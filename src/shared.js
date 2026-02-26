/**
 * shared.js — Central shared state object
 *
 * Single source of truth for cross-module state that was previously
 * scattered across window.__engineShared and window.__sharedColors.
 * Populated by engine.js at boot, read by modes and subsystems.
 */

export const colors = {
    TAN_HEX: "#d4b896",
    COMP_HEX: "#40d060",
    COMP_DARK_HEX: "#2a9d45",
    HUE: 33,
};

// The shared context object passed to every mode. Properties are
// set by engine.js after DOM is ready — modes receive it by parameter.
export const shared = {
    canvas: null,
    ctx: null,
    overlayCanvas: null,
    overlayCtx: null,
    textColliders: [],
    linkElements: [],
    sliderMarkerColliders: [],
    sliderBarColliders: [],
    CELL: 12,
    COLS: 0,
    ROWS: 0,
    get TAN_HEX() { return colors.TAN_HEX; },
    get COMP_HEX() { return colors.COMP_HEX; },
    get COMP_DARK_HEX() { return colors.COMP_DARK_HEX; },
    BLACK_HEX: "#1a1209",
    COL_LEFT_CELL: 0,
    COL_RIGHT_CELL: 0,
    COL_TOP_CELL: 0,
    COL_BOTTOM_CELL: 0,
    columnRect: null,
    columnHidden: false,
    currentMode: null,
    frameCount: 0,
    get isAboutSiteActive() {
        var v = document.getElementById("view-about-site");
        return v ? getComputedStyle(v).display !== "none" : false;
    },
    updateColliders: null,
};
