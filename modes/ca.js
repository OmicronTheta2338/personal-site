/**
 * modes/ca.js — Conway's Game of Life + Generations CA rulesets
 *
 * Registers all CA modes into window.__modes for engine.js to pick up.
 * All CA modes share a single grid (switching ruleset keeps the board alive).
 */

(function () {
    "use strict";

    const LIVE_CHANCE = 0.30;

    /* ── Module-level shared grid ────────────────────────────── */
    let current, next, COLS, ROWS;
    let initialised = false;

    function idx(c, r) { return r * COLS + c; }

    function randomise() {
        for (let i = 0; i < current.length; i++)
            current[i] = Math.random() < LIVE_CHANCE ? 1 : 0;
    }

    function countAlive(col, row) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nc = (col + dc + COLS) % COLS;
                const nr = (row + dr + ROWS) % ROWS;
                if (current[idx(nc, nr)] === 1) n++;
            }
        }
        return n;
    }

    /* ── Colour palette for multi-state cells ─────────────────── */
    const TAN_RGB = [212, 184, 150];
    const BLACK_RGB = [26, 18, 9];

    function buildColors(gens) {
        const colors = new Array(gens);
        colors[0] = null; // dead — background covers it
        colors[1] = `rgb(${BLACK_RGB.join(",")})`;
        for (let s = 2; s < gens; s++) {
            const t = (s - 1) / (gens - 1);
            const r = Math.round(BLACK_RGB[0] + t * (TAN_RGB[0] - BLACK_RGB[0]));
            const g = Math.round(BLACK_RGB[1] + t * (TAN_RGB[1] - BLACK_RGB[1]));
            const b = Math.round(BLACK_RGB[2] + t * (TAN_RGB[2] - BLACK_RGB[2]));
            colors[s] = `rgb(${r},${g},${b})`;
        }
        return colors;
    }

    /* ── Mode factory ─────────────────────────────────────────── */
    function makeCAMode(id, label, survive, born, gens) {
        let cellColors = buildColors(gens);

        return {
            id,
            label,
            stepMs: 100,

            init(shared) {
                if (initialised) return;
                COLS = shared.COLS;
                ROWS = shared.ROWS;
                current = new Uint8Array(COLS * ROWS);
                next = new Uint8Array(COLS * ROWS);
                randomise();
                initialised = true;
            },

            activate(_shared) {
                cellColors = buildColors(gens);
                // Clear stale refractory cells when switching to a 2-state rule
                if (gens === 2) {
                    for (let i = 0; i < current.length; i++)
                        if (current[i] > 1) current[i] = 0;
                }
            },

            deactivate() { },

            step(_shared) {
                for (let row = 0; row < ROWS; row++) {
                    for (let col = 0; col < COLS; col++) {
                        const s = current[idx(col, row)];
                        let ns;
                        if (s === 0) {
                            ns = born.has(countAlive(col, row)) ? 1 : 0;
                        } else if (s === 1) {
                            ns = survive.has(countAlive(col, row)) ? 1 : (gens === 2 ? 0 : 2);
                        } else {
                            ns = s + 1 >= gens ? 0 : s + 1;
                        }
                        next[idx(col, row)] = ns;
                    }
                }
                const tmp = current; current = next; next = tmp;
            },

            render(shared) {
                const { ctx, canvas, TAN_HEX } = shared;
                ctx.fillStyle = TAN_HEX;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                for (let row = 0; row < ROWS; row++) {
                    for (let col = 0; col < COLS; col++) {
                        const s = current[idx(col, row)];
                        if (s > 0) {
                            ctx.fillStyle = cellColors[s];
                            ctx.fillRect(col * shared.CELL, row * shared.CELL, shared.CELL, shared.CELL);
                        }
                    }
                }
            },

            onRandomise(_shared) { randomise(); },

            onPaint(col, row, _shared) { current[idx(col, row)] = 1; },
        };
    }

    /* ── Ruleset definitions — registered into global mode list ── */
    window.__modes = window.__modes || [];
    window.__modes.push(
        makeCAMode("gameoflife", "Game of Life", new Set([2, 3]), new Set([3]), 2),
        makeCAMode("starwars", "Star Wars", new Set([3, 4, 5]), new Set([2]), 4),
        makeCAMode("brians", "Brian's Brain", new Set([]), new Set([2]), 3),
        makeCAMode("brain6", "Brain 6", new Set([6]), new Set([2, 4, 6]), 3),
        makeCAMode("rake", "Rake", new Set([3, 4, 6, 7]), new Set([2, 6, 7, 8]), 6),
        makeCAMode("bombers", "Bombers", new Set([3, 4, 5]), new Set([2, 4]), 25),
        makeCAMode("sedimental", "SediMental", new Set([4, 5, 6, 7, 8]), new Set([2, 5, 6, 7, 8]), 4)
    );

})();
