/**
 * tour.js — Progressive reveal state machine for the about-website page
 *
 * States: idle -> snake -> platformer -> tank -> complete
 *
 * Each stage replaces the entire #stage-ascii pre with a full merged layout:
 *   Snake:      23-line box (standalone)
 *   Platformer: 48-line layout — same snake top + open door + slopes/platform + platformer area
 *   Tank:       48-line layout — same snake top + open door + slopes/platform + # maze
 */

import { setOverlayMode } from './engine.js';
import { shared } from './shared.js';

let stage = 'idle';
let snakeApplesEaten = 0;
let snakeDoorOpen = false;
let originalStageHTML = null;

// ── Full stage ASCII layouts ───────────────────────────────────────
// Each is the complete merged visual for that stage.
// Lines with \\ render as \ in the pre (JS template literal escaping).

/* eslint-disable no-useless-escape */
const PLATFORMER_STAGE_HTML =
`=====================================================================
||                                                                 ||
||                                                        <span class="no-collide" style="color:transparent">[X]</span>      ||
||                                                                 ||
||    PRESS W/A/S/D TO TURN                                        ||
||                      |                                          ||
||                      |                                          ||
||                      |                                          ||
||        HOLD TO MOVE FASTER                                      ||
||                      |                                          ||
||                      |                                          ||
||                      |                                          ||
||              JUST DON'T BUMP INTO ANY TEXT                      ||
||                      |                                          ||
||                      |                                          ||
||                      |                                          ||
||                    EAT 3 APPLES TO UNLOCK THE DOOR              ||
||                                                                 ||
||                                                                 ||
||       <span id="plat-entry" class="no-collide">DOOR</span>                                                      ||
||   \\          /                                                  ||
||    \\        /                                                   ||
||=====        ====================================================||
||                                                                 ||
||                                                                 ||
||                            <span id="platformer-door-text" class="no-collide">DOOR</span>                                 ||
||                                                                 ||
||                                                                 ||
||                                                                 ||
||                         A/D TO MOVE                             ||
||                                                                 ||
||                                                                 ||
||                                                                 ||
||                                                                 ||
||                              W/SPACE TO JUMP                    ||
||                                                                 ||
||                                                                 ||
||                                                                 ||
||                                                                 ||
||     OH AND [ENTER] TO CLICK LINKS                               ||
||                                                                 ||
||                                                                 ||
||                                                                 ||
||                                                                 ||
||                               <a href="https://example.com" target="_blank" rel="noopener">LIKE THIS ONE</a>                     ||
||                                                                 ||
||                                                                 ||
=====================================================================`;

const TANK_STAGE_HTML =
`=====================================================================
||                                                                 ||
||                                                        <span class="no-collide" style="color:transparent">[X]</span>      ||
||                                                                 ||
||    PRESS W/A/S/D TO TURN                                        ||
||                      |                                          ||
||                      |                                          ||
||                      |                                          ||
||        HOLD TO MOVE FASTER                                      ||
||                      |                                          ||
||                      |                                          ||
||                      |                                          ||
||              JUST DON'T BUMP INTO ANY TEXT                      ||
||                      |                                          ||
||                      |                                          ||
||                      |                                          ||
||                    EAT 3 APPLES TO UNLOCK THE DOOR              ||
||                                                                 ||
||                                                                 ||
||       DOOR                                                      ||
||   \\          /                                                  ||
||    \\        /                                                   ||
||=====        ====================================================||
||#################################################################||
||##########################    <span id="tank-entry-point" class="no-collide" style="color:transparent">O</span>   ###############################||
||##########################        ###############################||
||##########################        ###############################||
||#################################################################||
||#################################################################||
||#######################  W/S TO DRIVE  ##########################||
||#################################################################||
||#################################################################||
||#################################################################||
||#################################################################||
||###########################   A/D TO TURN   #####################||
||#################################################################||
||#################################################################||
||#################################################################||
||#################################################################||
||###  OH AND [SPACE] TO SHOOT  ###################################||
||#################################################################||
||#################################################################||
||#################################################################||
||#################################################################||
||#############################  (IT WORKS ON LINKS TOO)  #########||
||#################################################################||
||#################################################################||
=====================================================================`;
/* eslint-enable no-useless-escape */

// ── Helpers ────────────────────────────────────────────────────────

