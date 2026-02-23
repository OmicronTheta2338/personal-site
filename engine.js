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
    const column = document.getElementById("column");
    const rndBtn = document.getElementById("randomise-btn");
    const ruleToggle = document.getElementById("rule-toggle");
    const ruleLabel = document.getElementById("rule-label");
    const ruleOpts = document.getElementById("rule-options");

    /* ── Grid (fixed at load) ────────────────────────────────── */
    const COLS = Math.ceil(window.innerWidth / CELL);
    const ROWS = Math.ceil((column.offsetHeight + 10 * CELL) / CELL);
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;

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
        canvas, ctx,
        CELL, COLS, ROWS,
        TAN_HEX, BLACK_HEX,
        COL_LEFT_CELL, COL_RIGHT_CELL,
        COL_TOP_CELL, COL_BOTTOM_CELL,
        columnHidden: false,
    };

    /* ── Column visibility toggle (Escape) ───────────────────── */
    function toggleColumn() {
        shared.columnHidden = !shared.columnHidden;
        column.classList.toggle("col-hidden", shared.columnHidden);
    }

    /* ── Mode management ─────────────────────────────────────── */
    let currentMode = null;

    function selectMode(id) {
        const mode = MODES.find(m => m.id === id);
        if (!mode) return;
        if (currentMode && currentMode.deactivate) currentMode.deactivate();
        currentMode = mode;
        if (currentMode.activate) currentMode.activate(shared);
    }

    // Initialise all modes once, then activate the first
    MODES.forEach(m => { if (m.init) m.init(shared); });
    selectMode(MODES[0].id);

    /* ── Main loop ───────────────────────────────────────────── */
    let lastStep = 0;
    function loop(ts) {
        const ms = typeof currentMode.stepMs === "function"
            ? currentMode.stepMs()
            : currentMode.stepMs;
        if (ts - lastStep >= ms) {
            currentMode.step(shared);
            lastStep = ts;
        }
        currentMode.render(shared);
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
        if (currentMode.onKeyDown) currentMode.onKeyDown(e, shared);
    });
    document.addEventListener("keyup", e => {
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

    document.addEventListener("click", function () {
        ruleOpts.hidden = true;
        ruleToggle.setAttribute("aria-expanded", "false");
    });

})();
