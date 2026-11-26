import { describe, expect, it } from "vitest";
import { lowEndDevice } from "./graphics";

const nav = (userAgent: string, extra: Partial<Navigator & { deviceMemory: number }> = {}) => ({ userAgent, hardwareConcurrency: 8, ...extra }) as unknown as Navigator;

describe("lowEndDevice", () => {
  it("picks Low for older iPhones (2× screens) and High for newer (3×)", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(lowEndDevice(nav(iphone), 2)).toBe(true);
    expect(lowEndDevice(nav(iphone), 3)).toBe(false);
  });
  it("picks Low for phones short of memory or cores, never for a desktop", () => {
    const android = "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    expect(lowEndDevice(nav(android, { deviceMemory: 2 }), 2)).toBe(true);
    expect(lowEndDevice(nav(android, { deviceMemory: 4, hardwareConcurrency: 4 }), 2)).toBe(true);
    expect(lowEndDevice(nav(android, { hardwareConcurrency: 4 }), 2)).toBe(true);
    // A good phone: 6 GB reports as 4, with 8 cores; and 8 GB.
    expect(lowEndDevice(nav(android, { deviceMemory: 4, hardwareConcurrency: 8 }), 2.6)).toBe(false);
    expect(lowEndDevice(nav(android, { deviceMemory: 8 }), 2.6)).toBe(false);
    expect(lowEndDevice(nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0", { deviceMemory: 4, hardwareConcurrency: 4 }), 1)).toBe(false);
  });
});
