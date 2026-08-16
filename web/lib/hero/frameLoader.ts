/**
 * Progressive, concurrency-limited image loading for the frame sequence.
 *
 * Isolated from React and from the canvas so it can be unit tested without a
 * DOM: image loading is injected. The scrubber's responsiveness depends
 * entirely on this behaving well under partial load, so the failure modes
 * (a 404 stalling the queue, the same frame fetched twice, unbounded parallel
 * requests) are tested rather than assumed.
 */

export type LoadImage<T> = (src: string) => Promise<T>;

export interface FrameLoaderOptions<T> {
  /** Distinct image URLs. Duplicated timeline frames must already be collapsed. */
  srcs: readonly string[];
  /** Simultaneous in-flight requests. Six matches a typical HTTP/2 comfort zone. */
  concurrency?: number;
  loadImage?: LoadImage<T>;
}

export interface FrameLoader<T> {
  readonly loaded: ReadonlySet<number>;
  readonly failed: ReadonlySet<number>;
  get(index: number): T | undefined;
  /** Loads the first `count` images. Resolves once they have all settled. */
  preload(count: number): Promise<void>;
  /** Queues everything else. Fire-and-forget: the scrub must not wait on it. */
  loadRest(): void;
  onProgress(callback: (loadedCount: number) => void): () => void;
  destroy(): void;
}

/**
 * Browser image loading. `decode()` is awaited so the first canvas draw of a
 * frame does not pay decode cost on the main thread mid-scroll.
 */
export const defaultLoadImage: LoadImage<HTMLImageElement> = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (typeof image.decode === "function") {
        image.decode().then(
          () => resolve(image),
          // A decode failure on an image that loaded is still usable.
          () => resolve(image)
        );
      } else {
        resolve(image);
      }
    };
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });

export function createFrameLoader<T = HTMLImageElement>({
  srcs,
  concurrency = 6,
  loadImage = defaultLoadImage as unknown as LoadImage<T>,
}: FrameLoaderOptions<T>): FrameLoader<T> {
  const images = new Map<number, T>();
  const loaded = new Set<number>();
  const failed = new Set<number>();
  const requested = new Set<number>();
  const progressCallbacks = new Set<(count: number) => void>();

  /** Ascending, so frames arrive in the order the user will scrub through them. */
  const queue: number[] = [];
  const settledCallbacks = new Map<number, () => void>();

  let active = 0;
  let destroyed = false;

  function announceProgress() {
    for (const callback of progressCallbacks) callback(loaded.size);
  }

  function markSettled(index: number) {
    settledCallbacks.get(index)?.();
    settledCallbacks.delete(index);
  }

  function pump() {
    while (!destroyed && active < concurrency && queue.length > 0) {
      const index = queue.shift()!;
      active++;

      loadImage(srcs[index]).then(
        (image) => {
          active--;
          if (!destroyed) {
            images.set(index, image);
            loaded.add(index);
            announceProgress();
          }
          markSettled(index);
          pump();
        },
        () => {
          active--;
          // A missing frame must not stall everything behind it. It is recorded
          // and skipped; nearestLoadedIndex covers the gap at draw time.
          if (!destroyed) failed.add(index);
          markSettled(index);
          pump();
        }
      );
    }
  }

  function enqueue(indices: number[]) {
    for (const index of indices) {
      if (requested.has(index)) continue;
      requested.add(index);
      queue.push(index);
    }
    pump();
  }

  return {
    loaded,
    failed,

    get: (index) => images.get(index),

    preload(count) {
      const upTo = Math.min(count, srcs.length);
      const indices = Array.from({ length: upTo }, (_, i) => i);
      if (indices.length === 0) return Promise.resolve();

      // Resolves when every requested frame has settled -- loaded OR failed.
      // Waiting only on success would leave the hero permanently
      // non-interactive after a single 404.
      const waits = indices.map(
        (index) =>
          new Promise<void>((resolve) => {
            if (loaded.has(index) || failed.has(index)) return resolve();
            settledCallbacks.set(index, resolve);
          })
      );

      enqueue(indices);
      return Promise.all(waits).then(() => undefined);
    },

    loadRest() {
      enqueue(Array.from({ length: srcs.length }, (_, i) => i));
    },

    onProgress(callback) {
      progressCallbacks.add(callback);
      return () => progressCallbacks.delete(callback);
    },

    destroy() {
      destroyed = true;
      queue.length = 0;
      for (const resolve of settledCallbacks.values()) resolve();
      settledCallbacks.clear();
      progressCallbacks.clear();
    },
  };
}