function getDoorRect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
        left: r.left + window.scrollX,
        right: r.right + window.scrollX,
        top: r.top + window.scrollY,
        bottom: r.bottom + window.scrollY,
    };
}

function triggerResize() {
    window.dispatchEvent(new CustomEvent('contentRevealed'));
}

function showSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('reveal-visible');
    triggerResize();
    setTimeout(triggerResize, 700);
}

function hideSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('reveal-visible');
    triggerResize();
}

function setStageHTML(html) {
    const pre = document.getElementById('stage-ascii');
    if (pre) {
        pre.innerHTML = html;
        triggerResize();
        setTimeout(triggerResize, 100);
        setTimeout(triggerResize, 700);
    }
}

// Extend canvas height and column bottom bound to cover a given pre rect.
// Must be done BEFORE activating a mode:
//   1. Cells beyond canvas.height are unconditional walls in isWall().
//   2. Cells below COL_BOTTOM_CELL are not excluded from the CA solid check,
//      so background CA cells in the newly-revealed area act as walls.
function extendCanvas(preRect) {
    if (!shared.canvas) return;
    const { CELL } = shared;
    const absBottom = preRect.bottom + window.scrollY;
    const neededH = Math.ceil(absBottom + CELL * 12);
    if (shared.canvas.height < neededH) {
        shared.canvas.height = neededH;
        if (shared.overlayCanvas) shared.overlayCanvas.height = neededH;
    }
    // Treat the entire pre area as "inside column" so isWall skips CA solids there.
    const neededBottom = Math.ceil(absBottom / CELL) + 12;
    if (shared.COL_BOTTOM_CELL < neededBottom) {
        shared.COL_BOTTOM_CELL = neededBottom;
    }
}

// ── Snake door mechanics ───────────────────────────────────────────

function openSnakeDoor() {
    snakeDoorOpen = true;

    const top = document.getElementById('sd-top');
    const bot = document.getElementById('sd-bot');
    const mid = document.getElementById('sd-mid');
    const door = document.getElementById('stage-door');

    if (top) top.textContent = '      ';
    if (bot) bot.textContent = '      ';

    if (mid) {
        for (const node of mid.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                node.textContent = node.textContent.replace(/#/g, ' ');
            }
        }
    }

    if (door) door.classList.add('stage-door-open');

    requestAnimationFrame(() => {
        const d = document.getElementById('stage-door');
        if (d) shared.snakeDoor = getDoorRect(d);
        if (shared.updateColliders) shared.updateColliders();
    });
}

// ── Tour state handlers ────────────────────────────────────────────

function resetTour() {
    stage = 'idle';
    snakeApplesEaten = 0;
    snakeDoorOpen = false;
    setOverlayMode('none');
    hideSection('reveal-gauntlet');

    shared.snakeDoor = null;
    shared.platformerDoor = null;
    shared.snakeConfig = null;
    shared.platformerSpawnPos = null;
    shared.tankSpawnPos = null;

    // Restore original snake stage HTML (with door hashes intact)
    if (originalStageHTML) {
        const pre = document.getElementById('stage-ascii');
        if (pre) pre.innerHTML = originalStageHTML;
        originalStageHTML = null;
    }

    const modeButtons = document.getElementById('sec-mode-buttons');
    if (modeButtons) modeButtons.style.display = 'none';
    const outro = document.getElementById('sec-outro');
    if (outro) outro.style.display = 'none';
}

function updateDoorPositions() {
    if (stage === 'snake' && snakeDoorOpen) {
        const d = document.getElementById('stage-door');
        if (d) shared.snakeDoor = getDoorRect(d);
    } else if (stage === 'platformer') {
        const d = document.getElementById('platformer-door-text');
        if (d) shared.platformerDoor = getDoorRect(d);
    }
}

