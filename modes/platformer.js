/**
 * modes/platformer.js — WASD platformer with character-level text collisions
 */
(function () {
    "use strict";

    var px = 100, py = 100;
    var vx = 0, vy = 0;
    var SIZE = 14;

    var grounded = false;
    var wallDir = 0;
    var facingDir = 1;

    var jumpBuffer = 0;
    var coyoteTime = 0;

    var KEYS = {
        'a': 'left', 'arrowleft': 'left',
        'd': 'right', 'arrowright': 'right',
        'w': 'up', 'arrowup': 'up',
        's': 'down', 'arrowdown': 'down',
        'enter': 'enter',
        ' ': 'jump' // keeping space jump as an option
    };
    var input = { left: false, right: false, up: false, down: false, jump: false, jumpConsumed: false, enter: false, enterConsumed: false };

    var GRAVITY = 0.45;
    var MAX_FALL = 9;
    var ACCEL = 1.0;
    var FRICTION = 0.70;
    var AIR_FRICTION = 0.85;
    var MAX_WALK = 4.5;
    var JUMP_SPEED = -8.5;
    var WALL_JUMP_SPEED_X = 6.5;
    var WALL_JUMP_SPEED_Y = -8;
    var WALL_SLIDE_SPEED = 2.5;

    var activeLink = null;

    function clearInputs() {
        for (var key in input) input[key] = false;
        jumpBuffer = 0;
    }

    function onNavClick(e) {
        var href = e.currentTarget.getAttribute("href");
        if (href && href.startsWith('#')) {
            e.preventDefault();
            var sectionId = href.substring(1);

            if (window.location.hash !== href) {
                window.location.hash = href;
            }
            // Force synchronous SPA layout update so the new view is display:block
            if (typeof window.handleRouting === 'function') {
                window.handleRouting();
            }

            // Layout is now valid. Measure heading!
            var section = document.getElementById(sectionId);
            if (section) {
                var heading = section.querySelector("h2");
                if (heading) {
                    var rect = heading.getBoundingClientRect();
                    px = rect.left + 14 + window.scrollX;
                    py = rect.top + window.scrollY - SIZE - 10;
                    vx = 0;
                    vy = 0;
                } else {
                    px = window.innerWidth / 2;
                    py = window.scrollY + 100;
                    vx = 0;
                    vy = 0;
                }
            }
        }
    }

    function getColliders(shared) {
        var colliders = shared.columnHidden ? [] : shared.textColliders.slice();

        // Retrieve dynamic solid logic from the active main mode (like CA, Snake or Minesweeper)
        if (shared.currentMode && shared.currentMode.getSolids && shared.currentMode !== platformerMode) {
            var columnRect = null;
            if (!shared.columnHidden) {
                var colEl = document.getElementById("column");
                if (colEl) {
                    var hr = colEl.getBoundingClientRect();
                    columnRect = {
                        left: hr.left + window.scrollX,
                        right: hr.right + window.scrollX,
                        top: hr.top + window.scrollY,
                        bottom: hr.bottom + window.scrollY
                    };
                }
            }

            var solids = shared.currentMode.getSolids(shared);
            if (solids && solids.length > 0) {
                for (var j = 0; j < solids.length; j++) {
                    var s = solids[j];
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

        var cw = shared.canvas.width;
        var ch = shared.canvas.height;
        colliders.push({ left: -100, right: 0, top: -100, bottom: ch + 100 });
        colliders.push({ left: cw, right: cw + 100, top: -100, bottom: ch + 100 });
        colliders.push({ left: 0, right: cw, top: ch, bottom: ch + 100 });

        return colliders;
    }

    function intersect(x, y, c) {
        var hw = SIZE / 2, hh = SIZE / 2;
        return x + hw > c.left && x - hw < c.right &&
            y + hh > c.top && y - hh < c.bottom;
    }

    function intersectLink(x, y, c) {
        var hw = SIZE / 2, hh = SIZE / 2;
        var pad = 8; // Extra generous pad to guarantee player standing ON text counts as hovering the parent link
        return x + hw + pad >= c.left && x - hw - pad <= c.right &&
            y + hh + pad >= c.top && y - hh - pad <= c.bottom;
    }

    function resolveX(colliders) {
        var hw = SIZE / 2;
        wallDir = 0;
        var hit = 0;
        if (vx === 0) return;

        for (var i = 0; i < colliders.length; i++) {
            var c = colliders[i];
            if (intersect(px, py, c)) {
                if (vx > 0) { px = c.left - hw; hit = 1; }
                else if (vx < 0) { px = c.right + hw; hit = -1; }
            }
        }
        if (hit !== 0) {
            vx = 0;
            wallDir = hit;
        }
    }

    function resolveY(colliders) {
        var hw = SIZE / 2;
        var hh = SIZE / 2;
        grounded = false;
        var hit = false;

        if (vy !== 0) {
            for (var i = 0; i < colliders.length; i++) {
                var c = colliders[i];
                if (intersect(px, py, c)) {
                    if (vy > 0) { py = c.top - hh; hit = 'bottom'; }
                    else if (vy < 0) { py = c.bottom + hh; hit = 'top'; }
                }
            }
            if (hit) {
                vy = 0;
                if (hit === 'bottom') grounded = true;
            }
        }

        // Wall slide check
        if (!grounded && wallDir === 0) {
            for (var i = 0; i < colliders.length; i++) {
                var c = colliders[i];
                // Check if slightly overlapping horizontally and within vertical bounds
                if (py + hh > c.top + 1 && py - hh < c.bottom - 1) {
                    if (Math.abs((px + hw) - c.left) < 1.0) { wallDir = 1; break; }
                    if (Math.abs((px - hw) - c.right) < 1.0) { wallDir = -1; break; }
                }
            }
        }
    }

    var platformerMode = {
        id: "platformer",
        label: "Platformer",
        stepMs: 16,
        fullCanvas: true,

        init: function (_shared) { },

        activate: function (shared) {
            document.getElementById("gol-controls").style.position = "relative";
            document.getElementById("gol-controls").style.zIndex = "1000";

            if (!document.getElementById("platformer-player")) {
                var el = document.createElement("div");
                el.id = "platformer-player";
                el.style.position = "absolute";
                el.style.width = SIZE + "px";
                el.style.height = SIZE + "px";
                el.style.backgroundColor = "#7EAEEC";
                el.style.zIndex = "1000";
                el.style.pointerEvents = "none";

                var e1 = document.createElement("div");
                e1.style.position = "absolute"; e1.style.width = "2px"; e1.style.height = "2px"; e1.style.backgroundColor = "#1a1209"; e1.style.top = "3px"; e1.className = "eye1";
                var e2 = document.createElement("div");
                e2.style.position = "absolute"; e2.style.width = "2px"; e2.style.height = "2px"; e2.style.backgroundColor = "#1a1209"; e2.style.top = "3px"; e2.className = "eye2";

                el.appendChild(e1);
                el.appendChild(e2);
                document.body.appendChild(el);
            }
            document.getElementById("platformer-player").style.display = "block";

            window.addEventListener('blur', clearInputs);

            var navLinks = document.querySelectorAll('a[href^="#"]');
            for (var i = 0; i < navLinks.length; i++) {
                navLinks[i].addEventListener('click', onNavClick);
            }

            var hash = window.location.hash || '#about';
            var sectionId = hash.substring(1);
            var activeSection = document.getElementById(sectionId);
            var heading = activeSection ? activeSection.querySelector("h2") : null;

            if (heading) {
                var rect = heading.getBoundingClientRect();
                if (rect.width > 0) {
                    px = rect.left + 14 + window.scrollX;
                    py = rect.top + window.scrollY - SIZE - 10;
                } else {
                    px = shared.canvas.width / 2;
                    py = Math.max(100, window.scrollY + 100);
                }
            } else {
                px = shared.canvas.width / 2;
                py = Math.max(100, window.scrollY + 100);
            }
            vx = 0; vy = 0;
        },

        deactivate: function () {
            var el = document.getElementById("platformer-player");
            if (el) el.style.display = "none";

            var controls = document.getElementById("gol-controls");
            if (controls) {
                controls.style.position = "";
                controls.style.zIndex = "";
            }

            if (activeLink) {
                activeLink.el.classList.remove("hover-active");
                activeLink = null;
            }
            window.removeEventListener('blur', clearInputs);

            var navLinks = document.querySelectorAll('a[href^="#"]');
            for (var i = 0; i < navLinks.length; i++) {
                navLinks[i].removeEventListener('click', onNavClick);
            }
        },

        step: function (shared) {
            var colliders = getColliders(shared);

            if (jumpBuffer > 0) jumpBuffer--;
            if (grounded) {
                coyoteTime = 8;
            } else if (coyoteTime > 0) {
                coyoteTime--;
            }

            // Variable jump height uses current input state
            var isJumpPressed = input.jump || input.up;

            var dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

            if (dir !== 0) {
                vx += dir * ACCEL;
                if (Math.abs(vx) > MAX_WALK) vx = Math.sign(vx) * MAX_WALK;
                facingDir = dir;
            } else {
                vx *= grounded ? FRICTION : AIR_FRICTION;
                if (Math.abs(vx) < 0.2) vx = 0;
            }

            vy += GRAVITY;

            // Wall slide
            if (wallDir !== 0 && dir === wallDir && vy > 0) {
                if (vy > WALL_SLIDE_SPEED) vy = Math.max(WALL_SLIDE_SPEED, vy - 1);
            } else {
                if (vy > MAX_FALL) vy = MAX_FALL;
            }

            if (jumpBuffer > 0) {
                if (coyoteTime > 0) {
                    vy = JUMP_SPEED;
                    jumpBuffer = 0;
                    coyoteTime = 0;
                    grounded = false;
                } else if (wallDir !== 0) {
                    vx = -wallDir * WALL_JUMP_SPEED_X;
                    vy = WALL_JUMP_SPEED_Y;
                    jumpBuffer = 0;
                    facingDir = -wallDir;
                    px -= wallDir; // disconnect from wall slightly
                }
            }

            // Variable jump height
            if (!isJumpPressed && vy < 0) {
                vy *= 0.6;
            }

            // Link interactions
            var newActiveLink = null;
            if (!shared.columnHidden) {
                for (var i = shared.linkElements.length - 1; i >= 0; i--) {
                    var l = shared.linkElements[i];
                    if (intersectLink(px, py, l)) {
                        newActiveLink = l;
                        break;
                    }
                }
            }

            if (activeLink !== newActiveLink) {
                if (activeLink) {
                    activeLink.el.classList.remove("hover-active");
                }
                if (newActiveLink) {
                    newActiveLink.el.classList.add("hover-active");
                }
                activeLink = newActiveLink;
            }

            px += vx;
            resolveX(colliders);

            py += vy;
            resolveY(colliders);

            // Screen scrolling only occurs if moving
            if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5 || !grounded) {
                var screenY = py - window.scrollY;
                if (screenY < 150) window.scrollBy(0, screenY - 150);
                if (screenY > window.innerHeight - 150) window.scrollBy(0, screenY - (window.innerHeight - 150));
            }

            // Respawn
            if (py > shared.canvas.height + 100) {
                px = shared.canvas.width / 2;
                py = window.scrollY + 100;
                vx = 0; vy = 0;
            }
        },

        render: function (shared) {
            var el = document.getElementById("platformer-player");
            if (el) {
                var hw = SIZE / 2;
                var hh = SIZE / 2;
                el.style.left = (px - hw) + "px";
                el.style.top = (py - hh) + "px";

                var eye1 = el.querySelector(".eye1");
                var eye2 = el.querySelector(".eye2");
                if (eye1 && eye2) {
                    var eyeX = facingDir === 1 ? 9 : 1;
                    eye1.style.left = eyeX + "px";
                    eye2.style.left = (eyeX + 4) + "px";
                }
            }
        },
        /* // Debug: draw collision boxes
            ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
            var colls = cachedColliders;
            for(var i=0; i<colls.length; i++) {
                ctx.fillRect(colls[i].left, colls[i].top, colls[i].right - colls[i].left, colls[i].bottom - colls[i].top);
            }
        */

        onKeyDown: function (e, _shared) {
            var k = e.key.toLowerCase();
            var code = e.code.toLowerCase();

            if (KEYS[k] || KEYS[code]) {
                var action = KEYS[k] || KEYS[code];

                // Process tap-sensitive actions immediately on key down
                if (!input[action]) {
                    if (action === "jump" || action === "up") {
                        jumpBuffer = 8;
                    }
                    if (action === "enter") {
                        // Un-focus any open dropdowns regardless of hover state
                        document.body.click();

                        if (activeLink) {
                            var toClick = activeLink.el;
                            // Give the DOM a tiny bit of time before clicking the selected item
                            setTimeout(function () { toClick.click(); }, 10);
                        }
                    }
                }

                input[action] = true;
                if (!["f5", "f12", "r", "c", "i", "tab", "escape"].includes(k)) {
                    if (["left", "right", "up", "down", "jump", "enter"].includes(action)) {
                        e.preventDefault();
                    }
                }
            }
        },

        onKeyUp: function (e, _shared) {
            var k = e.key.toLowerCase();
            var code = e.code.toLowerCase();

            if (KEYS[k] || KEYS[code]) {
                var action = KEYS[k] || KEYS[code];
                input[action] = false;
            }
        }
    };

    window.__modes = window.__modes || [];
    window.__modes.push(platformerMode);

})();
