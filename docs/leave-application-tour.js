/* ============================================================================
 * Leave Application — Guided Tour (DAP-style)
 * A self-contained, dependency-free in-app walkthrough overlay.
 *
 * WHAT IT DOES
 *   Highlights each part of the Quixy "Leave Application" form in order and
 *   explains it, like WalkMe / Whatfix. It is EXPLAIN-ONLY: it never fills or
 *   submits the form — the user performs the actions; the tour just guides.
 *
 * HOW TO LOAD  (pick one — see the bottom of this file for details)
 *   1. DevTools console : paste this whole file on the Leave Application page.
 *   2. DevTools Snippet : Sources ▸ Snippets ▸ New ▸ paste ▸ Run (Ctrl/Cmd+Enter).
 *   3. Bookmarklet      : host this file, then bookmark the loader at the bottom.
 *
 * RESET / CONTROL
 *   window.LeaveTour.start()  restart    .stop() close   .next() / .prev()
 * ==========================================================================*/
(function () {
  "use strict";

  // If a previous instance is running, tear it down first.
  if (window.LeaveTour && typeof window.LeaveTour.stop === "function") {
    window.LeaveTour.stop();
  }

  var PREFIX = "lvtour";
  var state = { i: 0, order: [] };

  /* ---------- helpers ---------------------------------------------------- */
  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  // Climb to a sensible "field box" that wraps a label + its control.
  function climbToField(el) {
    var cur = el;
    for (var i = 0; i < 6 && cur && cur.parentElement; i++) {
      try {
        if (cur.querySelector &&
            cur.querySelector("input,textarea,select,[role=combobox],[role=radiogroup],button")) {
          var r = cur.getBoundingClientRect();
          if (r.height > 0 && r.height < 240 && r.width > 60) return cur;
        }
      } catch (e) {}
      cur = cur.parentElement;
    }
    return el;
  }

  // Find an on-screen anchor element for any of the given label strings.
  // Strategy: 1) accessible attributes on controls; 2) visible text match.
  function findAnchor(labels) {
    var i, label;
    // 1) controls whose accessible name starts with the label
    var controls = [].slice.call(document.querySelectorAll(
      "input,textarea,select,[role=combobox],[role=textbox],[aria-label],[placeholder],[title]"));
    for (i = 0; i < labels.length; i++) {
      label = norm(labels[i]).toLowerCase();
      for (var c = 0; c < controls.length; c++) {
        var el = controls[c];
        if (!isVisible(el)) continue;
        var names = [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("title")];
        for (var n = 0; n < names.length; n++) {
          if (names[n] && norm(names[n]).toLowerCase().indexOf(label) === 0) return climbToField(el);
        }
      }
    }
    // 2) the SMALLEST leaf-ish element whose visible text contains the label.
    //    Picking the shortest text avoids matching a parent whose concatenated
    //    text spans several fields (which would highlight the wrong area).
    var all = [].slice.call(document.querySelectorAll("label,span,div,button,a,th,h1,h2,h3,h4,p"));
    for (i = 0; i < labels.length; i++) {
      label = norm(labels[i]).toLowerCase();
      var best = null, bestLen = Infinity;
      for (var a = 0; a < all.length; a++) {
        var node = all[a];
        if (!isVisible(node) || node.children.length > 1) continue; // leaf-ish only
        var t = norm(node.textContent).toLowerCase();
        if (!t || t.indexOf(label) === -1) continue;
        if (t.length < bestLen) { best = node; bestLen = t.length; }
      }
      if (best) return climbToField(best);
    }
    return null;
  }

  /* ---------- the tour content ------------------------------------------ */
  // anchor: list of candidate labels · optional: skip if not found ·
  // condition: extra runtime check (e.g. only show when the field is visible)
  var STEPS = [
    {
      title: "Welcome 👋",
      body: "This is the <b>Leave Application</b> form.<br><br>You can open it any time from " +
            "<b>Leave Attendance → Requisitions → Leave Application</b>.<br><br>" +
            "This 1-minute tour shows how to apply. Click <b>Next</b> to begin."
    },
    {
      anchor: ["Basic Employee Information"],
      title: "Your details (auto-filled)",
      body: "Application Id, Employee Id, Name and Date of Joining are filled in for you and " +
            "are read-only. Nothing to do here."
    },
    {
      anchor: ["Leave Balance", "Entitled Leaves"],
      title: "Your leave balance",
      body: "Entitled, Availed and Balance leaves come from HR records. They already include any " +
            "pending requests — so this is your live balance."
    },
    {
      anchor: ["Leave Type *", "Leave Type"],
      title: "Choose a Leave Type *",
      body: "Pick one:<br>• <b>PL</b> — paid leave (uses your balance)<br>" +
            "• <b>LOP</b> — loss of pay (no balance needed)<br>" +
            "• <b>Optional Leave</b> — optional/festival holiday (uses optional balance)."
    },
    {
      anchor: ["Half Day *", "Half Day"],
      title: "Full day or half day? *",
      body: "Choose <b>No</b> for a full day or <b>Yes</b> for half a day.<br><br>" +
            "Note: <b>Optional Leave is always full-day</b>, so this is locked to “No” for it."
    },
    {
      anchor: ["Half Day Type"],
      optional: true,
      condition: function (el) { return isVisible(el); },
      title: "Which half?",
      body: "Since you picked half-day, choose <b>First Half</b> or <b>Second Half</b>."
    },
    {
      anchor: ["Leave Dates(From & To) *", "Leave Dates"],
      title: "Pick your dates *",
      body: "Open the calendar, choose a <b>Start</b> and an <b>End</b> date, then click <b>Apply</b>. " +
            "For a single day, click the same date twice.<br><br>" +
            "⚠️ Keep the dates within one calendar month and not beyond the 25th. " +
            "If your leave crosses a month, split it into separate applications."
    },
    {
      anchor: ["No of Days"],
      title: "Number of days",
      body: "Calculated automatically from your dates (and shows 0.5 for a half-day)."
    },
    {
      anchor: ["Reason *", "Reason"],
      title: "Add a reason *",
      body: "Briefly state why you’re taking leave."
    },
    {
      anchor: ["File Upload if any"],
      optional: true,
      title: "Attach a file (optional)",
      body: "Upload any supporting document if you need to."
    },
    {
      anchor: ["I have cross checked"],
      title: "Confirm the details *",
      body: "Tick this box to confirm you’ve cross-checked the dates and details."
    },
    {
      anchor: ["Submit"],
      title: "Submit 🚀",
      body: "Click <b>Submit</b> to send your application. It then goes to <b>Manager Approval</b>, " +
            "then <b>HR</b>. Track it under <b>Leave Attendance → Status of Applications → " +
            "Leave Applications</b>.<br><br><i>This tour will not submit for you.</i>"
    }
  ];

  /* ---------- styles ----------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById(PREFIX + "-style")) return;
    var css = document.createElement("style");
    css.id = PREFIX + "-style";
    css.textContent = [
      "." + PREFIX + "-spot{position:absolute;z-index:2147483646;border-radius:8px;",
      "box-shadow:0 0 0 4px rgba(37,99,235,.9),0 0 0 9999px rgba(15,23,42,.55);",
      "pointer-events:none;transition:all .25s ease;}",
      "." + PREFIX + "-tip{position:absolute;z-index:2147483647;max-width:340px;background:#fff;",
      "color:#0f172a;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);",
      "font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:16px 18px;}",
      "." + PREFIX + "-tip h3{margin:0 0 8px;font-size:16px;color:#1e3a8a;}",
      "." + PREFIX + "-tip p{margin:0 0 14px;}",
      "." + PREFIX + "-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}",
      "." + PREFIX + "-count{font-size:12px;color:#64748b;}",
      "." + PREFIX + "-btns{display:flex;gap:8px;}",
      "." + PREFIX + "-btn{border:0;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;}",
      "." + PREFIX + "-next{background:#2563eb;color:#fff;}",
      "." + PREFIX + "-back{background:#e2e8f0;color:#0f172a;}",
      "." + PREFIX + "-x{position:absolute;top:8px;right:10px;border:0;background:transparent;",
      "font-size:18px;line-height:1;color:#94a3b8;cursor:pointer;}",
      "." + PREFIX + "-center{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);}",
      "." + PREFIX + "-veil{position:fixed;inset:0;z-index:2147483645;background:rgba(15,23,42,.55);}"
    ].join("");
    document.head.appendChild(css);
  }

  /* ---------- overlay elements ------------------------------------------ */
  var spot, tip, veil;
  function ensureEls() {
    if (!spot) { spot = document.createElement("div"); spot.className = PREFIX + "-spot"; }
    if (!tip)  { tip  = document.createElement("div"); tip.className  = PREFIX + "-tip"; }
    if (!spot.parentNode) document.body.appendChild(spot);
    if (!tip.parentNode)  document.body.appendChild(tip);
  }
  function showVeil() {
    if (!veil) { veil = document.createElement("div"); veil.className = PREFIX + "-veil"; }
    if (!veil.parentNode) document.body.appendChild(veil);
  }
  function hideVeil() { if (veil && veil.parentNode) veil.parentNode.removeChild(veil); }

  /* ---------- render a step --------------------------------------------- */
  function render() {
    var step = STEPS[state.order[state.i]];
    var anchorEl = step.anchor ? findAnchor(step.anchor) : null;

    var html =
      '<button class="' + PREFIX + '-x" title="Close">×</button>' +
      "<h3>" + step.title + "</h3>" +
      "<p>" + step.body + "</p>" +
      '<div class="' + PREFIX + '-row">' +
        '<span class="' + PREFIX + '-count">Step ' + (state.i + 1) + " of " + state.order.length + "</span>" +
        '<span class="' + PREFIX + '-btns">' +
          (state.i > 0 ? '<button class="' + PREFIX + '-btn ' + PREFIX + '-back">Back</button>' : "") +
          '<button class="' + PREFIX + '-btn ' + PREFIX + '-next">' +
            (state.i === state.order.length - 1 ? "Done" : "Next") +
          "</button>" +
        "</span>" +
      "</div>";

    ensureEls();
    tip.innerHTML = html;
    tip.querySelector("." + PREFIX + "-x").onclick = stop;
    tip.querySelector("." + PREFIX + "-next").onclick = next;
    var back = tip.querySelector("." + PREFIX + "-back");
    if (back) back.onclick = prev;

    if (anchorEl) {
      hideVeil();
      anchorEl.scrollIntoView({ block: "center", behavior: "smooth" });
      // position after the smooth scroll settles
      setTimeout(function () { positionAt(anchorEl); }, 300);
    } else {
      // no anchor (intro / not found) → centered modal with a veil
      showVeil();
      spot.style.display = "none";
      tip.classList.add(PREFIX + "-center");
    }
  }

  function positionAt(el) {
    var r = el.getBoundingClientRect();
    var sx = window.scrollX, sy = window.scrollY;
    spot.style.display = "block";
    spot.style.left = (r.left + sx - 4) + "px";
    spot.style.top = (r.top + sy - 4) + "px";
    spot.style.width = (r.width + 8) + "px";
    spot.style.height = (r.height + 8) + "px";

    tip.classList.remove(PREFIX + "-center");
    var tw = tip.offsetWidth || 340, th = tip.offsetHeight || 160;
    var below = r.bottom + 12 + th < window.innerHeight;
    var top = below ? (r.bottom + sy + 12) : (r.top + sy - th - 12);
    if (!below && top < sy) top = r.bottom + sy + 12; // fall back below if no room above
    var left = Math.min(Math.max(r.left + sx, 8 + sx), sx + window.innerWidth - tw - 8);
    tip.style.top = top + "px";
    tip.style.left = left + "px";
  }

  /* ---------- navigation ------------------------------------------------- */
  function stepUsable(idx) {
    var step = STEPS[idx];
    if (!step.anchor) return true;            // intro-style step
    var el = findAnchor(step.anchor);
    if (!el) return !step.optional ? true : false;   // keep required steps even if not found
    if (step.condition && !step.condition(el)) return false;
    return true;
  }

  function rebuildOrder() {
    state.order = [];
    for (var k = 0; k < STEPS.length; k++) if (stepUsable(k)) state.order.push(k);
  }

  function next() {
    if (state.i >= state.order.length - 1) { stop(); return; }
    state.i++; rebuildOrderPreserving(); render();
  }
  function prev() {
    if (state.i <= 0) return;
    state.i--; rebuildOrderPreserving(); render();
  }
  // Re-evaluate conditional steps (the form may have changed) while keeping
  // the user on the same logical step where possible.
  function rebuildOrderPreserving() {
    var currentStepIdx = state.order[state.i];
    rebuildOrder();
    var pos = state.order.indexOf(currentStepIdx);
    state.i = pos >= 0 ? pos : Math.min(state.i, state.order.length - 1);
  }

  function onScrollResize() {
    if (!spot || spot.style.display === "none") return;
    var step = STEPS[state.order[state.i]];
    var el = step.anchor ? findAnchor(step.anchor) : null;
    if (el) positionAt(el);
  }

  /* ---------- lifecycle -------------------------------------------------- */
  function start() {
    injectStyles();
    var looksRight = /Leave Application/i.test(document.title) ||
                     !!findAnchor(["Leave Type *", "Leave Type"]);
    if (!looksRight) {
      alert("Open the Leave Application form first, then run the tour.");
      return;
    }
    state.i = 0;
    rebuildOrder();
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize, true);
    document.addEventListener("keydown", onKey, true);
    render();
  }

  function onKey(e) {
    if (e.key === "Escape") stop();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") prev();
  }

  function stop() {
    window.removeEventListener("scroll", onScrollResize, true);
    window.removeEventListener("resize", onScrollResize, true);
    document.removeEventListener("keydown", onKey, true);
    [spot, tip, veil].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    spot = tip = veil = null;
  }

  window.LeaveTour = { start: start, stop: stop, next: next, prev: prev };
  start(); // auto-start on load
})();

/* ============================================================================
 * LOADING OPTIONS
 *
 * 1) CONSOLE (quickest)
 *    - Open the Leave Application form in the browser.
 *    - Press F12 → Console. (If it says "Don't paste...", type: allow pasting)
 *    - Paste this entire file, press Enter. The tour starts automatically.
 *
 * 2) DEVTOOLS SNIPPET (reusable, no re-paste)
 *    - F12 → Sources → Snippets → New snippet → paste this file → Save.
 *    - Right-click the snippet → Run (or Ctrl/Cmd+Enter) on the form page.
 *
 * 3) BOOKMARKLET (best for real end-users)
 *    - Host this file somewhere reachable, e.g. https://your.host/leave-application-tour.js
 *    - Create a bookmark whose URL is the one line below (edit the host):
 *
 *      javascript:(function(){var s=document.createElement('script');s.src='https://your.host/leave-application-tour.js?'+Date.now();document.body.appendChild(s);})();
 *
 *    - Open the form, click the bookmark → tour starts.
 *    - (For broad rollout, a tiny browser extension that injects the same
 *       script on the form's URL is the most seamless delivery.)
 * ==========================================================================*/
