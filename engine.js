/**
 * engine.js — Canvas simulation / game engine
 *
 * Coordinates the rAF loop and shared canvas state.
 * Reads all modes from window.__modes (populated by modes/*.js scripts
 * loaded before this file in index.html).
 *
 * Each mode implements:
 *   { id, label, stepMs,
 *     init(shared), activate(shared), deactivate(),
 *     step(shared), render(shared),
 *     onRandomise?(shared), onPaint?(col, row, shared),
 *     onKeyDown?(e, shared), onKeyUp?(e, shared) }
 *
 * To add a new game: create modes/mygame.js (push to window.__modes),
 * add a <script> tag in index.html before engine.js, add a <li> to the dropdown.
 */

(function () {
    "use strict";

    const MODES = window.__modes || [];

    /* ── Palette & cell size (shared constants) ─────────────── */
    const CELL = 12;
    let TAN_HEX = window.__sharedColors ? window.__sharedColors.TAN_HEX : "#d4b896";
    const BLACK_HEX = "#1a1209";

    /* ── DOM ─────────────────────────────────────────────────── */
    const canvas = document.getElementById("life-canvas");
    const ctx = canvas.getContext("2d");
    const overlayCanvas = document.getElementById("overlay-canvas");
    const overlayCtx = overlayCanvas ? overlayCanvas.getContext("2d") : null;
    const column = document.getElementById("column");
    const rndBtn = document.getElementById("randomise-btn");
    const ruleToggle = document.getElementById("rule-toggle");
    const ruleLabel = document.getElementById("rule-label");
    const ruleOpts = document.getElementById("rule-options");
    const overlayToggle = document.getElementById("overlay-toggle");
    const overlayLabel = document.getElementById("overlay-label");
    const overlayOpts = document.getElementById("overlay-options");
    const overlayHint = document.getElementById("overlay-hint");

    /* ── Grid (fixed at load) ────────────────────────────────── */
    const COLS = Math.ceil(window.innerWidth / CELL);
    const ROWS = Math.max(Math.ceil(window.innerHeight / CELL), 1);
    canvas.width = COLS * CELL;
    canvas.height = Math.max(column.offsetHeight + 10 * CELL, window.innerHeight);
    if (overlayCanvas) {
        overlayCanvas.width = canvas.width;
        overlayCanvas.height = canvas.height;
    }

    /* ── Column bounds (cells) ───────────────────────────────── */
    const COL_PX_W = column.offsetWidth;
    const COL_LEFT_PX = (COLS * CELL - COL_PX_W) / 2;
    const COL_LEFT_CELL = Math.floor(COL_LEFT_PX / CELL);
    const COL_RIGHT_CELL = Math.ceil((COL_LEFT_PX + COL_PX_W) / CELL);
    const colRect = column.getBoundingClientRect();
    const COL_TOP_CELL = Math.floor((colRect.top + window.scrollY) / CELL);
    const COL_BOTTOM_CELL = Math.ceil((colRect.bottom + window.scrollY) / CELL);

    /* ── Shared context (passed by reference to every mode call) */
    const shared = {
        canvas, ctx, overlayCanvas, overlayCtx,
        textColliders: [], linkElements: [],
        sliderMarkerColliders: [],
        CELL, COLS, ROWS,
        get TAN_HEX() { return TAN_HEX; },
        get COMP_HEX() { return window.__sharedColors ? window.__sharedColors.COMP_HEX : "#40d060"; },
        get COMP_DARK_HEX() { return window.__sharedColors ? window.__sharedColors.COMP_DARK_HEX : "#2a9d45"; },
        BLACK_HEX,
        COL_LEFT_CELL, COL_RIGHT_CELL,
        COL_TOP_CELL, COL_BOTTOM_CELL,
        columnRect: null,
        columnHidden: false,
        currentMode: null, // Track currently active main gamemode
        frameCount: 0,
        get isAboutSiteActive() {
            var v = document.getElementById("view-about-site");
            return v ? getComputedStyle(v).display !== "none" : false;
        },
    };

    window.__engineShared = shared;

    /* ── Column visibility toggle (Escape) ───────────────────── */
    function toggleColumn() {
        shared.columnHidden = !shared.columnHidden;
        column.classList.toggle("col-hidden", shared.columnHidden);
    }

    /* ── Shared colliders for overlay modes ──────────────────── */
    function buildCharacterColliders() {
        shared.textColliders = [];

        var colEl = document.getElementById("column");
        if (colEl) {
            var hr = colEl.getBoundingClientRect();
            shared.columnRect = {
                left: hr.left + window.scrollX,
                right: hr.right + window.scrollX,
                top: hr.top + window.scrollY,
                bottom: hr.bottom + window.scrollY
            };
        } else {
            shared.columnRect = null;
        }

        var elems = document.querySelectorAll('#site-header h1, #site-header p, #site-nav a, #nav-more-label, #nav-more-options li, .section h2, .section p, .section li, #contact p, #gol-controls, #overlay-controls, #site-footer, #randomise-btn, #wg-generate-btn, #wg-sidebar h3, #wg-gamemode-list a, #wg-instructions h3, #wg-instructions p, .wg-word-row, .wg-history-item, .wg-hint');

        var ruleOpts = document.getElementById("rule-options");
        var overlayOpts = document.getElementById("overlay-options");
        var navOpts = document.getElementById("nav-more-options");
        var isRuleOptsHidden = ruleOpts ? ruleOpts.hidden : true;
        var isOverlayOptsHidden = overlayOpts ? overlayOpts.hidden : true;
        var isNavOptsHidden = navOpts ? navOpts.hidden : true;

        var textNodesSet = new Set();
        for (var i = 0; i < elems.length; i++) {
            var el = elems[i];
            // Drastically improve performance by ignoring unseen text from inactive tabs
            if (el.getBoundingClientRect().height === 0) continue;

            var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
            var node;
            while (node = walk.nextNode()) {
                var parent = node.parentElement;
                if (isRuleOptsHidden && ruleOpts && ruleOpts.contains(parent)) continue;
                if (isOverlayOptsHidden && overlayOpts && overlayOpts.contains(parent)) continue;
                if (isNavOptsHidden && navOpts && navOpts.contains(parent)) continue;
                if (node.nodeValue.trim().length > 0) {
                    textNodesSet.add(node);
                }
            }
        }
        var textNodes = Array.from(textNodesSet);

        // Calculate blocking rectangles for open dropdowns
        var blockingRects = [];
        if (!isRuleOptsHidden && ruleOpts) {
            var rect = ruleOpts.getBoundingClientRect();
            blockingRects.push({
                left: rect.left + window.scrollX,
                right: rect.right + window.scrollX,
                top: rect.top + window.scrollY,
                bottom: rect.bottom + window.scrollY
            });
        }
        if (!isOverlayOptsHidden && overlayOpts) {
            var rect = overlayOpts.getBoundingClientRect();
            blockingRects.push({
                left: rect.left + window.scrollX,
                right: rect.right + window.scrollX,
                top: rect.top + window.scrollY,
                bottom: rect.bottom + window.scrollY
            });
        }
        if (!isNavOptsHidden && navOpts) {
            var rect = navOpts.getBoundingClientRect();
            blockingRects.push({
                left: rect.left + window.scrollX,
                right: rect.right + window.scrollX,
                top: rect.top + window.scrollY,
                bottom: rect.bottom + window.scrollY
            });
        }

        function isObscured(r) {
            var rLeft = r.left + window.scrollX;
            var rRight = r.right + window.scrollX;
            var rTop = r.top + window.scrollY;
            var rBottom = r.bottom + window.scrollY;

            for (var j = 0; j < blockingRects.length; j++) {
                var b = blockingRects[j];
                // Check if the rectangle intersects with the blocking rectangle
                if (rLeft < b.right && rRight > b.left &&
                    rTop < b.bottom && rBottom > b.top) {
                    return true;
                }
            }
            return false;
        }

        var range = document.createRange();
        for (var i = 0; i < textNodes.length; i++) {
            var tn = textNodes[i];
            var len = tn.nodeValue.length;
            for (var c = 0; c < len; c++) {
                if (tn.nodeValue[c].trim() === '') continue;
                range.setStart(tn, c);
                range.setEnd(tn, c + 1);
                var r = range.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    // Check if the character is obscured by an open dropdown
                    if (isObscured(r)) {
                        // Let's check if the parent is inside the blocking dropdown itself.
                        var parent = tn.parentElement;
                        var isInsideDropdown = (!isRuleOptsHidden && ruleOpts && ruleOpts.contains(parent)) ||
                            (!isOverlayOptsHidden && overlayOpts && overlayOpts.contains(parent)) ||
                            (!isNavOptsHidden && navOpts && navOpts.contains(parent));

                        if (!isInsideDropdown) {
                            continue; // Skip this character
                        }
                    }
                    shared.textColliders.push({
                        left: r.left + window.scrollX,
                        right: r.right + window.scrollX,
                        top: r.top + window.scrollY,
                        bottom: r.bottom + window.scrollY,
                        node: tn.parentElement
                    });
                }
            }
        }

        shared.sliderMarkerColliders = [];
        shared.sliderBarColliders = [];
        var viewAboutSite = document.getElementById("view-about-site");
        var isAboutSiteActive = viewAboutSite && getComputedStyle(viewAboutSite).display !== "none";
        var sliderBar = document.getElementById("color-slider-bar");
        var sliderMarker = document.getElementById("color-slider-marker");

        var barTop = 0;
        var barBottom = 0;

        if (sliderBar && isAboutSiteActive) {
            var r = sliderBar.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                var barLeft = r.left + window.scrollX;
                var barRight = r.right + window.scrollX;
                barTop = r.top + window.scrollY;
                barBottom = r.bottom + window.scrollY;

                var visibleSegments = [{ left: barLeft, right: barRight }];

                // Carve out sections covered by dropdowns
                for (var j = 0; j < blockingRects.length; j++) {
                    var b = blockingRects[j];
                    if (barBottom > b.top && barTop < b.bottom) { // Vertical overlap
                        var newSegments = [];
                        for (var s = 0; s < visibleSegments.length; s++) {
                            var seg = visibleSegments[s];
                            if (seg.right > b.left && seg.left < b.right) { // Horizontal overlap
                                if (seg.left < b.left) {
                                    newSegments.push({ left: seg.left, right: b.left });
                                }
                                if (seg.right > b.right) {
                                    newSegments.push({ left: b.right, right: seg.right });
                                }
                            } else {
                                newSegments.push(seg); // No overlap, keep original
                            }
                        }
                        visibleSegments = newSegments;
                    }
                }

                for (var s = 0; s < visibleSegments.length; s++) {
                    shared.textColliders.push({
                        left: visibleSegments[s].left,
                        right: visibleSegments[s].right,
                        top: barTop,
                        bottom: barBottom,
                        isSlider: true
                    });
                    shared.sliderBarColliders.push({
                        left: visibleSegments[s].left,
                        right: visibleSegments[s].right,
                        top: barTop,
                        bottom: barBottom
                    });
                }
            }
        }

        if (sliderMarker && isAboutSiteActive) {
            var mr = sliderMarker.getBoundingClientRect();
            if (mr.width > 0 && mr.height > 0) {
                var isMarkerObscured = false;
                for (var j = 0; j < blockingRects.length; j++) {
                    var b = blockingRects[j];
                    if (mr.left + window.scrollX < b.right && mr.right + window.scrollX > b.left &&
                        mr.top + window.scrollY < b.bottom && mr.bottom + window.scrollY > b.top) {
                        isMarkerObscured = true;
                        break;
                    }
                }

                if (!isMarkerObscured) {
                    shared.sliderMarkerColliders.push({
                        left: mr.left + window.scrollX,
                        right: mr.right + window.scrollX,
                        top: mr.top + window.scrollY,
                        bottom: mr.bottom + window.scrollY,
                        el: sliderMarker
                    });
                }
            }
        }

        var perfMarker = document.getElementById("perf-marker");
        if (perfMarker && isAboutSiteActive) {
            var pr = perfMarker.getBoundingClientRect();
            if (pr.width > 0 && pr.height > 0) {
                var isPerfObscured = false;
                for (var j = 0; j < blockingRects.length; j++) {
                    var b = blockingRects[j];
                    if (pr.left + window.scrollX < b.right && pr.right + window.scrollX > b.left &&
                        pr.top + window.scrollY < b.bottom && pr.bottom + window.scrollY > b.top) {
                        isPerfObscured = true;
                        break;
                    }
                }
                if (!isPerfObscured) {
                    shared.textColliders.push({
                        left: pr.left + window.scrollX,
                        right: pr.right + window.scrollX,
                        top: pr.top + window.scrollY,
                        bottom: pr.bottom + window.scrollY,
                        isPerfMarker: true
                    });
                }
            }
        }

        shared.linkElements = [];
        var links = document.querySelectorAll('#column a, #site-nav a, #rule-toggle, #overlay-toggle, #nav-more-toggle, #rule-options li, #overlay-options li, #nav-more-options li, #randomise-btn, #wg-generate-btn');
        for (var i = 0; i < links.length; i++) {
            var el = links[i];
            if (el.tagName.toLowerCase() === 'li' && el.parentElement.id === 'rule-options' && isRuleOptsHidden) continue;
            if (el.tagName.toLowerCase() === 'li' && el.parentElement.id === 'overlay-options' && isOverlayOptsHidden) continue;
            if (el.tagName.toLowerCase() === 'li' && el.parentElement.id === 'nav-more-options' && isNavOptsHidden) continue;
            var r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                var isInsideDropdown = (!isRuleOptsHidden && ruleOpts && ruleOpts.contains(el)) ||
                    (!isOverlayOptsHidden && overlayOpts && overlayOpts.contains(el)) ||
                    (!isNavOptsHidden && navOpts && navOpts.contains(el));

                if (isObscured(r) && !isInsideDropdown) {
                    continue; // Skip this link if it's obscured by the dropdown
                }

                shared.linkElements.push({
                    el: el,
                    left: r.left + window.scrollX,
                    right: r.right + window.scrollX,
                    top: r.top + window.scrollY,
                    bottom: r.bottom + window.scrollY
                });
            }
        }
    }

    shared.updateColliders = function () {
        setTimeout(buildCharacterColliders, 10);
    };

    function resizeCanvas() {
        const newHeight = Math.max(column.offsetHeight + 10 * CELL, window.innerHeight);
        if (canvas.height !== newHeight) {
            canvas.height = newHeight;
            if (overlayCanvas) overlayCanvas.height = newHeight;
            window.dispatchEvent(new CustomEvent('canvasResized'));
        }
        buildCharacterColliders();
    }

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('pageChanged', resizeCanvas);
    window.addEventListener('hashchange', shared.updateColliders);
    document.addEventListener('click', buildCharacterColliders);
    const rt_toggle = document.getElementById('rule-toggle');
    const ot_toggle = document.getElementById('overlay-toggle');
    if (rt_toggle) rt_toggle.addEventListener('click', shared.updateColliders);
    if (ot_toggle) ot_toggle.addEventListener('click', shared.updateColliders);

    /* ── Mode management ─────────────────────────────────────── */
    let currentMode = null;
    let overlayMode = null;

    function selectMode(id) {
        const mode = MODES.find(m => m.id === id);
        if (!mode) return;
        if (currentMode && currentMode.deactivate) currentMode.deactivate();
        currentMode = mode;
        shared.currentMode = currentMode;
        if (currentMode.activate) currentMode.activate(shared);
    }

    function setOverlayMode(modeId) {
        if (overlayMode && overlayMode.deactivate) overlayMode.deactivate(shared);

        if (modeId === "none") {
            overlayMode = null;
            overlayHint.textContent = "none active";
        } else {
            overlayMode = MODES.find(m => m.id === modeId);
            buildCharacterColliders();
            if (overlayMode && overlayMode.activate) overlayMode.activate(shared);

            if (modeId === "platformer") {
                overlayHint.textContent = "A/D to move; W to jump; Enter to click";
            } else if (modeId === "snake") {
                overlayHint.textContent = "W/A/S/D to steer; bump links to click";
            } else if (modeId === "tank") {
                overlayHint.textContent = "W/S move; A/D turn; Space to shoot";
            }
        }
    }

    // Initialise all modes once, then activate the first
    MODES.forEach(m => { if (m.init) m.init(shared); });
    selectMode(MODES[0].id); // Defaults to Game of Life since Platformer was removed from the list

    // Run the simulation for 100 iterations while loading
    if (currentMode && currentMode.step) {
        for (let i = 0; i < 100; i++) {
            currentMode.step(shared);
        }
    }

    /* ── Main loop ───────────────────────────────────────────── */
    let lastStep = 0;

    let lastFrameTime = performance.now();
    let smoothedFrameTime = 16.6;

    function loop(ts) {
        shared.frameCount++;

        // --- Performance Indicator Logic ---
        var perfMarker = document.getElementById("perf-marker");
        var viewAboutSite = document.getElementById("view-about-site");
        if (perfMarker && viewAboutSite && getComputedStyle(viewAboutSite).display !== "none") {
            // Exclusively use frame time delta as it is a more reactive metric of engine load
            var delta = ts - lastFrameTime;
            lastFrameTime = ts;

            // heavily smooth the delta so it's readable
            smoothedFrameTime = smoothedFrameTime * 0.95 + delta * 0.05;

            // Map 16.6ms (60fps) to 0.0, and 60ms+ (heavy lag) to 1.0
            var resourceUsage = Math.max(0, Math.min(1, (smoothedFrameTime - 16.6) / 43.4));

            // Map 0.0-1.0 usage to max 86px top (100px container - 14px marker)
            // top=0 is 100% usage (top of the bar), top=86 is 0% usage (bottom of the bar)
            var newTop = (1 - resourceUsage) * 86;
            perfMarker.style.top = newTop + "px";

            // Dynamically update the hitbox for physics engines
            if (shared.textColliders) {
                for (var i = 0; i < shared.textColliders.length; i++) {
                    var tc = shared.textColliders[i];
                    if (tc.isPerfMarker) {
                        var rect = perfMarker.getBoundingClientRect();
                        tc.top = rect.top + window.scrollY;
                        tc.bottom = rect.bottom + window.scrollY;
                        break;
                    }
                }
            }
        }
        // -----------------------------------

        const ms = typeof currentMode.stepMs === "function"
            ? currentMode.stepMs()
            : currentMode.stepMs;

        if (ts - lastStep >= ms) {
            currentMode.step(shared);
            if (overlayMode && !overlayMode.stepMs) overlayMode.step(shared); // Run synced if overlay has no local step
            lastStep = ts;
        }

        if (overlayMode && typeof overlayMode.step === 'function') {
            // Platformer runs much faster (16ms) than Life (100ms)
            const overlayMs = typeof overlayMode.stepMs === "function" ? overlayMode.stepMs() : (overlayMode.stepMs || 16);
            if (!overlayMode._lastStep) overlayMode._lastStep = 0;
            if (ts - overlayMode._lastStep >= overlayMs) {
                overlayMode.step(shared);
                overlayMode._lastStep = ts;
            }
        }

        currentMode.render(shared);
        if (overlayMode) overlayMode.render(shared);
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    /* ── Randomise button ────────────────────────────────────── */
    rndBtn.addEventListener("click", () => {
        if (currentMode.onRandomise) currentMode.onRandomise(shared);
    });

    /* ── Keyboard ─────────────────────────────────────────────── */
    document.addEventListener("keydown", e => {
        // Prevent Spacebar from natively scrolling the page down
        if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
        }

        if (e.key === "Escape") { toggleColumn(); return; }
        if (overlayMode && overlayMode.onKeyDown) overlayMode.onKeyDown(e, shared);
        if (currentMode.onKeyDown && !e.defaultPrevented) currentMode.onKeyDown(e, shared);
    });
    document.addEventListener("keyup", e => {
        if (overlayMode && overlayMode.onKeyUp) overlayMode.onKeyUp(e, shared);
        if (currentMode.onKeyUp) currentMode.onKeyUp(e, shared);
    });

    /* ── Mouse / touch painting ──────────────────────────────── */
    let painting = false;

    function canvasCell(e) {
        return {
            col: Math.floor((e.clientX + window.scrollX) / CELL),
            row: Math.floor((e.clientY + window.scrollY) / CELL) % ROWS,
        };
    }
    function tryPaint(e) {
        if (!currentMode.onPaint) return;
        const { col, row } = canvasCell(e);
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS)
            currentMode.onPaint(col, row, shared);
    }

    document.addEventListener("mousedown", function (e) {
        var inColumn = column.contains(e.target);
        // Modes with onMouseDown (e.g. Minesweeper) handle their own clicks.
        // fullCanvas modes also receive clicks when column is showing.
        if (currentMode.onMouseDown && (!inColumn || currentMode.fullCanvas)) {
            currentMode.onMouseDown(e, shared);
            return;
        }
        // CA-style drag painting: left button, outside column only
        if (e.button === 0 && !inColumn) {
            e.preventDefault();
            painting = true;
            tryPaint(e);
        }
    });
    document.addEventListener("mousemove", function (e) { if (painting) tryPaint(e); });
    document.addEventListener("mouseup", function () { painting = false; });

    // Globally unfocus buttons/links on click so the Enter key doesn't get stolen 
    // by the browser's accessibility outline during platformer gameplay!
    document.addEventListener("click", function (e) {
        let btn = e.target.closest("button, a");
        if (btn) btn.blur();
    });

    // Suppress context menu when the current mode handles right-click
    document.addEventListener("contextmenu", function (e) {
        if (currentMode.onMouseDown) e.preventDefault();
    });

    canvas.addEventListener("touchstart", e => {
        e.preventDefault();
        Array.from(e.touches).forEach(tryPaint);
    }, { passive: false });
    canvas.addEventListener("touchmove", e => {
        e.preventDefault();
        Array.from(e.touches).forEach(tryPaint);
    }, { passive: false });

    /* ── Dropdown ────────────────────────────────────────────── */
    ruleToggle.addEventListener("click", e => {
        e.stopPropagation();
        const open = !ruleOpts.hidden;
        ruleOpts.hidden = open;
        ruleToggle.setAttribute("aria-expanded", String(!open));
    });

    ruleOpts.addEventListener("click", e => {
        const li = e.target.closest("li");
        if (!li) return;
        selectMode(li.dataset.value);
        ruleLabel.textContent = li.textContent.trim();
        ruleOpts.querySelectorAll("li").forEach(el =>
            el.classList.toggle("selected", el === li)
        );
        ruleOpts.hidden = true;
        ruleToggle.setAttribute("aria-expanded", "false");
    });

    if (overlayToggle && overlayOpts) {
        overlayToggle.addEventListener("click", e => {
            e.stopPropagation();
            const open = !overlayOpts.hidden;
            overlayOpts.hidden = open;
            overlayToggle.setAttribute("aria-expanded", String(!open));

            // Auto-close the other dropdown if open
            ruleOpts.hidden = true;
            ruleToggle.setAttribute("aria-expanded", "false");
        });

        overlayOpts.addEventListener("click", e => {
            const li = e.target.closest("li");
            if (!li) return;
            setOverlayMode(li.dataset.value);
            overlayLabel.textContent = li.textContent.trim();
            overlayOpts.querySelectorAll("li").forEach(el =>
                el.classList.toggle("selected", el === li)
            );
            overlayOpts.hidden = true;
            overlayToggle.setAttribute("aria-expanded", "false");
        });
    }

    document.addEventListener("click", function (e) {
        ruleOpts.hidden = true;
        ruleToggle.setAttribute("aria-expanded", "false");
        if (overlayOpts) {
            overlayOpts.hidden = true;
            if (overlayToggle) overlayToggle.setAttribute("aria-expanded", "false");
        }
        // Wait for the DOM to update before rebuilding colliders
        setTimeout(shared.updateColliders, 10);
    });

    // Color updater
    window.addEventListener('colorChanged', function (e) {
        TAN_HEX = e.detail.baseHex;
        // Game loop will naturally re-render using shared.TAN_HEX
    });

})();
