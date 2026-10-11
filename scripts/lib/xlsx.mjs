/**
 * Minimal .xlsx reader for the parsers: no dependencies, read-only, values
 * only (no styles, no formulas — the cached value of a formula cell is
 * returned). Enough for publishers' results workbooks.
 *
 *   const rows = await xlsxRows(buffer, 'Sheet name'); // array of arrays
 *
 * An .xlsx file is a zip of XML parts; this reads the zip central directory,
 * inflates the parts it needs with node:zlib, and pulls cells out of the
 * sheet XML. Cell positions come from the r="B7" references, so sparse rows
 * keep their columns.
 */
import { inflateRawSync } from 'node:zlib';

/** zip entries by name → Buffer (stored or deflated). */
function unzip(buf) {
  // End of central directory record: signature 0x06054b50, within the last 64 KiB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('xlsx: not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('xlsx: bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(local + 26), lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    files.set(name, () => (method === 0 ? raw : inflateRawSync(raw)));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return XML_ENT[e] ?? m;
});

function colIndex(ref) {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Rows of one worksheet (by its tab name) as arrays of strings/numbers;
 *  empty cells are undefined. */
export function xlsxRows(buf, sheetName) {
  const files = unzip(buf);
  const read = (name) => {
    const f = files.get(name);
    if (!f) throw new Error(`xlsx: part ${name} missing`);
    return f().toString('utf8');
  };
  const shared = files.has('xl/sharedStrings.xml')
    ? [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        unescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
    : [];
  const wb = read('xl/workbook.xml');
  const esc = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;');
  const sheet = wb.match(new RegExp(`<sheet [^>]*name="${esc}"[^>]*/>`));
  if (!sheet) throw new Error(`xlsx: sheet "${sheetName}" not found`);
  const rid = sheet[0].match(/r:id="([^"]+)"/)[1];
  const rels = read('xl/_rels/workbook.xml.rels');
  const rel = [...rels.matchAll(/<Relationship [^>]*\/>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
  const target = rel.match(/Target="([^"]+)"/)[1].replace(/^\/?(xl\/)?/, '');
  const xml = read(`xl/${target}`);

  const rows = [];
  for (const row of xml.matchAll(/<row [^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = [];
    for (const c of (row[1] ?? '').matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, body = ''] = c;
      const type = attrs.match(/t="(\w+)"/)?.[1];
      let v;
      if (type === 'inlineStr') v = unescape([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw == null) continue;
        if (type === 's') v = shared[Number(raw)];
        else if (type === 'str' || type === 'b' || type === 'e') v = unescape(raw);
        else v = Number(raw);
      }
      r[colIndex(ref)] = v;
    }
    rows.push(r);
  }
  return rows;
}

/** Tab names of a workbook, in order. */
export function xlsxSheetNames(buf) {
  const f = unzip(buf).get('xl/workbook.xml');
  if (!f) throw new Error('xlsx: workbook.xml missing');
  return [...f().toString('utf8').matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => unescape(m[1]));
}
