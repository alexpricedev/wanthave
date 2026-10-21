# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for anything security-sensitive.

- Preferred: [open a private security advisory](https://github.com/alexpricedev/wanthave/security/advisories/new)
  on this repository (Security → Advisories → Report a vulnerability).
- Or email **ops@chptrs.tech** with the details.

Include what you did, what happened, and what you expected — a proof of concept
or raw HTTP request is ideal. If you need to test against a live instance, use
your own deployment or `localhost`, not the production site.

## What to expect

- An acknowledgement within a few days.
- An assessment and, where warranted, a fix on `main`; coordinated disclosure
  once a release is out.
- Credit in the advisory if you'd like it, unless you prefer to stay anonymous.

Please give us a reasonable window to ship a fix before publishing details.

## Scope

In scope: this repository's application code and its deployed instance —
authentication and session handling, CSRF, access control on lists and accounts,
the card-image proxy, OG rendering, and anything that leaks another user's data.

Out of scope:

- Vulnerabilities in dependencies — report those upstream (we'll take the
  version bump).
- Missing hardening headers or DNS records on a deployment (see
  [runbooks/SECURITY.md](runbooks/SECURITY.md) for the operator checklist).
- Rate-limit or resource-exhaustion findings that require no amplification.
- Reports about the Pokémon card data or artwork — those are third-party assets,
  see [NOTICE.md](NOTICE.md).

## Safe harbour

We won't pursue legal action for research that stays within this policy: don't
access, modify, or delete other people's data, don't run automated scans against
production, and don't publicly disclose before we've shipped a fix.
