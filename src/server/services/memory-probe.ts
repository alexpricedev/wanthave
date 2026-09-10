// Temporary diagnostic: samples resident memory on an interval and emails one
// summarised digest a day. Built to settle a specific question — whether the
// service's ~600MB RSS is a fixed baseline allocated at boot or a curve that
// ramps as the card-art cache fills — and meant to be deleted once it has.
//
// Everything here measures directly rather than trusting the runtime's own
// accounting: Bun never populates `arrayBuffers` in process.memoryUsage() and
// under-reports `external` badly (200MB of Uint8Array reads as 77MB), so the
// card cache is sized by summing byteLength and libvips by asking libvips.
// Only `rss` is taken at face value, and it is the number Railway bills.

import { heapStats } from "bun:jsc";
import {
  type DigestPayload,
  type DigestSink,
  logInfo,
  startDigestScheduler,
} from "@alexpricedev/log-digest";
import sharp from "sharp";
import { cardImageCacheStats } from "./card-images";
import { SETS } from "./cards";
import { getEmailService } from "./email";
import { log } from "./logger";

const SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SAMPLE_CATEGORY = "memory";

const CATALOGUE_SIZE = SETS.reduce((total, set) => total + set.count, 0);

// The RSS movement below which a window counts as flat rather than climbing.
// Set above the noise a few OG renders make so a quiet day doesn't read as a
// ramp.
const RAMP_THRESHOLD_BYTES = 25 * 1024 * 1024;

interface Sample {
  rss: number;
  jscHeap: number;
  cardEntries: number;
  cardBytes: number;
  sharpCacheCurrent: number;
  sharpCacheHigh: number;
  sharpQueue: number;
  sharpProcess: number;
}

// What the process held once boot finished and before it served anything. Every
// digest carries it, because the gap between this and the current RSS is the
// part of the bill that requests are responsible for.
let boot: (Sample & { at: Date; sharpConcurrency: number }) | null = null;

const collect = (): Sample => {
  const cards = cardImageCacheStats();
  const cache = sharp.cache();
  const counters = sharp.counters();
  return {
    rss: process.memoryUsage.rss(),
    jscHeap: heapStats().heapSize,
    cardEntries: cards.entries,
    cardBytes: cards.bytes,
    // libvips reports its cache in megabytes; normalise to bytes throughout.
    sharpCacheCurrent: cache.memory.current * 1024 * 1024,
    sharpCacheHigh: cache.memory.high * 1024 * 1024,
    sharpQueue: counters.queue,
    sharpProcess: counters.process,
  };
};

const mb = (bytes: number): string => (bytes / 1048576).toFixed(1);
const signedMb = (bytes: number): string =>
  `${bytes >= 0 ? "+" : "-"}${mb(Math.abs(bytes))}`;

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const toSample = (data: Record<string, unknown> | undefined): Sample => ({
  rss: num(data?.rss),
  jscHeap: num(data?.jscHeap),
  cardEntries: num(data?.cardEntries),
  cardBytes: num(data?.cardBytes),
  sharpCacheCurrent: num(data?.sharpCacheCurrent),
  sharpCacheHigh: num(data?.sharpCacheHigh),
  sharpQueue: num(data?.sharpQueue),
  sharpProcess: num(data?.sharpProcess),
});

interface Series {
  first: number;
  last: number;
  min: number;
  max: number;
  mean: number;
  p95: number;
  delta: number;
}

const seriesOf = (values: number[]): Series => {
  const sorted = [...values].sort((a, b) => a - b);
  const first = values[0] as number;
  const last = values[values.length - 1] as number;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * 0.95) - 1,
  );
  return {
    first,
    last,
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    mean: values.reduce((total, v) => total + v, 0) / values.length,
    p95: sorted[Math.max(0, index)] as number,
    delta: last - first,
  };
};

interface Verdict {
  headline: string;
  detail: string;
}

// Turn the window into the one sentence the investigation actually needs: is
// this a baseline problem or a growth problem, and which suspect owns it.
const verdictFor = (
  rss: Series,
  cardBytes: Series,
  sharpHigh: number,
): Verdict => {
  if (Math.abs(rss.delta) < RAMP_THRESHOLD_BYTES) {
    return {
      headline: "STABLE — high baseline, not a ramp",
      detail:
        `RSS moved ${signedMb(rss.delta)}MB across the window, inside the ${mb(RAMP_THRESHOLD_BYTES)}MB noise floor. ` +
        "The memory is allocated and held, not accumulating. Attack the baseline: MALLOC_ARENA_MAX, VIPS_CONCURRENCY, sharp.cache().",
    };
  }

  if (rss.delta < 0) {
    return {
      headline: "FALLING — RSS lower than at window start",
      detail: `RSS fell ${mb(Math.abs(rss.delta))}MB. Most likely a restart mid-window; check the boot baseline timestamp below.`,
    };
  }

  const attributed = cardBytes.delta;
  const unexplained = rss.delta - attributed;

  if (attributed >= rss.delta * 0.5) {
    return {
      headline: "RAMP — card art cache dominant (suspect 1)",
      detail:
        `RSS grew ${mb(rss.delta)}MB; the card cache grew ${mb(attributed)}MB of that. ` +
        `Cap or drop the Map in card-images.ts — CDN and disk already back it. Ceiling is ~171MB at ${CATALOGUE_SIZE} cards.`,
    };
  }

  return {
    headline: "RAMP — mostly outside the card cache (suspect 2)",
    detail:
      `RSS grew ${mb(rss.delta)}MB, of which only ${mb(attributed)}MB is card art — ${mb(unexplained)}MB is unaccounted. ` +
      `libvips cache high-water is ${mb(sharpHigh)}MB, so the remainder points at glibc arena retention from sharp. Try MALLOC_ARENA_MAX=2.`,
  };
};

