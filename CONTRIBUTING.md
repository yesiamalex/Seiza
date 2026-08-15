# Contributing to Seiza

Thanks for considering it. A couple of things that matter more here than
in a typical repo, because of the dual-license (AGPL + commercial —
see `COMMERCIAL-LICENSE.md`):

## Contributor License Agreement (CLA) — required before merge

Because contributions may be relicensed commercially (that's what funds
paid support/hosting for people who can't self-deploy), the maintainer
needs clean, unambiguous rights to every line merged. That means:

- **TODO: wire up a CLA bot** (e.g. [cla-assistant.io](https://cla-assistant.io)
  or SAP's CLA bot) so first-time contributors get an explicit,
  affirmative sign-off prompt on their first PR, before merge is possible.
- Until that bot is set up, **do not merge external PRs** — an implied
  "PRing means you agree" note in this file is not a substitute for an
  actual signed agreement, and relying on it would undermine the exact
  thing the CLA is supposed to protect.

## Be upfront about this tradeoff

CLAs are a legitimate and common practice for dual-licensed projects
(Sentry, Grafana, and many others use one), but some contributors
reasonably don't want to sign one. That's a fair position — no hard
feelings, and forks are always possible under the AGPL. Better that
tradeoff is visible here than discovered after someone's already put
work in.

## Everything else

- Open an issue before a large PR, so design direction (see the paper
  draft's Sections 3–4) doesn't get relitigated in review.
- Adding a new gesture or 3D asset? Update `THIRD_PARTY_ASSETS.md` in the
  same PR — assets without a documented license won't be merged.
