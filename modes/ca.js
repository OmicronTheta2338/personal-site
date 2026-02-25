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
    let current, next, permanentlyDead, COLS, ROWS;
    let initialised = false;

    function idx(c, r) { return r * COLS + c; }

    function randomise() {
        for (let i = 0; i < current.length; i++) {
            if (permanentlyDead && permanentlyDead[i]) {
                current[i] = 0;
            } else {
                current[i] = Math.random() < LIVE_CHANCE ? 1 : 0;
            }
        }
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
    function buildColors(gens) {
        const colors = new Array(gens);
        colors[0] = null; // dead — background covers it

        // Grab dynamic hue from global context, default to original tan hue (33)
        const hue = (window.__sharedColors && window.__sharedColors.HUE !== undefined)
            ? window.__sharedColors.HUE
            : 33;

        // Black state (state 1) is very dark, but retains a slight tint of the hue
        colors[1] = `hsl(${hue}, 48%, 7%)`;

        for (let s = 2; s < gens; s++) {
            const t = (s - 1) / (gens - 1);

            // Lerp lightness from 7% (black) up to 71% (background tan)
            const l = Math.round(7 + t * (71 - 7));

            // Saturation slightly lerps down from 48% (black) to 42% (tan)
            const sat = Math.round(48 + t * (42 - 48));

            colors[s] = `hsl(${hue}, ${sat}%, ${l}%)`;
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
            CELL: 12, // Expose CELL size for getSolids to compute cleanly without engine.js dependencies

            rebuildColors() {
                cellColors = buildColors(gens);
            },

            init(shared) {
                if (initialised) return;
                COLS = shared.COLS;
                ROWS = shared.ROWS;
                current = new Uint8Array(COLS * ROWS);
                next = new Uint8Array(COLS * ROWS);
                if (!permanentlyDead || permanentlyDead.length !== COLS * ROWS) {
                    permanentlyDead = new Uint8Array(COLS * ROWS);
                }
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
                        const i = idx(col, row);
                        if (permanentlyDead[i]) {
                            next[i] = 0;
                            continue;
                        }
                        const s = current[i];
                        let ns;
                        if (s === 0) {
                            ns = born.has(countAlive(col, row)) ? 1 : 0;
                        } else if (s === 1) {
                            ns = survive.has(countAlive(col, row)) ? 1 : (gens === 2 ? 0 : 2);
                        } else {
                            ns = s + 1 >= gens ? 0 : s + 1;
                        }
                        next[i] = ns;
                    }
                }
                const tmp = current; current = next; next = tmp;
            },

            render(shared) {
                const { ctx, canvas, TAN_HEX } = shared;
                ctx.fillStyle = TAN_HEX;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Calculate tiling to draw the viewport-height grid all the way down the page
                const blockHeight = ROWS * shared.CELL;
                const repeats = Math.max(Math.ceil(canvas.height / blockHeight), 1);

                for (let r = 0; r < repeats; r++) {
                    const yOffset = r * blockHeight;
                    for (let row = 0; row < ROWS; row++) {
                        for (let col = 0; col < COLS; col++) {
                            const i = idx(col, row);
                            if (permanentlyDead && permanentlyDead[i]) {
                                ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
                                ctx.fillRect(col * shared.CELL, yOffset + row * shared.CELL, shared.CELL, shared.CELL);
                            } else {
                                const s = current[i];
                                if (s > 0) {
                                    ctx.fillStyle = cellColors[s];
                                    ctx.fillRect(col * shared.CELL, yOffset + row * shared.CELL, shared.CELL, shared.CELL);
                                }
                            }
                        }
                    }
                }
            },

            onRandomise(_shared) { randomise(); },

            onPaint(col, row, _shared) {
                const i = idx(col, row);
                if (!permanentlyDead[i]) current[i] = 1;
            },

            destroy(exX, exY, radius, shared) {
                if (!initialised) return false;
                const canvasHeight = shared ? shared.canvas.height : window.innerHeight;
                const canvasWidth = shared ? shared.canvas.width : window.innerWidth;
                const blockHeight = ROWS * shared.CELL;
                const repeats = Math.max(Math.ceil(canvasHeight / blockHeight), 1);

                let columnRect = null;
                if (shared && !shared.columnHidden) {
                    const colEl = document.getElementById("column");
                    if (colEl) {
                        const hr = colEl.getBoundingClientRect();
                        columnRect = {
                            left: hr.left + window.scrollX,
                            right: hr.right + window.scrollX,
                            top: hr.top + window.scrollY,
                            bottom: hr.bottom + window.scrollY
                        };
                    }
                }

                let hits = false;
                for (let r_offset = 0; r_offset < repeats; r_offset++) {
                    const yOffset = r_offset * blockHeight;
                    for (let row = 0; row < ROWS; row++) {
                        for (let col = 0; col < COLS; col++) {
                            const cx = col * shared.CELL + shared.CELL / 2;
                            const cy = yOffset + row * shared.CELL + shared.CELL / 2;

                            if (columnRect) {
                                if (cx >= columnRect.left && cx <= columnRect.right &&
                                    cy >= columnRect.top && cy <= columnRect.bottom) {
                                    continue;
                                }
                            }

                            const dx = cx - exX;
                            const dy = cy - exY;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist <= radius) {
                                const i = idx(col, row);
                                permanentlyDead[i] = 1;
                                current[i] = 0;
                                hits = true;
                            }
                        }
                    }
                }
                return hits;
            },

            getSolids(shared) {
                if (!initialised) return [];
                const solids = [];

                // Calculate tiling for physics boxes too!
                // shared may be passed by platformer/snake, fallback to innerHeight if not
                const canvasHeight = shared ? shared.canvas.height : window.innerHeight;
                const blockHeight = ROWS * this.CELL;
                const repeats = Math.max(Math.ceil(canvasHeight / blockHeight), 1);

                for (let r = 0; r < repeats; r++) {
                    const yOffset = r * blockHeight;
                    for (let row = 0; row < ROWS; row++) {
                        for (let col = 0; col < COLS; col++) {
                            if (current[idx(col, row)] > 0) {
                                solids.push({
                                    left: col * this.CELL,
                                    right: col * this.CELL + this.CELL,
                                    top: yOffset + row * this.CELL,
                                    bottom: yOffset + row * this.CELL + this.CELL
                                });
                            }
                        }
                    }
                }
                return solids;
            },

            getCAState() {
                if (!initialised) return null;
                return { current, COLS, ROWS };
            }
        };
    }

    /* ── Ruleset definitions — registered into global mode list ── */
    window.__modes = window.__modes || [];
    const caModes = [
        makeCAMode("gameoflife", "Game of Life", new Set([2, 3]), new Set([3]), 2),
        makeCAMode("starwars", "Star Wars", new Set([3, 4, 5]), new Set([2]), 4),
        makeCAMode("brians", "Brian's Brain", new Set([]), new Set([2]), 3),
        makeCAMode("brain6", "Brain 6", new Set([6]), new Set([2, 4, 6]), 3),
        makeCAMode("rake", "Rake", new Set([3, 4, 6, 7]), new Set([2, 6, 7, 8]), 6),
        makeCAMode("bombers", "Bombers", new Set([3, 4, 5]), new Set([2, 4]), 25),
        makeCAMode("sedimental", "SediMental", new Set([4, 5, 6, 7, 8]), new Set([2, 5, 6, 7, 8]), 4)
    ];

    caModes.forEach(m => window.__modes.push(m));

    // Listen for color slider updates to recalculate mathematically perfect HSL tint arrays
    window.addEventListener('colorChanged', function (e) {
        if (!initialised) return;
        // Since CA shares a grid, all CA modes mathematically rebuild their palette references
        // We could just rebuild the *active* one, but rebuilding all is fast enough
        caModes.forEach(function (m) {
            if (typeof m.rebuildColors === 'function') {
                m.rebuildColors();
            }
        });
    });

})();