const PAPER = "#f7f4ec";
const CARD = "#fffdf8";
const INK = "#17161a";
const MUTED = "#6f6a7a";
const EDGE = "#e7e1d4";
const WANT = "#e5b35b";
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const renderHtml = (
  samples: Sample[],
  rss: Series,
  cardBytes: Series,
  cardEntries: Series,
  jscHeap: Series,
  verdict: Verdict,
  period: string,
): string => {
  const latest = samples[samples.length - 1] as Sample;
  const sharpHigh = Math.max(...samples.map((s) => s.sharpCacheHigh));

  const row = (label: string, value: string, note = ""): string => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid ${EDGE};color:${MUTED};">${label}</td>
      <td style="padding:8px 10px;border-bottom:1px solid ${EDGE};font-family:monospace;text-align:right;color:${INK};">${value}</td>
      <td style="padding:8px 10px;border-bottom:1px solid ${EDGE};color:${MUTED};font-size:12px;">${note}</td>
    </tr>`;

  const section = (title: string, rows: string): string => `
    <h3 style="margin:22px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};">${title}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>`;

  const bootRows = boot
    ? row(
        "RSS at boot",
        `${mb(boot.rss)} MB`,
        boot.at.toISOString().slice(0, 16).replace("T", " "),
      ) +
      row(
        "Growth since boot",
        `${signedMb(latest.rss - boot.rss)} MB`,
        "request-driven portion",
      ) +
      row(
        "libvips threads",
        String(boot.sharpConcurrency),
        "sharp.concurrency() at boot",
      )
    : row("Boot baseline", "unavailable", "probe started after boot");

  return `
  <div style="background:${PAPER};padding:24px;font-family:${FONT};color:${INK};">
    <div style="max-width:640px;margin:0 auto;background:${CARD};border:1px solid ${EDGE};border-radius:10px;padding:24px;">
      <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:${MUTED};">WantHave memory probe</p>
      <h2 style="margin:0 0 4px;font-size:20px;">${period}</h2>
      <p style="margin:0;color:${MUTED};font-size:13px;">${samples.length} samples, every ${SAMPLE_INTERVAL_MS / 60000} minutes</p>

      <div style="margin:20px 0;padding:14px 16px;background:${PAPER};border-left:3px solid ${WANT};border-radius:4px;">
        <p style="margin:0 0 6px;font-weight:600;">${verdict.headline}</p>
        <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.5;">${verdict.detail}</p>
      </div>

      ${section(
        "Resident memory (billed)",
        row("Now", `${mb(rss.last)} MB`) +
          row("Change over window", `${signedMb(rss.delta)} MB`) +
          row("Mean", `${mb(rss.mean)} MB`) +
          row("p95", `${mb(rss.p95)} MB`) +
          row("Min / Max", `${mb(rss.min)} / ${mb(rss.max)} MB`),
      )}

      ${section(
        "Card art cache (suspect 1)",
        row(
          "Held now",
          `${mb(cardBytes.last)} MB`,
          `${cardEntries.last} of ${CATALOGUE_SIZE} cards`,
        ) +
          row(
            "Change over window",
            `${signedMb(cardBytes.delta)} MB`,
            `${cardEntries.delta >= 0 ? "+" : ""}${cardEntries.delta} cards`,
          ) +
          row(
            "Share of current RSS",
            `${((cardBytes.last / rss.last) * 100).toFixed(1)} %`,
          ) +
          row(
            "Projected at full catalogue",
            `${mb(cardEntries.last > 0 ? (cardBytes.last / cardEntries.last) * CATALOGUE_SIZE : 0)} MB`,
            "if every card is requested",
          ),
      )}

      ${section(
        "libvips / sharp (suspect 2)",
        row("Cache now", `${mb(latest.sharpCacheCurrent)} MB`) +
          row("Cache high-water", `${mb(sharpHigh)} MB`) +
          row(
            "Tasks queued / active",
            `${latest.sharpQueue} / ${latest.sharpProcess}`,
          ),
      )}

      ${section(
        "JS heap (indicative only)",
        row("JSC heap now", `${mb(jscHeap.last)} MB`) +
          row("Change over window", `${signedMb(jscHeap.delta)} MB`) +
          row(
            "Unattributed",
            `${mb(Math.max(0, rss.last - jscHeap.last - cardBytes.last - latest.sharpCacheCurrent))} MB`,
            "native / fragmentation",
          ),
      )}

      ${section("Boot baseline", bootRows)}

      <p style="margin:22px 0 0;font-size:11px;color:${MUTED};line-height:1.5;">
        Bun does not populate arrayBuffers and under-reports external memory, so card art and libvips
        are measured directly rather than via process.memoryUsage(). Temporary diagnostic — delete memory-probe.ts to stop it.
      </p>
    </div>
  </div>`;
};

const renderText = (
  rss: Series,
  cardBytes: Series,
  cardEntries: Series,
  verdict: Verdict,
  sampleCount: number,
  period: string,
): string =>
  [
    `WantHave memory probe — ${period}`,
    `${sampleCount} samples`,
    "",
    verdict.headline,
    verdict.detail,
    "",
    `RSS now:        ${mb(rss.last)} MB`,
    `RSS change:     ${signedMb(rss.delta)} MB`,
    `RSS mean/p95:   ${mb(rss.mean)} / ${mb(rss.p95)} MB`,
    `RSS min/max:    ${mb(rss.min)} / ${mb(rss.max)} MB`,
    "",
    `Card cache:     ${mb(cardBytes.last)} MB across ${cardEntries.last}/${CATALOGUE_SIZE} cards`,
    `Card change:    ${signedMb(cardBytes.delta)} MB`,
    boot
      ? `Since boot:     ${signedMb(rss.last - boot.rss)} MB (boot was ${mb(boot.rss)} MB)`
      : "Boot baseline unavailable",
  ].join("\n");

export const memoryDigestSink: DigestSink = {
  async send(payload: DigestPayload): Promise<void> {
    const samples = payload.logs
      .filter((entry) => entry.category === SAMPLE_CATEGORY)
      .map((entry) => toSample(entry.data));

    if (samples.length === 0) return;

    // Empty-string env vars are a real possibility on Railway and `??` would
    // wave one through as a recipient, so fall back on falsiness instead.
    const toEmail =
      process.env.FEEDBACK_TO_EMAIL || process.env.REPLY_TO_EMAIL || "";
    if (!toEmail) {
      log.warn(
        "memory-probe",
        "No digest recipient configured (set FEEDBACK_TO_EMAIL or REPLY_TO_EMAIL)",
      );
      return;
    }

    const rss = seriesOf(samples.map((s) => s.rss));
    const cardBytes = seriesOf(samples.map((s) => s.cardBytes));
    const cardEntries = seriesOf(samples.map((s) => s.cardEntries));
    const jscHeap = seriesOf(samples.map((s) => s.jscHeap));
    const sharpHigh = Math.max(...samples.map((s) => s.sharpCacheHigh));
    const verdict = verdictFor(rss, cardBytes, sharpHigh);

    await getEmailService().sendOperational({
      to: { email: toEmail },
      subject: `WantHave memory — ${mb(rss.last)}MB RSS, ${signedMb(rss.delta)}MB over 24h`,
      html: renderHtml(
        samples,
        rss,
        cardBytes,
        cardEntries,
        jscHeap,
        verdict,
        payload.period,
      ),
      text: renderText(
        rss,
        cardBytes,
        cardEntries,
        verdict,
        samples.length,
        payload.period,
      ),
    });

    log.info(
      "memory-probe",
      `Digest sent: ${samples.length} samples, RSS ${mb(rss.last)}MB (${signedMb(rss.delta)}MB)`,
    );
  },
};

/**
 * Begin sampling and schedule the daily digest. Always on — this is a
 * short-lived diagnostic, and the way to turn it off is to delete the module
 * and its call in main.ts once the investigation is settled.
 */
export const startMemoryProbe = (): void => {
  boot = {
    ...collect(),
    at: new Date(),
    sharpConcurrency: sharp.concurrency(),
  };

  log.info(
    "memory-probe",
    `Boot baseline ${mb(boot.rss)}MB RSS, ${boot.sharpConcurrency} libvips threads — sampling every ${SAMPLE_INTERVAL_MS / 60000}m, digest every ${DIGEST_INTERVAL_MS / 3600000}h`,
  );

  setInterval(() => {
    logInfo(SAMPLE_CATEGORY, "sample", { ...collect() });
  }, SAMPLE_INTERVAL_MS);

  // startupDelayMs 0: exactly one email a day, no boot send. Liveness is
  // visible in stdout — log-digest mirrors every sample to the console.
  startDigestScheduler({
    sink: memoryDigestSink,
    intervalMs: DIGEST_INTERVAL_MS,
    startupDelayMs: 0,
  });
};
