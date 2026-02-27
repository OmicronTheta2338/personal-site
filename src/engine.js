/**
 * engine.js — Canvas simulation / game engine
 *
 * Coordinates the rAF loop, shared canvas state, mode activation,
 * input handling, and collision collider rebuilding.
 */

import { MODES } from './modes/index.js';
import { shared, colors } from './shared.js';
import { buildCharacterColliders } from './colliders.js';
import { setCAStepMs } from './modes/ca.js';

const CELL = 12;

let currentMode = null;
let overlayMode = null;

export function selectMode(id) {
    const mode = MODES.find(m => m.id === id);
    if (!mode) return;
    if (currentMode && currentMode.deactivate) currentMode.deactivate();
    currentMode = mode;
    shared.currentMode = currentMode;
    if (currentMode.activate) currentMode.activate(shared);

    document.querySelectorAll('.rule-label-text').forEach(el => {
        el.textContent = mode.label;
    });
    document.querySelectorAll('.rule-options-list li').forEach(li => {
        li.classList.toggle('selected', li.dataset.value === id);
    });
}

export function setOverlayMode(modeId) {
    if (overlayMode && overlayMode.deactivate) overlayMode.deactivate(shared);

    if (modeId === "none") {
        overlayMode = null;
    } else {
        overlayMode = MODES.find(m => m.id === modeId);
        buildCharacterColliders(shared);
        if (overlayMode && overlayMode.activate) overlayMode.activate(shared);
    }
}

export function randomise() {
    if (currentMode && currentMode.onRandomise) currentMode.onRandomise(shared);
}

export function setStepMs(ms) {
    setCAStepMs(ms);
}

export function getOverlayMode() {
    return overlayMode;
}

