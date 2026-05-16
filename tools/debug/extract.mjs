// Reproduce the SPReconciler PDF extraction using the SAME pdfjs version as
// the app (4.7.76), so we see what the parser actually receives in-browser.
// Usage:
//   node extract.mjs <path-to-pdf>
import * as pdfjs from '../../../../BreakOut/site/tools/svg-render-test/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const file = process.argv[2];
if (!file) { console.error('Usage: node extract.mjs <pdf>'); process.exit(1); }

const buf = await readFile(file);
const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

console.log('=== ' + path.basename(file) + ' — ' + doc.numPages + ' pages ===');
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  // Same bucketing logic as the app.
  const lines = new Map();
  for (const it of tc.items) {
    const y = Math.round(it.transform[5] * 10) / 10;
    const x = it.transform[4];
    if (!lines.has(y)) lines.set(y, []);
    lines.get(y).push({ x, str: it.str });
  }
  const sorted = [...lines.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([_, items]) => items.sort((a, b) => a.x - b.x).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0);
  console.log('\n--- page ' + p + ' (' + sorted.length + ' lines) ---');
  for (const ln of sorted) console.log('|' + ln + '|');
}
