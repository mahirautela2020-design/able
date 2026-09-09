/**
 * Pure geometry for evidence crops. Deliberately free of sharp/Playwright so
 * the "is this crop real?" decision can be tested without a browser or an
 * image codec — it is the rule that keeps fabricated evidence out of reports.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Context padded around a finding's own box, in pixels per side. */
export const CROP_PADDING_PX = 30;

/**
 * Work out the region of a full-page screenshot that evidences `bbox`.
 *
 * Returns `null` when the finding lies outside the captured image. That is the
 * whole point of this function: full-page captures are hard-capped (Chromium
 * wraps around past 16384px — see MAX_CAPTURE_PX in browser.ts), so a finding
 * far down a long page may have no pixels in the capture at all. Clamping it
 * into range instead — which is what the audit pipeline used to do — yields a
 * crop of unrelated content that is indistinguishable from real evidence.
 * No crop is strictly better than a convincing wrong one.
 *
 * `sharp.extract` requires integers inside the image bounds; bboxes arrive as
 * float CSS pixels, so everything is rounded and clamped.
 */
export function cropRectFor(
  bbox: Rect,
  imageWidth: number,
  imageHeight: number,
  padding = CROP_PADDING_PX
): CropRect | null {
  if (imageWidth <= 0 || imageHeight <= 0) return null;

  // Zero-area elements (display:none survivors, collapsed wrappers) have
  // nothing to show.
  if (bbox.width <= 0 || bbox.height <= 0) return null;

  // Does the element's own box intersect the captured image at all? Padding
  // is context, not evidence, so it must not drag an off-image finding in.
  const intersects =
    bbox.x < imageWidth &&
    bbox.y < imageHeight &&
    bbox.x + bbox.width > 0 &&
    bbox.y + bbox.height > 0;
  if (!intersects) return null;

  const left = Math.min(
    Math.max(0, Math.round(bbox.x - padding)),
    imageWidth - 1
  );
  const top = Math.min(
    Math.max(0, Math.round(bbox.y - padding)),
    imageHeight - 1
  );
  const width = Math.max(
    1,
    Math.min(imageWidth - left, Math.round(bbox.width + padding * 2))
  );
  const height = Math.max(
    1,
    Math.min(imageHeight - top, Math.round(bbox.height + padding * 2))
  );

  return { left, top, width, height };
}
