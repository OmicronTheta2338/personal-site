/**
 * color-slider.js — Colour slider + HSL theme updates
 *
 * Extracted from the inline <script> in index.html.
 * Manages the hue-rotating colour slider and publishes colorChanged events.
 */

import { hslToHex } from './utils/hsl.js';
import { colors } from './shared.js';

const SATURATION = 0.42;
const LIGHTNESS = 0.71;
const BASE_HUE = 33;

let currentPercentage = 0;
let isDragging = false;

let sliderContainer, sliderMarker, root;

function updateColorFromPercentage(percentage) {
    if (percentage < 0) percentage = 0;
    if (percentage > 1) percentage = 1;
    currentPercentage = percentage;

    sliderMarker.style.left = (percentage * 100) + '%';

    var hue = (BASE_HUE + percentage * 360) % 360;

    var baseHex = hslToHex(hue, SATURATION, LIGHTNESS);
    var compHue = (hue + 180) % 360;

    var compHex = hslToHex(compHue, 0.60, 0.55);
    var compDarkHex = hslToHex(compHue, 0.70, 0.40);

    root.style.setProperty('--tan', baseHex);
    root.style.setProperty('--comp-color', compHex);
    root.style.setProperty('--comp-dark-color', compDarkHex);

    colors.TAN_HEX = baseHex;
    colors.COMP_HEX = compHex;
    colors.COMP_DARK_HEX = compDarkHex;
    colors.HUE = hue;

    window.dispatchEvent(new CustomEvent('colorChanged', {
        detail: { baseHex, compHex, compDarkHex, hue }
    }));
}

function onPointerMove(e) {
    if (!isDragging) return;
    var rect = sliderContainer.getBoundingClientRect();
    var pos = e.clientX - rect.left;
    var percentage = pos / rect.width;
    updateColorFromPercentage(percentage);
}

function onPointerUp() {
    isDragging = false;
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
}

function onPointerDown(e) {
    isDragging = true;
    onPointerMove(e.touches ? e.touches[0] : e);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove);
    window.addEventListener('touchend', onPointerUp);
}

export function setColorSliderPercentage(p) {
    updateColorFromPercentage(p);
}

export function getColorSliderPercentage() {
    return currentPercentage;
}

export function pushColorSliderAbsolute(newPxX, widthOffset) {
    var rect = sliderContainer.getBoundingClientRect();
    var pos = newPxX - rect.left + widthOffset;
    var percentage = pos / rect.width;
    updateColorFromPercentage(percentage);
    return currentPercentage === 0 || currentPercentage === 1;
}

export function initColorSlider() {
    sliderContainer = document.getElementById('color-slider-container');
    sliderMarker = document.getElementById('color-slider-marker');
    root = document.documentElement;

    sliderContainer.addEventListener('mousedown', onPointerDown);
    sliderContainer.addEventListener('touchstart', onPointerDown, { passive: false });

    updateColorFromPercentage(0);
}
