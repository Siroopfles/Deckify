import { callable } from "@decky/api";

export const backendGetImage = callable<[string], { ok: boolean; data_url?: string; error?: string }>("get_image");

export class ImageLruCache {
  private map = new Map<string, string>();
  constructor(private capacity: number = 200) {}

  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export class ImageRequestQueue {
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number = 4) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.activeCount++;
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.activeCount--;
            this.next();
          });
      };

      if (this.activeCount < this.maxConcurrent) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  private next(): void {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const nextTask = this.queue.shift();
      if (nextTask) nextTask();
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.activeCount;
  }
}

export const imgMemoryCache = new ImageLruCache(200);
export const imgRequestQueue = new ImageRequestQueue(4);
export const imgPending = new Map<string, Promise<string | null>>();

export function fetchWithQueueAndCache(src: string): Promise<string | null> {
  let promise = imgPending.get(src);
  if (!promise) {
    promise = imgRequestQueue
      .enqueue(() => backendGetImage(src))
      .then((res) => {
        if (res && res.ok && res.data_url) {
          imgMemoryCache.set(src, res.data_url);
          return res.data_url;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        imgPending.delete(src);
      });
    imgPending.set(src, promise);
  }
  return promise;
}
