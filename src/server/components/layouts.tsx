import type React from "react";

import { getAssetUrl } from "../services/assets";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  siteStructuredData,
} from "../services/seo";
import type { User } from "../services/users";
import { Nav } from "./nav";
import { Wordmark } from "./wordmark";

// The site is dark-only (see `colorScheme: "dark"` on <html>), so theme-color
// matches --color-void from style.css rather than shipping light/dark variants.
const THEME_COLOR = "#0c0b0e";

// Self-hosted @font-face declarations (latin subset), injected inline so the
// CSS bundler leaves the absolute /fonts URLs untouched and nothing loads
// cross-origin. Forque = display, Archivo (variable) = body, IBM Plex Mono =
// utility. Keep these font-family names in sync with the --font-* tokens in
// style.css. See DESIGN.md.
const FONT_FACES = [
  "@font-face{font-family:'Forque';src:url('/Forque.ttf') format('truetype');font-display:swap}",
  "@font-face{font-family:'Archivo';font-weight:400 700;src:url('/fonts/archivo-latin-var.woff2') format('woff2');font-display:swap}",
  "@font-face{font-family:'IBM Plex Mono';font-weight:400;src:url('/fonts/ibm-plex-mono-latin-400.woff2') format('woff2');font-display:swap}",
  "@font-face{font-family:'IBM Plex Mono';font-weight:500;src:url('/fonts/ibm-plex-mono-latin-500.woff2') format('woff2');font-display:swap}",
  "@font-face{font-family:'IBM Plex Mono';font-weight:600;src:url('/fonts/ibm-plex-mono-latin-600.woff2') format('woff2');font-display:swap}",
].join("");

const canonicalUrl = (path?: string): string =>
  path ? new URL(path, SITE_URL).href : SITE_URL;

interface HeadMetaProps {
  title: string;
  description: string;
  canonicalPath?: string;
  noindex?: boolean;
}

// Shared <head> essentials for both Layout and BaseLayout, so the two can't
// drift out of sync (e.g. one missing the description or canonical tag).
function HeadMeta({
  title,
  description,
  canonicalPath,
  noindex,
}: HeadMetaProps) {
  return (
    <>
      <meta charSet="utf-8" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, viewport-fit=cover"
      />
      <title>{title}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <meta name="color-scheme" content="dark" />
      <meta name="theme-color" content={THEME_COLOR} />
      <link rel="canonical" href={canonicalUrl(canonicalPath)} />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/apple-touch-icon.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href="/favicon-32x32.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="16x16"
        href="/favicon-16x16.png"
      />
      <link rel="manifest" href="/site.webmanifest" />
      {/* All three faces are self-hosted from public/fonts (latin subset) so
          nothing is fetched cross-origin — the hardened CSP only allows
          font-src 'self'. Declared inline (not in the bundled CSS) so the CSS
          bundler doesn't try to resolve the absolute /fonts URLs. Forque is the
          display voice, Archivo the body, IBM Plex Mono the utility face. */}
      <style dangerouslySetInnerHTML={{ __html: FONT_FACES }} />
      <link rel="stylesheet" href={getAssetUrl("/assets/main.css")} />
    </>
  );
}

interface LayoutProps {
  title: string;
  name: string;
  children: React.ReactNode;
  user?: User | null;
  csrfToken?: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
  // Per-page OG/Twitter image path (made absolute against SITE_URL). Defaults to
  // the site-wide card. Public trade lists pass their own rendered OG image.
  ogImagePath?: string;
  ogImageAlt?: string;
  // When false, omits the shared header/footer chrome — used by the builder
  // view, which owns its own full-bleed layout.
  chrome?: boolean;
}

export function Layout({
  title,
  name,
  children,
  user,
  csrfToken,
  description = SITE_DESCRIPTION,
  canonicalPath,
  noindex,
  ogImagePath,
  ogImageAlt = "wanthave—build and share your Pokémon TCG Pocket trade list",
  chrome = true,
}: LayoutProps) {
  const ogImage = ogImagePath
    ? new URL(ogImagePath, SITE_URL).href
    : `${SITE_URL}/og-image.png`;
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <head>
        <HeadMeta
          title={title}
          description={description}
          canonicalPath={canonicalPath}
          noindex={noindex}
        />
        {/* Preact (via the importmap below) loads from esm.sh. Preconnect opens
            the TLS connection while the HTML parses so the first cross-origin
            fetch doesn't pay the handshake; dns-prefetch is the cheaper
            fallback for browsers that ignore preconnect. */}
        <link rel="preconnect" href="https://esm.sh" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://esm.sh" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:locale" content="en_US" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={ogImageAlt} />
        <meta property="og:url" content={canonicalUrl(canonicalPath)} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={ogImageAlt} />
        {!noindex && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: siteStructuredData() }}
          />
        )}
        <script
          type="importmap"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              imports: {
                preact: "https://esm.sh/preact@10.28.4",
                "preact/hooks": "https://esm.sh/preact@10.28.4/hooks",
                "preact/jsx-dev-runtime":
                  "https://esm.sh/preact@10.28.4/jsx-dev-runtime",
                "preact/jsx-runtime":
                  "https://esm.sh/preact@10.28.4/jsx-runtime",
              },
            }),
          }}
        />
      </head>
      <body data-page={name} data-component="layout">
        {chrome && (
          <header>
            <a href="/" className="logo">
              <Wordmark />
            </a>
            {user && <Nav page={name} user={user} csrfToken={csrfToken} />}
          </header>
        )}
        <main>{children}</main>
        {chrome && <SiteFooter />}
        <script type="module" src={getAssetUrl("/assets/main.js")} />
      </body>
    </html>
  );
}

// Shared site footer for the full Layout and the ErrorLayout.
function SiteFooter() {
  return (
    <footer>
      <Wordmark />
    </footer>
  );
}

interface ErrorLayoutProps {
  title: string;
  children: React.ReactNode;
}

// Layout for error and maintenance pages (404, 500, 503). Deliberately ships NO
// client JavaScript — no importmap, Lottie, or main bundle — so the page renders
// instantly and stays legible even when the app is degraded or offline, the
// spec's resilience baseline for error and 503 responses. Reuses the same
// header/footer chrome as `Layout` for continuity, and is always noindex so
// crawlers never treat an error body as real content. No nav — error pages have
// no session context, and the top nav is guest-hidden anyway.
export function ErrorLayout({ title, children }: ErrorLayoutProps) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <head>
        <HeadMeta title={title} description={SITE_DESCRIPTION} noindex />
      </head>
      <body data-page="error" data-component="layout">
        <header>
          <a href="/" className="logo" aria-label={SITE_NAME}>
            <Wordmark />
          </a>
        </header>
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

interface BaseLayoutProps {
  title: string;
  children: React.ReactNode;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
}

export function BaseLayout({
  title,
  children,
  description = SITE_DESCRIPTION,
  canonicalPath,
  noindex,
}: BaseLayoutProps) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <head>
        <HeadMeta
          title={title}
          description={description}
          canonicalPath={canonicalPath}
          noindex={noindex}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
