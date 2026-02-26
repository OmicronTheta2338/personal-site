const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    // Catch console logs from the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Load the local HTML file
    await page.goto('file:///c:/Users/kamer/personal-site/index.html', { waitUntil: 'load' });

    console.log("Evaluating game engine loop metrics...");

    const metrics = await page.evaluate(async () => {
        return new Promise((resolve) => {
            // Activate platformer overlay mode
            if (window.__modes) {
                const pMode = window.__modes.find(m => m.id === 'platformer');
                if (window.__engineShared) {
                    window.__engineShared.overlayMode = pMode;
                    if (pMode.activate) pMode.activate(window.__engineShared);
                }
            }

            setTimeout(() => {
                let shared = window.__engineShared;
                if (!shared) {
                    resolve("Error: __engineShared not found attached to window.");
                    return;
                }

                let textCollidersLen = shared.textColliders ? shared.textColliders.length : 0;
                let linkElementsLen = shared.linkElements ? shared.linkElements.length : 0;
                let solidsLen = 0;

                if (shared.currentMode && shared.currentMode.getSolids) {
                    let s = shared.currentMode.getSolids(shared);
                    solidsLen = s ? s.length : 0;
                }

                resolve({
                    textCollidersLength: textCollidersLen,
                    linkElementsLength: linkElementsLen,
                    solidsLength: solidsLen,
                    caRepeats: Math.max(Math.ceil((shared.canvas ? shared.canvas.height : 1000) / ((shared.ROWS || 1) * (shared.CELL || 1))), 1),
                    canvasHeight: shared.canvas ? shared.canvas.height : 0
                });
            }, 500);
        });
    });

    console.log("METRICS:", metrics);
    await browser.close();
})();
