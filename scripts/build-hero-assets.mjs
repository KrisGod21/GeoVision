/**
 * Builds the hero media the landing page actually ships.
 *
 * Run once from the repo root:  npm run assets
 *
 * Outputs are committed, so a fresh clone does not need to run this. Re-run it
 * only when the source media changes, or when we decide to change frame count,
 * resolution, or quality.
 *
 * Everything about the hero payload is decided here. If the scrubber turns out
 * to be heavy, this is the file to edit -- the components read the manifest and
 * do not care how many frames there are or what format they are in.
 *
 * ---------------------------------------------------------------------------
 * Why the desktop frames are NOT converted to WebP
 * ---------------------------------------------------------------------------
 * Measured, not assumed. The source JPGs average 37 KB at 1280x720 and are
 * already near-optimally compressed for grainy aerial footage. Every re-encode
 * tested came out LARGER than the source while also costing a generation of
 * quality:
 *
 *   webp q80  12.25 MB  (86% bigger)      webp q40   7.72 MB  (17% bigger)
 *   webp q60   9.27 MB  (41% bigger)      webp q30   6.66 MB  ( 1% bigger)
 *   mozjpeg q60 7.10 MB ( 8% bigger)      webp q25   6.16 MB  ( 6% smaller, visibly degraded)
 *   avif q40   5.59 MB  (15% smaller, but AVIF decode is far slower --
 *                        a bad trade when 146 images must decode during a scrub)
 *
 * So desktop frames are copied byte-for-byte. The real win came from
 * deduplication instead: 34 of the 180 frames are byte-identical to their
 * predecessor, which is free to remove.
 *
 * Mobile frames DO convert to WebP, because there the 640px downscale
 * dominates and WebP wins. The model-output PNG also converts, because PNG is
 * the wrong format for a photograph (2.92 MB -> 0.37 MB).
 */

import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_FRAMES_DIR = path.join(repoRoot, "assets", "ezgif-5ea5e051e9d0a528-jpg");
const SOURCE_MODEL_OUTPUT = path.join(repoRoot, "assets", "model-output.png");

const PUBLIC_DIR = path.join(repoRoot, "web", "public");
const DESKTOP_OUT = path.join(PUBLIC_DIR, "frames", "hero");
const MOBILE_OUT = path.join(PUBLIC_DIR, "frames", "hero-sm");
const HERO_OUT = path.join(PUBLIC_DIR, "hero");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "frames", "manifest.json");
/**
 * The manifest is also emitted as a TS module. The hero imports that rather
 * than fetching the JSON: waiting on a network round-trip before the frame
 * preload can even begin would delay the hero by an entire request.
 */
const MANIFEST_TS_PATH = path.join(repoRoot, "web", "lib", "hero", "manifest.generated.ts");

/** Desktop ships the source JPGs untouched. Mobile takes every Nth frame, downscaled. */
const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { quality: 72, width: 640, height: 360, everyNth: 6 };
/**
 * The source image carries its own legend baked into the top-left corner. In
 * the hero the pins are the legend, so two of them on one panel is noise -- the
 * legend is cropped away. Adjust LEGEND_CROP_LEFT to 0 to keep it.
 */
const LEGEND_CROP_LEFT = 280;
const MODEL_OUTPUT = {
  quality: 82,
  width: 1672 - LEGEND_CROP_LEFT,
  height: 941,
};

const pad = (n) => String(n).padStart(3, "0");
const bytesToMB = (b) => (b / 1024 / 1024).toFixed(2);
const bytesToKB = (b) => (b / 1024).toFixed(1);

const sizeOf = async (file) => (await stat(file)).size;

async function sumSizes(files) {
  const sizes = await Promise.all(files.map(sizeOf));
  return sizes.reduce((a, b) => a + b, 0);
}

async function resetDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

/**
 * Splits a frame list into the set of distinct images plus a sequence mapping
 * every timeline position onto one of them.
 *
 * Returns { files, sequence } where sequence[i] is the index into files that
 * timeline position i should display. Consumers load `files` once and index
 * through `sequence`, so duplicated frames cost neither bytes nor a decode.
 */
async function dedupe(sources) {
  const seenByHash = new Map();
  const files = [];
  const sequence = [];

  for (const source of sources) {
    const hash = createHash("sha1")
      .update(await readFile(source))
      .digest("hex");

    if (!seenByHash.has(hash)) {
      seenByHash.set(hash, files.length);
      files.push(source);
    }
    sequence.push(seenByHash.get(hash));
  }

  return { files, sequence };
}

function report(label, { sequenceLength, distinct, sourceBytes, outBytes }) {
  const delta = sourceBytes - outBytes;
  const pct = sourceBytes === 0 ? 0 : Math.round((delta / sourceBytes) * 100);
  const direction = pct >= 0 ? `${pct}% smaller` : `${-pct}% larger`;
  console.log(`\n${label}`);
  console.log(`  timeline positions  ${sequenceLength}`);
  console.log(`  distinct images     ${distinct}${distinct < sequenceLength ? `  (${sequenceLength - distinct} duplicates removed)` : ""}`);
  console.log(`  source              ${bytesToMB(sourceBytes)} MB`);
  console.log(`  shipped             ${bytesToMB(outBytes)} MB  (${direction})`);
  console.log(`  avg/image           ${bytesToKB(outBytes / distinct)} KB`);
}

