"use strict";

// Tab switching
document.querySelectorAll(".tab").forEach(function (tab) {
  tab.addEventListener("click", function () {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    document.querySelectorAll(".panel").forEach(function (p) { p.hidden = true; });
    document.getElementById("panel-" + tab.dataset.tab).hidden = false;
  });
});

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    return tabs[0];
  });
}

// ---------------- Audit ----------------

// Runs inside the page (via chrome.scripting.executeScript). Must be a
// self-contained function -- no closures over popup.js state, since it
// executes in the tab's own JS context, not this one.
function runAxeInPage() {
  return window.axe.run(document, { resultTypes: ["violations"] }).then(function (results) {
    return results.violations.map(function (v) {
      return {
        id: v.id,
        impact: v.impact || "minor",
        help: v.help,
        description: v.description,
        helpUrl: v.helpUrl,
        nodeCount: v.nodes.length,
        targets: v.nodes.slice(0, 5).map(function (n) { return n.target[0]; }).filter(Boolean)
      };
    });
  });
}

function highlightInPage(selector) {
  try {
    var el = document.querySelector(selector);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    var prevOutline = el.style.outline;
    var prevOffset = el.style.outlineOffset;
    el.style.outline = "3px solid #ef4444";
    el.style.outlineOffset = "2px";
    setTimeout(function () {
      el.style.outline = prevOutline;
      el.style.outlineOffset = prevOffset;
    }, 2000);
    return true;
  } catch (e) {
    return false;
  }
}

var runAuditBtn = document.getElementById("run-audit");
var auditStatus = document.getElementById("audit-status");
var auditResults = document.getElementById("audit-results");

runAuditBtn.addEventListener("click", function () {
  runAuditBtn.disabled = true;
  runAuditBtn.textContent = "Scanning…";
  auditStatus.hidden = true;
  auditResults.innerHTML = "";

  getActiveTab().then(function (tab) {
    if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
      throw new Error("Open a regular http(s) page to audit (not a browser internal page).");
    }
    return chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["vendor/axe.min.js"] })
      .then(function () {
        return chrome.scripting.executeScript({ target: { tabId: tab.id }, func: runAxeInPage });
      })
      .then(function (injectionResults) {
        var violations = (injectionResults[0] && injectionResults[0].result) || [];
        renderAuditResults(violations, tab.id);
      });
  }).catch(function (err) {
    auditStatus.hidden = false;
    auditStatus.textContent = "Couldn't run audit: " + err.message;
  }).finally(function () {
    runAuditBtn.disabled = false;
    runAuditBtn.textContent = "Run audit on this page";
  });
});

function renderAuditResults(violations, tabId) {
  if (violations.length === 0) {
    auditStatus.hidden = false;
    auditStatus.textContent = "No axe-core violations found on this page.";
    return;
  }
  auditStatus.hidden = false;
  auditStatus.textContent = violations.length + " issue type" + (violations.length === 1 ? "" : "s") + " found.";

  var order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  violations.sort(function (a, b) { return (order[a.impact] || 9) - (order[b.impact] || 9); });

  violations.forEach(function (v) {
    var li = document.createElement("li");
    li.className = "result";
    var head = document.createElement("div");
    head.className = "result-head";
    var title = document.createElement("span");
    title.className = "result-title";
    title.textContent = v.help;
    var impact = document.createElement("span");
    impact.className = "impact impact-" + v.impact;
    impact.textContent = v.impact;
    head.appendChild(title);
    head.appendChild(impact);
    li.appendChild(head);

    var desc = document.createElement("div");
    desc.className = "result-desc";
    desc.textContent = v.description;
    li.appendChild(desc);

    var count = document.createElement("div");
    count.className = "result-count";
    count.textContent = v.nodeCount + " element" + (v.nodeCount === 1 ? "" : "s") + " affected";
    li.appendChild(count);

    if (v.targets.length > 0) {
      var btn = document.createElement("button");
      btn.className = "highlight-btn";
      btn.textContent = "Highlight on page";
      btn.addEventListener("click", function () {
        chrome.scripting.executeScript({ target: { tabId: tabId }, func: highlightInPage, args: [v.targets[0]] });
      });
      li.appendChild(btn);
    }

    auditResults.appendChild(li);
  });
}

// ---------------- Inspect ----------------

