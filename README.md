# WantHave

Build a Pokémon TCG Pocket trade list and share it as a link — posted in Discord, it unfurls with an OG image showing the cards you're looking for. See [PRD.md](PRD.md) for the full spec.

---

## What's Included

Auth, security, database, testing, linting — these are the rails. They're solved so you can focus on your custom logic instead of tech choices and security fundamentals.

### Authentication

A complete magic-link email auth flow: users enter their email, receive a login link, and get a session. No passwords to store, hash, or reset.

- **Magic-link login** with HMAC-protected tokens and expiry
- **Session management** with 30-day sessions, automatic renewal, and secure cookie handling (HttpOnly, Secure, SameSite)
- **Guest sessions** that auto-create for unauthenticated visitors — useful for carts, preferences, or any state you want before login
- **Admin middleware** with role-based route protection and a dedicated `/admin` route namespace
- **Pluggable email providers** — ships with a console provider for development; add Resend or any custom provider via a simple interface

### Security

- **CSRF protection** using the synchronizer token pattern with timing-safe comparison and origin validation
- **Rate limiting** middleware with configurable sliding-window limits per IP
- **Session fixation prevention** — sessions are regenerated on login
- **Environment validation** at startup — the server fails fast with clear error messages if required variables are missing
- **Response hardening** — security headers on every response (nosniff, frame/clickjacking protection, an enforcing Content Security Policy, Permissions-Policy, HSTS in production), plus `/.well-known/security.txt` and Subresource Integrity on third-party scripts — see [runbooks/SECURITY.md](runbooks/SECURITY.md)

### Database

PostgreSQL through Bun's built-in `Bun.SQL` — no ORM, no driver dependency.

- **Auto-migrations on startup** — pending migrations run before the server accepts requests; if one fails, the server won't start
- **Migration CLI** for manual operations (`migrate:up`, `migrate:status`, `migrate:create`)
- **Seed script** scaffold for development data (`bun run seed`)
- **Parameterised queries** throughout — no string concatenation, no SQL injection surface

### Testing

- **220+ tests across 28 files** covering controllers, services, middleware, utilities, and client scripts
- **No browser simulation needed** — server-rendered templates are pure functions of props, testable with `renderToString()` and string assertions
- **Real database testing** for services — tests run against PostgreSQL with table truncation for isolation
- **Mock-based controller tests** that verify HTTP responses (status codes, headers, HTML content) without touching the database
- **Client script tests** using happy-dom for DOM globals, with page lifecycle isolation

Run the full suite: `bun run test`

### Code Quality

- **Biome** linting with zero-warning enforcement (`--max-warnings 0`) — no `any` types, no `console` statements, no unused variables
- **TypeScript** strict mode with `noUnusedLocals` and `noUnusedParameters`
- **Husky** pre-commit hooks that run lint and typecheck before every commit
- **GitHub Actions CI** — lint, build, and the full test suite run on every PR (`.github/workflows/ci.yml`); gate merges behind them with required status checks (see [runbooks/CI.md](runbooks/CI.md))
- **Structured logging** via `src/server/services/logger.ts` — replaces `console.*` with levelled output (info, warn, error)

### Frontend

- **React JSX as a template engine** — server-side only, no client-side React, no virtual DOM, no hydration
- **Bun CSS bundler** with `@import` resolution, CSS nesting, and minification — no external CSS tooling needed
- **Opt-in interactivity** — sprinkle in any client-side framework per page (ships with a Preact island example loaded via CDN import map)
- **Page lifecycle system** — `registerPage()` / `PageController` pattern with `init()` and `cleanup()` for per-page JS
- **Cookie-based flash messages** — HMAC-signed, single-use cookies for post-redirect-get feedback (success banners, validation errors)
- **Accessibility baseline** — semantic landmarks, labelled form controls, a keyboard focus ring, reduced-motion support, announced flash messages, and captioned data tables out of the box — see [runbooks/ACCESSIBILITY.md](runbooks/ACCESSIBILITY.md)
- **Privacy-clean by default** — no analytics, no trackers, no third-party cookies; only strictly-necessary first-party cookies, so no consent banner is legally required until you add tracking — see [runbooks/PRIVACY.md](runbooks/PRIVACY.md) for the consent-banner and privacy-policy pattern
- **Asset cache-busting** in production — MD5-hashed filenames with immutable `Cache-Control` headers

---

## Quick Start

You'll need [Bun](https://bun.sh) and a local [PostgreSQL](https://www.postgresql.org/) instance running.

```bash
bun install
bun run dev
```

