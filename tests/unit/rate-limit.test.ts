import { describe, test, expect, beforeEach } from "bun:test";
import {
  checkRateLimit,
  clearRateLimitState,
  parseRateLimitOptions,
  BURST_WINDOW_SEC,
  BURST_MAX,
  LONG_WINDOW_SEC,
  LONG_MAX,
} from "../../src/server/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    clearRateLimitState();
  });

  describe("parseRateLimitOptions", () => {
    test("returns defaults when options empty", () => {
      const opts = parseRateLimitOptions({});
      expect(opts.burstWindowSec).toBe(BURST_WINDOW_SEC);
      expect(opts.burstMax).toBe(BURST_MAX);
      expect(opts.longWindowSec).toBe(LONG_WINDOW_SEC);
      expect(opts.longMax).toBe(LONG_MAX);
    });

    test("parses valid overrides", () => {
      const opts = parseRateLimitOptions({
        rateLimitBurstWindow: "10",
        rateLimitBurstMax: "5",
        rateLimitLongWindow: "120",
        rateLimitLongMax: "50",
      });
      expect(opts.burstWindowSec).toBe(10);
      expect(opts.burstMax).toBe(5);
      expect(opts.longWindowSec).toBe(120);
      expect(opts.longMax).toBe(50);
    });

    test("falls back to default for invalid values", () => {
      const opts = parseRateLimitOptions({
        rateLimitBurstWindow: "0",
        rateLimitBurstMax: "9999",
      });
      expect(opts.burstWindowSec).toBe(BURST_WINDOW_SEC);
      expect(opts.burstMax).toBe(BURST_MAX);
    });
  });

  describe("checkRateLimit disabled", () => {
    test("always allows when rateLimitEnabled is not true", () => {
      expect(checkRateLimit("192.168.1.1", {})).toEqual({ allowed: true });
      expect(checkRateLimit("192.168.1.1", { rateLimitEnabled: "false" })).toEqual(
        { allowed: true },
      );
      for (let i = 0; i < 20; i++) {
        expect(checkRateLimit("192.168.1.1", { rateLimitEnabled: "false" })).toEqual(
          { allowed: true },
        );
      }
    });
  });

  describe("checkRateLimit burst limit", () => {
    test("allows up to burstMax then denies", () => {
      const opts = {
        rateLimitEnabled: "true",
        rateLimitBurstWindow: "20",
        rateLimitBurstMax: "3",
        rateLimitLongWindow: "600",
        rateLimitLongMax: "150",
      };
      expect(checkRateLimit("10.0.0.1", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("10.0.0.1", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("10.0.0.1", opts)).toEqual({ allowed: true });
      const fourth = checkRateLimit("10.0.0.1", opts);
      expect(fourth.allowed).toBe(false);
      expect(fourth.retryAfterSec).toBeGreaterThanOrEqual(1);
      expect(fourth.retryAfterSec).toBeLessThanOrEqual(20);
    });
  });

  describe("checkRateLimit different IPs", () => {
    test("each IP has independent limit", () => {
      const opts = {
        rateLimitEnabled: "true",
        rateLimitBurstWindow: "20",
        rateLimitBurstMax: "2",
        rateLimitLongWindow: "600",
        rateLimitLongMax: "150",
      };
      expect(checkRateLimit("10.0.0.1", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("10.0.0.1", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("10.0.0.1", opts).allowed).toBe(false);
      expect(checkRateLimit("10.0.0.2", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("10.0.0.2", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("10.0.0.2", opts).allowed).toBe(false);
    });
  });

  describe("checkRateLimit sliding window", () => {
    test("after burst window expires next request allowed", async () => {
      const opts = {
        rateLimitEnabled: "true",
        rateLimitBurstWindow: "1",
        rateLimitBurstMax: "2",
        rateLimitLongWindow: "10",
        rateLimitLongMax: "150",
      };
      expect(checkRateLimit("127.0.0.1", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("127.0.0.1", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("127.0.0.1", opts).allowed).toBe(false);
      await Bun.sleep(1100);
      expect(checkRateLimit("127.0.0.1", opts)).toEqual({ allowed: true });
    });
  });

  describe("checkRateLimit long window", () => {
    test("denies when long count exceeds longMax", () => {
      const opts = {
        rateLimitEnabled: "true",
        rateLimitBurstWindow: "20",
        rateLimitBurstMax: "100",
        rateLimitLongWindow: "600",
        rateLimitLongMax: "4",
      };
      expect(checkRateLimit("10.0.0.1", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("10.0.0.1", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("10.0.0.1", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("10.0.0.1", opts)).toEqual({ allowed: true });
      const fifth = checkRateLimit("10.0.0.1", opts);
      expect(fifth.allowed).toBe(false);
      expect(fifth.retryAfterSec).toBeDefined();
    });
  });

  describe("checkRateLimit unknown IP", () => {
    test("treats empty ip as unknown key", () => {
      const opts = {
        rateLimitEnabled: "true",
        rateLimitBurstWindow: "20",
        rateLimitBurstMax: "1",
        rateLimitLongWindow: "600",
        rateLimitLongMax: "150",
      };
      expect(checkRateLimit("", opts)).toEqual({ allowed: true });
      expect(checkRateLimit("", opts).allowed).toBe(false);
    });
  });
});