/** Copies distinct frames verbatim -- no re-encode, so no generation loss. */
async function buildDesktop(sources) {
  await resetDir(DESKTOP_OUT);
  const { files, sequence } = await dedupe(sources);

  const outNames = [];
  for (const [i, source] of files.entries()) {
    const name = `frame-${pad(i)}.jpg`;
    await copyFile(source, path.join(DESKTOP_OUT, name));
    outNames.push(name);
  }

  report("Desktop frames (source JPGs, deduplicated, not re-encoded)", {
    sequenceLength: sequence.length,
    distinct: files.length,
    sourceBytes: await sumSizes(sources),
    outBytes: await sumSizes(outNames.map((n) => path.join(DESKTOP_OUT, n))),
  });

  return { files: outNames, sequence };
}

/** Downscales and converts -- here the resize dominates and WebP genuinely wins. */
async function buildMobile(sources) {
  await resetDir(MOBILE_OUT);

  const sampled = sources.filter((_, i) => i % MOBILE.everyNth === 0);
  const { files, sequence } = await dedupe(sampled);

  const outNames = [];
  for (const [i, source] of files.entries()) {
    const name = `frame-${pad(i)}.webp`;
    await sharp(source)
      .resize({ width: MOBILE.width, withoutEnlargement: true })
      .webp({ quality: MOBILE.quality, effort: 6 })
      .toFile(path.join(MOBILE_OUT, name));
    outNames.push(name);
  }

  report(`Mobile frames (every ${MOBILE.everyNth}th, ${MOBILE.width}px wide, WebP q${MOBILE.quality})`, {
    sequenceLength: sequence.length,
    distinct: files.length,
    sourceBytes: await sumSizes(sampled),
    outBytes: await sumSizes(outNames.map((n) => path.join(MOBILE_OUT, n))),
  });

  return { files: outNames, sequence };
}

async function buildModelOutput() {
  await mkdir(HERO_OUT, { recursive: true });
  const outFile = path.join(HERO_OUT, "model-output.webp");

  await sharp(SOURCE_MODEL_OUTPUT)
    .extract({
      left: LEGEND_CROP_LEFT,
      top: 0,
      width: MODEL_OUTPUT.width,
      height: MODEL_OUTPUT.height,
    })
    .webp({ quality: MODEL_OUTPUT.quality, effort: 6 })
    .toFile(outFile);

  report("Model output (hero reveal panel, PNG -> WebP)", {
    sequenceLength: 1,
    distinct: 1,
    sourceBytes: await sizeOf(SOURCE_MODEL_OUTPUT),
    outBytes: await sizeOf(outFile),
  });
}

async function main() {
  const entries = await readdir(SOURCE_FRAMES_DIR);
  const sources = entries
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .sort()
    .map((f) => path.join(SOURCE_FRAMES_DIR, f));

  if (sources.length === 0) {
    throw new Error(`No source frames found in ${SOURCE_FRAMES_DIR}`);
  }

  console.log(`Source frames: ${sources.length}`);

  const desktop = await buildDesktop(sources);
  const mobile = await buildMobile(sources);
  await buildModelOutput();

  // The components need frame counts and the dedupe mapping without probing the
  // network, so they are emitted here rather than hardcoded in the components.
  const manifest = {
    desktop: {
      dir: "/frames/hero",
      files: desktop.files,
      sequence: desktop.sequence,
      width: DESKTOP.width,
      height: DESKTOP.height,
    },
    mobile: {
      dir: "/frames/hero-sm",
      files: mobile.files,
      sequence: mobile.sequence,
      width: MOBILE.width,
      height: MOBILE.height,
    },
    modelOutput: {
      src: "/hero/model-output.webp",
      width: MODEL_OUTPUT.width,
      height: MODEL_OUTPUT.height,
    },
  };

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const generated = [
    "// GENERATED by scripts/build-hero-assets.mjs -- do not edit by hand.",
    "// Run `npm run assets` from the repo root to regenerate.",
    "",
    "import type { HeroManifest } from './manifest';",
    "",
    `export const heroManifest: HeroManifest = ${JSON.stringify(manifest, null, 2)};`,
    "",
  ].join("\n");
  await writeFile(MANIFEST_TS_PATH, generated, "utf8");

  const totalShipped =
    (await sumSizes(desktop.files.map((n) => path.join(DESKTOP_OUT, n)))) +
    (await sizeOf(path.join(HERO_OUT, "model-output.webp")));
  const mobileShipped =
    (await sumSizes(mobile.files.map((n) => path.join(MOBILE_OUT, n)))) +
    (await sizeOf(path.join(HERO_OUT, "model-output.webp")));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Hero payload, desktop visitor:  ${bytesToMB(totalShipped)} MB`);
  console.log(`Hero payload, mobile visitor:   ${bytesToMB(mobileShipped)} MB`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\nManifest: ${path.relative(repoRoot, MANIFEST_PATH)}`);
  console.log(`          ${path.relative(repoRoot, MANIFEST_TS_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
