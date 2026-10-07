import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  keepSearchImage,
  readSearchImage,
} from "../../../src/client/modules/search-image/search-image-store";

class QuotaStorage {
  data = new Map<string, string>();
  constructor(private quota: number) {}
  private used(): number {
    let n = 0;
    for (const [k, v] of this.data) n += k.length + v.length;
    return n;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    const prev = this.data.get(key);
    const next = this.used() - (prev ? key.length + prev.length : 0) + key.length + value.length;
    if (next > this.quota) throw new DOMException("full", "QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const original = globalThis.sessionStorage;
let storage: QuotaStorage;

const image = (id: string, size = 10) => ({
  id,
  dataUrl: `data:image/jpeg;base64,${"A".repeat(size)}`,
});

beforeEach(() => {
  storage = new QuotaStorage(10_000);
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
});

afterAll(() => {
  Object.defineProperty(globalThis, "sessionStorage", { value: original, configurable: true });
});

describe("search image store", () => {
  test("keeps only the most recent images", () => {
    for (let i = 0; i < 20; i++) keepSearchImage(image(`img-${i}`));
    expect(readSearchImage("img-0")).toBeNull();
    expect(readSearchImage("img-19")?.id).toBe("img-19");
    const images = [...storage.data.keys()].filter((k) => k.startsWith("degoog-search-image:"));
    expect(images.length).toBeLessThanOrEqual(8);
  });

  test("makes room by dropping the oldest images when storage is full", () => {
    for (let i = 0; i < 5; i++) keepSearchImage(image(`big-${i}`, 3000));
    expect(readSearchImage("big-4")?.id).toBe("big-4");
    expect(readSearchImage("big-0")).toBeNull();
  });

  test("keeping the same image again does not evict it", () => {
    keepSearchImage(image("a"));
    for (let i = 0; i < 7; i++) keepSearchImage(image(`b-${i}`));
    keepSearchImage(image("a"));
    keepSearchImage(image("c"));
    expect(readSearchImage("a")?.id).toBe("a");
  });
});
