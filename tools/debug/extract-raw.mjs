// Dump RAW text items with (x, y) coords so we can see how the PDF lays
// out the Grand Slam column — is it on a different Y? Far X? Something else?
import * as pdfjs from '../../../../BreakOut/site/tools/svg-render-test/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';

const file = process.argv[2];
const pageNum = parseInt(process.argv[3] || '4', 10);
if (!file) { console.error('Usage: node extract-raw.mjs <pdf> <pageNum>'); process.exit(1); }
const buf = await readFile(file);
const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
const page = await doc.getPage(pageNum);
const tc = await page.getTextContent();
console.log('=== page ' + pageNum + ' raw items ===');
for (const it of tc.items) {
  const x = it.transform[4].toFixed(2);
  const y = it.transform[5].toFixed(2);
  console.log('y=' + y.padStart(8) + ' x=' + x.padStart(8) + ' "' + it.str + '"');
}
