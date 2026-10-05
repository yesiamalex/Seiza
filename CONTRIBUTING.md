# Contributing to Seiza

Thank you for your interest in contributing. Seiza is dual-licensed (AGPL
and commercial, see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)), which
adds one requirement that most repositories don't have: a Contributor
License Agreement.

## Contributor License Agreement (CLA)

You must sign a CLA before your pull request can be merged.

The maintainer can relicense contributions commercially, and that revenue
funds paid support and hosting for people who can't deploy Seiza
themselves. To do that, the maintainer needs clear rights to every merged
line.

Current status:

- **To do:** set up a CLA bot, such as
  [cla-assistant.io](https://cla-assistant.io) or SAP's CLA bot, so that
  first-time contributors are asked to sign on their first pull request.
- Until the bot is in place, external pull requests are not merged. A note
  in this file saying "opening a PR means you agree" is not a signed
  agreement, and relying on it would undermine what the CLA protects.

### If you don't want to sign a CLA

That's a reasonable choice. CLAs are common in dual-licensed projects (for
example, Sentry and Grafana use them), but not everyone wants to sign one.
You can always fork Seiza under the AGPL. This section is here so you know
before you start work, not after.

## Before you open a pull request

- **Open an issue first for large changes**, so that design decisions are
  agreed before review.
- **Record new assets.** If you add a gesture, avatar, model, or other 3D
  asset, add a row to [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) in the
  same pull request. Assets without a documented license are not merged.
- **Update the docs** when you change behavior that they describe.

## Documentation style guide

Seiza's documentation follows common technical-writing conventions, based on
the [Google developer documentation style guide](https://developers.google.com/style)
and the [Diátaxis](https://diataxis.fr/) framework. Please follow them when
you write or edit docs.

### Structure

- Keep each section to one purpose:
  - **How-to:** numbered steps that get a task done.
  - **Reference:** facts, usually in a table.
  - **Explanation:** why something works the way it does.
- Put the most important information first.
- Use numbered lists for steps in order, and bulleted lists for everything
  else.
- Use a table when you compare items or list options.
- Link to other sections instead of repeating them.

### Voice and tone

- Use short sentences, about 25 words or fewer, and short paragraphs.
- Be direct. Avoid filler such as "simply", "just", "basically", "honestly",
  "genuinely", or "in order to".
- State limits plainly.
- Describe how things work now. Leave the history of a change to commit
  messages and code comments.

### Formatting

- Use sentence case for headings: "Deploy your own instance", not "Deploy
  Your Own Instance".
- Use `code format` for file names, paths, commands, keys, field names, and
  values.
- Use **bold** for UI labels and for a few key terms. Don't use it for
  general emphasis.
- Use American English spelling.
