/**
 * modes/snake.js — Snake overlay mode
 *
 * WASD to steer. Canvas edges + text + CA cells are walls.
 * Hold a direction key for >350 ms to accelerate (turbo mode).
 */

import { pushColorSliderAbsolute } from '../color-slider.js';

const STEP_MS = 130;
const TURBO_MS = 25;
const HOLD_DELAY = 350;
const RED_HEX = "#c0392b";

const DIRS = {
    w: { dc: 0, dr: -1 },
    s: { dc: 0, dr: 1 },
    a: { dc: -1, dr: 0 },
    d: { dc: 1, dr: 0 },
};

let snake = null;
let heldKey = null;
let holdStart = 0;
let activeLink = null;

function isWall(c, r, shared) {
    const { COLS, ROWS, CELL, textColliders, columnHidden } = shared;

    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;

    if (!columnHidden && textColliders) {
        const left = c * CELL;
        const top = r * CELL;
        const right = left + CELL;
        const bottom = top + CELL;

        for (let i = 0; i < textColliders.length; i++) {
            const tc = textColliders[i];
            if (left + 2 < tc.right && right - 2 > tc.left &&
                top + 2 < tc.bottom && bottom - 2 > tc.top) {
                return true;
            }
        }
    }

    if (shared.currentMode && shared.currentMode.getSolids) {
        if (!shared.columnHidden &&
            c >= shared.COL_LEFT_CELL && c < shared.COL_RIGHT_CELL &&
            r >= shared.COL_TOP_CELL && r < shared.COL_BOTTOM_CELL) {
            return false;
        }

        const left = c * CELL;
        const top = r * CELL;
        const right = left + CELL;
        const bottom = top + CELL;

        const solids = shared.currentMode.getSolids(shared);
        for (let i = 0; i < solids.length; i++) {
            const s = solids[i];
            if (left + 2 < s.right && right - 2 > s.left &&
                top + 2 < s.bottom && bottom - 2 > s.top) {
                return true;
            }
        }
    }
    return false;
}

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

function initSnake(shared) {
    const { COL_LEFT_CELL, CELL } = shared;

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

function checkLinkIntersection(c, r, shared) {
    if (shared.columnHidden || !shared.linkElements) return;
    const { CELL, linkElements } = shared;
    const left = c * CELL;
    const top = r * CELL;
    const right = left + CELL;
    const bottom = top + CELL;

    let newActiveLink = null;
    let matchedClick = false;
    for (let i = linkElements.length - 1; i >= 0; i--) {
        const l = linkElements[i];

        const isHovering = (left + 6 < l.right && right - 6 > l.left && top + 6 < l.bottom && bottom - 6 > l.top);
        if (isHovering && !newActiveLink) newActiveLink = l;

        const isBumping = (left + 2 < l.right && right - 2 > l.left && top + 2 < l.bottom && bottom - 2 > l.top);

        if (isBumping && !matchedClick) {
            l.el.click();
            matchedClick = true;
        }
    }

    if (activeLink !== newActiveLink) {
        if (activeLink) activeLink.el.classList.remove("hover-active");
        if (newActiveLink) newActiveLink.el.classList.add("hover-active");
        activeLink = newActiveLink;
    }
}

function checkSliderPush(c, r, dc, shared) {
    if (shared.columnHidden || !shared.sliderMarkerColliders || dc === 0) return { isWall: false, pushed: false };

    const { CELL, sliderMarkerColliders } = shared;
    const left = c * CELL;
    const top = r * CELL;
    const right = left + CELL;
    const bottom = top + CELL;

    for (let i = 0; i < sliderMarkerColliders.length; i++) {
        const sm = sliderMarkerColliders[i];

        if (left + 2 < sm.right && right - 2 > sm.left && top + 2 < sm.bottom && bottom - 2 > sm.top) {
            var hitEnd = false;
            if (dc > 0) {
                hitEnd = pushColorSliderAbsolute(right, sm.el.offsetWidth / 2);
            } else if (dc < 0) {
                hitEnd = pushColorSliderAbsolute(left, -sm.el.offsetWidth / 2);
            }

            var mr = sm.el.getBoundingClientRect();
            sm.left = mr.left + window.scrollX;
            sm.right = mr.right + window.scrollX;
            sm.top = mr.top + window.scrollY;
            sm.bottom = mr.bottom + window.scrollY;

            if (hitEnd) return { isWall: true, pushed: false };
            return { isWall: false, pushed: true };
        }
    }
    return { isWall: false, pushed: false };
}

export const snakeMode = {
    id: "snake",
    label: "Snake",

    stepMs() {
        if (!heldKey) return STEP_MS;
        return (performance.now() - holdStart) > HOLD_DELAY ? TURBO_MS : STEP_MS;
    },

    init(_shared) { },

    activate(shared) {
        heldKey = null;
        initSnake(shared);
    },

    deactivate(shared) {
        heldKey = null;
        snake = null;
        if (activeLink) {
            activeLink.el.classList.remove("hover-active");
            activeLink = null;
        }
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

        const pushResult = checkSliderPush(newHead.c, newHead.r, snake.dir.dc, shared);
        if (pushResult.isWall) {
            snake.alive = false; return;
        }

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

        overlayCtx.fillStyle = RED_HEX;
        overlayCtx.fillRect(snake.apple.c * CELL, snake.apple.r * CELL, CELL, CELL);

        snake.body.forEach((cell, i) => {
            const isHead = (i === 0);
            overlayCtx.fillStyle = snake.alive ? (isHead ? shared.COMP_DARK_HEX : shared.COMP_HEX) : TAN_HEX;
            overlayCtx.fillRect(cell.c * CELL, cell.r * CELL, CELL, CELL);
        });

        overlayCtx.fillStyle = BLACK_HEX;
        overlayCtx.font = "bold 13px 'Courier New', monospace";
        overlayCtx.textBaseline = "top";
        overlayCtx.textAlign = "left";
        overlayCtx.fillText("SCORE: " + snake.score, 12, window.scrollY + 12);

        if (!snake.alive) {
            overlayCtx.fillStyle = "rgba(26,18,9,0.72)";
            overlayCtx.fillRect(0, 0, canvas.width, canvas.height);

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            overlayCtx.fillStyle = TAN_HEX;
            overlayCtx.textAlign = "center";
            overlayCtx.textBaseline = "middle";
            overlayCtx.font = "bold 28px 'Courier New', monospace";
            overlayCtx.fillText("GAME OVER", cx, cy - 32);
            overlayCtx.font = "14px 'Courier New', monospace";
            overlayCtx.fillText("SCORE: " + snake.score, cx, cy);
            overlayCtx.font = "11px 'Courier New', monospace";
            overlayCtx.fillText("[press W/A/S/D to restart]", cx, cy + 28);
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

        if (snake.apple) {
            solids.push({
                left: snake.apple.c * shared.CELL,
                right: snake.apple.c * shared.CELL + shared.CELL,
                top: snake.apple.r * shared.CELL,
                bottom: snake.apple.r * shared.CELL + shared.CELL
            });
        }

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
};