// Self-contained: click-to-inspect overlay + tooltip, entirely on-page so
// it keeps working after the popup closes (Chrome closes the popup as soon
// as the user clicks into the page, which is exactly how inspecting an
// element works -- so this cannot depend on popup.js state after injection).
function startInspectInPage() {
  if (window.__ableExtInspectActive) return;
  window.__ableExtInspectActive = true;

  function rgbToHex(str) {
    var m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
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
  function relLuminance(hex) {
    var n = parseInt(hex.replace("#", ""), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function chan(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  }
  function contrastRatio(fg, bg) {
    var l1 = relLuminance(fg), l2 = relLuminance(bg);
    var lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  function roleOf(el) {
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
    return tag;
  }
  function nameOf(el) {
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    if (el.tagName.toLowerCase() === "img") return el.getAttribute("alt") || "(no alt text)";
    return (el.textContent || "").trim().slice(0, 60) || "(no accessible name)";
  }
  function cssSelector(el) {
    if (el.id) return "#" + el.id;
    var sel = el.tagName.toLowerCase();
    if (el.className && typeof el.className === "string") {
      var cls = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 1);
      if (cls.length) sel += "." + cls[0];
    }
    return sel;
  }

  var outline = document.createElement("div");
  outline.style.cssText = "position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #22c55e;background:rgba(34,197,94,0.12);display:none;transition:none";
  document.body.appendChild(outline);

  var tooltip = document.createElement("div");
  tooltip.style.cssText = "position:fixed;max-width:280px;background:#111;color:#fff;padding:10px 12px;border-radius:8px;font:12px -apple-system,sans-serif;line-height:1.6;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.3);display:none";
  document.body.appendChild(tooltip);

  var exitBtn = document.createElement("button");
  exitBtn.textContent = "Exit inspect (Esc)";
  exitBtn.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;padding:8px 14px;border-radius:999px;border:none;background:#111;color:#fff;font:12px -apple-system,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25)";
  document.body.appendChild(exitBtn);

  function onMove(ev) {
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el || el === outline || el === tooltip || el === exitBtn || el === document.body || el === document.documentElement) {
      outline.style.display = "none";
      return;
    }
    var rect = el.getBoundingClientRect();
    outline.style.left = rect.left + "px";
    outline.style.top = rect.top + "px";
    outline.style.width = rect.width + "px";
    outline.style.height = rect.height + "px";
    outline.style.display = "block";
  }

  function onClick(ev) {
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el || el === outline || el === tooltip || el === exitBtn) return;
    ev.preventDefault();
    ev.stopPropagation();
    var rect = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var fg = rgbToHex(cs.color);
    var bg = resolveBg(el);
    var ratio = contrastRatio(fg, bg);
    var fontSize = parseFloat(cs.fontSize);
    var fontWeight = parseInt(cs.fontWeight, 10) || 400;
    var isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    var required = isLarge ? 3 : 4.5;
    var passes = ratio >= required;

    tooltip.innerHTML =
      "<div style=\"font-weight:700;margin-bottom:4px\">" + roleOf(el) + "</div>" +
      "<div style=\"opacity:.8\">" + nameOf(el) + "</div>" +
      "<div style=\"margin-top:6px;font-family:monospace;font-size:11px;opacity:.7\">" + cssSelector(el) + "</div>" +
      "<div style=\"margin-top:6px\">Contrast: " + ratio.toFixed(2) + ":1 " +
        "<span style=\"color:" + (passes ? "#4ade80" : "#f87171") + "\">" + (passes ? "✓ passes" : "✗ fails") + " " + required + ":1</span></div>" +
      "<div>Touch target: " + Math.round(rect.width) + "×" + Math.round(rect.height) + "px" + (Math.min(rect.width, rect.height) < 24 ? " <span style=\"color:#f87171\">(below 24px)</span>" : "") + "</div>" +
      "<div>Tab index: " + (el.tabIndex >= 0 ? el.tabIndex : "not focusable") + "</div>";
    tooltip.style.left = Math.min(rect.left, window.innerWidth - 300) + "px";
    tooltip.style.top = Math.min(rect.bottom + 8, window.innerHeight - 160) + "px";
    tooltip.style.display = "block";
  }

  function cleanup() {
    window.__ableExtInspectActive = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeydown);
    outline.remove();
    tooltip.remove();
    exitBtn.remove();
  }
  function onKeydown(ev) {
    if (ev.key === "Escape") cleanup();
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown);
  exitBtn.addEventListener("click", cleanup);
}

var toggleInspectBtn = document.getElementById("toggle-inspect");
toggleInspectBtn.addEventListener("click", function () {
  getActiveTab().then(function (tab) {
    if (!tab || !tab.id) return;
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: startInspectInPage });
    window.close();
  });
});

// ---------------- Accessibility options ----------------

var toggleA11yBtn = document.getElementById("toggle-a11y");
toggleA11yBtn.addEventListener("click", function () {
  getActiveTab().then(function (tab) {
    if (!tab || !tab.id) return;
    return chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["vendor/a11y-widget.js"] })
      .then(function () {
        return chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function () { if (window.ScanA11yWidget) window.ScanA11yWidget.open(); }
        });
      });
  }).then(function () {
    window.close();
  });
});
