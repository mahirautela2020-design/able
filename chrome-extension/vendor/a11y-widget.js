// Vendored copy of src/lib/widget/accessibility-widget-script.ts's
// ACCESSIBILITY_WIDGET_SCRIPT, for local injection inside the Chrome
// extension (Chrome Web Store policy disallows fetching/executing remote
// code, so this can't be loaded from the live /widget.js URL at runtime --
// it must ship inside the extension package). Keep in sync with the SDK
// source; re-run this extraction if that file changes.

(function () {
  "use strict";

  if (window.__ableA11yWidgetLoaded) return;
  window.__ableA11yWidgetLoaded = true;

  var SCRIPT_TAG = document.currentScript;
  var POSITION = (SCRIPT_TAG && SCRIPT_TAG.getAttribute("data-position")) || "bottom-right";
  var ACCENT = (SCRIPT_TAG && SCRIPT_TAG.getAttribute("data-accent")) || "#2563eb";
  var STORAGE_KEY = "able-a11y-widget-settings";

  var DEFAULTS = {
    profile: "none",
    contrast: "none",
    saturation: "none",
    textScale: 100,
    lineHeight: "none",
    letterSpacing: "none",
    dyslexiaFont: false,
    textAlign: "none",
    highlightLinks: false,
    hideImages: false,
    reducedMotion: false,
    bigCursor: false,
    readingGuide: false,
    readingMask: false,
    tooltips: false,
    focusMode: false,
    textMagnify: false
  };

  var PRESETS = [
    { id: "none", label: "None", settings: {} },
    { id: "seizure-safe", label: "Seizure Safe", settings: { reducedMotion: true, saturation: "low" } },
    { id: "color-blindness", label: "Color Blindness", settings: { saturation: "grayscale", contrast: "high" } },
    { id: "low-vision", label: "Low Vision", settings: { textScale: 150, contrast: "high", bigCursor: true } },
    { id: "vision-impaired", label: "Visually Impaired", settings: { textScale: 200, contrast: "high", highlightLinks: true, bigCursor: true } },
    { id: "senior-citizens", label: "Senior Citizens", settings: { textScale: 125, lineHeight: "loose", bigCursor: true } },
    { id: "dyslexia", label: "Dyslexia", settings: { dyslexiaFont: true, letterSpacing: "wide", lineHeight: "loose", textAlign: "left" } },
    { id: "motor-impairment", label: "Motor Impairment", settings: { bigCursor: true, focusMode: true, reducedMotion: true } },
    { id: "adhd", label: "Cognitive / ADHD", settings: { readingMask: true, reducedMotion: true, focusMode: true } }
  ];

  // ---- Core apply logic -----------------------------------------------
  // Same behavior as ABLE_INSPECT_BRIDGE_SCRIPT's applyAccessibilityProfile
  // (src/lib/explore/bridge-script.ts), used internally for our own
  // proxied-preview testing tool. Here it runs directly on the HOST page
  // that embeds this widget (no iframe/postMessage indirection needed —
  // this script IS running inside the real page).
  function applyProfile(settings) {
    var styleId = "__able-a11y-widget-style";
    var existing = document.getElementById(styleId);
    var css = [];
    var filterParts = [];

    if (settings.contrast && settings.contrast !== "none") {
      if (settings.contrast === "dark") filterParts.push("invert(1) hue-rotate(180deg)");
      else if (settings.contrast === "light") filterParts.push("brightness(1.1) contrast(1.1)");
      else if (settings.contrast === "high") filterParts.push("contrast(1.4)");
      else if (settings.contrast === "invert") filterParts.push("invert(1) hue-rotate(180deg)");
    }
    if (settings.saturation && settings.saturation !== "none") {
      if (settings.saturation === "low") filterParts.push("saturate(0.5)");
      else if (settings.saturation === "high") filterParts.push("saturate(2)");
      else if (settings.saturation === "grayscale") filterParts.push("grayscale(1)");
    }

    if (filterParts.length > 0) {
      document.body.style.filter = filterParts.join(" ");
      if (settings.contrast === "dark") {
        css.push("img,video,picture{filter:invert(1) hue-rotate(180deg)!important}");
      }
    } else {
      document.body.style.filter = "";
    }

    if (settings.textScale && settings.textScale !== 100) {
      document.documentElement.style.fontSize = settings.textScale + "%";
    } else {
      document.documentElement.style.fontSize = "";
    }

    if (settings.lineHeight && settings.lineHeight !== "none") {
      var lh = settings.lineHeight === "loose" ? "1.5" : (settings.lineHeight === "loosest" ? "2.0" : "1");
      if (lh !== "1") css.push("*{line-height:" + lh + "!important}");
    }

    if (settings.letterSpacing && settings.letterSpacing !== "none") {
      var ls = settings.letterSpacing === "wide" ? "0.05em" : (settings.letterSpacing === "wider" ? "0.1em" : "0");
      if (ls !== "0") css.push("*{letter-spacing:" + ls + "!important}");
    }

    if (settings.dyslexiaFont) {
      css.push('*{font-family:"OpenDyslexic","Comic Sans MS",Verdana,sans-serif!important}');
    }

    if (settings.textAlign && settings.textAlign !== "none") {
      css.push("p,li,div,span,h1,h2,h3,h4,h5,h6{text-align:" + settings.textAlign + "!important}");
    }

    if (settings.highlightLinks) {
      css.push("a{outline:2px solid #ffbf00!important;background:#fff8e1!important;color:#00457c!important}");
    }

    if (settings.hideImages) {
      css.push("img,svg,video,picture{visibility:hidden!important}");
    }

    if (settings.reducedMotion) {
      css.push("*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}");
    }

    if (settings.bigCursor) {
      var cursorSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M0,0l8,12h6l10,12H0V0z'/%3E%3C/svg%3E";
      css.push("*{cursor:url('" + cursorSvg + "') 0 0,auto!important}");
    }

    if (settings.textMagnify) {
      css.push("p:hover,span:hover,li:hover,a:hover,h1:hover,h2:hover,h3:hover,h4:hover,h5:hover,h6:hover,button:hover,label:hover{font-size:1.5em!important;transition:font-size .1s ease}");
    }

    if (css.length > 0 || filterParts.length > 0) {
      var styleText = css.join("");
      if (!existing) {
        var style = document.createElement("style");
        style.id = styleId;
        document.head.appendChild(style);
        existing = style;
      }
      existing.textContent = styleText;
    } else if (existing) {
      existing.remove();
    }

    var guideId = "__able-a11y-widget-guide";
    var guide = document.getElementById(guideId);
    if (settings.readingGuide) {
      if (!guide) {
        guide = document.createElement("div");
        guide.id = guideId;
        guide.style.cssText = "position:fixed;left:0;right:0;height:4px;background:rgba(255,0,0,0.5);pointer-events:none;z-index:2147483001;display:none";
        document.body.appendChild(guide);
        var guideHandler = function (ev) {
          guide.style.top = ev.clientY + "px";
          guide.style.display = "block";
        };
        document.addEventListener("mousemove", guideHandler);
        guide._guideHandler = guideHandler;
      }
    } else if (guide) {
      if (guide._guideHandler) document.removeEventListener("mousemove", guide._guideHandler);
      guide.remove();
    }

    var maskId = "__able-a11y-widget-mask";
    var mask = document.getElementById(maskId);
    if (settings.readingMask) {
      if (!mask) {
        mask = document.createElement("div");
        mask.id = maskId;
        mask.style.cssText = "position:fixed;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:2147483000;background:rgba(0,0,0,0.75);box-shadow:0 -120px 0 120px rgba(0,0,0,0.75) inset;display:none";
        document.body.appendChild(mask);
        var maskHandler = function (ev) {
          mask.style.top = Math.max(0, ev.clientY - 60) + "px";
          mask.style.bottom = Math.max(0, window.innerHeight - ev.clientY - 60) + "px";
          mask.style.display = "block";
        };
        document.addEventListener("mousemove", maskHandler);
        mask._maskHandler = maskHandler;
      }
    } else if (mask) {
      if (mask._maskHandler) document.removeEventListener("mousemove", mask._maskHandler);
      mask.remove();
    }

    if (settings.focusMode) {
      if (!window.__ableA11yWidgetFocusHandler) {
        var fmSpot = document.createElement("div");
        fmSpot.id = "__able-a11y-widget-focus-spot";
        fmSpot.style.cssText = "position:fixed;pointer-events:none;z-index:2147482999;border:3px solid " + ACCENT + ";border-radius:4px;box-shadow:0 0 0 9999px rgba(0,0,0,0.6);display:none;transition:left .08s ease,top .08s ease,width .08s ease,height .08s ease";
        document.body.appendChild(fmSpot);
        var FOCUS_SEL = "section,article,header,nav,main,aside,form,figure,table,li,p,h1,h2,h3,h4,h5,h6,button,a,label,blockquote,pre,img";
        var fmOver = function (ev) {
          var target = ev.target;
          var el = target && target.closest ? target.closest(FOCUS_SEL) : null;
          if (!el || el === document.body || el === document.documentElement) {
            fmSpot.style.display = "none";
            return;
          }
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            fmSpot.style.display = "none";
            return;
          }
          fmSpot.style.left = rect.left + "px";
          fmSpot.style.top = rect.top + "px";
          fmSpot.style.width = rect.width + "px";
          fmSpot.style.height = rect.height + "px";
          fmSpot.style.display = "block";
        };
        var fmOut = function (ev) {
          if (!ev.relatedTarget) fmSpot.style.display = "none";
        };
        document.addEventListener("mouseover", fmOver);
        document.addEventListener("mouseout", fmOut);
        window.__ableA11yWidgetFocusHandler = { over: fmOver, out: fmOut };
      }
    } else if (window.__ableA11yWidgetFocusHandler) {
      document.removeEventListener("mouseover", window.__ableA11yWidgetFocusHandler.over);
      document.removeEventListener("mouseout", window.__ableA11yWidgetFocusHandler.out);
      window.__ableA11yWidgetFocusHandler = null;
      var fmSpotEl = document.getElementById("__able-a11y-widget-focus-spot");
      if (fmSpotEl) fmSpotEl.remove();
    }

    if (settings.tooltips) {
      var tooltipId = "__able-a11y-widget-tooltip";
      var tooltip = document.getElementById(tooltipId);
      if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = tooltipId;
        tooltip.style.cssText = "position:fixed;background:#000;color:#fff;padding:4px 8px;border-radius:2px;font-size:12px;z-index:2147483001;pointer-events:none;display:none;max-width:200px;word-wrap:break-word";
        document.body.appendChild(tooltip);
        var tooltipShow = function (ev) {
          var el = ev.target;
          var text = el && el.getAttribute && (el.getAttribute("title") || el.getAttribute("aria-label"));
          if (text) {
            tooltip.textContent = text;
            tooltip.style.display = "block";
            tooltip.style.left = (ev.clientX + 10) + "px";
            tooltip.style.top = (ev.clientY + 10) + "px";
          }
        };
        var tooltipHide = function () {
          tooltip.style.display = "none";
        };
        document.addEventListener("mouseover", tooltipShow);
        document.addEventListener("mouseout", tooltipHide);
        document.addEventListener("focus", tooltipShow, true);
        document.addEventListener("blur", tooltipHide, true);
        tooltip._show = tooltipShow;
        tooltip._hide = tooltipHide;
      }
    } else {
      var existingTooltip = document.getElementById("__able-a11y-widget-tooltip");
      if (existingTooltip) {
        if (existingTooltip._show) {
          document.removeEventListener("mouseover", existingTooltip._show);
          document.removeEventListener("mouseout", existingTooltip._hide);
          document.removeEventListener("focus", existingTooltip._show, true);
          document.removeEventListener("blur", existingTooltip._hide, true);
        }
        existingTooltip.remove();
      }
    }
  }

  // ---- Persistence -------------------------------------------------
  function loadSettings() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      var parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, parsed);
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }
  function saveSettings(settings) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // localStorage unavailable (private mode / disabled) -- not fatal
    }
  }

  var state = loadSettings();
  var activeProfile = state.profile || "none";

  // ---- UI (Shadow DOM, isolated from the host page's CSS) ----------
  var host = document.createElement("div");
  host.id = "able-a11y-widget-host";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;" +
    (POSITION.indexOf("bottom") !== -1 ? "bottom:16px;" : "top:16px;") +
    (POSITION.indexOf("left") !== -1 ? "left:16px;" : "right:16px;");
  // Appended to <html> (a sibling of <body>), not <body> itself -- the
  // profile filter (contrast/dark/invert) above is applied to document.body
  // specifically so the widget's own UI structurally escapes it instead of
  // being visually distorted by its own contrast/invert effects.
  document.documentElement.appendChild(host);

  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var style = document.createElement("style");
  style.textContent =
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
    '.fab{width:52px;height:52px;border-radius:50%;background:' + ACCENT + ';color:#fff;border:none;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.25);}' +
    '.fab:hover{opacity:0.92}' +
    '.fab svg{width:26px;height:26px}' +
    '.panel{position:absolute;' + (POSITION.indexOf("bottom") !== -1 ? "bottom:64px;" : "top:64px;") +
      (POSITION.indexOf("left") !== -1 ? "left:0;" : "right:0;") +
      'width:320px;max-height:70vh;overflow-y:auto;background:#fff;color:#111;border-radius:12px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,0.2);font-size:13px;border:1px solid #e5e5e5}' +
    '.panel.hidden{display:none}' +
    '.panel-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;' +
      'border-bottom:1px solid #eee;font-weight:600;position:sticky;top:0;background:#fff}' +
    '.panel-close{background:none;border:none;cursor:pointer;font-size:16px;color:#666;line-height:1}' +
    '.panel-body{padding:12px 14px}' +
    'section{margin-bottom:14px}' +
    'h4{margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#555}' +
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
    '.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}' +
    'button.opt{padding:6px 8px;border-radius:6px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:12px;text-align:left}' +
    'button.opt.active{background:' + ACCENT + ';color:#fff;border-color:' + ACCENT + '}' +
    'button.opt:hover:not(.active){background:#f5f5f5}' +
    'label.row{display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0;font-size:12px}' +
    'select{width:100%;padding:6px 8px;border-radius:6px;border:1px solid #ddd;font-size:12px;background:#fff}' +
    '.field-label{display:block;font-size:10px;font-weight:600;margin-bottom:4px;color:#666}' +
    '.badge{font-size:9px;color:#999;padding:10px 14px 12px;border-top:1px solid #f0f0f0;text-align:center}' +
    '.badge a{color:#999}';
  root.appendChild(style);

  var fab = document.createElement("button");
  fab.className = "fab";
  fab.setAttribute("aria-label", "Accessibility options");
  fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="1.5" fill="currentColor" stroke="none"/><path d="M4 8h16M12 8v13M8 12l-3 3M16 12l3 3M8 21l1.5-6M16 21l-1.5-6"/></svg>';
  root.appendChild(fab);

  var panel = document.createElement("div");
  panel.className = "panel hidden";
  root.appendChild(panel);

  function renderPanel() {
    panel.innerHTML = "";

    var header = document.createElement("div");
    header.className = "panel-header";
    header.innerHTML = "<span>Accessibility Options</span>";
    var closeBtn = document.createElement("button");
    closeBtn.className = "panel-close";
    closeBtn.setAttribute("aria-label", "Close accessibility options");
    closeBtn.textContent = "✕";
    closeBtn.onclick = closePanel;
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var body = document.createElement("div");
    body.className = "panel-body";
    panel.appendChild(body);

    // Profiles
    var profilesSection = document.createElement("section");
    profilesSection.innerHTML = "<h4>Profiles</h4>";
    var profilesGrid = document.createElement("div");
    profilesGrid.className = "grid2";
    PRESETS.forEach(function (p) {
      var btn = document.createElement("button");
      btn.className = "opt" + (activeProfile === p.id ? " active" : "");
      btn.textContent = p.label;
      btn.onclick = function () {
        activeProfile = p.id;
        state = Object.assign({}, DEFAULTS, p.settings, { profile: p.id });
        commit();
      };
      profilesGrid.appendChild(btn);
    });
    profilesSection.appendChild(profilesGrid);
    body.appendChild(profilesSection);

    // Color
    body.appendChild(makeSelectSection("Color", [
      { label: "Contrast", key: "contrast", options: [["none", "None"], ["dark", "Dark"], ["light", "Light"], ["high", "High"], ["invert", "Invert"]] },
      { label: "Saturation", key: "saturation", options: [["none", "None"], ["low", "Low"], ["high", "High"], ["grayscale", "Grayscale"]] }
    ]));

    // Text
    var textSection = document.createElement("section");
    textSection.innerHTML = "<h4>Text</h4>";
    var scaleLabel = document.createElement("span");
    scaleLabel.className = "field-label";
    scaleLabel.textContent = "Text size";
    textSection.appendChild(scaleLabel);
    var scaleGrid = document.createElement("div");
    scaleGrid.className = "grid5";
    [100, 125, 150, 175, 200].forEach(function (scale) {
      var btn = document.createElement("button");
      btn.className = "opt" + (state.textScale === scale ? " active" : "");
      btn.textContent = scale + "%";
      btn.style.padding = "6px 2px";
      btn.style.textAlign = "center";
      btn.onclick = function () {
        update({ textScale: scale });
      };
      scaleGrid.appendChild(btn);
    });
    textSection.appendChild(scaleGrid);
    textSection.appendChild(makeSelect("Line height", "lineHeight", [["none", "Normal"], ["loose", "Loose"], ["loosest", "Very loose"]]));
    textSection.appendChild(makeSelect("Letter spacing", "letterSpacing", [["none", "Normal"], ["wide", "Wide"], ["wider", "Very wide"]]));
    textSection.appendChild(makeSelect("Text align", "textAlign", [["none", "Default"], ["left", "Left"], ["center", "Center"]]));
    textSection.appendChild(makeCheckbox("Dyslexia-friendly font", "dyslexiaFont"));
    body.appendChild(textSection);

    // Content
    var contentSection = document.createElement("section");
    contentSection.innerHTML = "<h4>Content</h4>";
    contentSection.appendChild(makeCheckbox("Highlight links", "highlightLinks"));
    contentSection.appendChild(makeCheckbox("Hide images", "hideImages"));
    contentSection.appendChild(makeCheckbox("Pause animations", "reducedMotion"));
    body.appendChild(contentSection);

    // Aids
    var aidsSection = document.createElement("section");
    aidsSection.innerHTML = "<h4>Accessibility Aids</h4>";
    aidsSection.appendChild(makeCheckbox("Big cursor", "bigCursor"));
    aidsSection.appendChild(makeCheckbox("Reading guide", "readingGuide"));
    aidsSection.appendChild(makeCheckbox("Reading mask", "readingMask"));
    aidsSection.appendChild(makeCheckbox("Show tooltips", "tooltips"));
    aidsSection.appendChild(makeCheckbox("Focus mode (light up section on hover)", "focusMode"));
    aidsSection.appendChild(makeCheckbox("Text magnify (enlarge on hover)", "textMagnify"));
    body.appendChild(aidsSection);

    var badge = document.createElement("div");
    badge.className = "badge";
    badge.innerHTML = 'Accessibility by <a href="https://scana11y-nine.vercel.app" target="_blank" rel="noopener">ScanA11y</a>';
    panel.appendChild(badge);
  }

  function makeSelectSection(title, fields) {
    var section = document.createElement("section");
    var h = document.createElement("h4");
    h.textContent = title;
    section.appendChild(h);
    fields.forEach(function (f) {
      section.appendChild(makeSelect(f.label, f.key, f.options));
    });
    return section;
  }

  function makeSelect(label, key, options) {
    var wrap = document.createElement("div");
    wrap.style.marginBottom = "8px";
    var labelEl = document.createElement("span");
    labelEl.className = "field-label";
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
    var select = document.createElement("select");
    options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt[0];
      o.textContent = opt[1];
      if (state[key] === opt[0]) o.selected = true;
      select.appendChild(o);
    });
    select.onchange = function () {
      var updates = {};
      updates[key] = select.value;
      update(updates);
    };
    wrap.appendChild(select);
    return wrap;
  }

  function makeCheckbox(label, key) {
    var wrap = document.createElement("label");
    wrap.className = "row";
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!state[key];
    input.onchange = function () {
      var updates = {};
      updates[key] = input.checked;
      update(updates);
    };
    wrap.appendChild(input);
    var span = document.createElement("span");
    span.textContent = label;
    wrap.appendChild(span);
    return wrap;
  }

  function update(updates) {
    activeProfile = "custom";
    state = Object.assign({}, state, updates, { profile: "custom" });
    commit();
  }

  function commit() {
    applyProfile(state);
    saveSettings(state);
    renderPanel();
  }

  var isOpen = false;
  function openPanel() {
    isOpen = true;
    panel.classList.remove("hidden");
    fab.setAttribute("aria-expanded", "true");
  }
  function closePanel() {
    isOpen = false;
    panel.classList.add("hidden");
    fab.setAttribute("aria-expanded", "false");
  }
  fab.onclick = function () {
    if (isOpen) closePanel();
    else openPanel();
  };

  document.addEventListener("click", function (ev) {
    if (!isOpen) return;
    var path = ev.composedPath ? ev.composedPath() : [];
    if (path.indexOf(host) === -1) closePanel();
  });

  renderPanel();
  applyProfile(state);

  // Public API for sites that want programmatic control.
  window.ScanA11yWidget = {
    open: openPanel,
    close: closePanel,
    reset: function () {
      activeProfile = "none";
      state = Object.assign({}, DEFAULTS);
      commit();
    },
    apply: function (updates) {
      update(updates || {});
    }
  };
})();

