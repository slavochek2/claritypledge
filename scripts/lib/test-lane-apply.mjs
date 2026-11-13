// Side-effect module (P1672): applies this worktree's TEST lane env to process.env at import time.
// Import it FIRST in vite.config.ts and playwright.config.ts so the lane wins over every env file and over
// modules that read the environment while they load. See test-lane.mjs for the rules and the fail-closed throw.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTestLaneEnv } from './test-lane.mjs';

applyTestLaneEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
