/**
 * The code-splitting budget, enforced.
 *
 * H3's finish line is a number, not a feeling: "initial JS under 200KB gzipped,
 * and a documented budget in CI". This is that budget. It walks `index.html`
 * for the entry script and every `modulepreload` beside it — which is exactly
 * the set the browser must have before it can paint — gzips each, and fails if
 * the total crosses the ceiling.
 *
 * Route chunks are not counted. That is the point of splitting them: they are
 * fetched when a screen is opened, by the operators who open it.
 *
 * Raise BUDGET_KB only with a reason. It going up is the thing this file exists
 * to make someone notice.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const BUDGET_KB = 200;
/** The largest a single lazily-loaded screen chunk may get before it wants splitting itself. */
const ROUTE_BUDGET_KB = 60;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

const entry = [...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g)].map((m) => m[1]);
const preload = [...html.matchAll(/rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g)].map((m) => m[1]);
const css = [...html.matchAll(/rel="stylesheet"[^>]+href="\/([^"]+\.css)"/g)].map((m) => m[1]);

if (entry.length === 0) {
  console.error('size-budget: no entry script found in dist/index.html — did the build run?');
  process.exit(1);
}

const gzipped = (file) => gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length;
const kb = (bytes) => (bytes / 1024).toFixed(1);

const initial = [...entry, ...preload];
let total = 0;

console.log('Initial JS — everything the browser needs before first paint:\n');
for (const file of initial.sort((a, b) => gzipped(b) - gzipped(a))) {
  const size = gzipped(file);
  total += size;
  console.log(`  ${kb(size).padStart(7)} KB  ${file}`);
}

let cssTotal = 0;
for (const file of css) cssTotal += gzipped(file);

console.log(`\n  ${kb(total).padStart(7)} KB  total initial JS (gzipped)`);
console.log(`  ${kb(cssTotal).padStart(7)} KB  CSS (not budgeted)`);
console.log(`  ${String(BUDGET_KB).padStart(7)}.0 KB  budget\n`);

// A route chunk that has quietly become a bundle of its own is worth knowing
// about even when the initial budget is fine.
const routeChunks = [...new Set([...html.matchAll(/\/([^"]+\.js)/g)].map((m) => m[1]))];
const over = [];
for (const file of routeChunks) {
  if (initial.includes(file)) continue;
  try {
    statSync(join(DIST, file));
  } catch {
    continue;
  }
  const size = gzipped(file);
  if (size / 1024 > ROUTE_BUDGET_KB) over.push([file, size]);
}
for (const [file, size] of over) {
  console.log(`  warning: route chunk ${file} is ${kb(size)} KB gzipped (soft limit ${ROUTE_BUDGET_KB} KB)`);
}

if (total / 1024 > BUDGET_KB) {
  console.error(
    `\nsize-budget: FAIL — initial JS is ${kb(total)} KB gzipped, over the ${BUDGET_KB} KB budget by ${kb(
      total - BUDGET_KB * 1024,
    )} KB.\n` +
      'Either move what grew behind a lazy route, or raise the budget in scripts/size-budget.mjs with a reason.',
  );
  process.exit(1);
}

console.log(`size-budget: PASS — ${kb(total)} KB of ${BUDGET_KB} KB.`);
