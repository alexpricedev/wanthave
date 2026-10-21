# Contributing

Thanks for taking a look. Bug reports, fixes and small improvements are all
welcome.

## Reporting bugs and suggesting features

Open an issue and include the game context where relevant (which set or card,
which platform embedded the link). For anything security-related, follow
[SECURITY.md](SECURITY.md) instead of opening an issue.

## Getting set up

You'll need [Bun](https://bun.sh) and a PostgreSQL 16+ database.

```bash
bun install
cp .env.example .env      # then fill in DATABASE_URL and a CRYPTO_PEPPER
bun run generate:pepper   # prints one to paste into .env
createdb wanthave && createdb wanthave-test
bun run dev               # client, server and CSS watchers on :3000
```

Migrations run automatically on startup, and an `admin@example.com` admin user is
seeded into an empty database. Card art needs object storage — see the card art
section of [.env.example](.env.example) and
[docs/adding-a-set.md](docs/adding-a-set.md). Without it the app still runs; cards
just render as placeholders.

## Before you open a PR

```bash
bun run check   # Biome + tsc, zero warnings allowed
bun run test    # needs the test database from .env.test
```

Both run in CI on every PR. A few conventions worth knowing:

- **Services own the logic.** Controllers fetch from `src/server/services/` and
  render; they don't query the database directly.
- **Templates are pure.** They receive fully resolved props, which is what makes
  them testable without a browser.
- **No `console.*` in server code** — use `log` from
  `src/server/services/logger.ts`.
- **Migrations are numbered** (`NNN_snake_case.ts`) and must be safe to run
  before the server accepts traffic.
- **New behaviour needs a test.** Match the existing style: mocked services for
  controllers, a real database for services, happy-dom for client scripts.

Keep PRs focused. If a change touches both a fix and a refactor, split it.

## Commit messages

Short imperative subject, then a body explaining *why* when it isn't obvious:

```
Confirm before deleting a list

Anonymous lists are immutable and can't be recovered once deleted, so a
mis-tap in the list index permanently loses the link.
```

## Licence

Contributions are accepted under the [MIT licence](LICENSE) — inbound equals
outbound. By opening a PR you confirm you have the right to submit the work.

## Code of conduct

Participation is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
