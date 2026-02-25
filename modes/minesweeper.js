/**
 * modes/minesweeper.js — Minesweeper game mode
 *
 * Registers into window.__modes.  Uses the full canvas (independent of
 * the CA cell size).  L-click = reveal / chord, R-click = flag.
 * Mines are placed after the first click so the first reveal is always safe.
 */

(function () {
    "use strict";

    /* ── Constants ───────────────────────────────────────────────────────── */
    const MS = 24;    // minesweeper cell size in px (matches 2x2 of CA CELL=12)

    /* ── Colours (tan / black palette) ──────────────────────────────────── */
    // Helper to get current hue from the global UI state
    function getHue() {
        return (window.__sharedColors && window.__sharedColors.HUE !== undefined)
            ? window.__sharedColors.HUE
            : 33;
    }

    // Dynamic HSL functions based on the current hue
    function C_FACE() { return "hsl(" + getHue() + ", 41%, 59%)"; }  // unrevealed button face (#c4a06a -> ~36, 41%, 59%)
    function C_HI() { return "hsl(" + getHue() + ", 53%, 78%)"; }    // highlight edge (#e8d4a8 -> ~41, 53%, 78%)
    function C_SH() { return "hsl(" + getHue() + ", 43%, 33%)"; }    // shadow edge (#7a5830 -> ~32, 43%, 33%)
    function C_FLAT() { return "hsl(" + getHue() + ", 42%, 71%)"; }  // revealed empty cell (#d4b896 -> ~33, 42%, 71%)
    function C_BLACK() { return "hsl(" + getHue() + ", 48%, 7%)"; }  // (#1a1209 -> ~33, 48%, 7%)
    function C_HIT() { return "#b03030"; }                           // cell the player fatally clicked (always red)

    /* ── Module-level state ──────────────────────────────────────────────── */
    var MSCOLS, MSROWS, TOTAL, MINES;
    var cells;
    var hitIdx;     // flat index of the mine that killed the player
    var gameState;  // 'wait' | 'play' | 'won' | 'lost'
    var dirty = true;

    /* ── Sprite images ───────────────────────────────────────────────────── */
    var imgFlag = new Image();
    var imgBomb = new Image();
    imgFlag.src = "modes/MINESWEEPER_FLAG.png";
    imgBomb.src = "modes/MINESWEEPER_BOMB.png";

    function idx(c, r) {
        var wc = (c % MSCOLS + MSCOLS) % MSCOLS;
        var wr = (r % MSROWS + MSROWS) % MSROWS;
        return wr * MSCOLS + wc;
    }

    function neighbours(c, r, cb) {
        for (var dr = -1; dr <= 1; dr++)
            for (var dc = -1; dc <= 1; dc++)
                if (dr || dc)
                    cb(c + dc, r + dr);
    }

    /* ── Board init ──────────────────────────────────────────────────────── */
    function initBoard(shared) {
        var canvas = shared.canvas;
        MSCOLS = Math.floor(canvas.width / MS);
        MSROWS = Math.max(Math.floor(window.innerHeight / MS), 1);
        TOTAL = MSCOLS * MSROWS;
        cells = [];
        for (var i = 0; i < TOTAL; i++) {
            cells.push({ mine: false, adj: 0, revealed: false, flagged: false });
        }

        // Try to read CA grid active state
        var caMode = window.__modes.find(function (m) { return typeof m.getCAState === 'function'; });
        var caState = caMode ? caMode.getCAState() : null;

        MINES = 0;

        if (caState && caState.current) {
            for (var r = 0; r < MSROWS; r++) {
                for (var c = 0; c < MSCOLS; c++) {
                    var msIdx = idx(c, r);
                    var aliveCount = 0;
                    // Check the 2x2 area in CA grid
                    for (var dr = 0; dr < 2; dr++) {
                        for (var dc = 0; dc < 2; dc++) {
                            var caC = c * 2 + dc;
                            var caR = (r * 2 + dr) % caState.ROWS;
                            if (caC < caState.COLS) {
                                var caIdx = caR * caState.COLS + caC;
                                if (caState.current[caIdx] > 0) aliveCount++;
                            }
                        }
                    }
                    if (aliveCount >= 2) { // 2, 3, or 4 cells alive -> bomb
                        cells[msIdx].mine = true;
                        MINES++;
                    }
                }
            }
        }

        // Precompute adjacencies
        for (var r = 0; r < MSROWS; r++) {
            for (var c = 0; c < MSCOLS; c++) {
                if (cells[idx(c, r)].mine) continue;
                var n = 0;
                neighbours(c, r, function (nc, nr) { if (cells[idx(nc, nr)].mine) n++; });
                cells[idx(c, r)].adj = n;
            }
        }

        hitIdx = -1;
        gameState = "play";
        dirty = true;
    }

    /* ── Flood fill reveal ───────────────────────────────────────────────── */
    function floodReveal(c, r) {
        var wc = (c % MSCOLS + MSCOLS) % MSCOLS;
        var wr = (r % MSROWS + MSROWS) % MSROWS;
        var cell = cells[idx(wc, wr)];
        if (cell.revealed || cell.flagged || cell.mine) return;
        cell.revealed = true;
        if (cell.adj === 0) neighbours(wc, wr, function (nc, nr) { floodReveal(nc, nr); });
    }

    function checkWin() { return cells.every(function (c) { return c.mine || c.revealed; }); }
    function revealAll() { cells.forEach(function (c) { c.revealed = true; }); }

    /* ── Cell drawing ────────────────────────────────────────────────────── */
    function drawCell(ctx, c, r, yOffset, showMines) {
        var x = c * MS;
        var y = yOffset + r * MS;
        var cell = cells[idx(c, r)];
        var B = 2; // border width

        if (cell.revealed) {
            var isHit = (cell.mine && idx(c, r) === hitIdx);
            ctx.fillStyle = isHit ? C_HIT() : C_FLAT();
            ctx.fillRect(x, y, MS, MS);

            if (cell.mine) {
                // Draw bomb sprite (or fallback circle)
                var pad = Math.round(MS * 0.08);
                if (imgBomb.complete && imgBomb.naturalWidth > 0) {
                    ctx.drawImage(imgBomb, x + pad, y + pad, MS - pad * 2, MS - pad * 2);
                } else {
                    ctx.fillStyle = C_BLACK();
                    ctx.beginPath();
                    ctx.arc(x + MS / 2, y + MS / 2, MS * 0.27, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (cell.adj > 0) {
                ctx.fillStyle = C_BLACK();
                ctx.font = "bold " + Math.floor(MS * 0.6) + "px 'Courier New',monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(cell.adj, x + MS / 2, y + MS / 2);
            }
            // Subtle grid seam
            ctx.strokeStyle = C_SH();
            ctx.globalAlpha = 0.18;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 0.5, y + 0.5, MS - 1, MS - 1);
            ctx.globalAlpha = 1;

        } else {
            // Raised button
            ctx.fillStyle = C_FACE();
            ctx.fillRect(x, y, MS, MS);
            ctx.fillStyle = C_HI();
            ctx.fillRect(x, y, MS, B); // top
            ctx.fillRect(x, y, B, MS); // left
            ctx.fillStyle = C_SH();
            ctx.fillRect(x, y + MS - B, MS, B); // bottom
            ctx.fillRect(x + MS - B, y, B, MS); // right

            if (cell.flagged) {
                var pad = Math.round(MS * 0.08);
                if (imgFlag.complete && imgFlag.naturalWidth > 0) {
                    ctx.drawImage(imgFlag, x + pad, y + pad, MS - pad * 2, MS - pad * 2);
                } else {
                    // Fallback: drawn pole + triangle
                    ctx.fillStyle = C_BLACK();
                    var px = x + Math.round(MS * 0.38);
                    var py = y + Math.round(MS * 0.18);
                    var pw = Math.round(MS * 0.09);
                    var ph = Math.round(MS * 0.64);
                    ctx.fillRect(px, py, pw, ph);
                    ctx.beginPath();
                    ctx.moveTo(px + pw, py);
                    ctx.lineTo(px + pw + Math.round(MS * 0.36), py + Math.round(MS * 0.22));
                    ctx.lineTo(px + pw, py + Math.round(MS * 0.44));
                    ctx.closePath();
                    ctx.fill();
                }
            } else if (showMines && cell.mine) {
                // Unflagged mine revealed after game over
                var pad2 = Math.round(MS * 0.08);
                if (imgBomb.complete && imgBomb.naturalWidth > 0) {
                    ctx.drawImage(imgBomb, x + pad2, y + pad2, MS - pad2 * 2, MS - pad2 * 2);
                } else {
                    ctx.fillStyle = C_BLACK();
                    ctx.beginPath();
                    ctx.arc(x + MS / 2, y + MS / 2, MS * 0.27, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    /* ── Render ──────────────────────────────────────────────────────────── */
    function render(shared) {
        if (!cells || !dirty) return;
        dirty = false;

        var ctx = shared.ctx;
        var canvas = shared.canvas;

        // Fill the entire canvas first so the sub-cell remainder strip is covered
        ctx.fillStyle = C_FACE();
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        var showMines = (gameState === "lost" || gameState === "won");

        var blockHeight = MSROWS * MS;
        var repeats = Math.max(Math.ceil(canvas.height / blockHeight), 1);

        for (var r_offset = 0; r_offset < repeats; r_offset++) {
            var yOffset = r_offset * blockHeight;
            for (var r = 0; r < MSROWS; r++) {
                for (var c = 0; c < MSCOLS; c++) {
                    drawCell(ctx, c, r, yOffset, showMines);
                }
            }
        }

        // HUD — mines remaining
        if (gameState === "play") {
            var flagged = 0;
            cells.forEach(function (c) { if (c.flagged) flagged++; });
            var txt = "MINES: " + (MINES - flagged);
            ctx.fillStyle = "hsla(" + getHue() + ", 48%, 7%, 0.55)";
            ctx.fillRect(4, 4, 132, 24);
            ctx.fillStyle = C_FLAT();
            ctx.font = "bold 13px 'Courier New',monospace";
            ctx.textBaseline = "middle";
            ctx.textAlign = "left";
            ctx.fillText(txt, 10, 16);
        }

        // Win / lose overlay
        if (gameState === "won" || gameState === "lost") {
            var won = (gameState === "won");
            ctx.fillStyle = won ? "hsla(" + getHue() + ", 42%, 71%, 0.78)" : "hsla(" + getHue() + ", 48%, 7%, 0.72)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = won ? C_BLACK() : C_FLAT();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "bold 28px 'Courier New',monospace";
            ctx.fillText(won ? "YOU WIN!" : "GAME OVER", canvas.width / 2, canvas.height / 2 - 32);
            ctx.font = "14px 'Courier New',monospace";
            ctx.fillText(
                won ? "All " + MINES + " mines cleared." : "Kaboom.",
                canvas.width / 2, canvas.height / 2
            );
            ctx.font = "11px 'Courier New',monospace";
            ctx.fillText("[click anywhere to restart]", canvas.width / 2, canvas.height / 2 + 28);
        }
    }

    /* ── Click handling ──────────────────────────────────────────────────── */
    function handleClick(mc, mr, button, shared) {
        mc = (mc % MSCOLS + MSCOLS) % MSCOLS;
        mr = (mr % MSROWS + MSROWS) % MSROWS;
        dirty = true;

        // Restart on any click after game ends
        if (gameState === "won" || gameState === "lost") {
            initBoard(shared);
            return;
        }

        var cell = cells[idx(mc, mr)];

        if (button === 2) {
            // Right-click: toggle flag on unrevealed cell
            if (!cell.revealed) cell.flagged = !cell.flagged;
            return;
        }

        if (cell.flagged) return;

        // Chord: L-click on a revealed number with enough adjacent flags
        if (cell.revealed && cell.adj > 0) {
            var flagCount = 0;
            neighbours(mc, mr, function (c, r) { if (cells[idx(c, r)].flagged) flagCount++; });
            if (flagCount === cell.adj) {
                var busted = false;
                neighbours(mc, mr, function (c, r) {
                    if (busted) return;
                    var n = cells[idx(c, r)];
                    if (n.flagged) return;
                    if (n.mine) {
                        n.revealed = true;
                        hitIdx = idx(c, r);
                        gameState = "lost";
                        revealAll();
                        busted = true;
                    } else {
                        floodReveal(c, r);
                    }
                });
                if (!busted && checkWin()) gameState = "won";
            }
            return;
        }

        if (cell.revealed) return;

        if (cell.mine) {
            cell.revealed = true;
            hitIdx = idx(mc, mr);
            gameState = "lost";
            revealAll();
        } else {
            floodReveal(mc, mr);
            if (checkWin()) gameState = "won";
        }
    }

    /* ── Mode object ─────────────────────────────────────────────────────── */
    var minesweeperMode = {
        id: "minesweeper",
        label: "Minesweeper",
        stepMs: 10000,      // essentially idle — game is entirely event-driven
        fullCanvas: true,       // engine: pass clicks even when column is showing

        init: function (_s) {
            window.addEventListener('colorChanged', function () {
                dirty = true;
            });
            window.addEventListener('canvasResized', function () {
                dirty = true;
            });
        },
        activate: function (s) { initBoard(s); },
        deactivate: function () { cells = null; },
        step: function (_s) { },
        render: function (s) { render(s); },

        getSolids: function (shared) {
            if (!cells) return [];
            var solids = [];
            var canvasHeight = shared ? shared.canvas.height : window.innerHeight;
            var blockHeight = MSROWS * MS;
            var repeats = Math.max(Math.ceil(canvasHeight / blockHeight), 1);

            for (var r_offset = 0; r_offset < repeats; r_offset++) {
                var yOffset = r_offset * blockHeight;
                for (var r = 0; r < MSROWS; r++) {
                    for (var c = 0; c < MSCOLS; c++) {
                        var cell = cells[idx(c, r)];
                        if (cell.revealed || cell.flagged) {
                            solids.push({
                                left: c * MS,
                                right: c * MS + MS,
                                top: yOffset + r * MS,
                                bottom: yOffset + r * MS + MS
                            });
                        }
                    }
                }
            }
            return solids;
        },

        onMouseDown: function (e, shared) {
            var mc = Math.floor((e.clientX + window.scrollX) / MS);
            var mr = Math.floor((e.clientY + window.scrollY) / MS);
            handleClick(mc, mr, e.button, shared);
            e.preventDefault();
        },
    };

    window.__modes = window.__modes || [];
    window.__modes.push(minesweeperMode);

})();
