/**
 * User-Agent classification for analytics.
 *
 * Three populations hit this site and a raw request count blends them into one
 * useless number: people, link-unfurl bots (the surfaces our share links land
 * on — this is signal, not noise), and generic crawlers. Separating them is
 * what makes a conversion rate mean anything.
 */

export type SharePlatform =
  | "discord"
  | "twitter"
  | "facebook"
  | "slack"
  | "telegram"
  | "whatsapp"
  | "reddit"
  | "linkedin"
  | "bluesky"
  | "skype"
  | "embed";

export interface UserAgentClass {
  /** True for anything that isn't a person driving a browser. */
  isBot: boolean;
  /** Set only when the request is a link unfurl we can attribute to a surface. */
  platform: SharePlatform | null;
}

// Ordered: first match wins, so specific platforms are checked before the
// generic bot heuristics below.
const UNFURL_AGENTS: [SharePlatform, RegExp][] = [
  ["discord", /Discordbot/i],
  // Before Twitter: Telegram's real UA is "TelegramBot (like TwitterBot)", so
  // checking Twitter first would misattribute every Telegram unfurl.
  ["telegram", /TelegramBot/i],
  ["twitter", /Twitterbot/i],
  ["facebook", /facebookexternalhit|facebookcatalog|facebot/i],
  ["slack", /Slackbot|Slack-ImgProxy/i],
  ["whatsapp", /WhatsApp/i],
  ["reddit", /redditbot/i],
  ["linkedin", /LinkedInBot/i],
  ["bluesky", /Bluesky ?Cardyb|bskylink/i],
  ["skype", /SkypeUriPreview/i],
  // Generic preview-card fetchers used by many smaller apps and chat clients.
  ["embed", /Embedly|iframely|Pinterest|vkShare|Yahoo Link Preview|nuzzel/i],
];

// Search crawlers, AI crawlers, SEO scrapers, and bare HTTP clients. Not
// exhaustive by design — the generic pattern below catches the long tail.
const KNOWN_BOTS =
  /Googlebot|Google-InspectionTool|bingbot|DuckDuckBot|YandexBot|Baiduspider|Applebot|PetalBot|Bytespider|Amazonbot|AhrefsBot|SemrushBot|MJ12bot|DotBot|GPTBot|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|CCBot|archive\.org_bot|ia_archiver/i;

// Long tail: anything self-describing as automation, plus the usual scripting
// clients. Deliberately loose — a false positive costs one under-counted human,
// a false negative inflates the exact number we're trying to trust.
const GENERIC_BOT =
  /\bbot\b|bot\/|crawler|crawling|spider|slurp|scrap|monitor|uptime|headless|http-client|python-requests|aiohttp|okhttp|libwww|Go-http|node-fetch|axios|^curl|^Wget|^Java\//i;

export const classifyUserAgent = (
  userAgent: string | null | undefined,
): UserAgentClass => {
  // A real browser always sends one. Absent means a script, and counting those
  // as people is how the visitor number stopped being believable.
  if (!userAgent) return { isBot: true, platform: null };

  for (const [platform, pattern] of UNFURL_AGENTS) {
    if (pattern.test(userAgent)) return { isBot: true, platform };
  }

  if (KNOWN_BOTS.test(userAgent) || GENERIC_BOT.test(userAgent)) {
    return { isBot: true, platform: null };
  }

  return { isBot: false, platform: null };
};
