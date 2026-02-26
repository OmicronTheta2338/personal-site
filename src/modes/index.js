/**
 * modes/index.js — Mode registry
 *
 * Aggregates all game modes into a single MODES array.
 * Engine imports this instead of relying on window.__modes.
 */

import { caModes } from './ca.js';
import { snakeMode } from './snake.js';
import { minesweeperMode } from './minesweeper.js';
import { platformerMode } from './platformer.js';
import { tankMode } from './tank.js';

export const MODES = [
    ...caModes,
    minesweeperMode,
    snakeMode,
    platformerMode,
    tankMode,
];
