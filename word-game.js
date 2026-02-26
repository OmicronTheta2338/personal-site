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
            "1": { title: "1. CHARACTER & SITUATION", desc: "Act out the character in this situation.", destTitle: [], destDesc: [] },
            "2": { title: "2. ADJECTIVE & CHARACTER", desc: "Roleplay this character with this specific trait.", destTitle: [], destDesc: [] },
            "3": { title: "3. WORD -> CONTEXTS", desc: "List as many contexts/associations for this word as possible.", destTitle: [], destDesc: [] },
            "4": { title: "4. TOPIC -> SYNONYMS", desc: "Give synonyms or examples related to this topic.", destTitle: [], destDesc: [] },
            "5": { title: "5. TOPIC CONNECTION", desc: "Find two elements that rhyme, two elements that alliterate, and a context/word that could fit either.", destTitle: [], destDesc: [] },
            "6": { title: "6. WORD STREAM STORY", desc: "Incorporate the new word into a continuous story.", destTitle: [], destDesc: [] },
            "7": { title: "7. SAYING & TOPIC", desc: "Use this saying in a conversation about the topic.", destTitle: [], destDesc: [] }
        };

        function renderInstructions(modeId) {
            const data = INSTRUCTIONS[modeId];
            if (!data) return;

            let tHTML = "";
            for (let i = 0; i < data.title.length; i++) {
                tHTML += data.destTitle.includes(i) ? '\u00A0' : data.title[i];
            }

            let dHTML = "";
            for (let i = 0; i < data.desc.length; i++) {
                dHTML += data.destDesc.includes(i) ? '\u00A0' : data.desc[i];
            }

            instructionsContainer.innerHTML = `<h3 class="wg-title" data-wg-mode="${modeId}">${tHTML}</h3><p class="wg-desc" data-wg-mode="${modeId}">${dHTML}</p>`;
        }

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
            if (!currentContent || currentContent.text !== text) {
                currentContent = { type: 'single', text: text, mode: currentMode, dest: [] };
            }

            const el = document.createElement('div');
            el.className = 'wg-word-row wg-anim-in';
            el.dataset.wgLine = "1";
            let displayHTML = "";
            for (let i = 0; i < text.length; i++) {
                displayHTML += currentContent.dest.includes(i) ? '\u00A0' : text[i];
            }
            el.innerHTML = displayHTML;
            display.appendChild(el);
        }

        function renderTwoLines(text1, text2) {
            wordHistory = [];
            if (!currentContent || currentContent.text1 !== text1 || currentContent.text2 !== text2) {
                currentContent = { type: 'double', text1: text1, text2: text2, mode: currentMode, dest1: [], dest2: [] };
            }

            const el1 = document.createElement('div');
            el1.className = 'wg-word-row wg-anim-in';
            el1.dataset.wgLine = "1";
            let d1 = "";
            for (let i = 0; i < text1.length; i++) {
                d1 += currentContent.dest1.includes(i) ? '\u00A0' : text1[i];
            }
            el1.innerHTML = d1;

            const el2 = document.createElement('div');
            el2.className = 'wg-word-row wg-anim-in';
            el2.style.animationDelay = '0.1s';
            el2.dataset.wgLine = "2";
            let d2 = "";
            for (let i = 0; i < text2.length; i++) {
                d2 += currentContent.dest2.includes(i) ? '\u00A0' : text2[i];
            }
            el2.innerHTML = d2;

            display.appendChild(el1);
            display.appendChild(el2);
        }

        function updateHistory() {
            const newWord = getRandom(window.ALL_WORDS || []);
            wordHistory.unshift(newWord);
            if (wordHistory.length > 5) wordHistory.pop();

            // Shift dest arrays
            let destArrays = currentContent && currentContent.type === 'stream' ? currentContent.destHist : [[], [], [], [], [], []];
            destArrays.unshift([]);
            if (destArrays.length > 5) destArrays.pop();

            currentContent = { type: 'stream', history: [...wordHistory], mode: currentMode, destHist: destArrays };
        }

        function renderHistory() {
            const historyContainer = document.createElement('div');
            historyContainer.className = 'wg-history-container';

            wordHistory.forEach((word, index) => {
                const el = document.createElement('div');
                el.className = 'wg-history-item';
                el.dataset.wgHistoryIdx = String(index);

                if (index === 0) {
                    el.classList.add('wg-current', 'wg-anim-in');
                } else {
                    el.classList.add('wg-past');
                    el.style.opacity = Math.max(0.1, 0.6 - (index * 0.1));
                    el.style.fontSize = `${Math.max(1, 2.5 - (index * 0.3))}rem`;
                }

                let d = "";
                // ensure destHist exists
                let destArr = currentContent.destHist && currentContent.destHist[index] ? currentContent.destHist[index] : [];
                for (let i = 0; i < word.length; i++) {
                    d += destArr.includes(i) ? '\u00A0' : word[i];
                }
                el.innerHTML = d;
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

            renderInstructions(currentMode);

            display.innerHTML = '';

            if (currentContent.type === 'single') {
                renderSingleLine(currentContent.text);
            } else if (currentContent.type === 'double') {
                renderTwoLines(currentContent.text1, currentContent.text2);
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

                renderInstructions(currentMode);

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

        // Callback from tank.js explosions
        window.__wgDestroyChar = function (node, charIndex) {
            if (node.classList.contains('wg-title')) {
                let m = node.dataset.wgMode;
                if (m && INSTRUCTIONS[m] && !INSTRUCTIONS[m].destTitle.includes(charIndex)) {
                    INSTRUCTIONS[m].destTitle.push(charIndex);
                }
                return;
            }
            if (node.classList.contains('wg-desc')) {
                let m = node.dataset.wgMode;
                if (m && INSTRUCTIONS[m] && !INSTRUCTIONS[m].destDesc.includes(charIndex)) {
                    INSTRUCTIONS[m].destDesc.push(charIndex);
                }
                return;
            }

            if (!currentContent) return;

            if (node.classList.contains('wg-word-row')) {
                if (node.dataset.wgLine === "1") {
                    if (!currentContent.dest) currentContent.dest = [];
                    if (!currentContent.dest1) currentContent.dest1 = [];
                    if (currentContent.type === 'single' && !currentContent.dest.includes(charIndex)) currentContent.dest.push(charIndex);
                    if (currentContent.type === 'double' && !currentContent.dest1.includes(charIndex)) currentContent.dest1.push(charIndex);
                } else if (node.dataset.wgLine === "2") {
                    if (!currentContent.dest2) currentContent.dest2 = [];
                    if (!currentContent.dest2.includes(charIndex)) currentContent.dest2.push(charIndex);
                }
            } else if (node.classList.contains('wg-history-item')) {
                let rIdx = parseInt(node.dataset.wgHistoryIdx);
                if (!isNaN(rIdx) && currentContent.destHist && currentContent.destHist[rIdx]) {
                    if (!currentContent.destHist[rIdx].includes(charIndex)) {
                        currentContent.destHist[rIdx].push(charIndex);
                    }
                }
            }
        };

    });
})();
