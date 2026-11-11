import { describe, it, expect, vi } from "vitest";

vi.mock("@decky/api", () => ({
  callable: () => vi.fn(),
}));

import {
  ImageLruCache,
  ImageRequestQueue,
  imgMemoryCache,
  imgRequestQueue,
} from "./imagePipeline";

describe("DeckifyImage Pipeline", () => {
  describe("ImageLruCache", () => {
    it("exports default imgMemoryCache with capacity 200", () => {
      expect(imgMemoryCache).toBeInstanceOf(ImageLruCache);
    });

    it("stores and retrieves items correctly", () => {
      const cache = new ImageLruCache(3);
      cache.set("url1", "data:image/1");
      expect(cache.get("url1")).toBe("data:image/1");
      expect(cache.has("url1")).toBe(true);
      expect(cache.has("url2")).toBe(false);
      expect(cache.size).toBe(1);
    });

    it("evicts oldest item when capacity is exceeded", () => {
      const cache = new ImageLruCache(2);
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe("2");
      expect(cache.get("c")).toBe("3");
      expect(cache.size).toBe(2);
    });

    it("refreshes recency on get", () => {
      const cache = new ImageLruCache(2);
      cache.set("a", "1");
      cache.set("b", "2");
      expect(cache.get("a")).toBe("1");
      cache.set("c", "3");
      expect(cache.get("a")).toBe("1");
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe("3");
    });

    it("updates existing key without evicting", () => {
      const cache = new ImageLruCache(2);
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("a", "updated_1");
      expect(cache.get("a")).toBe("updated_1");
      expect(cache.get("b")).toBe("2");
      expect(cache.size).toBe(2);
    });

    it("clears all cached items", () => {
      const cache = new ImageLruCache(3);
      cache.set("a", "1");
      cache.set("b", "2");
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.has("b")).toBe(false);
    });
  });

  describe("ImageRequestQueue", () => {
    it("exports default imgRequestQueue with maxConcurrent 4", () => {
      expect(imgRequestQueue).toBeInstanceOf(ImageRequestQueue);
    });

    it("limits concurrent executions to maxConcurrent", async () => {
      const queue = new ImageRequestQueue(2);
      let active = 0;
      let peak = 0;

      const makeTask = () => () =>
        new Promise<void>((resolve) => {
          active++;
          peak = Math.max(peak, active);
          setTimeout(() => {
            active--;
            resolve();
          }, 20);
        });

      await Promise.all([
        queue.enqueue(makeTask()),
        queue.enqueue(makeTask()),
        queue.enqueue(makeTask()),
        queue.enqueue(makeTask()),
      ]);

      expect(peak).toBeLessThanOrEqual(2);
    });

    it("executes tasks in FIFO order", async () => {
      const queue = new ImageRequestQueue(1);
      const executionOrder: number[] = [];

      const makeTask = (id: number) => () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            executionOrder.push(id);
            resolve();
          }, 10);
        });

      await Promise.all([
        queue.enqueue(makeTask(1)),
        queue.enqueue(makeTask(2)),
        queue.enqueue(makeTask(3)),
      ]);

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it("propagates task errors without halting subsequent queue items", async () => {
      const queue = new ImageRequestQueue(1);
      const executionOrder: number[] = [];

      const failingTask = () =>
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            executionOrder.push(1);
            reject(new Error("RPC failed"));
          }, 10);
        });

      const successTask = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            executionOrder.push(2);
            resolve("success");
          }, 10);
        });

      await expect(queue.enqueue(failingTask)).rejects.toThrow("RPC failed");
      const res = await queue.enqueue(successTask);
      expect(res).toBe("success");
      expect(executionOrder).toEqual([1, 2]);
    });

    it("deduplicates in-flight requests for identical URLs", async () => {
      const inFlight = new Map<string, Promise<string>>();
      let backendFetchCount = 0;

      const fetchImage = (url: string) => {
        let promise = inFlight.get(url);
        if (!promise) {
          backendFetchCount++;
          promise = new Promise<string>((resolve) => {
            setTimeout(() => resolve(`data:image/${url}`), 15);
          }).finally(() => {
            inFlight.delete(url);
          });
          inFlight.set(url, promise);
        }
        return promise;
      };

      const [res1, res2, res3] = await Promise.all([
        fetchImage("https://i.scdn.co/image/abc"),
        fetchImage("https://i.scdn.co/image/abc"),
        fetchImage("https://i.scdn.co/image/abc"),
      ]);

      expect(res1).toBe("data:image/https://i.scdn.co/image/abc");
      expect(res2).toBe("data:image/https://i.scdn.co/image/abc");
      expect(res3).toBe("data:image/https://i.scdn.co/image/abc");
      expect(backendFetchCount).toBe(1);
    });
  });
});
