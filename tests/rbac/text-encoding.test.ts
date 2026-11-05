/**
 * Text encoding guard.
 *
 * One save glitch once wrote cp1252 bytes into source that was meant to stay
 * plain UTF-8, hiding real punctuation inside shipped UI text (an apostrophe
 * in "Today's" arrived as three stray characters that only rendered
 * correctly sometimes). These tests pin down the two things that keep every
 * page legible:
 *
 *  1. Every shipped file is strictly valid UTF-8 with no double-encoded
 *     cp1252 clusters hiding inside the text.
 *  2. Every CSV build coined as a data URL starts with a UTF-8 marker, so
 *     spreadsheets decode the export instead of guessing.
 *
 * Fixtures are built from code points so the scanner never trips over this
 * test file itself (tests/ is not part of the scanned tree).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const SCAN_DIRS = ["src", "scripts", "docs"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".turbo", "coverage"]);
const TEXT_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".css", ".html", ".txt", ".yml", ".yaml"]);

let passedTests = 0;
let totalTests = 0;

function test(name: string, fn: () => void): void {
  totalTests += 1;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests += 1;
  } catch (err: unknown) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    throw err;
  }
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (TEXT_EXTS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

/** cp1252: code points above standard Latin-1, for bytes 0x80-0x9F. */
const CP1252_UPPER: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

function cp1252Byte(codePoint: number): number | null {
  if (CP1252_UPPER[codePoint] !== undefined) return CP1252_UPPER[codePoint];
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint;
  return null;
}

const MOJIBAKE_LEADS = [0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xe0, 0xe2, 0xe4];

/**
 * Reads one double-encoded cluster starting at `i`, the same way the one-off
 * repair script did: turns the characters shown in cp1252 back into the
 * UTF-8 byte sequence they stand for and decodes it. Returns the repaired
 * text plus how many source characters it consumed, or null when nothing
 * decodes.
 */
function revertCluster(text: string, index: number): { text: string; length: number } | null {
  const leadByte = cp1252Byte(text.codePointAt(index) ?? 0);
  if (leadByte === null || !MOJIBAKE_LEADS.includes(leadByte)) return null;
  const bytes = [leadByte];
  let length = 1;
  while (true) {
    const next = text[index + length];
    if (!next) break;
    const nextByte = cp1252Byte(text.codePointAt(index + length) ?? 0);
    if (nextByte === null) break;
    bytes.push(nextByte);
    length += 1;
  }
  if (bytes.length < 2) return null;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(bytes));
    if (!decoded || decoded === text.substr(index, length)) return null;
    return { text: decoded, length };
  } catch {
    return null;
  }
}

function mojibakeClusters(text: string): Array<{ index: number; shown: string; repaired: string }> {
  const clusters: Array<{ index: number; shown: string; repaired: string }> = [];
  let i = 0;
  while (i < text.length) {
    if ((text.codePointAt(i) ?? 0) < 0x80) {
      i += 1;
      continue;
    }
    const cluster = revertCluster(text, i);
    if (cluster) {
      clusters.push({ index: i, shown: text.substr(i, cluster.length), repaired: cluster.text });
      i += cluster.length;
    } else {
      i += 1;
    }
  }
  return clusters;
}

function readFiles(relativeDrop: (file: string) => string): Array<{ file: string; buffer: Buffer; text: string }> {
  const files: Array<{ file: string; buffer: Buffer; text: string }> = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const buffer = fs.readFileSync(file);
      files.push({ file: relativeDrop(file), buffer, text: buffer.toString("utf8") });
    }
  }
  return files;
}

const files = readFiles((file) => path.relative(ROOT, file));

test("Every shipped file is strictly valid UTF-8", () => {
  const broken: string[] = [];
  for (const item of files) {
    try {
      // ignoreBOM keeps a leading U+FEFF in the decoded text so the byte
      // round-trip below compares against the full original buffer.
      const flags = item.buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? { ignoreBOM: true } : {};
      const decoded = new TextDecoder("utf-8", { fatal: true, ...flags }).decode(item.buffer);
      if (!Buffer.from(decoded, "utf8").equals(item.buffer)) broken.push(item.file);
    } catch {
      broken.push(item.file);
    }
  }
  assert.deepEqual(broken, []);
});

test("No shipped file starts with a UTF-8 marker (BOMs stay out of the repo)", () => {
  const withBom = files
    .filter((item) => item.buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])))
    .map((item) => item.file);
  assert.deepEqual(withBom, []);
});

test("No shipped text holds double-encoded cp1252 sequences", () => {
  const damaged = files
    .map((item) => ({ file: item.file, clusters: mojibakeClusters(item.text) }))
    .filter((item) => item.clusters.length > 0);
  assert.deepEqual(
    damaged.map((item) => ({ file: item.file, shown: item.clusters.map((c) => c.shown) })),
    []
  );
});

test("Real punctuation never reads as mojibake (repairs stay one-way)", () => {
  const clean = ["Today\u2019s visits", "Room \u2014", "A \u00b7 B", "Loading\u2026", "Stra\u00dfe", "Na\u00efve"]
    .map((sample) => mojibakeClusters(sample))
    .flat();
  assert.equal(clean.length, 0);
});

test("The scanner recognises the double-encoded forms it must remove", () => {
  // Every fixture is built from code points, never typed as raw text.
  const doubleEncoded = [
    { shown: String.fromCharCode(0xe2, 0x20ac, 0x2122), repaired: "\u2019" },
    { shown: String.fromCharCode(0xe2, 0x20ac, 0x201d), repaired: "\u2014" },
    { shown: String.fromCharCode(0xe2, 0x20ac, 0x00a6), repaired: "\u2026" },
    { shown: String.fromCharCode(0xc2, 0x00b7), repaired: "\u00b7" },
  ];
  for (const fixture of doubleEncoded) {
    const [cluster] = mojibakeClusters(fixture.shown);
    assert.ok(cluster, "the double-encoded cluster is detected");
    assert.equal(cluster!.repaired, fixture.repaired);
    assert.equal(cluster!.shown, fixture.shown);
  }
});

test("Every CSV export begins with a UTF-8 marker", () => {
  const needle = "data:text/csv;charset=utf-8,";
  const unbommed: string[] = [];
  let csvFiles = 0;
  for (const item of files) {
    if (!item.text.includes(needle)) continue;
    csvFiles += 1;
    let index = item.text.indexOf(needle);
    while (index !== -1) {
      if (!item.text.startsWith("\\uFEFF", index + needle.length)) unbommed.push(item.file);
      index = item.text.indexOf(needle, index + 1);
    }
  }
  assert.ok(csvFiles > 0, "expected CSV exports to still exist");
  assert.deepEqual(unbommed, []);
});

console.log("\n=================================================");
console.log("  Text Encoding Guard");
console.log(`  Result: ${passedTests}/${totalTests} passed`);
console.log("=================================================\n");

if (passedTests !== totalTests) process.exit(1);
