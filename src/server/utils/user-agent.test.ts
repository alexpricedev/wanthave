import { describe, expect, test } from "bun:test";
import { classifyUserAgent, type SharePlatform } from "./user-agent";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const FIREFOX =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";

describe("classifyUserAgent", () => {
  test("treats real browsers as human with no platform", () => {
    for (const ua of [CHROME, SAFARI_IOS, FIREFOX]) {
      expect(classifyUserAgent(ua)).toEqual({ isBot: false, platform: null });
    }
  });

  test("attributes unfurl bots to their platform", () => {
    const cases: [string, SharePlatform][] = [
      [
        "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
        "discord",
      ],
      ["Twitterbot/1.0", "twitter"],
      [
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "facebook",
      ],
      ["Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "slack"],
      ["TelegramBot (like TwitterBot)", "telegram"],
      ["WhatsApp/2.23.20.0 A", "whatsapp"],
      ["Mozilla/5.0 (compatible; redditbot/1.0)", "reddit"],
      ["LinkedInBot/1.0 (compatible; Mozilla/5.0)", "linkedin"],
      ["Mozilla/5.0 (compatible; Bluesky Cardyb/1.1)", "bluesky"],
      ["SkypeUriPreview Preview/0.5", "skype"],
      ["Embedly/0.2", "embed"],
    ];

    for (const [ua, platform] of cases) {
      expect(classifyUserAgent(ua)).toEqual({ isBot: true, platform });
    }
  });

  test("flags crawlers and scripting clients as bots with no platform", () => {
    const bots = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
      "Mozilla/5.0 (compatible; GPTBot/1.0)",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Go-http-client/2.0",
      "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0",
    ];

    for (const ua of bots) {
      expect(classifyUserAgent(ua)).toEqual({ isBot: true, platform: null });
    }
  });

  test("treats a missing or empty User-Agent as a bot", () => {
    expect(classifyUserAgent(null).isBot).toBe(true);
    expect(classifyUserAgent(undefined).isBot).toBe(true);
    expect(classifyUserAgent("").isBot).toBe(true);
  });
});
