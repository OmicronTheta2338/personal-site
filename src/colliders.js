/**
 * colliders.js — Text/element collision builder
 *
 * Extracted from engine.js. Builds character-level hitboxes for all visible
 * text, slider bar/marker, perf marker, and interactive link elements.
 */

export function buildCharacterColliders(shared) {
    shared.textColliders = [];

    var colEl = document.getElementById("column");
    if (colEl) {
        var hr = colEl.getBoundingClientRect();
        shared.columnRect = {
            left: hr.left + window.scrollX,
            right: hr.right + window.scrollX,
            top: hr.top + window.scrollY,
            bottom: hr.bottom + window.scrollY
        };
    } else {
        shared.columnRect = null;
    }

    var elems = document.querySelectorAll('#site-header h1, #site-header p, #site-nav a, #nav-more-label, #nav-more-options li, .section h2, .section p, .section li, #contact p, #gol-controls, #overlay-controls, #site-footer, #randomise-btn, #wg-generate-btn, #wg-sidebar h3, #wg-gamemode-list a, #wg-instructions h3, #wg-instructions p, .wg-word-row, .wg-history-item, .wg-hint');

    var ruleOpts = document.getElementById("rule-options");
    var overlayOpts = document.getElementById("overlay-options");
    var navOpts = document.getElementById("nav-more-options");
    var isRuleOptsHidden = ruleOpts ? ruleOpts.hidden : true;
    var isOverlayOptsHidden = overlayOpts ? overlayOpts.hidden : true;
    var isNavOptsHidden = navOpts ? navOpts.hidden : true;

    var textNodesSet = new Set();
    for (var i = 0; i < elems.length; i++) {
        var el = elems[i];
        if (el.getBoundingClientRect().height === 0) continue;

        var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while (node = walk.nextNode()) {
            var parent = node.parentElement;
            if (isRuleOptsHidden && ruleOpts && ruleOpts.contains(parent)) continue;
            if (isOverlayOptsHidden && overlayOpts && overlayOpts.contains(parent)) continue;
            if (isNavOptsHidden && navOpts && navOpts.contains(parent)) continue;
            if (node.nodeValue.trim().length > 0) {
                textNodesSet.add(node);
            }
        }
    }
    var textNodes = Array.from(textNodesSet);

    var blockingRects = [];
    if (!isRuleOptsHidden && ruleOpts) {
        var rect = ruleOpts.getBoundingClientRect();
        blockingRects.push({
            left: rect.left + window.scrollX,
            right: rect.right + window.scrollX,
            top: rect.top + window.scrollY,
            bottom: rect.bottom + window.scrollY
        });
    }
    if (!isOverlayOptsHidden && overlayOpts) {
        var rect = overlayOpts.getBoundingClientRect();
        blockingRects.push({
            left: rect.left + window.scrollX,
            right: rect.right + window.scrollX,
            top: rect.top + window.scrollY,
            bottom: rect.bottom + window.scrollY
        });
    }
    if (!isNavOptsHidden && navOpts) {
        var rect = navOpts.getBoundingClientRect();
        blockingRects.push({
            left: rect.left + window.scrollX,
            right: rect.right + window.scrollX,
            top: rect.top + window.scrollY,
            bottom: rect.bottom + window.scrollY
        });
    }

    function isObscured(r) {
        var rLeft = r.left + window.scrollX;
        var rRight = r.right + window.scrollX;
        var rTop = r.top + window.scrollY;
        var rBottom = r.bottom + window.scrollY;

        for (var j = 0; j < blockingRects.length; j++) {
            var b = blockingRects[j];
            if (rLeft < b.right && rRight > b.left &&
                rTop < b.bottom && rBottom > b.top) {
                return true;
            }
        }
        return false;
    }

    var range = document.createRange();
    for (var i = 0; i < textNodes.length; i++) {
        var tn = textNodes[i];
        var len = tn.nodeValue.length;
        for (var c = 0; c < len; c++) {
            if (tn.nodeValue[c].trim() === '') continue;
            range.setStart(tn, c);
            range.setEnd(tn, c + 1);
            var r = range.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                if (isObscured(r)) {
                    var parent = tn.parentElement;
                    var isInsideDropdown = (!isRuleOptsHidden && ruleOpts && ruleOpts.contains(parent)) ||
                        (!isOverlayOptsHidden && overlayOpts && overlayOpts.contains(parent)) ||
                        (!isNavOptsHidden && navOpts && navOpts.contains(parent));

                    if (!isInsideDropdown) {
                        continue;
                    }
                }
                shared.textColliders.push({
                    left: r.left + window.scrollX,
                    right: r.right + window.scrollX,
                    top: r.top + window.scrollY,
                    bottom: r.bottom + window.scrollY,
                    node: tn.parentElement
                });
            }
        }
    }

    shared.sliderMarkerColliders = [];
    shared.sliderBarColliders = [];
    var viewAboutSite = document.getElementById("view-about-site");
    var isAboutSiteActive = viewAboutSite && getComputedStyle(viewAboutSite).display !== "none";
    var sliderBar = document.getElementById("color-slider-bar");
    var sliderMarker = document.getElementById("color-slider-marker");

    var barTop = 0;
    var barBottom = 0;

    if (sliderBar && isAboutSiteActive) {
        var r = sliderBar.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
            var barLeft = r.left + window.scrollX;
            var barRight = r.right + window.scrollX;
            barTop = r.top + window.scrollY;
            barBottom = r.bottom + window.scrollY;

            var visibleSegments = [{ left: barLeft, right: barRight }];

            for (var j = 0; j < blockingRects.length; j++) {
                var b = blockingRects[j];
                if (barBottom > b.top && barTop < b.bottom) {
                    var newSegments = [];
                    for (var s = 0; s < visibleSegments.length; s++) {
                        var seg = visibleSegments[s];
                        if (seg.right > b.left && seg.left < b.right) {
                            if (seg.left < b.left) {
                                newSegments.push({ left: seg.left, right: b.left });
                            }
                            if (seg.right > b.right) {
                                newSegments.push({ left: b.right, right: seg.right });
                            }
                        } else {
                            newSegments.push(seg);
                        }
                    }
                    visibleSegments = newSegments;
                }
            }

            for (var s = 0; s < visibleSegments.length; s++) {
                shared.textColliders.push({
                    left: visibleSegments[s].left,
                    right: visibleSegments[s].right,
                    top: barTop,
                    bottom: barBottom,
                    isSlider: true
                });
                shared.sliderBarColliders.push({
                    left: visibleSegments[s].left,
                    right: visibleSegments[s].right,
                    top: barTop,
                    bottom: barBottom
                });
            }
        }
    }

    if (sliderMarker && isAboutSiteActive) {
        var mr = sliderMarker.getBoundingClientRect();
        if (mr.width > 0 && mr.height > 0) {
            var isMarkerObscured = false;
            for (var j = 0; j < blockingRects.length; j++) {
                var b = blockingRects[j];
                if (mr.left + window.scrollX < b.right && mr.right + window.scrollX > b.left &&
                    mr.top + window.scrollY < b.bottom && mr.bottom + window.scrollY > b.top) {
                    isMarkerObscured = true;
                    break;
                }
            }

            if (!isMarkerObscured) {
                shared.sliderMarkerColliders.push({
                    left: mr.left + window.scrollX,
                    right: mr.right + window.scrollX,
                    top: mr.top + window.scrollY,
                    bottom: mr.bottom + window.scrollY,
                    el: sliderMarker
                });
            }
        }
    }

    var perfMarker = document.getElementById("perf-marker");
    if (perfMarker && isAboutSiteActive) {
        var pr = perfMarker.getBoundingClientRect();
        if (pr.width > 0 && pr.height > 0) {
            var isPerfObscured = false;
            for (var j = 0; j < blockingRects.length; j++) {
                var b = blockingRects[j];
                if (pr.left + window.scrollX < b.right && pr.right + window.scrollX > b.left &&
                    pr.top + window.scrollY < b.bottom && pr.bottom + window.scrollY > b.top) {
                    isPerfObscured = true;
                    break;
                }
            }
            if (!isPerfObscured) {
                shared.textColliders.push({
                    left: pr.left + window.scrollX,
                    right: pr.right + window.scrollX,
                    top: pr.top + window.scrollY,
                    bottom: pr.bottom + window.scrollY,
                    isPerfMarker: true
                });
            }
        }
    }

    shared.linkElements = [];
    var links = document.querySelectorAll('#column a, #site-nav a, #rule-toggle, #overlay-toggle, #nav-more-toggle, #rule-options li, #overlay-options li, #nav-more-options li, #randomise-btn, #wg-generate-btn');
    for (var i = 0; i < links.length; i++) {
        var el = links[i];
        if (el.tagName.toLowerCase() === 'li' && el.parentElement.id === 'rule-options' && isRuleOptsHidden) continue;
        if (el.tagName.toLowerCase() === 'li' && el.parentElement.id === 'overlay-options' && isOverlayOptsHidden) continue;
        if (el.tagName.toLowerCase() === 'li' && el.parentElement.id === 'nav-more-options' && isNavOptsHidden) continue;
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
            var isInsideDropdown = (!isRuleOptsHidden && ruleOpts && ruleOpts.contains(el)) ||
                (!isOverlayOptsHidden && overlayOpts && overlayOpts.contains(el)) ||
                (!isNavOptsHidden && navOpts && navOpts.contains(el));

            if (isObscured(r) && !isInsideDropdown) {
                continue;
            }

            shared.linkElements.push({
                el: el,
                left: r.left + window.scrollX,
                right: r.right + window.scrollX,
                top: r.top + window.scrollY,
                bottom: r.bottom + window.scrollY
            });
        }
    }
}
