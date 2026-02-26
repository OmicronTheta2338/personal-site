/**
 * modes/ca.js — Conway's Game of Life + Generations CA rulesets
 *
 * All CA modes share a single grid (switching ruleset keeps the board alive).
 */

import { colors } from '../shared.js';

const LIVE_CHANCE = 0.30;

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

function buildColors(gens) {
    const clrs = new Array(gens);
    clrs[0] = null;

    const hue = colors.HUE !== undefined ? colors.HUE : 33;

    clrs[1] = `hsl(${hue}, 48%, 7%)`;

    for (let s = 2; s < gens; s++) {
        const t = (s - 1) / (gens - 1);
        const l = Math.round(7 + t * (71 - 7));
        const sat = Math.round(48 + t * (42 - 48));
        clrs[s] = `hsl(${hue}, ${sat}%, ${l}%)`;
    }
    return clrs;
}

function makeCAMode(id, label, survive, born, gens) {
    let cellColors = buildColors(gens);

    return {
        id,
        label,
        stepMs: 100,
        CELL: 12,

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
            for (let row = 0; row < ROWS; row++) {
                for (let col = 0; col < COLS; col++) {
                    const i = idx(col, row);
                    if (permanentlyDead[i]) continue;

                    let cx_base = col * shared.CELL + shared.CELL / 2;
                    let cy_base = row * shared.CELL + shared.CELL / 2;

                    let eX_mod = ((exX % canvasWidth) + canvasWidth) % canvasWidth;
                    let eY_mod = ((exY % blockHeight) + blockHeight) % blockHeight;

                    let dx = cx_base - eX_mod;
                    if (dx > canvasWidth / 2) dx -= canvasWidth;
                    if (dx < -canvasWidth / 2) dx += canvasWidth;

                    let dy = cy_base - eY_mod;
                    if (dy > blockHeight / 2) dy -= blockHeight;
                    if (dy < -blockHeight / 2) dy += blockHeight;

                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= radius) {
                        let hitX = exX + dx;
                        let hitY = exY + dy;

                        let isProtected = false;
                        if (columnRect) {
                            if (hitX >= columnRect.left && hitX <= columnRect.right &&
                                hitY >= columnRect.top && hitY <= columnRect.bottom) {
                                isProtected = true;
                            }
                        }

                        if (!isProtected) {
                            permanentlyDead[i] = 1;
                            current[i] = 0;
                            hits = true;
                        }
                    }
                }
            }
            return hits;
        },

        cachedSolidsFrame: -1,
        cachedSolids: [],

        getSolids(shared) {
            if (!initialised) return [];
            if (shared && shared.frameCount === this.cachedSolidsFrame) return this.cachedSolids;

            const solids = [];
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

            if (shared) {
                this.cachedSolidsFrame = shared.frameCount;
                this.cachedSolids = solids;
            }

            return solids;
        },

        getCAState() {
            if (!initialised) return null;
            return { current, COLS, ROWS };
        }
    };
}

export const caModes = [
    makeCAMode("gameoflife", "Game of Life", new Set([2, 3]), new Set([3]), 2),
    makeCAMode("starwars", "Star Wars", new Set([3, 4, 5]), new Set([2]), 4),
    makeCAMode("brians", "Brian's Brain", new Set([]), new Set([2]), 3),
    makeCAMode("brain6", "Brain 6", new Set([6]), new Set([2, 4, 6]), 3),
    makeCAMode("rake", "Rake", new Set([3, 4, 6, 7]), new Set([2, 6, 7, 8]), 6),
    makeCAMode("bombers", "Bombers", new Set([3, 4, 5]), new Set([2, 4]), 25),
    makeCAMode("sedimental", "SediMental", new Set([4, 5, 6, 7, 8]), new Set([2, 5, 6, 7, 8]), 4)
];

window.addEventListener('colorChanged', function () {
    if (!initialised) return;
    caModes.forEach(function (m) {
        if (typeof m.rebuildColors === 'function') {
            m.rebuildColors();
        }
    });
});
