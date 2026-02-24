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
        const { COLS, ROWS, CELL, textColliders, columnHidden } = shared;

        // Canvas boundaries
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;

        // Word collision
        if (!columnHidden && textColliders) {
            const left = c * CELL;
            const top = r * CELL;
            const right = left + CELL;
            const bottom = top + CELL;

            // Allow ~2px margin of forgiveness inside the cell
            for (let i = 0; i < textColliders.length; i++) {
                const tc = textColliders[i];
                if (left + 2 < tc.right && right - 2 > tc.left &&
                    top + 2 < tc.bottom && bottom - 2 > tc.top) {
                    return true;
                }
            }
        }
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
        const { COL_LEFT_CELL, CELL } = shared;

        // start to the left of the central column, near current scroll Y
        const sc = Math.max(3, Math.floor(COL_LEFT_CELL / 2));
        const sr = Math.floor((window.scrollY + 200) / CELL);

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

    /* ── Link intersection ───────────────────────────────────── */
    function checkLinkIntersection(c, r, shared) {
        if (shared.columnHidden || !shared.linkElements) return;
        const { CELL, linkElements } = shared;
        const left = c * CELL;
        const top = r * CELL;
        const right = left + CELL;
        const bottom = top + CELL;

        for (let i = 0; i < linkElements.length; i++) {
            const l = linkElements[i];
            // Use same bounding box as isWall to avoid adjacent false triggers
            if (left + 2 < l.right && right - 2 > l.left &&
                top + 2 < l.bottom && bottom - 2 > l.top) {
                l.el.click();
            }
        }
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
            if (shared.canvas) shared.canvas.style.visibility = "hidden";
            initSnake(shared);
        },

        deactivate(shared) {
            heldKey = null;
            snake = null;
            if (shared.canvas) shared.canvas.style.visibility = "visible";
            if (shared.overlayCtx) {
                shared.overlayCtx.clearRect(0, 0, shared.canvas.width, shared.canvas.height);
            }
        },

        step(shared) {
            if (!snake || !snake.alive) return;
            snake.dir = snake.nextDir;

            const head = snake.body[0];
            const newHead = { c: head.c + snake.dir.dc, r: head.r + snake.dir.dr };

            checkLinkIntersection(newHead.c, newHead.r, shared);

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

            // Screen scrolling
            const { CELL } = shared;
            const headY = newHead.r * CELL;
            const screenY = headY - window.scrollY;
            if (screenY < 150) window.scrollBy(0, screenY - 150);
            if (screenY > window.innerHeight - 150) window.scrollBy(0, screenY - (window.innerHeight - 150));
        },

        render(shared) {
            const { overlayCtx, canvas, TAN_HEX, BLACK_HEX, CELL } = shared;

            if (!overlayCtx) return;
            overlayCtx.clearRect(0, 0, canvas.width, canvas.height);

            if (!snake) return;

            // Apple
            overlayCtx.fillStyle = RED_HEX;
            overlayCtx.fillRect(snake.apple.c * CELL, snake.apple.r * CELL, CELL, CELL);

            // Snake body
            snake.body.forEach((cell, i) => {
                overlayCtx.fillStyle = i === 0 ? HEAD_HEX : BLACK_HEX;
                overlayCtx.fillRect(cell.c * CELL, cell.r * CELL, CELL, CELL);
            });

            // Score
            overlayCtx.fillStyle = BLACK_HEX;
            overlayCtx.font = "bold 13px 'Courier New', monospace";
            overlayCtx.textBaseline = "top";
            overlayCtx.textAlign = "left";
            // Make score follow camera
            overlayCtx.fillText("SCORE: " + snake.score, 12, window.scrollY + 12);

            // Game-over overlay
            if (!snake.alive) {
                overlayCtx.fillStyle = "rgba(26,18,9,0.55)";
                overlayCtx.fillRect(0, 0, canvas.width, canvas.height);
                const cx = canvas.width / 2;
                const cy = window.scrollY + (window.innerHeight / 2);
                overlayCtx.fillStyle = TAN_HEX;
                overlayCtx.textAlign = "center";
                overlayCtx.textBaseline = "middle";
                overlayCtx.font = "bold 20px 'Courier New', monospace";
                overlayCtx.fillText("GAME OVER", cx, cy - 26);
                overlayCtx.font = "14px 'Courier New', monospace";
                overlayCtx.fillText("SCORE: " + snake.score, cx, cy);
                overlayCtx.font = "11px 'Courier New', monospace";
                overlayCtx.fillText("[press W/A/S/D to restart]", cx, cy + 22);
                overlayCtx.textAlign = "left";
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

        getSolids(shared) {
            if (!snake || !snake.alive) return [];
            const solids = [];

            // Push Apple
            if (snake.apple) {
                solids.push({
                    left: snake.apple.c * shared.CELL,
                    right: snake.apple.c * shared.CELL + shared.CELL,
                    top: snake.apple.r * shared.CELL,
                    bottom: snake.apple.r * shared.CELL + shared.CELL
                });
            }

            // Push Body
            snake.body.forEach(cell => {
                solids.push({
                    left: cell.c * shared.CELL,
                    right: cell.c * shared.CELL + shared.CELL,
                    top: cell.r * shared.CELL,
                    bottom: cell.r * shared.CELL + shared.CELL
                });
            });

            return solids;
        },

        // No onRandomise or onPaint for snake
    };

    /* ── Register into global mode list ─────────────────────── */
    window.__modes = window.__modes || [];
    window.__modes.push(snakeMode);

})();
