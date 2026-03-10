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
    const forms = document.querySelectorAll('.verify-form');

    forms.forEach(form => {
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
                    resultSpan.textContent = "Correct!";
                    resultSpan.style.color = "var(--comp-dark-color)"; // using a variable from style.css
                } else {
                    resultSpan.textContent = "Incorrect.";
                    resultSpan.style.color = "red"; // simple color for incorrect
                }
            } catch (err) {
                console.error("Error verifying answer:", err);
                resultSpan.textContent = "Verification error.";
                resultSpan.style.color = "red";
            }
        });
    });
}
