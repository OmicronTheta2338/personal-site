/**
 * main.js — Application entry point
 *
 * Boots all subsystems in the correct order after DOM is ready.
 */

import './style.css';
import { initRouter } from './router.js';
import { initColorSlider } from './color-slider.js';
import { initWordGame } from './word-game/word-game.js';
import { initEngine } from './engine.js';

document.getElementById("yr").textContent = new Date().getFullYear();

initRouter();
initColorSlider();
initWordGame();
initEngine();
