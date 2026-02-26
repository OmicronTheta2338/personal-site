/**
 * collision-helpers.js — Shared getColliders() used by platformer, snake, tank
 *
 * Deduplicates the near-identical collision gathering logic that was repeated
 * in each overlay mode. Each mode can customize via options.
 */

export function getColliders(shared, selfMode, options = {}) {
    const { addBoundaryWalls = false, filterSliders = false } = options;

    let colliders = shared.columnHidden ? [] : shared.textColliders.slice();

    if (filterSliders && !shared.isAboutSiteActive) {
        colliders = colliders.filter(function (c) { return !c.isSlider; });
    }

    if (shared.currentMode && shared.currentMode.getSolids && shared.currentMode !== selfMode) {
        let columnRect = shared.columnRect;

        let solids = shared.currentMode.getSolids(shared);
        if (solids && solids.length > 0) {
            for (let j = 0; j < solids.length; j++) {
                let s = solids[j];
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

    if (addBoundaryWalls) {
        let cw = shared.canvas.width;
        let ch = shared.canvas.height;
        colliders.push({ left: -100, right: 0, top: -100, bottom: ch + 100 });
        colliders.push({ left: cw, right: cw + 100, top: -100, bottom: ch + 100 });
        colliders.push({ left: 0, right: cw, top: ch, bottom: ch + 100 });
    }

    return colliders;
}
