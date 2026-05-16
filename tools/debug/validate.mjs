// Validate the SPReconciler parsers against the real PDFs. Mirrors the
// browser flow: PDF.js text extraction → page-line bucketing → parser →
// reconciliation. Then compares row counts and totals against the
// known-good values from the PDFs themselves.
//
// Usage: node validate.mjs

import * as pdfjs from '../../../../BreakOut/site/tools/svg-render-test/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LL_PDF = 'C:/Users/ptsol/Downloads/summer26_all_sp.pdf';
const BD_PDF = 'C:/Users/ptsol/Downloads/summer26_all_sp_x_div.pdf';
const SPRING_MISNAMED_PDF = 'C:/Users/ptsol/Downloads/spring_all_xdiv.pdf';

// Expected totals from each PDF's footer "Total # of Patches" / "Totals" row.
const EXPECT_SUMMER = { rackless: 138, eight_ob: 32, eight_br: 33, nine_os: 65, nine_br: 24, skunk: 1 };
const EXPECT_SPRING_LL = { rackless: 154, eight_ob: 40, eight_br: 41, nine_os: 77, nine_br: 30, skunk: 4 };

// Re-extract parser logic from index.html so we test the SAME code.
const html = readFileSync(path.resolve('../../index.html'), 'utf8');

// Extract function bodies via marker comments.
function extract(name) {
  const re = new RegExp('function ' + name + '\\s*\\(([^)]*)\\)\\s*\\{', 'g');
  const m = re.exec(html);
  if (!m) throw new Error('Not found: ' + name);
  // Find matching close brace.
  let depth = 1;
  let i = m.index + m[0].length;
  while (i < html.length && depth > 0) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') depth--;
    i++;
  }
  return new Function(m[1], html.slice(m.index + m[0].length, i - 1));
}

// Pull all needed helpers from the HTML.
const INT_ROW_RE = /^\d+(?:\s+\d+){5}$/;

function findIntsAfter(lines, i) {
  for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
    const ln = lines[j];
    if (!ln) continue;
    if (INT_ROW_RE.test(ln)) {
      return { ints: ln.trim().split(/\s+/).map(s => parseInt(s, 10)), at: j };
    }
    if (/^\d{5}\b/.test(ln)) return null;
    if (/^\d{1,3}\s*-\s*\S/.test(ln)) return null;
  }
  return null;
}

function extractMeta(lines) {
  let session_label = null, printed_at = null;
  for (const ln of lines) {
    if (!session_label) {
      const m = ln.match(/^(Summer|Spring|Fall|Winter)\s+\d{4}$/i);
      if (m) session_label = ln;
    }
    if (!printed_at) {
      const m = ln.match(/Printed\s+(\d+\/\d+\/\d+)\s*\/\s*(\d+:\d+:\d+\s*[AP]M)/i);
      if (m) printed_at = m[1] + ' ' + m[2];
    }
    if (session_label && printed_at) break;
  }
  return { session_label, printed_at };
}

function parseAllLeague(pages) {
  const lines = pages.flat();
  const { session_label, printed_at } = extractMeta(lines);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const m = ln.match(/^(\d{5})\s+(.+?)\s*$/);
    if (!m) continue;
    const member_number = m[1];
    const member_name = m[2].trim();
    const found = findIntsAfter(lines, i);
    if (!found) continue;
    const [rackless, eight_ob, eight_br, nine_os, nine_br, skunk] = found.ints;
    rows.push({ member_number, member_name,
                rackless, eight_ob, eight_br, nine_os, nine_br, skunk,
                grand_slam: 0 });
    i = found.at;
  }
  const byMem = new Map();
  for (const r of rows) {
    if (!byMem.has(r.member_number)) byMem.set(r.member_number, r);
  }
  return { session_label, printed_at, rows: [...byMem.values()] };
}

function parseByDivision(pages) {
  const lines = pages.flat();
  const { session_label, printed_at } = extractMeta(lines);
  const rows = [];
  let cur_div_num = null, cur_div_name = null;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const dh = ln.match(/^(\d{1,3})\s*-\s*(.+?)\s*$/);
    if (dh && !/^\d{5}\b/.test(ln)) {
      cur_div_num = dh[1].padStart(3, '0');
      cur_div_name = dh[2].trim();
      continue;
    }
    if (!cur_div_num) continue;
    const m = ln.match(/^(\d{5})\s+(.+?)\s+(\d{5})\s*$/);
    if (!m) continue;
    const member_number = m[1];
    const member_name = m[2].trim();
    const team_number = m[3];
    const found = findIntsAfter(lines, i);
    if (!found) continue;
    const [rackless, eight_ob, eight_br, nine_os, nine_br, skunk] = found.ints;
    rows.push({
      division_number: cur_div_num,
      division_name: cur_div_name,
      team_number,
      member_number, member_name,
      rackless, eight_ob, eight_br, nine_os, nine_br, skunk
    });
    i = found.at;
  }
  return { session_label, printed_at, rows };
}

async function pdfPageLines(file) {
  const buf = await readFile(file);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
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
    pages.push(sorted);
  }
  return pages;
}

