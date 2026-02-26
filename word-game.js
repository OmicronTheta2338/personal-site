(function () {
    let currentMode = "1";
    let wordHistory = []; // For Mode 6
    let generationHistory = []; // Stack for Undo

    // DOM Initialisation will be done carefully using an init pattern or DOMContentLoaded to avoid nulls
    // Since the script runs before engine.js which does some UI work, we can just rely on DOMContentLoaded
    document.addEventListener("DOMContentLoaded", function () {
        const display = document.getElementById('wg-display');
        const listItems = document.querySelectorAll('#wg-gamemode-list a');
        const instructionsContainer = document.getElementById('wg-instructions');
        const generateBtn = document.getElementById('wg-generate-btn');

        const INSTRUCTIONS = {
            "1": { title: "1. CHARACTER & SITUATION", desc: "Act out the character in this situation." },
            "2": { title: "2. ADJECTIVE & CHARACTER", desc: "Roleplay this character with this specific trait." },
            "3": { title: "3. WORD -> CONTEXTS", desc: "List as many contexts/associations for this word as possible." },
            "4": { title: "4. TOPIC -> SYNONYMS", desc: "Give synonyms or examples related to this topic." },
            "5": { title: "5. TOPIC CONNECTION", desc: "Find two elements that rhyme, two elements that alliterate, and a context/word that could fit either." },
            "6": { title: "6. WORD STREAM STORY", desc: "Incorporate the new word into a continuous story." },
            "7": { title: "7. SAYING & TOPIC", desc: "Use this saying in a conversation about the topic." }
        };

        function getRandom(arr) {
            if (!arr || arr.length === 0) return "???";
            return arr[Math.floor(Math.random() * arr.length)];
        }

        let currentContent = null;

        function generateContent() {
            // Check if the current view is the game view before generating things
            var viewWordGame = document.getElementById("view-word-game");
            if (!viewWordGame || getComputedStyle(viewWordGame).display === "none") return;

            if (currentContent) {
                generationHistory.push({
                    mode: currentContent.mode || currentMode,
                    content: JSON.parse(JSON.stringify(currentContent))
                });
                if (generationHistory.length > 50) generationHistory.shift();
            }

            display.innerHTML = '';

            switch (currentMode) {
                case "1":
                    renderTwoLines(getRandom(window.CHARACTERS || []), getRandom(window.SITUATIONS || []));
                    break;
                case "2":
                    renderTwoLines(getRandom(window.ADJECTIVES || []), getRandom(window.CHARACTERS || []));
                    break;
                case "3":
                    renderSingleLine(getRandom(window.ALL_WORDS || []));
                    break;
                case "4":
                    renderSingleLine(getRandom(window.TOPICS || []));
                    break;
                case "5":
                    renderTwoLines(getRandom(window.TOPICS || []), getRandom(window.TOPICS || []));
                    break;
                case "6":
                    updateHistory();
                    renderHistory();
                    break;
                case "7":
                    renderTwoLines(getRandom(window.SAYINGS || []), getRandom(window.TOPICS || []));
                    break;
            }

            // Immediately recalculate hitboxes to account for the new height of the rendered text
            if (window.__engineShared && window.__engineShared.updateColliders) {
                // Use a short timeout to let the DOM paint first
                setTimeout(() => window.__engineShared.updateColliders(), 50);
            }
        }

        function renderSingleLine(text) {
            wordHistory = [];
            currentContent = { type: 'single', text: text, mode: currentMode };

            const el = document.createElement('div');
            el.className = 'wg-word-row wg-anim-in';
            el.textContent = text;
            display.appendChild(el);
        }

        function renderTwoLines(text1, text2) {
            wordHistory = [];
            currentContent = { type: 'double', text1: text1, text2: text2, mode: currentMode };

            const el1 = document.createElement('div');
            el1.className = 'wg-word-row wg-anim-in';
            el1.textContent = text1;

            const el2 = document.createElement('div');
            el2.className = 'wg-word-row wg-anim-in';
            el2.style.animationDelay = '0.1s';
            el2.textContent = text2;

            display.appendChild(el1);
            display.appendChild(el2);
        }

        function updateHistory() {
            const newWord = getRandom(window.ALL_WORDS || []);
            wordHistory.unshift(newWord);
            if (wordHistory.length > 5) wordHistory.pop();
            currentContent = { type: 'stream', history: [...wordHistory], mode: currentMode };
        }

        function renderHistory() {
            const historyContainer = document.createElement('div');
            historyContainer.className = 'wg-history-container';

            wordHistory.forEach((word, index) => {
                const el = document.createElement('div');
                el.className = 'wg-history-item';

                if (index === 0) {
                    el.classList.add('wg-current', 'wg-anim-in');
                } else {
                    el.classList.add('wg-past');
                    el.style.opacity = Math.max(0.1, 0.6 - (index * 0.1));
                    el.style.fontSize = `${Math.max(1, 2.5 - (index * 0.3))}rem`;
                }

                el.textContent = word;
                historyContainer.appendChild(el);
            });

            display.appendChild(historyContainer);
        }

        function undoGeneration() {
            // Check if active
            var viewWordGame = document.getElementById("view-word-game");
            if (!viewWordGame || getComputedStyle(viewWordGame).display === "none") return;

            if (generationHistory.length === 0) return;

            const previousState = generationHistory.pop();
            currentMode = previousState.mode;
            currentContent = previousState.content;

            listItems.forEach(li => {
                if (li.dataset.mode === currentMode) li.classList.add('wg-active');
                else li.classList.remove('wg-active');
            });

            const data = INSTRUCTIONS[currentMode];
            if (data) {
                instructionsContainer.innerHTML = `<h3>${data.title}</h3><p>${data.desc}</p>`;
            }

            display.innerHTML = '';

            if (currentContent.type === 'single') {
                wordHistory = [];
                const el = document.createElement('div');
                el.className = 'wg-word-row';
                el.textContent = currentContent.text;
                display.appendChild(el);
            } else if (currentContent.type === 'double') {
                wordHistory = [];
                const el1 = document.createElement('div');
                el1.className = 'wg-word-row';
                el1.textContent = currentContent.text1;

                const el2 = document.createElement('div');
                el2.className = 'wg-word-row';
                el2.textContent = currentContent.text2;

                display.appendChild(el1);
                display.appendChild(el2);
            } else if (currentContent.type === 'stream') {
                wordHistory = currentContent.history;
                renderHistory();
            }
        }

        // Setup Sidebar Selection
        listItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                listItems.forEach(li => li.classList.remove('wg-active'));
                item.classList.add('wg-active');

                currentMode = item.dataset.mode;
                wordHistory = [];

                const data = INSTRUCTIONS[currentMode];
                if (data) {
                    instructionsContainer.innerHTML = `<h3>${data.title}</h3><p>${data.desc}</p>`;
                }

                generateContent();
            });
        });

        // Setup Generate Button
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                var viewWordGame = document.getElementById("view-word-game");
                if (viewWordGame && getComputedStyle(viewWordGame).display !== "none") {
                    generateContent();
                }
            });
        }

        // Setup Global Hotkeys, filtered dynamically by engine visibility
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                var viewWordGame = document.getElementById("view-word-game");
                if (viewWordGame && getComputedStyle(viewWordGame).display !== "none") {
                    e.preventDefault();
                    generateContent();
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                var viewWordGame = document.getElementById("view-word-game");
                if (viewWordGame && getComputedStyle(viewWordGame).display !== "none") {
                    e.preventDefault();
                    undoGeneration();
                }
            }
        });

        // Setup engine routing hook so it triggers when game view opens
        // This simulates mounting the component. We can listen for hashchange.
        window.addEventListener("hashchange", function () {
            var hash = window.location.hash || '#about-me';
            if (hash === '#word-game') {
                // Initialise if needed, but not forcing a generate if they go back and forth
            }
        });

    });
})();
