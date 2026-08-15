// The __ableInspect bridge, extracted verbatim from public/explore-demo.html
// (and its test twin tests/fixtures/explore-demo.html) so preview-proxy can
// inject the same script into a real proxied page. Keep this string
// byte-identical to the inline <script> body in both HTML files — see
// tests/bridge-script-sync.test.ts, which guards against drift.
export const ABLE_INSPECT_BRIDGE_SCRIPT = `
    (function () {
      function rgbToHex(str) {
        var m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (!m) return "#000000";
        function to2(n) { return Number(n).toString(16).padStart(2, "0"); }
        return "#" + to2(m[1]) + to2(m[2]) + to2(m[3]);
      }
      function resolveBg(el) {
        var cur = el;
        while (cur) {
          var bg = getComputedStyle(cur).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return rgbToHex(bg);
          cur = cur.parentElement;
        }
        return "#ffffff";
      }
      function roleOf(el) {
        if (el.getAttribute("data-role")) return el.getAttribute("data-role");
        var role = el.getAttribute("role");
        if (role) return role;
        var tag = el.tagName.toLowerCase();
        if (tag === "button") return "button";
        if (tag === "a") return "link";
        if (tag === "img") return "img";
        if (tag === "input") return (el.type === "checkbox" || el.type === "radio") ? el.type : "textbox";
        if (tag === "select") return "combobox";
        if (tag === "textarea") return "textbox";
        if (/^h[1-6]$/.test(tag)) return "heading";
        if (tag === "main") return "main";
        if (tag === "nav") return "navigation";
        if (tag === "header") return "banner";
        if (tag === "footer") return "contentinfo";
        return tag;
      }
      function nameOf(el) {
        if (el.getAttribute("data-name")) return el.getAttribute("data-name");
        if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
        if (el.tagName.toLowerCase() === "img") return el.getAttribute("alt") || "";
        return (el.textContent || "").trim().slice(0, 60);
      }
      function cssSelector(el) {
        if (el.id) return "#" + el.id;
        var sel = el.tagName.toLowerCase();
        if (el.className && typeof el.className === "string") {
          var cls = el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 1);
          if (cls.length) sel += "." + cls[0];
        }
        return sel;
      }
      function hasVisibleText(el) {
        return (el.textContent || "").trim().length > 0;
      }
      function inspect(x, y) {
        var el = document.elementFromPoint(x, y);
        if (!el || el === document.documentElement || el === document.body) return null;
        var rect = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        var aria = {};
        for (var i = 0; i < el.attributes.length; i++) {
          var attr = el.attributes[i];
          if (/^aria-/i.test(attr.name)) aria[attr.name] = attr.value;
        }
        var ancestors = [];
        var cur = el.parentElement;
        while (cur && cur !== document.body && ancestors.length < 8) {
          var r = roleOf(cur);
          if (r) ancestors.push(r);
          cur = cur.parentElement;
        }
        return {
          role: roleOf(el),
          name: nameOf(el),
          tag: el.tagName.toLowerCase(),
          selector: cssSelector(el),
          aria: aria,
          fontSize: cs.fontSize,
          touchTarget: { width: Math.round(rect.width), height: Math.round(rect.height) },
          tabIndex: el.tabIndex >= 0 ? el.tabIndex : null,
          ancestors: ancestors,
          bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          computed: { color: rgbToHex(cs.color), backgroundColor: resolveBg(el) },
          hasText: hasVisibleText(el)
        };
      }
      function focusables() {
        var els = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        var out = [];
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          out.push({ selector: cssSelector(el), label: nameOf(el) || el.tagName.toLowerCase(), bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
        }
        return out;
      }
      function contrastPairs() {
        var seen = {};
        var pairs = [];
        var els = document.querySelectorAll("button, a, input, span, h1, h2, h3, p, label, [data-role]");
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          var fg = rgbToHex(getComputedStyle(el).color);
          var bg = resolveBg(el);
          var key = fg + "|" + bg;
          if (seen[key]) continue;
          seen[key] = 1;
          pairs.push({ fg: fg, bg: bg, selector: cssSelector(el), label: nameOf(el) || el.tagName.toLowerCase() });
        }
        return pairs;
      }
      function clearHighlight() {
        var nodes = document.querySelectorAll(".__able-highlight");
        for (var i = 0; i < nodes.length; i++) nodes[i].remove();
      }
      function highlight(selector) {
        clearHighlight();
        var el = document.querySelector(selector);
        if (!el) return false;
        var rect = el.getBoundingClientRect();
        var overlay = document.createElement("div");
        overlay.className = "__able-highlight";
        overlay.style.cssText = "position:fixed;border:2px solid #e11d48;background:rgba(225,29,72,0.12);z-index:99999;pointer-events:none;" +
          "left:" + rect.left + "px;top:" + rect.top + "px;width:" + rect.width + "px;height:" + rect.height + "px;";
        document.body.appendChild(overlay);
        return true;
      }
      function highlightByRoleName(role, name) {
        clearHighlight();
        var el = document.querySelector('[data-role="' + role + '"][data-name="' + name + '"]');
        if (!el) {
          var all = document.querySelectorAll("*");
          for (var i = 0; i < all.length; i++) {
            if (roleOf(all[i]) === role && nameOf(all[i]) === name) { el = all[i]; break; }
          }
        }
        if (!el) return false;
        return highlight(cssSelector(el));
      }
      function patch(selector, styles) {
        var el = document.querySelector(selector);
        if (!el) return false;
        for (var k in styles) el.style[k] = styles[k];
        return true;
      }
      function focusEl(selector) {
        var el = document.querySelector(selector);
        if (!el) return false;
        el.focus();
        return true;
      }
      function setFilter(filter) {
        document.body.style.filter = (!filter || filter === "none") ? "" : filter;
        return true;
      }
      function applyAccessibilityProfile(settings) {
        settings = settings || {};
        var styleId = "__able-a11y-style";
        var existing = document.getElementById(styleId);
        var css = [];
        var filterParts = [];

        // Build composite filter
        if (settings.contrast && settings.contrast !== "none") {
          if (settings.contrast === "dark") {
            filterParts.push("invert(1) hue-rotate(180deg)");
            // Will re-invert images below
          } else if (settings.contrast === "light") {
            filterParts.push("brightness(1.1) contrast(1.1)");
          } else if (settings.contrast === "high") {
            filterParts.push("contrast(1.4)");
          } else if (settings.contrast === "invert") {
            filterParts.push("invert(1) hue-rotate(180deg)");
          }
        }
        if (settings.saturation && settings.saturation !== "none") {
          if (settings.saturation === "low") {
            filterParts.push("saturate(0.5)");
          } else if (settings.saturation === "high") {
            filterParts.push("saturate(2)");
          } else if (settings.saturation === "grayscale") {
            filterParts.push("grayscale(1)");
          }
        }

        // Apply composite filter to body
        if (filterParts.length > 0) {
          document.body.style.filter = filterParts.join(" ");
          // Re-invert images if using dark contrast to compensate
          if (settings.contrast === "dark") {
            css.push("img,video,picture{filter:invert(1) hue-rotate(180deg)!important}");
          }
        } else {
          document.body.style.filter = "";
        }

        // Text scale
        if (settings.textScale && settings.textScale !== 100) {
          document.documentElement.style.fontSize = settings.textScale + "%";
        } else {
          document.documentElement.style.fontSize = "";
        }

        // Line height
        if (settings.lineHeight && settings.lineHeight !== "none") {
          var lh = settings.lineHeight === "loose" ? "1.5" : (settings.lineHeight === "loosest" ? "2.0" : "1");
          if (lh !== "1") css.push("*{line-height:" + lh + "!important}");
        }

        // Letter spacing
        if (settings.letterSpacing && settings.letterSpacing !== "none") {
          var ls = settings.letterSpacing === "wide" ? "0.05em" : (settings.letterSpacing === "wider" ? "0.1em" : "0");
          if (ls !== "0") css.push("*{letter-spacing:" + ls + "!important}");
        }

        // Dyslexia font
        if (settings.dyslexiaFont) {
          css.push('*{font-family:"Comic Sans MS","OpenDyslexic",Verdana,sans-serif!important}');
        }

        // Text align
        if (settings.textAlign && settings.textAlign !== "none") {
          css.push("p,li,div,span,h1,h2,h3,h4,h5,h6{text-align:" + settings.textAlign + "!important}");
        }

        // Highlight links
        if (settings.highlightLinks) {
          css.push("a{outline:2px solid #ffbf00!important;background:#fff8e1!important;color:#00457c!important}");
        }

        // Hide images
        if (settings.hideImages) {
          css.push("img,svg,video,picture{visibility:hidden!important}");
        }

        // Reduced motion
        if (settings.reducedMotion) {
          css.push("*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}");
        }

        // Big cursor
        if (settings.bigCursor) {
          var cursorSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M0,0l8,12h6l10,12H0V0z'/%3E%3C/svg%3E";
          css.push("*{cursor:url('" + cursorSvg + "') 0 0,auto!important}");
        }

        // Focus mode: a much stronger, always-visible focus indicator
        // (UX4G's "Focus Mode") — a real spotlight/dim overlay would need
        // per-keystroke DOM tracking; this is the CSS-only equivalent.
        if (settings.focusMode) {
          css.push("*:focus{outline:4px solid #2563eb!important;outline-offset:3px!important;box-shadow:0 0 0 6px rgba(37,99,235,0.35)!important}");
        }

        // Text magnify: enlarges text under the cursor (UX4G's "Text
        // Magnify") — a true cursor-following lens would need a canvas
        // overlay; this hover-scale is the CSS-only equivalent.
        if (settings.textMagnify) {
          css.push("p:hover,span:hover,li:hover,a:hover,h1:hover,h2:hover,h3:hover,h4:hover,h5:hover,h6:hover,button:hover,label:hover{font-size:1.5em!important;transition:font-size .1s ease}");
        }

        // Update or create style element
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

        // Manage reading guide
        var guideId = "__able-guide";
        var guide = document.getElementById(guideId);
        if (settings.readingGuide) {
          if (!guide) {
            guide = document.createElement("div");
            guide.id = guideId;
            guide.style.cssText = "position:fixed;left:0;right:0;height:4px;background:rgba(255,0,0,0.5);pointer-events:none;z-index:99998;display:none";
            document.body.appendChild(guide);
            var guideHandler = function(ev) {
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

        // Manage reading mask
        var maskId = "__able-mask";
        var mask = document.getElementById(maskId);
        if (settings.readingMask) {
          if (!mask) {
            mask = document.createElement("div");
            mask.id = maskId;
            mask.style.cssText = "position:fixed;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:99997;background:rgba(0,0,0,0.75);box-shadow:0 -120px 0 120px rgba(0,0,0,0.75) inset;display:none";
            document.body.appendChild(mask);
            var maskHandler = function(ev) {
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

        // Manage tooltips
        if (settings.tooltips) {
          var tooltipId = "__able-tooltip";
          var tooltip = document.getElementById(tooltipId);
          if (!tooltip) {
            tooltip = document.createElement("div");
            tooltip.id = tooltipId;
            tooltip.style.cssText = "position:fixed;background:#000;color:#fff;padding:4px 8px;border-radius:2px;font-size:12px;z-index:99999;pointer-events:none;display:none;max-width:200px;word-wrap:break-word";
            document.body.appendChild(tooltip);
            var tooltipHandler = function(ev) {
              var el = ev.target;
              var text = el.getAttribute("title") || el.getAttribute("aria-label");
              if (text) {
                tooltip.textContent = text;
                tooltip.style.display = "block";
                tooltip.style.left = (ev.clientX + 10) + "px";
                tooltip.style.top = (ev.clientY + 10) + "px";
              }
            };
            var tooltipHideHandler = function() {
              tooltip.style.display = "none";
            };
            document.addEventListener("mouseover", tooltipHandler);
            document.addEventListener("mouseout", tooltipHideHandler);
            document.addEventListener("focus", tooltipHandler, true);
            document.addEventListener("blur", tooltipHideHandler, true);
            tooltip._tooltipHandler = tooltipHandler;
            tooltip._tooltipHideHandler = tooltipHideHandler;
          }
        } else {
          var tooltip = document.getElementById("__able-tooltip");
          if (tooltip) {
            if (tooltip._tooltipHandler) {
              document.removeEventListener("mouseover", tooltip._tooltipHandler);
              document.removeEventListener("mouseout", tooltip._tooltipHideHandler);
              document.removeEventListener("focus", tooltip._tooltipHandler, true);
              document.removeEventListener("blur", tooltip._tooltipHideHandler, true);
            }
            tooltip.remove();
          }
        }

        // Manage dictionary lookup: double-click a word for its definition,
        // via the free, keyless Dictionary API (dictionaryapi.dev — MIT-
        // licensed, Wiktionary-sourced). Entirely self-contained in the
        // iframe: no postMessage round-trip to the parent needed.
        if (settings.dictionary) {
          if (!window.__ableDictHandler) {
            var dictPopup = null;
            function removeDictPopup() {
              if (dictPopup) { dictPopup.remove(); dictPopup = null; }
            }
            function wordAt(x, y) {
              var range;
              if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(x, y);
              } else if (document.caretPositionFromPoint) {
                var pos = document.caretPositionFromPoint(x, y);
                if (pos) {
                  range = document.createRange();
                  range.setStart(pos.offsetNode, pos.offset);
                  range.collapse(true);
                }
              }
              if (!range || !range.startContainer || range.startContainer.nodeType !== 3) return null;
              var text = range.startContainer.textContent || "";
              var offset = range.startOffset;
              var start = offset, end = offset;
              while (start > 0 && /[a-zA-Z']/.test(text[start - 1])) start--;
              while (end < text.length && /[a-zA-Z']/.test(text[end])) end++;
              var word = text.slice(start, end).replace(/^'+|'+$/g, "");
              return word.length > 1 ? word.toLowerCase() : null;
            }
            var dictHandler = function(ev) {
              var word = wordAt(ev.clientX, ev.clientY);
              removeDictPopup();
              if (!word) return;
              ev.preventDefault();
              dictPopup = document.createElement("div");
              dictPopup.className = "__able-dict-popup";
              dictPopup.style.cssText = "position:fixed;max-width:280px;background:#111;color:#fff;padding:8px 10px;border-radius:6px;font-size:12px;line-height:1.4;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.3);left:" + (ev.clientX + 8) + "px;top:" + (ev.clientY + 12) + "px";
              dictPopup.textContent = "Looking up \\"" + word + "\\"\\u2026";
              document.body.appendChild(dictPopup);
              fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word))
                .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
                .then(function(data) {
                  if (!dictPopup) return;
                  var entry = data[0];
                  var meaning = entry && entry.meanings && entry.meanings[0];
                  var def = meaning && meaning.definitions && meaning.definitions[0];
                  var phonetic = entry && (entry.phonetic || (entry.phonetics && entry.phonetics[0] && entry.phonetics[0].text)) || "";
                  var pos = meaning ? meaning.partOfSpeech : "";
                  var html = "<strong>" + word + "</strong>";
                  if (phonetic) html += " <span style=\\"opacity:.7\\">" + phonetic + "</span>";
                  if (pos) html += " <em style=\\"opacity:.7\\">(" + pos + ")</em>";
                  html += "<br/>" + (def ? def.definition : "No definition found.");
                  dictPopup.innerHTML = html;
                })
                .catch(function() {
                  if (dictPopup) dictPopup.textContent = "No definition found for \\"" + word + "\\".";
                });
            };
            document.addEventListener("dblclick", dictHandler);
            document.addEventListener("click", removeDictPopup);
            window.__ableDictHandler = { dblclick: dictHandler, click: removeDictPopup };
          }
        } else if (window.__ableDictHandler) {
          document.removeEventListener("dblclick", window.__ableDictHandler.dblclick);
          document.removeEventListener("click", window.__ableDictHandler.click);
          var openPopup = document.querySelector(".__able-dict-popup");
          if (openPopup) openPopup.remove();
          window.__ableDictHandler = null;
        }

        return true;
      }

      window.__ableInspect = {
        inspect: inspect,
        focusables: focusables,
        contrastPairs: contrastPairs,
        highlight: highlight,
        highlightByRoleName: highlightByRoleName,
        patch: patch,
        focusEl: focusEl,
        setFilter: setFilter,
        applyAccessibilityProfile: applyAccessibilityProfile,
        clearHighlight: clearHighlight
      };

      window.addEventListener("message", function (ev) {
        var msg = ev.data || {};
        if (!msg || typeof msg !== "object" || typeof msg.type !== "string" || msg.type.indexOf("able:") !== 0) return;
        switch (msg.type) {
          case "able:inspect":
            window.parent && window.parent.postMessage({ type: "able:inspect:result", element: inspect(msg.x, msg.y) }, "*");
            break;
          case "able:focusables":
            window.parent && window.parent.postMessage({ type: "able:focusables:result", items: focusables() }, "*");
            break;
          case "able:contrast-pairs":
            window.parent && window.parent.postMessage({ type: "able:contrast-pairs:result", pairs: contrastPairs() }, "*");
            break;
          case "able:patch":
            window.parent && window.parent.postMessage({ type: "able:patch:result", ok: patch(msg.selector, msg.styles) }, "*");
            break;
          case "able:highlight":
            window.parent && window.parent.postMessage({ type: "able:highlight:result", ok: highlight(msg.selector) }, "*");
            break;
          case "able:highlight-role-name":
            window.parent && window.parent.postMessage({ type: "able:highlight:result", ok: highlightByRoleName(msg.role, msg.name) }, "*");
            break;
          case "able:focus":
            window.parent && window.parent.postMessage({ type: "able:focus:result", ok: focusEl(msg.selector) }, "*");
            break;
          case "able:set-filter":
            window.parent && window.parent.postMessage({ type: "able:set-filter:result", ok: setFilter(msg.filter) }, "*");
            break;
          case "able:apply-a11y-profile":
            window.parent && window.parent.postMessage({ type: "able:apply-a11y-profile:result", ok: applyAccessibilityProfile(msg.settings) }, "*");
            break;
        }
      });
    })();
  `;
