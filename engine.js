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
    const TAN_HEX = "#d4b896";
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
    const ROWS = Math.ceil((column.offsetHeight + 10 * CELL) / CELL);
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
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
        CELL, COLS, ROWS,
        TAN_HEX, BLACK_HEX,
        COL_LEFT_CELL, COL_RIGHT_CELL,
        COL_TOP_CELL, COL_BOTTOM_CELL,
        columnHidden: false,
        currentMode: null, // Track currently active main gamemode
    };

    /* ── Column visibility toggle (Escape) ───────────────────── */
    function toggleColumn() {
        shared.columnHidden = !shared.columnHidden;
        column.classList.toggle("col-hidden", shared.columnHidden);
    }

    /* ── Shared colliders for overlay modes ──────────────────── */
    function buildCharacterColliders() {
        shared.textColliders = [];
        var elems = document.querySelectorAll('#site-header h1, #site-header p, #site-nav a, .section h2, .section p, .section li, #contact p, #gol-controls, #overlay-controls, #site-footer, #randomise-btn');
        var textNodes = [];

        var walk = document.createTreeWalker(document.getElementById("column"), NodeFilter.SHOW_TEXT, null, false);
        var ruleOpts = document.getElementById("rule-options");
        var overlayOpts = document.getElementById("overlay-options");
        var isRuleOptsHidden = ruleOpts ? ruleOpts.hidden : true;
        var isOverlayOptsHidden = overlayOpts ? overlayOpts.hidden : true;
        var node;

        while (node = walk.nextNode()) {
            var parent = node.parentElement;
            if (isRuleOptsHidden && ruleOpts && ruleOpts.contains(parent)) continue;
            if (isOverlayOptsHidden && overlayOpts && overlayOpts.contains(parent)) continue;
            var isTarget = false;
            for (var i = 0; i < elems.length; i++) {
                if (elems[i].contains(parent)) { isTarget = true; break; }
            }
            if (isTarget && node.nodeValue.trim().length > 0) textNodes.push(node);
        }

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
                        // If it's part of an active dropdown menu option, we still want it to be collidable!
                        // Wait, dropdown text nodes were already excluded from `textNodes` if they belong to the dropdown itself.
                        // Actually, wait: `if (isRuleOptsHidden && ruleOpts.contains(parent)) continue;` handles hidden.
                        // If it's NOT hidden, the dropdown text nodes DO get into `textNodes`.
                        // If we blanket block them here, they will block themselves!

                        // Let's check if the parent is inside the blocking dropdown itself.
                        var parent = tn.parentElement;
                        var isInsideDropdown = (!isRuleOptsHidden && ruleOpts && ruleOpts.contains(parent)) ||
                            (!isOverlayOptsHidden && overlayOpts && overlayOpts.contains(parent));

                        if (!isInsideDropdown) {
                            continue; // Skip this character
                        }
                    }
                    shared.textColliders.push({
                        left: r.left + window.scrollX,
                        right: r.right + window.scrollX,
                        top: r.top + window.scrollY,
                        bottom: r.bottom + window.scrollY
                    });
                }
            }
        }

        shared.linkElements = [];
        var links = document.querySelectorAll('#column a, #rule-toggle, #overlay-toggle, #rule-options li, #overlay-options li, #randomise-btn');
        for (var i = 0; i < links.length; i++) {
            var el = links[i];
            if (el.tagName.toLowerCase() === 'li' && el.parentElement.id === 'rule-options' && isRuleOptsHidden) continue;
            if (el.tagName.toLowerCase() === 'li' && el.parentElement.id === 'overlay-options' && isOverlayOptsHidden) continue;
            var r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                var isInsideDropdown = (!isRuleOptsHidden && ruleOpts && ruleOpts.contains(el)) ||
                    (!isOverlayOptsHidden && overlayOpts && overlayOpts.contains(el));

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

    window.addEventListener('resize', buildCharacterColliders);
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
            }
        }
    }

    // Initialise all modes once, then activate the first
    MODES.forEach(m => { if (m.init) m.init(shared); });
    selectMode(MODES[0].id); // Defaults to Game of Life since Platformer was removed from the list

    // Run the simulation for 50 iterations while loading
    if (currentMode && currentMode.step) {
        for (let i = 0; i < 75; i++) {
            currentMode.step(shared);
        }
    }

    /* ── Main loop ───────────────────────────────────────────── */
    let lastStep = 0;
    function loop(ts) {
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
            row: Math.floor((e.clientY + window.scrollY) / CELL),
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

})();