Visit [http://localhost:3000](http://localhost:3000) — migrations run automatically on startup.

---

## Project Structure

```
src/
├── client/                     # Browser-side code
│   ├── main.ts                 # Entry point — routes to page controllers
│   ├── page-lifecycle.ts       # Page init/cleanup system
│   ├── style.css               # Global styles (CSS entry point)
│   ├── components/             # Shared CSS (nav, layout)
│   └── pages/                  # Page-specific JS + CSS (co-located)
│
├── server/                     # Server-side code
│   ├── main.ts                 # Server entry point
│   ├── routes/
│   │   ├── app.tsx             # View routes (HTML)
│   │   ├── api.ts               # API routes (JSON)
│   │   └── admin.tsx           # Admin routes (protected)
│   ├── controllers/            # Route handlers
│   │   ├── app/                # View controllers — return HTML
│   │   ├── api/                # API controllers — return JSON
│   │   └── auth/               # Auth controllers — login/logout
│   ├── templates/               # Full-page JSX templates
│   ├── components/             # Reusable server JSX components
│   ├── services/                # Business logic & data access
│   ├── middleware/              # Auth, CSRF, rate limiting, admin
│   ├── utils/                   # Response helpers, crypto, env validation
│   └── database/
│       ├── cli.ts / migrate.ts  # Migration tooling
│       ├── seed.ts              # Development seed data
│       └── migrations/          # Numbered migration files
│
└── types/                       # Global TypeScript declarations
```

---

## Contributing

Contributions are welcome! Please open issues or PRs.

---

## Deploy

WantHave is a single Bun process — no containers, no serverless adapters, no platform-specific runtime. Anywhere you can run `bun run start`, it'll work: Railway, Fly.io, Render, a VPS, or your own machine.

### Railway

A `railway.json` is included with build and start commands pre-configured. Deployments typically go live in under 60 seconds.

1. Push to GitHub
2. Create a new [Railway](https://railway.com?referralCode=XB1wns) project and connect your repo
3. Add a **PostgreSQL** plugin and link it to your service — this auto-sets `DATABASE_URL`
4. Set the remaining environment variables (see below)
5. Deploy — Railway will build, run migrations, and start the server

> **Tip:** If you're using Claude Code with the [Railway MCP server](https://docs.railway.com/guides/mcp), you can ask Claude to set up the project, add PostgreSQL, and configure environment variables for you.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string — auto-set when you link Railway's PostgreSQL plugin to your service |
| `CRYPTO_PEPPER` | Yes | Secret key for session tokens — run `bun run generate:pepper` to get one (see below) |
| `APP_URL` | Yes | Your app's public URL — you'll get this from Railway after your first deploy (e.g. `https://my-app.up.railway.app`) |
| `PORT` | No | Server port — auto-set by Railway, defaults to `3000` locally |

> **Generating `CRYPTO_PEPPER`:** This is a secret key used to secure session tokens. Run `bun run generate:pepper` to get a value. Use a different value for each environment (development, production, etc).

> **Email deliverability:** When sending real mail via Resend, follow [runbooks/EMAIL.md](runbooks/EMAIL.md) to set up SPF, DKIM, and DMARC — without it, magic links land in spam.

> **SEO:** Before your first deploy, set `SITE_URL` (and the `Sitemap:` line in `public/robots.txt`) to your production domain — see [runbooks/SEO.md](runbooks/SEO.md) for the canonical-URL config, sitemap, indexing policy, and verification steps.

> **Security:** The HTTP hardening (security headers, CSP, HSTS, SRI) works out of the box, but set `SECURITY_CONTACT` (the `security.txt` reporting address) and add the registrar-level records before launch — see [runbooks/SECURITY.md](runbooks/SECURITY.md) for that plus the TLS, HSTS-preload, CAA, and DNSSEC steps.

> **Privacy:** The default site needs no cookie banner (zero non-essential storage). The moment you add analytics, ads, or embeds, you must add an opt-in consent banner and a privacy policy — see [runbooks/PRIVACY.md](runbooks/PRIVACY.md) for wiring up `@alexpricedev/billet-cookie-consent`, the required policy disclosures, and GPC handling.

> **CI & merge protection:** CI runs on every PR, but check results are advisory until you require them. A fork doesn't inherit branch protection, so nothing stops an auto-merge (GitHub's or Conductor's) from merging a red build — enable required status checks once per repo. See [runbooks/CI.md](runbooks/CI.md).

### Database

WantHave uses PostgreSQL through Bun's built-in `Bun.SQL` — no ORM, no driver dependency. Migrations run automatically on server startup — pending migrations are applied before the server accepts requests. If a migration fails, the server won't start (fail-safe).

A lightweight CLI is also available for manual operations:

```bash
bun run migrate:up       # Run pending migrations
bun run migrate:status   # Show migration state
bun run migrate:create   # Create a new migration file
```

If you don't need a database, remove the `src/server/database/` and `src/server/services/` directories and strip the DB-related routes. There's no framework coupling to undo.

---

## License

This project is not currently licensed for public use. All rights reserved.
