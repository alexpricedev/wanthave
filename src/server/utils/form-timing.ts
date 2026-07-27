import { timingSafeEqual } from "node:crypto";
import { computeHMAC } from "./crypto";

// Spam trap: forms carry a signed render timestamp so a submission that lands
// impossibly fast can be spotted. Bots post the instant they parse the form;
// a human needs seconds to type. Signed so the value can't be back-dated.

export const MIN_FILL_MS = 3000;

const sign = (issuedAt: number): string => computeHMAC(`form:${issuedAt}`);

/** Stamp for a hidden field, rendered when the form is served. */
export const createFormStamp = (now = Date.now()): string =>
  `${now}.${sign(now)}`;

/**
 * How long the form was on screen, or null if the stamp is missing, malformed,
 * or not ours. Callers decide what to do with a null.
 */
export const readFormStampAge = (
  stamp: string,
  now = Date.now(),
): number | null => {
  const [issuedAtRaw, signature] = stamp.split(".");
  if (!issuedAtRaw || !signature) return null;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isSafeInteger(issuedAt)) return null;

  const expected = sign(issuedAt);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  return now - issuedAt;
};

/** True when the submission is too fast (or unsigned) to have been typed. */
export const isTooFast = (stamp: string, minMs = MIN_FILL_MS): boolean => {
  const age = readFormStampAge(stamp);
  return age === null || age < minMs;
};
