/**
 * modes/tank.js — Top-down tank overlay
 *
 * W/S move; A/D turn; Space to shoot. Projectiles explode on impact,
 * destroying CA cells and text characters.
 */

import { getColliders } from '../utils/collision-helpers.js';
import { pushColorSliderAbsolute } from '../color-slider.js';
import { destroyChar } from '../word-game/word-game.js';
import { shared as sharedState } from '../shared.js';

const TANK_WIDTH = 16;
const TANK_HEIGHT = 20;
const TANK_SPEED = 2.5;
const TANK_TURN_SPEED = 0.08;

const PROJ_SPEED = 6;
const PROJ_RADIUS = 3;
const EXPLOSION_RADIUS = 40;

let x = 0;
let y = 0;
let angle = 0;

let keys = { w: false, a: false, s: false, d: false };
let projectiles = [];
let explosions = [];

function resetTank() {
    if (sharedState.tankSpawnPos) {
        x = sharedState.tankSpawnPos.x;
        y = sharedState.tankSpawnPos.y;
        sharedState.tankSpawnPos = null;
    } else {
        let spawnX = window.innerWidth / 2;
        let spawnY = window.scrollY + 200;

        let dropdown = document.getElementById('overlay-dropdown');
        if (dropdown) {
            let rect = dropdown.getBoundingClientRect();
            spawnX = rect.left - TANK_WIDTH - 20 + window.scrollX;
            spawnY = rect.top + rect.height / 2 + window.scrollY;
        } else {
            let col = document.getElementById('column');
            if (col) {
                let rect = col.getBoundingClientRect();
                spawnX = rect.left + rect.width / 2 + window.scrollX;
                spawnY = rect.bottom - 40 + window.scrollY;
            }
        }
        x = spawnX;
        y = spawnY;
    }
    angle = 0;
    keys = { w: false, a: false, s: false, d: false };
    projectiles = [];
    explosions = [];
}

