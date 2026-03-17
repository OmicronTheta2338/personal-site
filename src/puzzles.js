/**
 * puzzles.js — Client-side answer verification
 *
 * Checks user-submitted answers against a precomputed SHA-256 hash.
 */

// Helper to calculate SHA-256 hash of a string using Web Crypto API
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Normalise answer string: uppercase and remove all spacing/punctuation (keep only alphanumeric)
function normalizeAnswer(answer) {
    return answer.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function initPuzzles() {
    // 1. Initialize existing solved puzzles on page load
    const huntSections = document.querySelectorAll('section[data-hunt-id]');

    huntSections.forEach(section => {
        const huntId = section.getAttribute('data-hunt-id');
        if (!huntId) return;

        const logContainer = section.querySelector('.solved-puzzles-list');

        // Find all puzzle forms in this hunt
        const puzzleForms = section.querySelectorAll('.verify-form');

        puzzleForms.forEach(form => {
            const puzzleName = form.getAttribute('data-puzzle-name') || 'Unknown Puzzle';
            const storageKey = `solved_${huntId}_${puzzleName}`;

            // Check if solved in localStorage
            const savedAnswer = localStorage.getItem(storageKey);

            if (savedAnswer) {
                markAsSolved(form, puzzleName, savedAnswer, logContainer);
            }

            // 2. Handle new submissions
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const input = form.querySelector('.answer-input');
                const resultSpan = form.querySelector('.verify-result');
                const targetHash = form.getAttribute('data-hash');

                if (!input || !resultSpan || !targetHash) return;

                const rawAnswer = input.value;
                const normalized = normalizeAnswer(rawAnswer);

                if (!normalized) {
                    resultSpan.textContent = "Please enter an answer.";
                    resultSpan.style.color = "var(--black)";
                    return;
                }

                try {
                    const computedHash = await sha256(normalized);

                    if (computedHash === targetHash.toLowerCase()) {
                        // Correct answer!
                        // Save to localStorage
                        localStorage.setItem(storageKey, normalized);
                        // Update UI
                        markAsSolved(form, puzzleName, normalized, logContainer);
                    } else {
                        resultSpan.textContent = "Incorrect.";
                        resultSpan.style.color = "red";
                    }
                } catch (err) {
                    console.error("Error verifying answer:", err);
                    resultSpan.textContent = "Verification error.";
                    resultSpan.style.color = "red";
                }
            });
        });
    });
}

function markAsSolved(form, puzzleName, answer, logContainer) {
    // Hide the form
    form.style.display = 'none';

    // Show the solved message in its place
    const solvedDisplay = form.parentElement.querySelector('.solved-display');
    if (solvedDisplay) {
        solvedDisplay.style.display = 'block';
        solvedDisplay.textContent = `Solved! Answer: ${answer}`;
    }

    // Add to the hunt log at the bottom if we have a log container
    if (logContainer) {
        // Only append if it's not already in the log (prevents duplicates on re-init)
        const existingEntries = Array.from(logContainer.querySelectorAll('li'));
        const alreadyLogged = existingEntries.some(li => li.getAttribute('data-puzzle') === puzzleName);

        if (!alreadyLogged) {
            const li = document.createElement('li');
            li.setAttribute('data-puzzle', puzzleName);
            li.style.marginBottom = "5px";
            li.innerHTML = `<strong>${puzzleName}</strong> correctly answered with <strong>${answer}</strong>`;
            logContainer.appendChild(li);
        }
    }
}
