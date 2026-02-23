/**
 * modes/snake.js — Snake game mode
 *
 * Registers into window.__modes for engine.js to pick up.
 * WASD to steer. Canvas edges are walls. The central column is a wall
 * only for the rows it occupies, and only when visible (Escape toggles).
 * Hold a direction key for >350 ms to accelerate (turbo mode).
 */

(function () {
    "use strict";

    const STEP_MS = 130;
    const TURBO_MS = 25;
    const HOLD_DELAY = 350;  // ms before turbo kicks in
    const RED_HEX = "#c0392b";
    const HEAD_HEX = "#4a3829"; // slightly lighter than body

    const DIRS = {
        w: { dc: 0, dr: -1 },
        s: { dc: 0, dr: 1 },
        a: { dc: -1, dr: 0 },
        d: { dc: 1, dr: 0 },
    };

    /* ── Module-level state ──────────────────────────────────── */
    let snake = null;
    let heldKey = null;
    let holdStart = 0;

    /* ── Wall check ──────────────────────────────────────────── */
    function isWall(c, r, shared) {
        const { COLS, ROWS, COL_LEFT_CELL, COL_RIGHT_CELL,
            COL_TOP_CELL, COL_BOTTOM_CELL, columnHidden } = shared;

        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;

        if (!columnHidden &&
            c >= COL_LEFT_CELL && c < COL_RIGHT_CELL &&
            r >= COL_TOP_CELL && r < COL_BOTTOM_CELL) return true;

        return false;
    }

    /* ── Apple placement ─────────────────────────────────────── */
    function randomApple(body, shared) {
        const { COLS, ROWS } = shared;
        let c, r;
        do {
            c = Math.floor(Math.random() * COLS);
            r = Math.floor(Math.random() * ROWS);
        } while (
            isWall(c, r, shared) ||
            body.some(b => b.c === c && b.r === r)
        );
        return { c, r };
    }

    /* ── Init / restart ──────────────────────────────────────── */
    function initSnake(shared) {
        const { COL_LEFT_CELL, ROWS } = shared;
        const sc = Math.max(3, Math.floor(COL_LEFT_CELL / 2));
        const sr = Math.floor(ROWS / 2);
        const body = [
            { c: sc, r: sr },
            { c: sc - 1, r: sr },
            { c: sc - 2, r: sr },
        ];
        snake = {
            body,
            dir: { dc: 1, dr: 0 },
            nextDir: { dc: 1, dr: 0 },
            apple: randomApple(body, shared),
            alive: true,
            score: 0,
        };
    }

    /* ── Mode object — registered into global mode list ─────── */
    const snakeMode = {
        id: "snake",
        label: "Snake",

        // Dynamic tick rate: turbo when key held long enough
        stepMs() {
            if (!heldKey) return STEP_MS;
            return (performance.now() - holdStart) > HOLD_DELAY ? TURBO_MS : STEP_MS;
        },

        init(_shared) { },   // nothing to do at startup

        activate(shared) {
            heldKey = null;
            initSnake(shared);
        },

        deactivate() {
            heldKey = null;
            snake = null;
        },

        step(shared) {
            if (!snake || !snake.alive) return;
            snake.dir = snake.nextDir;

            const head = snake.body[0];
            const newHead = { c: head.c + snake.dir.dc, r: head.r + snake.dir.dr };

            if (isWall(newHead.c, newHead.r, shared)) { snake.alive = false; return; }
            if (snake.body.some(b => b.c === newHead.c && b.r === newHead.r)) {
                snake.alive = false; return;
            }

            snake.body.unshift(newHead);
            if (newHead.c === snake.apple.c && newHead.r === snake.apple.r) {
                snake.score++;
                snake.apple = randomApple(snake.body, shared);
            } else {
                snake.body.pop();
            }
        },

        render(shared) {
            const { ctx, canvas, TAN_HEX, BLACK_HEX, CELL,
                COL_LEFT_CELL, ROWS, columnHidden } = shared;

            ctx.fillStyle = TAN_HEX;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (!snake) return;

            // Apple
            ctx.fillStyle = RED_HEX;
            ctx.fillRect(snake.apple.c * CELL, snake.apple.r * CELL, CELL, CELL);

            // Snake body
            snake.body.forEach((cell, i) => {
                ctx.fillStyle = i === 0 ? HEAD_HEX : BLACK_HEX;
                ctx.fillRect(cell.c * CELL, cell.r * CELL, CELL, CELL);
            });

            // Score
            ctx.fillStyle = BLACK_HEX;
            ctx.font = "bold 13px 'Courier New', monospace";
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            ctx.fillText("SCORE: " + snake.score, 8, 8);

            // Game-over overlay
            if (!snake.alive) {
                ctx.fillStyle = "rgba(26,18,9,0.55)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                const cx = columnHidden
                    ? canvas.width / 2
                    : (COL_LEFT_CELL / 2) * CELL;
                const cy = Math.floor(ROWS / 2) * CELL;
                ctx.fillStyle = TAN_HEX;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.font = "bold 20px 'Courier New', monospace";
                ctx.fillText("GAME OVER", cx, cy - 26);
                ctx.font = "14px 'Courier New', monospace";
                ctx.fillText("SCORE: " + snake.score, cx, cy);
                ctx.font = "11px 'Courier New', monospace";
                ctx.fillText("[press W/A/S/D to restart]", cx, cy + 22);
                ctx.textAlign = "left";
            }
        },

        onKeyDown(e, shared) {
            const key = e.key.toLowerCase();
            if (!DIRS[key]) return;
            e.preventDefault();

            if (!snake || !snake.alive) {
                initSnake(shared);
                heldKey = key;
                holdStart = performance.now();
                return;
            }

            if (heldKey !== key) {
                heldKey = key;
                holdStart = performance.now();
            }

            const wanted = DIRS[key];
            if (wanted.dc !== -snake.dir.dc || wanted.dr !== -snake.dir.dr)
                snake.nextDir = wanted;
        },

        onKeyUp(e) {
            if (e.key.toLowerCase() === heldKey) heldKey = null;
        },

        // No onRandomise or onPaint for snake
    };

    /* ── Register into global mode list ─────────────────────── */
    window.__modes = window.__modes || [];
    window.__modes.push(snakeMode);

})();
