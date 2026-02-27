/**
 * modes/snake.js — Snake overlay mode
 *
 * WASD to steer. Canvas edges + text + CA cells are walls.
 * Hold a direction key for >350 ms to accelerate (turbo mode).
 */

import { pushColorSliderAbsolute } from '../color-slider.js';
import { shared } from '../shared.js';
import { isCellAlive, killCellAt } from './ca.js';

const STEP_MS = 130;
const TURBO_MS = 25;
const HOLD_DELAY = 350;

function isTutorial(shared) {
    return !!(shared.snakeConfig && shared.snakeConfig.appleBounds);
}

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
    const { COLS, CELL, textColliders, columnHidden } = shared;
    const maxRow = Math.ceil(shared.canvas.height / CELL);

    if (c < 0 || c >= COLS || r < 0 || r >= maxRow) return true;

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

    // In free-roam mode CA cells are eaten as food, not walls.
    if (isTutorial(shared) && shared.currentMode && shared.currentMode.getSolids) {
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
    const { COLS, ROWS, CELL } = shared;
    const head = body[0];
    const maxRow = Math.ceil(shared.canvas.height / CELL);
    const bounds = shared.snakeConfig && shared.snakeConfig.appleBounds;
    let c, r, attempts = 0;
    do {
        if (bounds) {
            c = bounds.cellLeft + Math.floor(Math.random() * (bounds.cellRight - bounds.cellLeft));
            r = bounds.cellTop + Math.floor(Math.random() * (bounds.cellBottom - bounds.cellTop));
        } else {
            c = Math.floor(Math.random() * COLS);
            const minR = Math.max(0, head.r - ROWS);
            const maxR = Math.min(maxRow - 1, head.r + ROWS);
            r = minR + Math.floor(Math.random() * (maxR - minR + 1));
        }
        attempts++;
        if (attempts > 1000) break;
    } while (
        isWall(c, r, shared) ||
        body.some(b => b.c === c && b.r === r)
    );
    return { c, r };
}

function initSnake(shared) {
    const { CELL } = shared;
    const cfg = shared.snakeConfig;

    let sc, sr, dir;
    if (cfg && cfg.spawnCol !== undefined) {
        sc = cfg.spawnCol;
        sr = cfg.spawnRow;
        dir = cfg.spawnDir || { dc: 0, dr: 1 };
    } else {
        const h1 = document.querySelector('#site-header h1');
        if (h1) {
            const rect = h1.getBoundingClientRect();
            sc = Math.floor((rect.left + window.scrollX) / CELL) - 2;
            sr = Math.floor((rect.top + window.scrollY + rect.height / 2) / CELL);
        } else {
            sc = Math.max(3, Math.floor(shared.COL_LEFT_CELL / 2));
            sr = Math.floor((window.scrollY + 50) / CELL);
        }
        dir = { dc: 1, dr: 0 };
    }
    sc = Math.max(3, sc);

    const body = [
        { c: sc, r: sr },
        { c: sc - dir.dc, r: sr - dir.dr },
        { c: sc - dir.dc * 2, r: sr - dir.dr * 2 },
    ];
    snake = {
        body,
        dir: { dc: dir.dc, dr: dir.dr },
        nextDir: { dc: dir.dc, dr: dir.dr },
        apple: isTutorial(shared) ? randomApple(body, shared) : null,
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

export function respawnSnake(sh) {
    initSnake(sh || shared);
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
        if (!snake) return;

        const pushResult = checkSliderPush(newHead.c, newHead.r, snake.dir.dc, shared);
        if (pushResult.isWall) {
            snake.alive = false; return;
        }

        // In free-roam mode, eat alive CA cells before the wall check so they
        // don't block movement. The cell is killed here; isWall then sees it as empty.
        const tutorial = isTutorial(shared);
        let ateCA = false;
        if (!tutorial && isCellAlive(newHead.c, newHead.r)) {
            killCellAt(newHead.c, newHead.r);
            ateCA = true;
        }

        if (isWall(newHead.c, newHead.r, shared)) { snake.alive = false; return; }
        if (snake.body.some(b => b.c === newHead.c && b.r === newHead.r)) {
            snake.alive = false; return;
        }

        snake.body.unshift(newHead);
        if (ateCA) {
            snake.score++;
        } else if (tutorial && snake.apple && newHead.c === snake.apple.c && newHead.r === snake.apple.r) {
            snake.score++;
            snake.apple = randomApple(snake.body, shared);
            window.dispatchEvent(new CustomEvent('snakeAteApple', { detail: { score: snake.score } }));
        } else {
            snake.body.pop();
        }

        if (shared.snakeDoor) {
            const d = shared.snakeDoor;
            const headLeft = newHead.c * shared.CELL;
            const headTop = newHead.r * shared.CELL;
            const headRight = headLeft + shared.CELL;
            const headBottom = headTop + shared.CELL;
            if (headRight > d.left && headLeft < d.right &&
                headBottom > d.top && headTop < d.bottom) {
                window.dispatchEvent(new CustomEvent('doorReached', {
                    detail: {
                        from: 'snake',
                        headPx: headLeft + shared.CELL / 2,
                        headPy: headTop + shared.CELL / 2,
                    }
                }));
            }
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

        // Keep CA cells dead under the snake body every frame — the CA ticks
        // independently so cells can be born between snake steps without this.
        if (snake.alive) {
            for (let i = 0; i < snake.body.length; i++) {
                const seg = snake.body[i];
                if (isCellAlive(seg.c, seg.r)) killCellAt(seg.c, seg.r);
            }
        }

        if (snake.apple) {
            overlayCtx.fillStyle = BLACK_HEX;
            overlayCtx.fillRect(snake.apple.c * CELL, snake.apple.r * CELL, CELL, CELL);
        }

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

        if (snake.apple && isTutorial(shared)) {
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
