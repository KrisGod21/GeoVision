import { describe, expect, it } from "vitest";
import { createFrameLoader } from "./frameLoader";

const srcs = (n: number) => Array.from({ length: n }, (_, i) => `/frames/frame-${i}.jpg`);

/**
 * A controllable stand-in for image loading. Records call order and tracks how
 * many loads are in flight at once, so the queue's behaviour is observable
 * without a DOM.
 */
function fakeLoader(options: { failOn?: number[]; delayMs?: number } = {}) {
  const { failOn = [], delayMs = 0 } = options;
  const order: number[] = [];
  let active = 0;
  let peakActive = 0;

  const loadImage = async (src: string) => {
    const index = Number(src.match(/frame-(\d+)/)![1]);
    order.push(index);
    active++;
    peakActive = Math.max(peakActive, active);

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    active--;
    if (failOn.includes(index)) throw new Error(`failed ${index}`);
    return { src } as unknown as CanvasImageSource;
  };

  return {
    loadImage,
    get order() {
      return order;
    },
    get peakActive() {
      return peakActive;
    },
  };
}

/**
 * Waits for a condition rather than a fixed delay. loadRest() is deliberately
 * fire-and-forget, so there is nothing to await -- but sleeping a fixed number
 * of milliseconds makes these tests flaky on a loaded machine.
 */
async function waitUntil(condition: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("waitUntil timed out");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createFrameLoader", () => {
  it("resolves preload only once the requested frames have loaded", async () => {
    const fake = fakeLoader();
    const loader = createFrameLoader({ srcs: srcs(180), concurrency: 6, loadImage: fake.loadImage });

    await loader.preload(20);

    expect(loader.loaded.size).toBe(20);
    for (let i = 0; i < 20; i++) expect(loader.get(i)).toBeDefined();
  });

  it("does not load beyond the preload count until loadRest is called", async () => {
    const fake = fakeLoader();
    const loader = createFrameLoader({ srcs: srcs(180), concurrency: 6, loadImage: fake.loadImage });

    await loader.preload(20);

    expect(fake.order.length).toBe(20);
    expect(loader.get(21)).toBeUndefined();
  });

  it("respects the concurrency ceiling", async () => {
    const fake = fakeLoader({ delayMs: 5 });
    const loader = createFrameLoader({ srcs: srcs(60), concurrency: 6, loadImage: fake.loadImage });

    await loader.preload(10);
    loader.loadRest();
    await waitUntil(() => loader.loaded.size + loader.failed.size === 60);

    expect(fake.peakActive).toBeLessThanOrEqual(6);
  });

  it("loads frames in ascending order", async () => {
    const fake = fakeLoader();
    const loader = createFrameLoader({ srcs: srcs(40), concurrency: 1, loadImage: fake.loadImage });

    await loader.preload(5);
    loader.loadRest();
    await waitUntil(() => fake.order.length === 40);

    expect(fake.order).toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  it("keeps going when an image fails rather than stalling the queue", async () => {
    const fake = fakeLoader({ failOn: [3, 17] });
    const loader = createFrameLoader({ srcs: srcs(40), concurrency: 4, loadImage: fake.loadImage });

    await loader.preload(10);
    loader.loadRest();
    await waitUntil(() => loader.loaded.size + loader.failed.size === 40);

    expect(loader.loaded.size).toBe(38);
    expect(loader.failed.has(3)).toBe(true);
    expect(loader.failed.has(17)).toBe(true);
    expect(loader.get(3)).toBeUndefined();
    expect(loader.get(39)).toBeDefined();
  });

  it("resolves preload even when a frame inside the preload window fails", async () => {
    // Otherwise a single 404 leaves the hero permanently non-interactive.
    const fake = fakeLoader({ failOn: [2] });
    const loader = createFrameLoader({ srcs: srcs(40), concurrency: 4, loadImage: fake.loadImage });

    await expect(loader.preload(5)).resolves.toBeUndefined();
    expect(loader.loaded.size).toBe(4);
  });

  it("never requests the same frame twice", async () => {
    const fake = fakeLoader();
    const loader = createFrameLoader({ srcs: srcs(30), concurrency: 4, loadImage: fake.loadImage });

    await loader.preload(10);
    loader.loadRest();
    loader.loadRest();
    await waitUntil(() => loader.loaded.size === 30);

    expect(fake.order.length).toBe(30);
    expect(new Set(fake.order).size).toBe(30);
  });

  it("reports progress as frames arrive", async () => {
    const fake = fakeLoader();
    const loader = createFrameLoader({ srcs: srcs(20), concurrency: 4, loadImage: fake.loadImage });

    const counts: number[] = [];
    loader.onProgress((n) => counts.push(n));

    await loader.preload(20);

    expect(counts.at(-1)).toBe(20);
    // Monotonic, so a progress indicator can never go backwards.
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it("stops loading after destroy", async () => {
    const fake = fakeLoader({ delayMs: 5 });
    const loader = createFrameLoader({ srcs: srcs(200), concurrency: 2, loadImage: fake.loadImage });

    await loader.preload(4);
    loader.loadRest();
    loader.destroy();
    await sleep(60);

    // A handful may already be in flight, but the queue must not drain fully.
    expect(fake.order.length).toBeLessThan(200);
  });

  it("handles a preload count larger than the sequence", async () => {
    const fake = fakeLoader();
    const loader = createFrameLoader({ srcs: srcs(3), concurrency: 6, loadImage: fake.loadImage });

    await loader.preload(50);

    expect(loader.loaded.size).toBe(3);
  });

  it("handles an empty sequence without hanging", async () => {
    const fake = fakeLoader();
    const loader = createFrameLoader({ srcs: [], concurrency: 6, loadImage: fake.loadImage });

    await expect(loader.preload(10)).resolves.toBeUndefined();
    expect(loader.loaded.size).toBe(0);
  });
});