function executeExplosion(exX, exY, radius, shared) {
    if (shared.currentMode && shared.currentMode.destroy) {
        shared.currentMode.destroy(exX, exY, radius, shared);
    }

    if (shared && shared.columnHidden) return;

    const column = document.getElementById('column');
    if (!column) return;

    let hits = false;
    const walk = document.createTreeWalker(column, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let nodesToProcess = [];

    while (node = walk.nextNode()) {
        const parent = node.parentElement;
        if (!parent) continue;
        if (parent.closest('#rule-options[hidden]')) continue;
        if (parent.closest('#overlay-options[hidden]')) continue;
        if (parent.closest('#nav-more-options[hidden]')) continue;

        if (node.nodeValue.trim().length > 0) {
            nodesToProcess.push(node);
        }
    }

    const range = document.createRange();

    for (let tn of nodesToProcess) {
        let val = tn.nodeValue;
        let changed = false;
        let newVal = "";

        for (let i = 0; i < val.length; i++) {
            let char = val[i];
            if (char.trim() === '') {
                newVal += char;
                continue;
            }

            range.setStart(tn, i);
            range.setEnd(tn, i + 1);
            let rect = range.getBoundingClientRect();

            let cx = rect.left + window.scrollX + rect.width / 2;
            let cy = rect.top + window.scrollY + rect.height / 2;

            let dist = Math.sqrt((cx - exX) ** 2 + (cy - exY) ** 2);
            if (dist <= radius) {
                let interactiveNode = tn.parentElement.closest('a, button, [role="option"], .select-toggle, #nav-more-label, #randomise-btn');
                if (interactiveNode) {
                    newVal += char;
                } else {
                    newVal += '\u00A0';
                    changed = true;
                    hits = true;

                    destroyChar(tn.parentElement, i);
                }
            } else {
                newVal += char;
            }
        }

        if (changed) {
            tn.nodeValue = newVal;
        }
    }

    if (hits && shared.updateColliders) {
        shared.updateColliders();
    }
}

export const tankMode = {
    id: "tank",
    label: "Tank Controls",
    stepMs: 16,

    init(_shared) { },

    activate(shared) {
        resetTank();
        shared.canvas.style.cursor = 'crosshair';
    },

    deactivate(shared) {
        resetTank();
        shared.canvas.style.cursor = 'default';
        if (shared.overlayCtx) {
            shared.overlayCtx.clearRect(0, 0, shared.canvas.width, shared.canvas.height);
        }
    },

    onKeyDown(e, _shared) {
        let k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) {
            keys[k] = true;
            e.preventDefault();
        }
        if (e.code === "Space") {
            projectiles.push({
                x: x,
                y: y,
                angle: angle
            });
            e.preventDefault();
        }
    },

    onKeyUp(e, _shared) {
        let k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) {
            keys[k] = false;
        }
    },

    getColliders(shared) {
        return getColliders(shared, tankMode, { filterSliders: true });
    },

    step(shared) {
        if (keys.a) angle -= TANK_TURN_SPEED;
        if (keys.d) angle += TANK_TURN_SPEED;

        if (keys.w || keys.s) {
            let speed = keys.w ? TANK_SPEED : -TANK_SPEED * 0.6;

            let dx = Math.sin(angle) * speed;
            let dy = -Math.cos(angle) * speed;

            let nextX = x + dx;
            let nextY = y + dy;

            let hit = false;
            let allSolids = this.getColliders(shared);

            for (let i = 0; i < allSolids.length; i++) {
                let s = allSolids[i];
                if (nextX >= s.left && nextX <= s.right && nextY >= s.top && nextY <= s.bottom) {
                    hit = true;
                    break;
                }
            }

            if (!hit) {
                x = nextX;
                y = nextY;
            }

            if (x < 0) x = 0;
            if (x > window.innerWidth) x = window.innerWidth;
            if (y < 0) y = 0;
        }

        for (let i = projectiles.length - 1; i >= 0; i--) {
            let p = projectiles[i];
            p.x += Math.sin(p.angle) * PROJ_SPEED;
            p.y -= Math.cos(p.angle) * PROJ_SPEED;

            let hitSlider = false;
            if (shared.isAboutSiteActive && shared.sliderMarkerColliders) {
                for (let sm of shared.sliderMarkerColliders) {
                    if (p.x >= sm.left - PROJ_RADIUS && p.x <= sm.right + PROJ_RADIUS &&
                        p.y >= sm.top - (PROJ_SPEED * 2) && p.y <= sm.bottom + (PROJ_SPEED * 2)) {
                        pushColorSliderAbsolute(p.x, 0);
                        hitSlider = true;
                        break;
                    }
                }
            }
            if (!hitSlider && shared.isAboutSiteActive && shared.sliderBarColliders) {
                for (let sb of shared.sliderBarColliders) {
                    if (p.x >= sb.left - PROJ_RADIUS && p.x <= sb.right + PROJ_RADIUS &&
                        p.y >= sb.top - (PROJ_SPEED * 2) && p.y <= sb.bottom + (PROJ_SPEED * 2)) {
                        pushColorSliderAbsolute(p.x, 0);
                        hitSlider = true;
                        break;
                    }
                }
            }
            if (hitSlider) {
                explosions.push({
                    x: p.x,
                    y: p.y,
                    r: 0,
                    maxR: EXPLOSION_RADIUS,
                    life: 1.0
                });
                executeExplosion(p.x, p.y, EXPLOSION_RADIUS, shared);
                projectiles.splice(i, 1);
                continue;
            }

            let hit = false;
            let allSolids = this.getColliders(shared);

            for (let s of allSolids) {
                if (p.x >= s.left && p.x <= s.right && p.y >= s.top && p.y <= s.bottom) {
                    hit = true;
                    if (s.node) {
                        let interactiveNode = s.node.closest('a, button, [role="option"], .select-toggle, #nav-more-label, #randomise-btn');
                        if (interactiveNode) {
                            p.hitLink = interactiveNode;
                        }
                    }
                    break;
                }
            }

            if (p.x < 0) p.x += window.innerWidth;
            if (p.x > window.innerWidth) p.x -= window.innerWidth;
            if (p.y < window.scrollY) p.y += window.innerHeight;
            if (p.y > window.scrollY + window.innerHeight) p.y -= window.innerHeight;

            if (hit) {
                if (p.hitLink) {
                    p.hitLink.click();
                    projectiles.splice(i, 1);
                } else {
                    explosions.push({
                        x: p.x,
                        y: p.y,
                        r: 0,
                        maxR: EXPLOSION_RADIUS,
                        life: 1.0
                    });
                    executeExplosion(p.x, p.y, EXPLOSION_RADIUS, shared);
                    projectiles.splice(i, 1);
                }
            }
        }

        for (let i = explosions.length - 1; i >= 0; i--) {
            let ex = explosions[i];
            ex.r += (ex.maxR - ex.r) * 0.2;
            ex.life -= 0.05;
            if (ex.life <= 0) {
                explosions.splice(i, 1);
            }
        }
    },

    render(shared) {
        const { overlayCtx } = shared;
        if (!overlayCtx) return;

        overlayCtx.clearRect(0, 0, shared.canvas.width, shared.canvas.height);

        overlayCtx.fillStyle = shared.COMP_HEX || "#40d060";
        for (let p of projectiles) {
            overlayCtx.beginPath();
            overlayCtx.arc(p.x, p.y, PROJ_RADIUS, 0, Math.PI * 2);
            overlayCtx.fill();
            overlayCtx.lineWidth = 1;
            overlayCtx.strokeStyle = "#1a1209";
            overlayCtx.stroke();
        }

        for (let ex of explosions) {
            overlayCtx.globalAlpha = Math.max(0, ex.life);
            overlayCtx.beginPath();
            overlayCtx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2);
            overlayCtx.fillStyle = shared.COMP_HEX || "#40d060";
            overlayCtx.fill();
            overlayCtx.strokeStyle = shared.COMP_DARK_HEX || "#2a9d45";
            overlayCtx.lineWidth = 2;
            overlayCtx.stroke();
        }
        overlayCtx.globalAlpha = 1.0;

        overlayCtx.save();
        overlayCtx.translate(x, y);
        overlayCtx.rotate(angle);

        overlayCtx.fillStyle = shared.COMP_HEX || "#40d060";
        overlayCtx.fillRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, TANK_HEIGHT);

        overlayCtx.strokeStyle = "#1a1209";
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, TANK_HEIGHT);

        overlayCtx.fillStyle = "#1a1209";
        overlayCtx.fillRect(-2, -TANK_HEIGHT / 2 - 6, 4, TANK_HEIGHT / 2 + 6);

        overlayCtx.beginPath();
        overlayCtx.arc(0, 0, 4, 0, Math.PI * 2);
        overlayCtx.fillStyle = "#1a1209";
        overlayCtx.fill();

        overlayCtx.restore();
    }
};
