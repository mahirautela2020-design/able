#!/usr/bin/env python3
"""Deterministic UI element detection for Able (P8).

Detects UI elements (buttons, icons, inputs, text) in a screenshot with a
lightweight detection model, so touch-target size (WCAG 2.5.8) and non-text
contrast (1.4.11) can be computed by math, not guessed by an LLM.

Contract:
  input : an absolute screenshot path (must live under the temp dir — see
          validation below, this is an SSRF-adjacent surface).
  output: JSON on stdout — an array of
            {"label": str, "confidence": float, "bbox": {x,y,w,h}, "class": str}
          OR a graceful {"error": "weights-unavailable"} when the model cannot
          be loaded (exit code 0 — the caller degrades to LLM-only advisory).

The detector runs as a SEPARATE PROCESS on purpose: `ultralytics` is AGPL-3.0
and must never be imported into the Next.js/TypeScript bundle. This boundary
keeps Able's source (MIT) clean.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

ALLOWED_CLASSES = {
    "button",
    "icon",
    "input",
    "text",
    "checkbox",
    "radio",
    "link",
    "image",
}

# Confidence floor for counting; boxes in [0.4, 0.5) are "borderline" and are
# still emitted (with their low confidence) so the caller can bucket them as
# needs_review rather than a hard violation.
MIN_CONFIDENCE = 0.4

# COCO (yolov8n) class names that plausibly map to UI elements. Everything
# else is dropped — we never pretend a COCO "person" is a button.
COCO_TO_UI = {
    "cell phone": "image",
    "tv": "image",
    "laptop": "image",
    "book": "image",
    "keyboard": "input",
    "mouse": "image",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", help="absolute path to the screenshot")
    parser.add_argument(
        "--temp-dir",
        default=tempfile.gettempdir(),
        help="allowed temp directory (defaults to system temp dir)",
    )
    parser.add_argument(
        "--weights",
        default=os.environ.get("DETECT_WEIGHTS", ""),
        help="path to detection weights (defaults to DETECT_WEIGHTS env)",
    )
    args = parser.parse_args()

    # ── Path validation: realpath must live under the allowed temp dir ──
    image_path = args.image
    temp_dir = os.path.realpath(args.temp_dir)
    real_image = os.path.realpath(image_path)
    if not (real_image == temp_dir or real_image.startswith(temp_dir + os.sep)):
        print(
            json.dumps({"error": "invalid-path"}),
            file=sys.stderr,
        )
        return 1
    if not os.path.isfile(real_image):
        print(json.dumps({"error": "invalid-path"}), file=sys.stderr)
        return 1

    # ── Feature-detect the model stack; degrade gracefully ──
    try:
        from ultralytics import YOLO  # noqa: F401
    except ImportError:
        print(json.dumps({"error": "weights-unavailable"}))
        return 0

    weights = args.weights
    model = None
    try:
        if weights and os.path.isfile(weights):
            model = YOLO(weights)
        else:
            # Attempt the standard download; if offline/blocked this raises
            # and we degrade rather than crash.
            model = YOLO("yolov8n.pt")
    except Exception:
        print(json.dumps({"error": "weights-unavailable"}))
        return 0

    try:
        results = model.predict(source=real_image, conf=MIN_CONFIDENCE, verbose=False)
    except Exception:
        print(json.dumps({"error": "weights-unavailable"}))
        return 0

    elements = []
    names = getattr(model, "names", {}) or {}
    for result in results:
        if result.boxes is None:
            continue
        for box in result.boxes:
            try:
                xyxy = box.xyxy.tolist()[0]
                conf = float(box.conf.tolist()[0])
                cls_id = int(box.cls.tolist()[0])
            except Exception:
                continue
            x1, y1, x2, y2 = (float(v) for v in xyxy)
            raw_name = str(names.get(cls_id, "")).strip().lower()
            ui_class = COCO_TO_UI.get(raw_name)
            if ui_class is None:
                # Fall back to a generic "text" for unidentified objects only
                # when a UI model (not COCO) is in use — detected by a
                # custom name mapping being absent. Keeps COCO noise out.
                if not names:
                    ui_class = "text"
                else:
                    continue
            if ui_class not in ALLOWED_CLASSES:
                continue
            elements.append(
                {
                    "label": raw_name or ui_class,
                    "confidence": round(conf, 4),
                    "bbox": {
                        "x": round(x1, 1),
                        "y": round(y1, 1),
                        "w": round(x2 - x1, 1),
                        "h": round(y2 - y1, 1),
                    },
                    "class": ui_class,
                }
            )

    print(json.dumps(elements))
    return 0


if __name__ == "__main__":
    sys.exit(main())
