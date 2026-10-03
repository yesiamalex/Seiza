# Seiza

A small 3D world that you and other people can walk around in together,
straight from a web browser — and that runs entirely on **your own**
Cloudflare account, not on a server anyone else operates.

Pick a name and a character, open a link, and you are standing in a room
with everyone else who opened it. No app to install, no headset needed
(though it works with one).

Seiza is a self-hosted supplement to hosted spaces like FrameVR — not a
replacement for them. It is smaller and plainer, and that is the trade:
you give up polish and get a room nobody can shut down, re-price, or
take your data out of.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yesiamalex/Seiza)

**New here? [DOCS.md](DOCS.md) is the complete guide** — this page is the
short version.

## What you can do in a room

- **Walk around** a daylit hall, a classroom, and a garden, and sit down
  properly on the chairs and benches.
- **Talk.** Voices fade with distance, the way they do in a real room, so
  two small conversations can happen in one space.
- **Turn on your camera, or share your screen** onto one of the screens on
  the wall — useful for slides.
- **Write on the notice boards**, hang pictures, and put up signs. Everyone
  can, not just whoever set the room up.
- **Wave, bow, clap, raise your hand, kneel, crouch.** Your avatar's face
  changes to match. Kneel in seiza for a minute and it nods off, then its
  legs fall asleep (switch that off in the Avatar menu for meetings).
- **Chat by text** if you would rather not talk.
- **Rearrange the place** in Edit Mode, down to swapping the whole
  environment for your own 3D model. What you place stays for the next
  person who joins.
- **Be whoever you like.** Build an avatar in the designer, pick one of the
  deployment's presets, or upload your own VRM file.

It works on a phone, a laptop, or a VR headset, from the same link. In a
headset your avatar follows your real head and hands, so people see you
wave and point, and turning your left palm toward you opens a menu for
voice and gestures.

## Why run it yourself

Hosted worlds keep closing. Mozilla Hubs shut down in 2024, Ready Player Me
in January 2026, and Spatial.io retired its free 3D worlds in July 2026 —
in each case for reasons that had nothing to do with whether people still
wanted them.

Seiza is something you, your school, or your club sets up on your own
Cloudflare account. Everything placed in a room, and everyone in it, lives
on that account. There is no Seiza server in the middle, because the
project does not run one.

## What it costs

For a class-sized room, realistically nothing. It fits inside Cloudflare's
free tiers, and the expensive part of a call — the actual audio and video —
never touches your server at all, because it travels directly between
browsers.

The one thing that can cost money is a TURN relay, needed when two people's
networks refuse to talk to each other directly. It is off until you turn it
on, and Cloudflare includes 1,000 GB a month before charging. See
[DOCS.md](DOCS.md), "Voice/video across different networks".

## Running your own

You do not need to write code, but you do need to be comfortable pasting a
few commands.

```bash
npm install
npm run worker:deploy   # builds and deploys everything to your account
```

That is one Worker serving the site, the avatar uploads, and the realtime
room server. The Deploy button above does the same thing by forking the
repo into your GitHub account first.

- Full walkthrough, configuration, and how to customise a world:
  [DOCS.md](DOCS.md)
- Running it somewhere other than Cloudflare: [SELF-HOSTING.md](SELF-HOSTING.md)

## Who is in charge of a room

Anyone who joins can walk, talk, present, and write on boards. Rearranging
the room can be put behind a password. If you set an **admin key**, whoever
holds it gets a participant list and can mute, remove, teleport to, or
gather everyone — aimed at a teacher running a class. See
[ADMIN.md](ADMIN.md).

Two honest limits: because voice goes directly between browsers, "mute" is
a request the other browser honours rather than something the server can
force, and removing someone ends their session but cannot stop them
rejoining, since there are no user accounts.

## What is rough

It is real and working, not production-hardened. The short list:

- Voice is a peer-to-peer mesh, so it suits classroom-sized rooms
  (~12 people), not large events.
- Nothing has been load-tested with a full room.
- "Admin" and "editor" are shared passwords, not individual logins.
- There is no whiteboard, no chat history, and no physics for objects you
  place.
- VR is new and has not been tried on a real headset yet.

[DOCS.md](DOCS.md)'s "Status" section has the honest, complete list,
including what each limit means for safety and moderation.

## Documentation

| Document | What's in it |
|---|---|
| [DOCS.md](DOCS.md) | Everything: deployment, configuration, world customisation, architecture, and the full status list |
| [ADMIN.md](ADMIN.md) | Moderation — admin keys, room passwords, what a host can and cannot do |
| [SELF-HOSTING.md](SELF-HOSTING.md) | Deploying somewhere other than Cloudflare |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, and the CLA |
| [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) | Asset licensing, including uploaded avatars |

## Licensing

Dual-licensed: **AGPL-3.0-or-later** ([LICENSE](LICENSE)) for open and
self-hosted use, or a **commercial license**
([COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)) for proprietary use.
3D assets are licensed separately — see
[THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md).
