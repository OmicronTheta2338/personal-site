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
    const MS = 20;    // minesweeper cell size in px
    const MINE_RATIO = 0.15;  // fraction of cells that are mines

    /* ── Colours (tan / black palette) ──────────────────────────────────── */
    const C_FACE = "#c4a06a";  // unrevealed button face
    const C_HI = "#e8d4a8";  // highlight edge (top / left)
    const C_SH = "#7a5830";  // shadow edge (bottom / right)
    const C_FLAT = "#d4b896";  // revealed empty cell
    const C_BLACK = "#1a1209";
    const C_HIT = "#b03030";  // cell the player fatally clicked

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

    function idx(c, r) { return r * MSCOLS + c; }
    function inBounds(c, r) { return c >= 0 && c < MSCOLS && r >= 0 && r < MSROWS; }

    function neighbours(c, r, cb) {
        for (var dr = -1; dr <= 1; dr++)
            for (var dc = -1; dc <= 1; dc++)
                if ((dr || dc) && inBounds(c + dc, r + dr))
                    cb(c + dc, r + dr);
    }

    /* ── Board init ──────────────────────────────────────────────────────── */
    function initBoard(shared) {
        var canvas = shared.canvas;
        MSCOLS = Math.floor(canvas.width / MS);
        MSROWS = Math.floor(canvas.height / MS);
        TOTAL = MSCOLS * MSROWS;
        MINES = Math.floor(TOTAL * MINE_RATIO);
        cells = [];
        for (var i = 0; i < TOTAL; i++)
            cells.push({ mine: false, adj: 0, revealed: false, flagged: false });
        hitIdx = -1;
        gameState = "wait";
        dirty = true;
    }

    function placeMines(safeC, safeR) {
        var safe = new Set();
        safe.add(idx(safeC, safeR));
        neighbours(safeC, safeR, function (c, r) { safe.add(idx(c, r)); });

        var placed = 0;
        while (placed < MINES) {
            var i = Math.floor(Math.random() * TOTAL);
            if (!cells[i].mine && !safe.has(i)) { cells[i].mine = true; placed++; }
        }
        for (var r = 0; r < MSROWS; r++) {
            for (var c = 0; c < MSCOLS; c++) {
                if (cells[idx(c, r)].mine) continue;
                var n = 0;
                neighbours(c, r, function (nc, nr) { if (cells[idx(nc, nr)].mine) n++; });
                cells[idx(c, r)].adj = n;
            }
        }
    }

    /* ── Flood fill reveal ───────────────────────────────────────────────── */
    function floodReveal(c, r) {
        if (!inBounds(c, r)) return;
        var cell = cells[idx(c, r)];
        if (cell.revealed || cell.flagged || cell.mine) return;
        cell.revealed = true;
        if (cell.adj === 0) neighbours(c, r, function (nc, nr) { floodReveal(nc, nr); });
    }

    function checkWin() { return cells.every(function (c) { return c.mine || c.revealed; }); }
    function revealAll() { cells.forEach(function (c) { c.revealed = true; }); }

    /* ── Cell drawing ────────────────────────────────────────────────────── */
    function drawCell(ctx, c, r, showMines) {
        var x = c * MS;
        var y = r * MS;
        var cell = cells[idx(c, r)];
        var B = 2; // border width

        if (cell.revealed) {
            var isHit = (cell.mine && idx(c, r) === hitIdx);
            ctx.fillStyle = isHit ? C_HIT : C_FLAT;
            ctx.fillRect(x, y, MS, MS);

            if (cell.mine) {
                // Draw bomb sprite (or fallback circle)
                var pad = Math.round(MS * 0.08);
                if (imgBomb.complete && imgBomb.naturalWidth > 0) {
                    ctx.drawImage(imgBomb, x + pad, y + pad, MS - pad * 2, MS - pad * 2);
                } else {
                    ctx.fillStyle = C_BLACK;
                    ctx.beginPath();
                    ctx.arc(x + MS / 2, y + MS / 2, MS * 0.27, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (cell.adj > 0) {
                ctx.fillStyle = C_BLACK;
                ctx.font = "bold " + Math.floor(MS * 0.6) + "px 'Courier New',monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(cell.adj, x + MS / 2, y + MS / 2);
            }
            // Subtle grid seam
            ctx.strokeStyle = C_SH;
            ctx.globalAlpha = 0.18;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 0.5, y + 0.5, MS - 1, MS - 1);
            ctx.globalAlpha = 1;

        } else {
            // Raised button
            ctx.fillStyle = C_FACE;
            ctx.fillRect(x, y, MS, MS);
            ctx.fillStyle = C_HI;
            ctx.fillRect(x, y, MS, B); // top
            ctx.fillRect(x, y, B, MS); // left
            ctx.fillStyle = C_SH;
            ctx.fillRect(x, y + MS - B, MS, B); // bottom
            ctx.fillRect(x + MS - B, y, B, MS); // right

            if (cell.flagged) {
                var pad = Math.round(MS * 0.08);
                if (imgFlag.complete && imgFlag.naturalWidth > 0) {
                    ctx.drawImage(imgFlag, x + pad, y + pad, MS - pad * 2, MS - pad * 2);
                } else {
                    // Fallback: drawn pole + triangle
                    ctx.fillStyle = C_BLACK;
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
                    ctx.fillStyle = C_BLACK;
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
        ctx.fillStyle = C_FACE;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        var showMines = (gameState === "lost" || gameState === "won");
        for (var r = 0; r < MSROWS; r++)
            for (var c = 0; c < MSCOLS; c++)
                drawCell(ctx, c, r, showMines);

        // HUD — mines remaining
        if (gameState === "wait" || gameState === "play") {
            var flagged = 0;
            cells.forEach(function (c) { if (c.flagged) flagged++; });
            var txt = "MINES: " + (MINES - flagged);
            ctx.fillStyle = "rgba(26,18,9,0.55)";
            ctx.fillRect(4, 4, 132, 24);
            ctx.fillStyle = C_FLAT;
            ctx.font = "bold 13px 'Courier New',monospace";
            ctx.textBaseline = "middle";
            ctx.textAlign = "left";
            ctx.fillText(txt, 10, 16);
        }

        // Win / lose overlay
        if (gameState === "won" || gameState === "lost") {
            var won = (gameState === "won");
            ctx.fillStyle = won ? "rgba(212,184,150,0.78)" : "rgba(26,18,9,0.72)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = won ? C_BLACK : C_FLAT;
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
        if (!inBounds(mc, mr)) return;
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

        // First click: place mines now (guaranteed safe open area)
        if (gameState === "wait") {
            gameState = "play";
            placeMines(mc, mr);
        }

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

        init: function (_s) { },
        activate: function (s) { initBoard(s); },
        deactivate: function () { cells = null; },
        step: function (_s) { },
        render: function (s) { render(s); },

        getSolids: function (_shared) {
            if (!cells || gameState === "wait") return [];
            var solids = [];
            for (var r = 0; r < MSROWS; r++) {
                for (var c = 0; c < MSCOLS; c++) {
                    var cell = cells[idx(c, r)];
                    if (cell.revealed || cell.flagged) {
                        solids.push({
                            left: c * MS,
                            right: c * MS + MS,
                            top: r * MS,
                            bottom: r * MS + MS
                        });
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
