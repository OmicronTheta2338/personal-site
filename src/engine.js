/**
 * engine.js — Canvas simulation / game engine
 *
 * Coordinates the rAF loop, shared canvas state, mode activation,
 * input handling, and collision collider rebuilding.
 */

import { MODES } from './modes/index.js';
import { shared, colors } from './shared.js';
import { buildCharacterColliders } from './colliders.js';

const CELL = 12;

export function initEngine() {
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
        buildCharacterColliders(shared);
    }

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('pageChanged', resizeCanvas);
    window.addEventListener('hashchange', shared.updateColliders);
    document.addEventListener('click', () => buildCharacterColliders(shared));
    if (ruleToggle) ruleToggle.addEventListener('click', shared.updateColliders);
    if (overlayToggle) overlayToggle.addEventListener('click', shared.updateColliders);

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
            buildCharacterColliders(shared);
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

        var perfMarker = document.getElementById("perf-marker");
        var viewAboutSite = document.getElementById("view-about-site");
        if (perfMarker && viewAboutSite && getComputedStyle(viewAboutSite).display !== "none") {
            var resourceUsage = 0;
            if (performance.memory) {
                var usedMB = performance.memory.usedJSHeapSize / (1024 * 1024);
                resourceUsage = Math.max(0, Math.min(1, usedMB / 200));
            }

            var newTop = (1 - resourceUsage) * 86;
            perfMarker.style.top = newTop + "px";

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

        const ms = typeof currentMode.stepMs === "function"
            ? currentMode.stepMs()
            : currentMode.stepMs;

        if (ts - lastStep >= ms) {
            currentMode.step(shared);
            if (overlayMode && !overlayMode.stepMs) overlayMode.step(shared);
            lastStep = ts;
        }

        if (overlayMode && typeof overlayMode.step === 'function') {
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

    rndBtn.addEventListener("click", () => {
        if (currentMode.onRandomise) currentMode.onRandomise(shared);
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

    document.addEventListener("click", function () {
        ruleOpts.hidden = true;
        ruleToggle.setAttribute("aria-expanded", "false");
        if (overlayOpts) {
            overlayOpts.hidden = true;
            if (overlayToggle) overlayToggle.setAttribute("aria-expanded", "false");
        }
        setTimeout(shared.updateColliders, 10);
    });

    window.addEventListener('colorChanged', function (e) {
        // colors object is already updated by color-slider.js
    });
}
