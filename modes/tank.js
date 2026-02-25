// top-down tank overlay

const TANK_WIDTH = 16;
const TANK_HEIGHT = 20;
const TANK_SPEED = 2.5;
const TANK_TURN_SPEED = 0.08;

const PROJ_SPEED = 6;
const PROJ_RADIUS = 3;
const EXPLOSION_RADIUS = 40;

let x = 0;
let y = 0;
let angle = 0; // facing straight up is 0

let keys = { w: false, a: false, s: false, d: false };
let projectiles = [];
let explosions = []; // {x, y, r, maxR, life}

let sharedRef = null;

function resetTank() {
    // spawn in the middle top area
    x = window.innerWidth / 2;
    y = window.scrollY + 200;
    angle = 0;
    keys = { w: false, a: false, s: false, d: false };
    projectiles = [];
    explosions = [];
}

const tankMode = {
    id: "tank",
    label: "Tank Controls",
    stepMs: 16,

    init(shared) {
        sharedRef = shared;
    },

    activate(shared) {
        resetTank();
        shared.canvas.style.cursor = 'crosshair';
    },

    deactivate(shared) {
        shared.canvas.style.cursor = 'default';
    },

    onKeyDown(e, shared) {
        let k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) {
            keys[k] = true;
            e.preventDefault();
        }
        if (e.code === "Space") {
            // fire projectile
            projectiles.push({
                x: x,
                y: y,
                angle: angle
            });
            e.preventDefault();
        }
    },

    onKeyUp(e, shared) {
        let k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) {
            keys[k] = false;
        }
    },

    getColliders(shared) {
        let colliders = shared.columnHidden ? [] : shared.textColliders.slice();

        if (shared.currentMode && shared.currentMode.getSolids && shared.currentMode !== tankMode) {
            let columnRect = null;
            if (!shared.columnHidden) {
                let colEl = document.getElementById("column");
                if (colEl) {
                    let hr = colEl.getBoundingClientRect();
                    columnRect = {
                        left: hr.left + window.scrollX,
                        right: hr.right + window.scrollX,
                        top: hr.top + window.scrollY,
                        bottom: hr.bottom + window.scrollY
                    };
                }
            }

            let solids = shared.currentMode.getSolids(shared);
            if (solids && solids.length > 0) {
                for (let j = 0; j < solids.length; j++) {
                    let s = solids[j];
                    // If the column is visible, ignore cells completely covered by it
                    if (!shared.columnHidden && columnRect) {
                        if (s.right > columnRect.left && s.left < columnRect.right &&
                            s.bottom > columnRect.top && s.top < columnRect.bottom) {
                            continue;
                        }
                    }
                    colliders.push(s);
                }
            }
        }
        return colliders;
    },

    step(shared) {
        // Turning
        if (keys.a) angle -= TANK_TURN_SPEED;
        if (keys.d) angle += TANK_TURN_SPEED;

        // Movement
        if (keys.w || keys.s) {
            let speed = keys.w ? TANK_SPEED : -TANK_SPEED * 0.6; // slower reverse

            let dx = Math.sin(angle) * speed;
            let dy = -Math.cos(angle) * speed; // -cos because 0 angle is straight UP (-y)

            // Simplistic collision logic for the tank body against text/solids
            // Tank needs to not drive through the text!
            // First pass, let's just use point collision for simplicity, can refine if needed.
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

            // keep in window horizontally
            if (x < 0) x = 0;
            if (x > window.innerWidth) x = window.innerWidth;

            // let it boundless vertically since page scrolls
            if (y < 0) y = 0;
        }

        let screenY = y - window.scrollY;

        // Use percentages of screen height for margins so they don't overlap on very short windows
        let baseMargin = Math.min(150, window.innerHeight * 0.3);
        let viewOffset = Math.min(100, window.innerHeight * 0.2);

        // -1 when facing up (angle=0), 1 when facing down (angle=PI)
        let facingY = -Math.cos(angle);

        // Increase threshold in the direction the tank is facing to push the camera further ahead
        let topThreshold = baseMargin - facingY * viewOffset;
        let bottomThreshold = baseMargin + facingY * viewOffset;

        if (screenY < topThreshold) {
            window.scrollBy(0, screenY - topThreshold);
        } else if (screenY > window.innerHeight - bottomThreshold) {
            window.scrollBy(0, screenY - (window.innerHeight - bottomThreshold));
        }

        // Projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
            let p = projectiles[i];
            p.x += Math.sin(p.angle) * PROJ_SPEED;
            p.y -= Math.cos(p.angle) * PROJ_SPEED;

            // Check if we hit the color slider!
            let hitSlider = false;
            if (shared.sliderMarkerColliders && window.__pushColorSliderAbsolute) {
                for (let sm of shared.sliderMarkerColliders) {
                    if (p.x >= sm.left - PROJ_RADIUS && p.x <= sm.right + PROJ_RADIUS &&
                        p.y >= sm.top - (PROJ_SPEED * 2) && p.y <= sm.bottom + (PROJ_SPEED * 2)) {
                        window.__pushColorSliderAbsolute(p.x, 0);
                        hitSlider = true;
                        break;
                    }
                }
            }
            if (!hitSlider && shared.sliderBarColliders && window.__pushColorSliderAbsolute) {
                for (let sb of shared.sliderBarColliders) {
                    if (p.x >= sb.left - PROJ_RADIUS && p.x <= sb.right + PROJ_RADIUS &&
                        p.y >= sb.top - (PROJ_SPEED * 2) && p.y <= sb.bottom + (PROJ_SPEED * 2)) {
                        window.__pushColorSliderAbsolute(p.x, 0);
                        hitSlider = true;
                        break;
                    }
                }
            }
            if (hitSlider) {
                // Generate an explosion that updates the colour and destroys text
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

            // Check collision
            let hit = false;
            let allSolids = this.getColliders(shared);

            for (let s of allSolids) {
                if (p.x >= s.left && p.x <= s.right && p.y >= s.top && p.y <= s.bottom) {
                    hit = true;
                    // Check if we hit an interactive link
                    if (s.node) {
                        let interactiveNode = s.node.closest('a, button, [role="option"], .select-toggle, #nav-more-label, #randomise-btn');
                        if (interactiveNode) {
                            p.hitLink = interactiveNode;
                        }
                    }
                    break;
                }
            }

            // OOB wrap
            if (p.x < 0) p.x += window.innerWidth;
            if (p.x > window.innerWidth) p.x -= window.innerWidth;
            if (p.y < window.scrollY) p.y += window.innerHeight;
            if (p.y > window.scrollY + window.innerHeight) p.y -= window.innerHeight;

            if (hit) {
                if (p.hitLink) {
                    // simulate mouse click on the actual link!
                    p.hitLink.click();
                    // don't explode visually, just despawn
                    projectiles.splice(i, 1);
                } else {
                    // Explode!
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

        // Explosions animation step
        for (let i = explosions.length - 1; i >= 0; i--) {
            let ex = explosions[i];
            ex.r += (ex.maxR - ex.r) * 0.2; // ease out
            ex.life -= 0.05;
            if (ex.life <= 0) {
                explosions.splice(i, 1);
            }
        }
    },

    render(shared) {
        const { overlayCtx } = shared;
        if (!overlayCtx) return;

        // Clear the overlay frame
        overlayCtx.clearRect(0, 0, shared.canvas.width, shared.canvas.height);

        // Draw projectiles
        overlayCtx.fillStyle = shared.COMP_HEX || "#40d060";
        for (let p of projectiles) {
            overlayCtx.beginPath();
            overlayCtx.arc(p.x, p.y, PROJ_RADIUS, 0, Math.PI * 2);
            overlayCtx.fill();

            // outline
            overlayCtx.lineWidth = 1;
            overlayCtx.strokeStyle = "#1a1209";
            overlayCtx.stroke();
        }

        // Draw explosions
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

        // Draw tank
        overlayCtx.save();
        overlayCtx.translate(x, y);
        overlayCtx.rotate(angle);

        // Body
        overlayCtx.fillStyle = shared.COMP_HEX || "#40d060";
        overlayCtx.fillRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, TANK_HEIGHT);

        // Body outline
        overlayCtx.strokeStyle = "#1a1209";
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(-TANK_WIDTH / 2, -TANK_HEIGHT / 2, TANK_WIDTH, TANK_HEIGHT);

        // Turret barrel
        overlayCtx.fillStyle = "#1a1209";
        overlayCtx.fillRect(-2, -TANK_HEIGHT / 2 - 6, 4, TANK_HEIGHT / 2 + 6);

        // Center hatch
        overlayCtx.beginPath();
        overlayCtx.arc(0, 0, 4, 0, Math.PI * 2);
        overlayCtx.fillStyle = "#1a1209";
        overlayCtx.fill();

        overlayCtx.restore();
    }
};

function executeExplosion(exX, exY, radius, shared) {
    // 1. Destroy CA cells
    if (shared.currentMode && shared.currentMode.destroy) {
        shared.currentMode.destroy(exX, exY, radius, shared);
    }

    // 2. Destroy Text using TreeWalker
    if (shared && shared.columnHidden) return;

    const column = document.getElementById('column');
    if (!column) return;

    let hits = false;
    const walk = document.createTreeWalker(column, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let nodesToProcess = [];

    while (node = walk.nextNode()) {
        // Skip hidden dropdown texts, etc. to be safe
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
                newVal += char; // keep existing whitespace as-is
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
                    newVal += char; // Shield the interactive text from destruction
                } else {
                    // overwrite with non-breaking space to prevent HTML whitespace collapsing!
                    newVal += '\u00A0';
                    changed = true;
                    hits = true;
                }
            } else {
                newVal += char;
            }
        }

        if (changed) {
            tn.nodeValue = newVal;
        }
    }

    // 3. Rebuild colliders if text changed
    if (hits && shared.updateColliders) {
        shared.updateColliders();
    }
}

window.__modes = window.__modes || [];
window.__modes.push(tankMode);