function onStartSnake() {
    if (stage !== 'idle') return;
    stage = 'snake';

    // Capture original HTML before any modifications so resetTour can restore it
    const pre = document.getElementById('stage-ascii');
    if (pre && !originalStageHTML) originalStageHTML = pre.innerHTML;

    showSection('reveal-gauntlet');

    // Wait a short time for the section to enter the layout flow before reading positions.
    // This avoids a race where getBoundingClientRect returns stale values mid-transition.
    setTimeout(() => {
        const spawnEl = document.getElementById('stage-spawn');
        const stagePre = document.getElementById('stage-ascii');

        if (spawnEl && stagePre) {
            const sr = spawnEl.getBoundingClientRect();
            const pr = stagePre.getBoundingClientRect();
            const { CELL } = shared;

            const spawnCol = Math.floor((sr.left + window.scrollX) / CELL);
            const spawnRow = Math.floor((sr.top + window.scrollY + sr.height / 2) / CELL);

            // Use the [X] span's rendered height/width for accurate line/char metrics
            const lineH = sr.bottom - sr.top || 18;
            const charW = (sr.width / 3) || 9;

            const appleBounds = {
                cellLeft: Math.ceil((pr.left + window.scrollX + charW * 2) / CELL) + 1,
                cellRight: Math.floor((pr.right + window.scrollX - charW * 2) / CELL) - 1,
                cellTop: Math.ceil((pr.top + window.scrollY + lineH) / CELL) + 1,
                cellBottom: Math.floor((pr.bottom + window.scrollY - lineH) / CELL) - 1,
            };

            shared.snakeConfig = {
                spawnCol,
                spawnRow,
                spawnDir: { dc: 0, dr: 1 },
                appleBounds,
            };

            // Extend canvas BEFORE activating: cells past the old canvas height
            // are out-of-bounds walls and would kill the snake on its first step.
            extendCanvas(pr);
        }

        setOverlayMode('snake');
        if (shared.updateColliders) shared.updateColliders();
    }, 50);
}

function onSnakeAppleEaten() {
    if (stage !== 'snake' || snakeDoorOpen) return;
    snakeApplesEaten++;
    if (snakeApplesEaten >= 3) {
        openSnakeDoor();
    }
}

function onDoorReached(e) {
    const from = e.detail && e.detail.from;
    const headPx = e.detail && e.detail.headPx;
    const headPy = e.detail && e.detail.headPy;

    if (from === 'snake' && stage === 'snake') {
        stage = 'platformer';
        shared.snakeDoor = null;
        shared.snakeConfig = null;
        setOverlayMode('none');

        // Replace the snake stage ASCII with the full platformer stage layout
        setStageHTML(PLATFORMER_STAGE_HTML);

        requestAnimationFrame(() => {
            const stagePre = document.getElementById('stage-ascii');
            if (stagePre) extendCanvas(stagePre.getBoundingClientRect());

            // Spawn platformer at the entry DOOR label (same pixel row as the snake door)
            const entryEl = document.getElementById('plat-entry');
            if (entryEl) {
                const r = entryEl.getBoundingClientRect();
                shared.platformerSpawnPos = {
                    x: r.left + window.scrollX + r.width / 2,
                    y: r.top + window.scrollY + r.height / 2,
                };
            } else if (headPx !== undefined) {
                shared.platformerSpawnPos = { x: headPx, y: headPy };
            }

            setOverlayMode('platformer');

            const doorEl = document.getElementById('platformer-door-text');
            if (doorEl) shared.platformerDoor = getDoorRect(doorEl);

            if (shared.updateColliders) shared.updateColliders();
        });

    } else if (from === 'platformer' && stage === 'platformer') {
        stage = 'tank';
        shared.platformerDoor = null;
        setOverlayMode('none');

        // Replace platformer layout with the full tank stage layout
        setStageHTML(TANK_STAGE_HTML);

        requestAnimationFrame(() => {
            const stagePre = document.getElementById('stage-ascii');
            if (stagePre) extendCanvas(stagePre.getBoundingClientRect());

            // Spawn tank at the marked corridor position in the # maze
            const marker = document.getElementById('tank-entry-point');
            if (marker) {
                const r = marker.getBoundingClientRect();
                shared.tankSpawnPos = {
                    x: r.left + window.scrollX + r.width / 2,
                    y: r.top + window.scrollY + r.height / 2,
                };
            } else if (headPx !== undefined) {
                shared.tankSpawnPos = { x: headPx, y: headPy };
            }

            setOverlayMode('tank');

            const modeButtons = document.getElementById('sec-mode-buttons');
            if (modeButtons) modeButtons.style.display = '';
            const outro = document.getElementById('sec-outro');
            if (outro) outro.style.display = '';

            if (shared.updateColliders) shared.updateColliders();
        });
    }
}

export function initTour() {
    window.addEventListener('tourStartSnake', onStartSnake);
    window.addEventListener('snakeAteApple', onSnakeAppleEaten);
    window.addEventListener('doorReached', onDoorReached);

    setInterval(updateDoorPositions, 500);
}
