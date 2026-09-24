/**
 * Exports the mock fleet to a CSV the backend seeder loads.
 *
 * The point is that the wired screen and the mock screen show the *same* 137
 * bikes. Generating a second, plausible-looking fleet on the server would make
 * every difference after the swap ambiguous — a data difference or a defect,
 * no way to tell. With one source, any difference is a defect.
 *
 * Run: npm run seed:export
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// The fixtures are TypeScript with extensionless imports, which Node cannot
// load. Vite already resolves them for the app, so borrow its loader rather
// than adding a second toolchain that has to agree with the first.
const here = dirname(fileURLToPath(import.meta.url));
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { vehicles } = await vite.ssrLoadModule('/src/mocks/vehicles.ts');
const { deriveMake } = await vite.ssrLoadModule('/src/lib/api/vehicles.mock.ts');
await vite.close();
const OUT = resolve(here, '../../../backend/src/main/resources/db/seed/fleet.csv');

const COLUMNS = [
  'registryId',
  'chassisNumber',
  'model',
  'make',
  'batteryType',
  'batteryVendor',
  'hub',
  'state',
  'registrationNumber',
  'odometerKm',
  'inductedOn',
];

/** Minimal RFC 4180: quote only when the value would otherwise break a row. */
function cell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const rows = vehicles.map((v) =>
  [
    v.id,
    v.chassisNumber,
    v.model,
    deriveMake(v.model),
    v.batteryType,
    v.batteryVendor,
    v.hub,
    v.state,
    v.registrationNumber,
    v.odometerKm,
    v.inductedOn,
  ].map(cell).join(','),
);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, [COLUMNS.join(','), ...rows].join('\n') + '\n', 'utf8');

console.log(`fleet.csv — ${rows.length} vehicles → ${OUT}`);