function summarizeTotals(rows, fields) {
  const t = {};
  for (const f of fields) t[f] = rows.reduce((s, r) => s + (r[f]||0), 0);
  return t;
}

function detectKind(pages) {
  const lines = pages.flat();
  for (const ln of lines.slice(0, 20)) {
    if (/End Of Session Award Summary By Division/i.test(ln)) return 'bd';
  }
  for (const ln of lines.slice(0, 20)) {
    if (/End Of Session Award Summary/i.test(ln)) return 'll';
  }
  for (const ln of lines) {
    if (/^\d{1,3}\s*-\s*\S/.test(ln) && !/^\d{5}\b/.test(ln)) return 'bd';
  }
  return 'unknown';
}

console.log('Validating SPReconciler parsers...\n');

const llPages = await pdfPageLines(LL_PDF);
const ll = parseAllLeague(llPages);

console.log('=== summer26_all_sp.pdf (ALL-LEAGUE) ===');
console.log('  detected:', detectKind(llPages));
console.log('  session:', ll.session_label, ' printed:', ll.printed_at);
console.log('  member rows:', ll.rows.length);
const llTotals = summarizeTotals(ll.rows, Object.keys(EXPECT_SUMMER));
console.log('  totals:', JSON.stringify(llTotals));
console.log('  expect:', JSON.stringify(EXPECT_SUMMER));
const llOK = Object.keys(EXPECT_SUMMER).every(k => llTotals[k] === EXPECT_SUMMER[k]);
console.log('  match:', llOK ? '✅' : '❌');

const bdPages = await pdfPageLines(BD_PDF);
const bd = parseByDivision(bdPages);

console.log('\n=== summer26_all_sp_x_div.pdf (BY-DIVISION) ===');
console.log('  detected:', detectKind(bdPages));
console.log('  session:', bd.session_label, ' printed:', bd.printed_at);
console.log('  member-division rows:', bd.rows.length);
const bdTotals = summarizeTotals(bd.rows, Object.keys(EXPECT_SUMMER));
console.log('  totals:', JSON.stringify(bdTotals));
console.log('  expect:', JSON.stringify(EXPECT_SUMMER));
const bdOK = Object.keys(EXPECT_SUMMER).every(k => bdTotals[k] === EXPECT_SUMMER[k]);
console.log('  match:', bdOK ? '✅' : '❌');
const divs = new Set(bd.rows.map(r => r.division_number));
console.log('  distinct divisions:', divs.size);

// New: misnamed all-league PDF that previously failed.
const springPages = await pdfPageLines(SPRING_MISNAMED_PDF);
const springDetected = detectKind(springPages);
console.log('\n=== spring_all_xdiv.pdf (misleading filename) ===');
console.log('  detected:', springDetected);
if (springDetected !== 'll') {
  console.log('  ❌ Expected ll detection from PDF content (filename has _xdiv but content is all-league)');
}
const spring = parseAllLeague(springPages);
console.log('  session:', spring.session_label, ' printed:', spring.printed_at);
console.log('  member rows:', spring.rows.length);
const springTotals = summarizeTotals(spring.rows, Object.keys(EXPECT_SPRING_LL));
console.log('  totals:', JSON.stringify(springTotals));
console.log('  expect:', JSON.stringify(EXPECT_SPRING_LL));
const springOK = springDetected === 'll' && Object.keys(EXPECT_SPRING_LL).every(k => springTotals[k] === EXPECT_SPRING_LL[k]);
console.log('  match:', springOK ? '✅' : '❌');

// Quick reconciliation sanity check.
console.log('\n=== RECONCILE (sample) ===');
const llByMem = new Map(ll.rows.map(r => [r.member_number, r]));
const bdByMem = new Map();
for (const r of bd.rows) {
  if (!bdByMem.has(r.member_number)) bdByMem.set(r.member_number, []);
  bdByMem.get(r.member_number).push(r);
}
const allMems = new Set([...llByMem.keys(), ...bdByMem.keys()]);
let match = 0, mismatch = 0, llOnly = 0, bdOnly = 0;
const CATS = ['rackless','eight_ob','eight_br','nine_os','nine_br','skunk'];
for (const m of allMems) {
  const ll_r = llByMem.get(m);
  const bd_rs = bdByMem.get(m) || [];
  if (!ll_r) { bdOnly++; continue; }
  if (bd_rs.length === 0) { llOnly++; continue; }
  const bd_sum = {};
  for (const c of CATS) bd_sum[c] = bd_rs.reduce((s, r) => s + (r[c]||0), 0);
  const same = CATS.every(c => (ll_r[c]||0) === (bd_sum[c]||0));
  if (same) match++; else mismatch++;
}
console.log('  total members:', allMems.size);
console.log('  matched      :', match);
console.log('  mismatched   :', mismatch);
console.log('  ll-only      :', llOnly);
console.log('  bd-only      :', bdOnly);

const allOK = llOK && bdOK && springOK;
console.log('\nFINAL:', allOK ? '✅ PARSER VALIDATED' : '❌ PARSER FAILED');
process.exit(allOK ? 0 : 1);
