/**
 * life.js — Conway's Game of Life / Generations CA / Snake
 *
 * CA mode: S/B/C Generations rules with torus wrapping.
 * Snake:   WASD steering; canvas edges + central column (when visible) = walls;
 *          hold a direction key for >350 ms to accelerate;
 *          Escape hides the column and opens the full canvas as play space.
 *
 * Grid fixed at load:
 *   COLS = ceil(window.innerWidth  / CELL)
 *   ROWS = ceil((column.offsetHeight + 10 * CELL) / CELL)
 */

(function () {
    "use strict";

    /* ── Constants ──────────────────────────────────────────── */
    const CELL = 12;
    const CA_STEP_MS = 100;
    const SNAKE_STEP_MS = 130;   // normal tick
    const SNAKE_FAST_MS = 55;    // held-key turbo tick
    const HOLD_DELAY_MS = 350;   // how long to hold before turbo kicks in
    const LIVE_CHANCE = 0.30;

    const TAN_HEX = "#d4b896";
    const BLACK_HEX = "#1a1209";
    const TAN_RGB = [212, 184, 150];
    const BLACK_RGB = [26, 18, 9];
    const RED_HEX = "#c0392b";

    /* ── Ruleset definitions (S/B/C Generations format) ─────── */
    const RULESETS = {
        gameoflife: { label: "Game of Life", survive: new Set([2, 3]), born: new Set([3]), gens: 2 },
        starwars: { label: "Star Wars", survive: new Set([3, 4, 5]), born: new Set([2]), gens: 4 },
        brians: { label: "Brian's Brain", survive: new Set([]), born: new Set([2]), gens: 3 },
        brain6: { label: "Brain 6", survive: new Set([6]), born: new Set([2, 4, 6]), gens: 3 },
        rake: { label: "Rake", survive: new Set([3, 4, 6, 7]), born: new Set([2, 6, 7, 8]), gens: 6 },
        bombers: { label: "Bombers", survive: new Set([3, 4, 5]), born: new Set([2, 4]), gens: 25 },
        sedimental: { label: "SediMental", survive: new Set([4, 5, 6, 7, 8]), born: new Set([2, 5, 6, 7, 8]), gens: 4 },
    };

    let rule = RULESETS.gameoflife;
    let snakeMode = false;

    /* ── Escape / column-visible toggle ─────────────────────── */
    let columnHidden = false;

    function toggleColumn() {
        columnHidden = !columnHidden;
        column.classList.toggle("col-hidden", columnHidden);
    }

    /* ── DOM refs ────────────────────────────────────────────── */
    const canvas = document.getElementById("life-canvas");
    const ctx = canvas.getContext("2d");
    const column = document.getElementById("column");
    const rndBtn = document.getElementById("randomise-btn");
    const ruleToggle = document.getElementById("rule-toggle");
    const ruleLabel = document.getElementById("rule-label");
    const ruleOpts = document.getElementById("rule-options");

    /* ── Grid dimensions (fixed at load) ────────────────────── */
    const COLS = Math.ceil(window.innerWidth / CELL);
    const ROWS = Math.ceil((column.offsetHeight + 10 * CELL) / CELL);

    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;

    /* ── Column wall bounds (cells) ─────────────────────────── */
    // Horizontal: column is centred in the canvas
    const COL_PX_W = column.offsetWidth;
    const COL_LEFT_PX = (COLS * CELL - COL_PX_W) / 2;
    const COL_LEFT_CELL = Math.floor(COL_LEFT_PX / CELL);
    const COL_RIGHT_CELL = Math.ceil((COL_LEFT_PX + COL_PX_W) / CELL);

    // Vertical: read from layout so the snake can pass above/below
    const colRect = column.getBoundingClientRect();
    const COL_TOP_CELL = Math.floor((colRect.top + window.scrollY) / CELL);
    const COL_BOTTOM_CELL = Math.ceil((colRect.bottom + window.scrollY) / CELL);

    /* ════════════════════════════════════════════════════════════
       CA MODE
       ════════════════════════════════════════════════════════════ */
    function makeGrid() { return new Uint8Array(COLS * ROWS); }
    let current = makeGrid();
    let next = makeGrid();
    function idx(c, r) { return r * COLS + c; }

    function randomise() {
        for (let i = 0; i < current.length; i++) {
            current[i] = Math.random() < LIVE_CHANCE ? 1 : 0;
        }
    }
    randomise();

    function countAlive(col, row) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nc = (col + dc + COLS) % COLS;
                const nr = (row + dr + ROWS) % ROWS;
                if (current[idx(nc, nr)] === 1) n++;
            }
        }
        return n;
    }

    function caStep() {
        const { survive, born, gens } = rule;
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const s = current[idx(col, row)];
                let ns;
                if (s === 0) {
                    ns = born.has(countAlive(col, row)) ? 1 : 0;
                } else if (s === 1) {
                    ns = survive.has(countAlive(col, row)) ? 1 : (gens === 2 ? 0 : 2);
                } else {
                    ns = s + 1 >= gens ? 0 : s + 1;
                }
                next[idx(col, row)] = ns;
            }
        }
        const tmp = current; current = next; next = tmp;
    }

    let cellColors = [];
    function buildColors() {
        const gens = rule.gens;
        cellColors = new Array(gens);
        cellColors[0] = null;
        cellColors[1] = `rgb(${BLACK_RGB.join(",")})`;
        for (let s = 2; s < gens; s++) {
            const t = (s - 1) / (gens - 1);
            const r = Math.round(BLACK_RGB[0] + t * (TAN_RGB[0] - BLACK_RGB[0]));
            const g = Math.round(BLACK_RGB[1] + t * (TAN_RGB[1] - BLACK_RGB[1]));
            const b = Math.round(BLACK_RGB[2] + t * (TAN_RGB[2] - BLACK_RGB[2]));
            cellColors[s] = `rgb(${r},${g},${b})`;
        }
    }
    buildColors();

    function caRender() {
        ctx.fillStyle = TAN_HEX;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const s = current[idx(col, row)];
                if (s > 0) {
                    ctx.fillStyle = cellColors[s];
                    ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
                }
            }
        }
    }

    /* ════════════════════════════════════════════════════════════
       SNAKE MODE
       ════════════════════════════════════════════════════════════ */
    const DIRS = {
        w: { dc: 0, dr: -1 },
        s: { dc: 0, dr: 1 },
        a: { dc: -1, dr: 0 },
        d: { dc: 1, dr: 0 },
    };

    let snake = null;
    let heldKey = null;   // currently held direction key
    let holdStart = 0;     // timestamp when the key was first pressed

    function isColWall(c, r) {
        // The column is only a horizontal barrier for the rows it occupies.
        // When the column is hidden, it's not a wall at all.
        if (columnHidden) return false;
        if (c < COL_LEFT_CELL || c >= COL_RIGHT_CELL) return false;
        return r >= COL_TOP_CELL && r < COL_BOTTOM_CELL;
    }

    function isWall(c, r) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
        return isColWall(c, r);
    }

    function randomApple(body) {
        let c, r;
        do {
            c = Math.floor(Math.random() * COLS);
            r = Math.floor(Math.random() * ROWS);
        } while (
            isWall(c, r) ||
            body.some(function (b) { return b.c === c && b.r === r; })
        );
        return { c, r };
    }

    function initSnake() {
        // Start on the left open area, vertically centred
        const sc = Math.max(3, Math.floor(COL_LEFT_CELL / 2));
        const sr = Math.floor(ROWS / 2);
        const body = [
            { c: sc, r: sr },
            { c: sc - 1, r: sr },
            { c: sc - 2, r: sr },
        ];
        snake = {
            body: body,
            dir: { dc: 1, dr: 0 },
            nextDir: { dc: 1, dr: 0 },
            apple: randomApple(body),
            alive: true,
            score: 0,
        };
    }

    function snakeStep() {
        if (!snake || !snake.alive) return;
        snake.dir = snake.nextDir;
        const head = snake.body[0];
        const newHead = { c: head.c + snake.dir.dc, r: head.r + snake.dir.dr };
        if (isWall(newHead.c, newHead.r)) { snake.alive = false; return; }
        if (snake.body.some(function (b) { return b.c === newHead.c && b.r === newHead.r; })) {
            snake.alive = false; return;
        }
        snake.body.unshift(newHead);
        if (newHead.c === snake.apple.c && newHead.r === snake.apple.r) {
            snake.score++;
            snake.apple = randomApple(snake.body);
        } else {
            snake.body.pop();
        }
    }

    function snakeRender() {
        ctx.fillStyle = TAN_HEX;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!snake) return;

        // Apple
        ctx.fillStyle = RED_HEX;
        ctx.fillRect(snake.apple.c * CELL, snake.apple.r * CELL, CELL, CELL);

        // Snake body (head slightly lighter)
        snake.body.forEach(function (cell, i) {
            ctx.fillStyle = i === 0 ? "#4a3829" : BLACK_HEX;
            ctx.fillRect(cell.c * CELL, cell.r * CELL, CELL, CELL);
        });

        // Score in top-left corner
        ctx.fillStyle = BLACK_HEX;
        ctx.font = "bold 13px 'Courier New', monospace";
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText("SCORE: " + snake.score, 8, 8);

        // Game-over overlay
        if (!snake.alive) {
            ctx.fillStyle = "rgba(26,18,9,0.55)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Centre text in the left play area (or full canvas if column hidden)
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
    }

    /* ── Turbo step speed ────────────────────────────────────── */
    function snakeStepMs() {
        if (!heldKey) return SNAKE_STEP_MS;
        return (performance.now() - holdStart) > HOLD_DELAY_MS
            ? SNAKE_FAST_MS
            : SNAKE_STEP_MS;
    }

    /* ── Keyboard handler ────────────────────────────────────── */
    document.addEventListener("keydown", function (e) {
        // Escape always toggles column visibility
        if (e.key === "Escape") {
            toggleColumn();
            return;
        }

        if (!snakeMode) return;

        const key = e.key.toLowerCase();
        if (!DIRS[key]) return;

        e.preventDefault(); // prevent page scroll

        if (!snake || !snake.alive) {
            initSnake();
            heldKey = key;
            holdStart = performance.now();
            return;
        }

        // Track hold for turbo
        if (heldKey !== key) {
            heldKey = key;
            holdStart = performance.now();
        }

        // Queue direction (can't reverse into self)
        const wanted = DIRS[key];
        if (wanted.dc !== -snake.dir.dc || wanted.dr !== -snake.dir.dr) {
            snake.nextDir = wanted;
        }
    });

    document.addEventListener("keyup", function (e) {
        if (e.key.toLowerCase() === heldKey) heldKey = null;
    });

    /* ════════════════════════════════════════════════════════════
       MAIN LOOP
       ════════════════════════════════════════════════════════════ */
    let lastStep = 0;
    function loop(ts) {
        const stepMs = snakeMode ? snakeStepMs() : CA_STEP_MS;
        if (ts - lastStep >= stepMs) {
            snakeMode ? snakeStep() : caStep();
            lastStep = ts;
        }
        snakeMode ? snakeRender() : caRender();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    /* ── Randomise button (CA only) ──────────────────────────── */
    rndBtn.addEventListener("click", function () {
        if (!snakeMode) randomise();
    });

    /* ── Custom rule dropdown ────────────────────────────────── */
    ruleToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        const isOpen = !ruleOpts.hidden;
        ruleOpts.hidden = isOpen;
        ruleToggle.setAttribute("aria-expanded", String(!isOpen));
    });

    ruleOpts.addEventListener("click", function (e) {
        const li = e.target.closest("li");
        if (!li) return;
        const value = li.dataset.value;

        if (value === "snake") {
            snakeMode = true;
            initSnake();
        } else {
            snakeMode = false;
            heldKey = null;
            rule = RULESETS[value];
            buildColors();
            if (rule.gens === 2) {
                for (let i = 0; i < current.length; i++) {
                    if (current[i] > 1) current[i] = 0;
                }
            }
        }

        ruleLabel.textContent = li.textContent.trim();
        ruleOpts.querySelectorAll("li").forEach(function (el) {
            el.classList.toggle("selected", el === li);
        });
        ruleOpts.hidden = true;
        ruleToggle.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("click", function () {
        ruleOpts.hidden = true;
        ruleToggle.setAttribute("aria-expanded", "false");
    });

    /* ── Mouse painting (CA mode only) ──────────────────────── */
    let painting = false;

    function canvasCell(e) {
        return {
            col: Math.floor((e.clientX + window.scrollX) / CELL),
            row: Math.floor((e.clientY + window.scrollY) / CELL),
        };
    }

    function paintCell(e) {
        if (snakeMode) return;
        const { col, row } = canvasCell(e);
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
            current[idx(col, row)] = 1;
        }
    }

    document.addEventListener("mousedown", function (e) {
        if (e.button === 0 && !column.contains(e.target)) {
            e.preventDefault();
            painting = true;
            paintCell(e);
        }
    });
    document.addEventListener("mousemove", function (e) { if (painting) paintCell(e); });
    document.addEventListener("mouseup", function () { painting = false; });

    canvas.addEventListener("touchstart", function (e) {
        e.preventDefault();
        Array.from(e.touches).forEach(paintCell);
    }, { passive: false });
    canvas.addEventListener("touchmove", function (e) {
        e.preventDefault();
        Array.from(e.touches).forEach(paintCell);
    }, { passive: false });

})();