export function initEngine() {
    const canvas = document.getElementById("life-canvas");
    const ctx = canvas.getContext("2d");
    const overlayCanvas = document.getElementById("overlay-canvas");
    const overlayCtx = overlayCanvas ? overlayCanvas.getContext("2d") : null;
    const column = document.getElementById("column");

    const COLS = Math.ceil(window.innerWidth / CELL);
    const ROWS = Math.max(Math.ceil(window.innerHeight / CELL), 1);
    canvas.width = COLS * CELL;
    canvas.height = Math.max(column.offsetHeight + 10 * CELL, window.innerHeight);
    if (overlayCanvas) {
        overlayCanvas.width = canvas.width;
        overlayCanvas.height = canvas.height;
    }

    const COL_PX_W = column.offsetWidth;
    const COL_LEFT_PX = (COLS * CELL - COL_PX_W) / 2;
    const COL_LEFT_CELL = Math.floor(COL_LEFT_PX / CELL);
    const COL_RIGHT_CELL = Math.ceil((COL_LEFT_PX + COL_PX_W) / CELL);
    const colRect = column.getBoundingClientRect();
    const COL_TOP_CELL = Math.floor((colRect.top + window.scrollY) / CELL);
    const COL_BOTTOM_CELL = Math.ceil((colRect.bottom + window.scrollY) / CELL);

    Object.assign(shared, {
        canvas, ctx, overlayCanvas, overlayCtx,
        CELL, COLS, ROWS,
        BLACK_HEX: "#1a1209",
        COL_LEFT_CELL, COL_RIGHT_CELL,
        COL_TOP_CELL, COL_BOTTOM_CELL,
    });

    shared.updateColliders = function () {
        setTimeout(() => buildCharacterColliders(shared), 10);
    };

    function toggleColumn() {
        shared.columnHidden = !shared.columnHidden;
        column.classList.toggle("col-hidden", shared.columnHidden);
    }

    function resizeCanvas() {
        const newHeight = Math.max(column.offsetHeight + 10 * CELL, window.innerHeight);
        if (canvas.height !== newHeight) {
            canvas.height = newHeight;
            if (overlayCanvas) overlayCanvas.height = newHeight;
            window.dispatchEvent(new CustomEvent('canvasResized'));
        }

        const cr = column.getBoundingClientRect();
        shared.COL_TOP_CELL = Math.floor((cr.top + window.scrollY) / CELL);
        shared.COL_BOTTOM_CELL = Math.ceil((cr.bottom + window.scrollY) / CELL);

        buildCharacterColliders(shared);
    }

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('pageChanged', resizeCanvas);
    window.addEventListener('contentRevealed', resizeCanvas);
    window.addEventListener('hashchange', shared.updateColliders);
    document.addEventListener('click', () => buildCharacterColliders(shared));

    MODES.forEach(m => { if (m.init) m.init(shared); });
    selectMode(MODES[0].id);

    if (currentMode && currentMode.step) {
        for (let i = 0; i < 100; i++) {
            currentMode.step(shared);
        }
    }

    let lastStep = 0;

    function loop(ts) {
        shared.frameCount++;

        const ms = typeof currentMode.stepMs === "function"
            ? currentMode.stepMs()
            : currentMode.stepMs;

        if (ts - lastStep >= ms) {
            currentMode.step(shared);
            if (overlayMode && !overlayMode.stepMs) overlayMode.step(shared);
            lastStep = ts;
        }

        const activeOverlay = overlayMode;  // snapshot — step() may null it via doorReached
        if (activeOverlay && typeof activeOverlay.step === 'function') {
            const overlayMs = typeof activeOverlay.stepMs === "function" ? activeOverlay.stepMs() : (activeOverlay.stepMs || 16);
            if (!activeOverlay._lastStep) activeOverlay._lastStep = 0;
            if (ts - activeOverlay._lastStep >= overlayMs) {
                activeOverlay.step(shared);
                activeOverlay._lastStep = ts;
            }
        }

        currentMode.render(shared);
        if (activeOverlay) activeOverlay.render(shared);
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // Event delegation for inline controls (randomise, rule dropdowns, overlay buttons)
    document.addEventListener("click", function (e) {
        const actionEl = e.target.closest("[data-action]");
        if (!actionEl) return;

        const action = actionEl.dataset.action;

        if (action === "randomise") {
            randomise();
            return;
        }

        if (action === "rule-toggle") {
            e.stopPropagation();
            const list = actionEl.closest('.inline-rule-select').querySelector('.rule-options-list');
            if (!list) return;
            const wasHidden = list.hidden;
            document.querySelectorAll('.rule-options-list').forEach(ul => { ul.hidden = true; });
            list.hidden = !wasHidden;
            actionEl.setAttribute("aria-expanded", String(wasHidden));
            shared.updateColliders();
            return;
        }

        if (action === "set-overlay") {
            const modeId = actionEl.dataset.mode;
            const btnRect = actionEl.getBoundingClientRect();
            const spawnX = btnRect.left + window.scrollX + btnRect.width / 2;
            const spawnY = btnRect.top + window.scrollY - CELL;

            if (modeId === 'snake') {
                shared.snakeConfig = {
                    spawnCol: Math.floor(spawnX / CELL),
                    spawnRow: Math.floor(spawnY / CELL),
                    spawnDir: { dc: 1, dr: 0 },
                };
            } else if (modeId === 'platformer') {
                shared.platformerSpawnPos = { x: spawnX, y: spawnY };
            } else if (modeId === 'tank') {
                shared.tankSpawnPos = { x: spawnX, y: spawnY };
            }

            setOverlayMode(modeId);
            return;
        }

        if (action === "start-minesweeper") {
            selectMode("minesweeper");
            return;
        }

        if (action === "start-snake") {
            window.dispatchEvent(new CustomEvent('tourStartSnake'));
            return;
        }
    });

    document.addEventListener("click", function (e) {
        const li = e.target.closest('.rule-options-list li');
        if (!li) return;
        selectMode(li.dataset.value);
        const list = li.closest('.rule-options-list');
        if (list) {
            list.hidden = true;
            const toggle = list.parentElement.querySelector('[data-action="rule-toggle"]');
            if (toggle) toggle.setAttribute("aria-expanded", "false");
        }
        shared.updateColliders();
    });

    // Close all open rule dropdowns on any click
    document.addEventListener("click", function (e) {
        if (!e.target.closest('[data-action="rule-toggle"]')) {
            document.querySelectorAll('.rule-options-list').forEach(ul => {
                ul.hidden = true;
            });
            document.querySelectorAll('[data-action="rule-toggle"]').forEach(btn => {
                btn.setAttribute("aria-expanded", "false");
            });
        }
        setTimeout(shared.updateColliders, 10);
    });

    document.addEventListener("keydown", e => {
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
        if (currentMode.onMouseDown && (!inColumn || currentMode.fullCanvas)) {
            currentMode.onMouseDown(e, shared);
            return;
        }
        if (e.button === 0 && !inColumn) {
            e.preventDefault();
            painting = true;
            tryPaint(e);
        }
    });
    document.addEventListener("mousemove", function (e) { if (painting) tryPaint(e); });
    document.addEventListener("mouseup", function () { painting = false; });

    document.addEventListener("click", function (e) {
        let btn = e.target.closest("button, a");
        if (btn) btn.blur();
    });

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

    window.addEventListener('colorChanged', function () {
        // colors object is already updated by color-slider.js
    });
}
