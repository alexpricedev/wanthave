import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./seo";

// Builds the /llms.txt body — the emerging convention that gives LLMs and AI
// agents a short, curated markdown index of the site. Unlike the sitemap (an
// exhaustive machine list of URLs), this is a hand-written summary with a
// one-line description per page. It controls nothing; it is purely a hint.
//
// The page list is kept in sync with the public routes by a drift test in
// llms-txt.test.ts, so a new public page can't silently go unlisted.

interface LlmsPage {
  path: string;
  title: string;
  description: string;
}

const PAGES: LlmsPage[] = [
  {
    path: "/",
    title: "Home",
    description:
      "Landing page for WantHave — build a Pokémon TCG Pocket trade list and share it as a link.",
  },
  {
    path: "/forms",
    title: "Forms",
    description:
      "Server-rendered form handling with validation, CSRF protection, and progressive enhancement.",
  },
  {
    path: "/projects",
    title: "Projects",
    description:
      "A CRUD example backed by a shared service layer, exposed as both HTML pages and a JSON API.",
  },
];

const RESOURCES: LlmsPage[] = [
  {
    path: "/sitemap.xml",
    title: "Sitemap",
    description: "XML sitemap of every public page.",
  },
  {
    path: "/.well-known/security.txt",
    title: "Security policy",
    description: "How to report a security vulnerability (RFC 9116).",
  },
];

const absolute = (path: string): string => new URL(path, SITE_URL).href;

const linkLine = ({ path, title, description }: LlmsPage): string =>
  `- [${title}](${absolute(path)}): ${description}`;

export const buildLlmsTxt = (): string =>
  [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "WantHave lets Pokémon TCG Pocket players build a trade list — wants and haves — without an account, and share it as a link. Posted in Discord, the link unfurls with an OG image showing the cards they're looking for.",
    "",
    "## Pages",
    "",
    ...PAGES.map(linkLine),
    "",
    "## Resources",
    "",
    ...RESOURCES.map(linkLine),
    "",
  ].join("\n");
