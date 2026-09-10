import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { LogEntry } from "@alexpricedev/log-digest";
import {
  type EmailMessage,
  type EmailProvider,
  EmailService,
  setEmailService,
} from "./email";
import { memoryDigestSink } from "./memory-probe";

const MB = 1024 * 1024;

const sent: EmailMessage[] = [];

const recordingProvider: EmailProvider = {
  async send(message) {
    sent.push(message);
  },
};

// One sample as the probe writes it: a log entry whose `data` carries the
// metrics. Only the fields the summariser reads need supplying.
const sample = (overrides: {
  rss: number;
  cardBytes?: number;
  cardEntries?: number;
  sharpCacheHigh?: number;
}): LogEntry => ({
  timestamp: new Date("2026-09-10T12:00:00Z"),
  level: "info",
  category: "memory",
  message: "sample",
  data: {
    rss: overrides.rss,
    jscHeap: 80 * MB,
    cardEntries: overrides.cardEntries ?? 100,
    cardBytes: overrides.cardBytes ?? 5 * MB,
    sharpCacheCurrent: 10 * MB,
    sharpCacheHigh: overrides.sharpCacheHigh ?? 20 * MB,
    sharpQueue: 0,
    sharpProcess: 0,
  },
});

const payload = (logs: LogEntry[]) => ({
  logs,
  summary: { errorCount: 0, warnCount: 0, infoCount: logs.length },
  period: "2026-09-10 12:00 UTC",
  format: { html: "", text: "" },
});

describe("memoryDigestSink", () => {
  beforeEach(() => {
    sent.length = 0;
    process.env.FEEDBACK_TO_EMAIL = "ops@example.com";
    setEmailService(new EmailService(recordingProvider));
  });

  afterEach(() => {
    delete process.env.FEEDBACK_TO_EMAIL;
    setEmailService(null as unknown as EmailService);
  });

  test("sends a digest to the feedback recipient with RSS in the subject", async () => {
    await memoryDigestSink.send(
      payload([sample({ rss: 600 * MB }), sample({ rss: 610 * MB })]),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to.email).toBe("ops@example.com");
    expect(sent[0]?.subject).toContain("610.0MB RSS");
    expect(sent[0]?.subject).toContain("+10.0MB");
  });

  test("reports a flat window as a baseline rather than a ramp", async () => {
    await memoryDigestSink.send(
      payload([sample({ rss: 600 * MB }), sample({ rss: 605 * MB })]),
    );

    expect(sent[0]?.text).toContain("STABLE");
    expect(sent[0]?.html).toContain("MALLOC_ARENA_MAX");
  });

  test("attributes growth to the card cache when it accounts for most of it", async () => {
    await memoryDigestSink.send(
      payload([
        sample({ rss: 400 * MB, cardBytes: 10 * MB, cardEntries: 200 }),
        sample({ rss: 500 * MB, cardBytes: 90 * MB, cardEntries: 1900 }),
      ]),
    );

    expect(sent[0]?.text).toContain("card art cache dominant");
    // Extrapolates the per-card average across the full catalogue.
    expect(sent[0]?.html).toContain("Projected at full catalogue");
  });

  test("points at libvips when growth is not explained by the card cache", async () => {
    await memoryDigestSink.send(
      payload([
        sample({ rss: 400 * MB, cardBytes: 50 * MB }),
        sample({ rss: 500 * MB, cardBytes: 52 * MB }),
      ]),
    );

    expect(sent[0]?.text).toContain("mostly outside the card cache");
  });

  test("flags a mid-window restart instead of reporting negative growth", async () => {
    await memoryDigestSink.send(
      payload([sample({ rss: 600 * MB }), sample({ rss: 200 * MB })]),
    );

    expect(sent[0]?.text).toContain("FALLING");
  });

  test("skips sending when no recipient is configured", async () => {
    delete process.env.FEEDBACK_TO_EMAIL;
    delete process.env.REPLY_TO_EMAIL;

    await memoryDigestSink.send(payload([sample({ rss: 600 * MB })]));

    expect(sent).toHaveLength(0);
  });

  test("ignores entries that are not memory samples", async () => {
    const unrelated: LogEntry = {
      timestamp: new Date(),
      level: "error",
      category: "database",
      message: "connection lost",
    };

    await memoryDigestSink.send(payload([unrelated]));

    expect(sent).toHaveLength(0);
  });
});
