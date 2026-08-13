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
          computed: { color: rgbToHex(cs.color), backgroundColor: resolveBg(el) }
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

      window.__ableInspect = {
        inspect: inspect,
        focusables: focusables,
        contrastPairs: contrastPairs,
        highlight: highlight,
        highlightByRoleName: highlightByRoleName,
        patch: patch,
        focusEl: focusEl,
        setFilter: setFilter,
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
        }
      });
    })();
  `;
