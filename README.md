# 🌸 Seiza

Seiza is a small 3D world that people can walk around in together from a web
browser. It runs entirely on your own Cloudflare account, not on a server
that someone else operates.

<p align="center">
  <img src="docs/media/hero.gif" width="720" alt="In Seiza's hall, a pink-haired, fan-made VRM avatar waves and then bows on the tatami, while two designer avatars kneel in seiza and doze, one of them bowing from seiza, and two more clap and cheer behind them.">
</p>

Pick a name and an avatar, open the link, and you are in a room with everyone
else who opened it. Nothing to install, and no headset needed (though it
works with one).

Seiza is a self-hosted complement to hosted spaces such as FrameVR, not a
replacement. It is smaller and plainer. In return, you get a room that nobody
else can shut down, re-price, or take your data out of.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yesiamalex/Seiza)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)

[![Support Seiza on Ko-fi][badge-kofi]](https://ko-fi.com/seizadeveloper)
[![Sponsor on GitHub][badge-github]](https://github.com/sponsors/yesiamalex)
[![Send with GCash][badge-gcash]](DONATE.md#in-the-philippines)
[![Send with BPI InstaPay][badge-bpi]](DONATE.md#in-the-philippines)

For the full guide, see [DOCS.md](DOCS.md).

## 🏯 What you can do in a room

- **Walk around** a hall, a classroom, and a garden, and sit on the chairs and
  benches.
- **Talk.** Voices get quieter with distance, so two small conversations can
  happen in one room.
- **Use your camera or share your screen** onto one of the wall screens, for
  example to show slides.
- **Write on the notice boards**, hang pictures, and put up signs. Anyone in
  the room can do this.
- **Wave, bow, clap, raise your hand, kneel, or crouch.** Your avatar's face
  changes to match. If you kneel in seiza for a minute, your avatar nods off,
  and then its legs fall asleep. You can turn this off in the Avatar menu for
  meetings.
- **Chat by text** if you prefer not to talk.
- **Rearrange the room** in Edit Mode, including replacing the whole
  environment with your own 3D model. Your changes stay for the next person
  who joins.
- **Choose your look.** Build an avatar in the designer, pick a preset, or
  upload your own VRM file.

<table>
  <tr>
    <td width="50%"><img src="docs/media/classroom.jpg" alt="The classroom from the back: students seated at desks, one raising a hand, the teacher at the chalkboard, and a presentation screen on the wall."></td>
    <td width="50%"><img src="docs/media/garden.jpg" alt="The garden at dusk: an avatar wades in the pond among koi and lily pads, another sits on a bench, and a third stands by the water."></td>
  </tr>
  <tr>
    <td align="center"><sub>A class in the classroom</sub></td>
    <td align="center"><sub>Wading in the garden pond</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/media/designer.jpg" alt="The avatar designer: a preview of a designed avatar with a happy expression, next to controls for presets, skin, body shape, and hair."></td>
    <td width="50%"><img src="docs/media/uploaded-vrm.jpg" alt="A detailed anime-style VRM avatar with long pink hair waves on the tatami in the hall, while two designer avatars kneel in seiza and doze behind her."></td>
  </tr>
  <tr>
    <td align="center"><sub>Design your own avatar in the browser</sub></td>
    <td align="center"><sub>Or bring a full VRM, like this fan-made model<sup>*</sup></sub></td>
  </tr>
</table>

The same link works on a phone, a laptop, or a VR headset. In a headset, your
avatar follows your head and hands, and turning your left palm toward you
opens a menu for voice and gestures.

## 🔒 Why run it yourself

Hosted worlds keep closing. Mozilla Hubs shut down in 2024, Ready Player Me
in January 2026, and Spatial.io retired its free 3D worlds in July 2026. None
of those closures had to do with whether people still used them.

You, your school, or your club set up Seiza on your own Cloudflare account.
Everything placed in a room, and everyone in it, lives on that account. The
Seiza project does not run a server, so there is nothing in the middle.

## 💸 What it costs

For a class-sized room, it is usually free. Seiza fits in Cloudflare's free
tiers, and audio and video travel directly between browsers instead of
through your server.

The one thing that can cost money is a TURN relay. It is only needed when two
people's networks can't connect directly, and it is off until you turn it on.
Cloudflare includes 1,000 GB per month before charging. See
[Voice and video across networks](DOCS.md#voice-and-video-across-networks).

The free plan covers about 7 hours a day of a full 16-person room. If you
outgrow it, Cloudflare's $5-a-month plan covers about 1,100 person-hours a
month, and every extra dollar about 7,400 more. See [Cost](DOCS.md#cost) for
the tables.

## 🚀 Run your own

You don't need to write code, but you do need to run a few commands.

```bash
npm install
npm run worker:deploy   # builds and deploys everything to your account
```

This deploys one Worker that serves the site, the upload API, and the
real-time room server. The **Deploy to Cloudflare** button does the same
thing, after first copying the repository into your GitHub account.

- Full setup, configuration, and world customization: [DOCS.md](DOCS.md)
- Hosting somewhere other than Cloudflare: [SELF-HOSTING.md](SELF-HOSTING.md)

## 🛡️ Who controls a room

Anyone who joins can walk, talk, present, and write on boards. You can put
room editing behind a password. If you set an **admin key**, whoever has it
gets a participant list and can mute, remove, teleport to, or gather
everyone. This is designed for a teacher running a class. See
[ADMIN.md](ADMIN.md).

Two limits apply:

- Voice goes directly between browsers, so "mute" is a request that the other
  browser follows. The server can't force it.
- There are no user accounts, so removing someone ends their session but
  doesn't stop them from rejoining.

## 🚧 Known limitations

Seiza works, but it isn't production-hardened yet.

- Voice is a peer-to-peer mesh, so it suits rooms of about 12 people, not
  large events.
- Nothing has been load-tested with a full room.
- "Admin" and "editor" are shared passwords, not individual logins.
- There is no drawing whiteboard, no chat history, and no physics for placed
  objects.
- VR support is new and hasn't been tested on a real headset yet.

For the complete list, including what each limit means for safety and
moderation, see [Known limitations](DOCS.md#known-limitations) in DOCS.md.

## 📚 Documentation

| Document | Contents |
|---|---|
| [DOCS.md](DOCS.md) | Deployment, configuration, world customization, how it works, and known limitations |
| [ADMIN.md](ADMIN.md) | Moderation: admin keys, room passwords, and what a host can and can't do |
| [SELF-HOSTING.md](SELF-HOSTING.md) | Running Seiza somewhere other than Cloudflare |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, the CLA, and the documentation style guide |
| [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md) | Asset licenses, including uploaded avatars |

## 🤝 Support and services

Seiza is free and open source. If it's useful to you, you can support its
development through [Ko-fi](https://ko-fi.com/seizadeveloper), GitHub
Sponsors, or, in the Philippines, GCash or BPI. See [DONATE.md](DONATE.md).

[![Support Seiza on Ko-fi][badge-kofi]](https://ko-fi.com/seizadeveloper)
[![Sponsor on GitHub][badge-github]](https://github.com/sponsors/yesiamalex)
[![Send with GCash][badge-gcash]](DONATE.md#in-the-philippines)
[![Send with BPI InstaPay][badge-bpi]](DONATE.md#in-the-philippines)

If your school or organization would like its own deployment set up,
customized (a different world, branding, or features), or maintained, without
working with the code yourselves, this is available as a paid service. Email
**seizadeveloper@gmail.com** to discuss what you need.

This is separate from licensing. Running Seiza under the AGPL is free and
needs no permission; [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) only
matters if you want to use it in a closed-source product.

## ⚖️ License

Seiza is dual-licensed:

- **AGPL-3.0-or-later** ([LICENSE](LICENSE)) for open and self-hosted use.
- A **commercial license** ([COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md))
  for proprietary use.

3D assets are licensed separately. See
[THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md).

The avatars in the GIF and screenshots were made with Seiza's built-in designer,
plus the CC0 VRoid Studio sample "Sendagaya Shino" (pixiv Inc.) and the
fan-made model credited below.

<sup>*</sup> The pink-haired avatar is "Hitori 'Bocchi' Gotoh", a fan-made VRM by
[@wawari_w](https://hub.vroid.com/en/users/42324143), of the character from *Bocchi the
Rock!* (© Aki Hamaji / Houbunsha / Aniplex). It appears only in the GIF at
the top and in this screenshot, from the maintainer's own copy, to show how an uploaded,
artist-made VRM looks in Seiza. The model is **not** included in this
repository or in any deployment, and its license doesn't allow
redistribution or corporate commercial use. Seiza isn't affiliated with or
endorsed by the model's author or the rights holders.

<!-- Support buttons (shields.io). The GCash and BPI logos are embedded as
     images, since shields.io has no built-in icon for either. -->
[badge-kofi]: https://img.shields.io/badge/Ko--fi-Support_Seiza-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white
[badge-github]: https://img.shields.io/badge/GitHub-Sponsor-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white
[badge-gcash]: https://img.shields.io/badge/GCash-Send-007DFE?style=for-the-badge&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAL00lEQVR4nO2ba6xdRRXH%2F3PuvYWWgryDPCyolYKlFtEgmCIKJOKzggRDDCLvGIMQ0Fi%2BGCCIohAIGnkUjRBNREzA%2BgJpw6MQQUEsQaoo0NtQG5Aij9L29p7z88PMOnvtOXMeF3pvY2QlO3ufs9esWa9Zs2bNbOlN%2BP%2BGMNkdAKHQDyEEJrvvQWCLKgBoJJpGlxBCswvukMeT1NoaSnnDCkgWbkhSSVhgJ0kzFYW0%2FjaFEJ4r4A5ripXxuhWQBB8KIYy7%2F%2FaUNC9dSJov6WhJO7r%2BkLRB0t2Slqf%2Fnpa0LISwztEaltScbEVMWAG54MCukj4p6TBJJ6gSdqKwVtItikpZEkLYmOhPiSIGgjRu7Xln4CzgSerQBDa7q9XlGnc44xmNh4DzgX1df42tIrRjYDjdtwPOAVY6hk2YVvrdTcBWhj%2BetcmVMQp8AZiZ%2Bh7qzeXkCB5M%2B8AC4F7H4OZkcS90bs1BwLymlf02eAw4aDKU0DMGEMe7QggAX5d0WXo1rhj5G0pRW5JnbLOkRyUtkbRJ0lOSVib8lqTDFWPFhyQdI2nEtW06WqTfw5LGJJ0YQrgNaIQQWhOWdiIANJL1pwGXOst4C%2FvnJnAbcBJu7A7QzyzgM8AVwEuZN%2Fl%2BbIh8IvE1kCck3AYTiSG%2BEfDNxMQmOsc4iekLgXkFGsPASLrb85D9LvS7L3CB68cPC%2Bv%2F1oTb0b4kR6%2FfvYQPidHrXefe0gbXALMLQvurQ%2FMZXodCgPcA17l%2BfHBcNIgCTFhgBjAXOLCvIhJjI8RIf53rPBf%2BNeAk126Y6C1DJeKJ5ruSYCOF99a2kSniZGBN6rMF%2FB6YmfC6WpPKg99KnFINrrL%2BujW0qe7c1GAsswLE6W%2BOY9xiRXB05gGfBs4EfgesovKiVcB9wOXAQuCdrt0Q2ZgF9gBOBQ4kjftewmdyXOvkMA86wxReskIADgHWUp%2FirPFKYG%2BzqjHtaBxCDIR%2BmPSDDcANwAJvwZx2%2Fq7Xf04BN1LPOZrA6mI7qrG4IhPahPHCWwdmpZ2BH2WCjburSZUB2kxSygC%2FD2yXKcHiRYfb%2B%2F8STsj4uznRNe8dBzYCx3m8tqaJ05FvYNF%2BDDggwx12bdZm%2BKWMcJzuGaBPoJYx4Dj3xispBjg08dakPnP9pW1AqjG3F%2FBXZyVcg5Mzoael%2B%2BnOet6a%2BTzeDcw7DCxOHFcSLBeeOORuAv5OzD9mkA0f4NZE0%2BKZ5RMHGDEbyxcnBO8uAIsz4Y3wt9L7ZiZEnsAsAa4iBryFxHXEUuJMYmBrBmPyo90UQDXsdgNezhR6lRsONqt8irpRTb5FbfcBtgF%2BRd2FW4nJ2VR5gXW%2B0AlvruyJPw2cAszt4cKzgS8Dj2RCLAV2oMsQoDLERQl%2Fo1Pg48D2uJkpXY85fv1QC0bUXHnc3ZvA%2BU5JNuW9nSpD85a358uB3bLxaBaxQOvH7wzgNGIGeDLV8CqOfyoPPJV67DDlX%2Bi9ID0vdjhmsH8DuxvRK6jGhrfo7lQxwohZgpSPKYCLvKXokX%2BTJT3Zu77Bj5hcPe%2BUb7z%2FtKCAD9M5G20GDjZGHkyETKMt4GFiRmgWDMDRdEZxE%2F5rjrGBFx50ps9983WqhOkXjgfzwGeo4pr3tL85ZZnXXG7jOV%2FXAxzhOrNx510J1%2BYyJ%2FxUlNrNsvOJMSCftU5J731ucL%2Fj2fAfbkg6VnG9bTW3IGm9pGdcn01gv4Rra%2F9Wwn1K0ndSR1NVu7NawJOJV6tLWN8HOlybSe5zbc1D39uQNCf9CI7w0yGEUaOQhJotac8MN0halKq5w4MUKXAzygSuIdyUmAo0Q5I2Snoo%2Fd1UVeB5d%2BG%2FYk4xrFi9yWGDe24kQkeoqv6ERHCjpEfM%2BoMIn5TZF7dPe0lxHwIYcygm7DvSe6CNvr5EM1eAucfy1KEfGr4DEt4zklalznpan1TGAnaRdKmkAzKaXZtKelXSlSGEpUbHvX%2B50MYrxXDvSfdagB7uwsjaAoGDHZ4p6pYQwuakqHF1AReIpkv6taRDu%2BH2gI8BZ0i6kfq22jJJn89wS0p9UVExtam3IWmWa2Taud94V%2BUB2xeI%2F3NA5oeS1T6iKPyY4jAY9NqU6BxfCLL9ptyWJIUQHpW0RlVhtmdjP0YteJgLtQrvJgr9ZopGou0v21LLoavnJTDv20vSDolO24gNpTGsurXnqBO2Kfw3o0%2FnBk1icrRM0oOJVi6gv0ou7D3Uw459%2BjZa%2B0vaWZkChiU9oTgMvALmZ42luuWNkbOAG1SeSSoOYjQOIYQNwMclfVHSkYoWyZlF0vskTc%2BZVd1z7PmoXn076DoL%2BCKlCXZ4Ynicqog5onqyhKJW95C0uhCda2DvQggvSPpuuooAHCPpzsKrkheWhkBp5tqn8E4N1RVgsK0LNnb%2Fk6rDDzYTTJP0uYQ7UP5PlfuXkqGRFOFtjyGPFUu9UGn2mV7oxstkCvhgkSbV6s4vcP5FPNjg8%2B5ZxPpAvsv7CrE4MbHdlwxcxrd9yu8tb6%2F1Y7jpvi3wQsL1Vag7HU1bGF2S3vkyPw1Jv1V0I7Msim49zzE3FEJYJemmhGMpZkvx9MfZycXfyBb2UDphcqyiZxk962t5COH5LAc4TNJ2qsenMUnXpGefoR7k%2FjP8R%2Foth7elvhx%2BP7EO4OsGpvWvJGVNaEWY6JqVFib6zYz%2Bq8AHEk57Awa4w1nVVnhPetqujZ1jqC%2BHE0K3gsh%2BVAURWxJb7bBUEDkzZ7KP4O2iCXEjxR%2BowNH9ScJp00zGsWq0L4jc4oxmtOdmtFvEYTbfmMlLYoZ8cXpvHtAA9gT%2BkeGbVl8DziOVtZwy8v3CoUwRl1GvRRrNJvAicd1f2zoDFjnBPS%2FnOJ7NU651OEb%2FNWBvY3AbYnHS6nzGyDri%2Flp7WZqIH0EsYef1fYMVwPFeEQUP2CUp6zHXLj8tAlVxI9%2BP%2BEZ6v4GqMLqC%2BoEOu5eG%2BB%2BBab4sfl5CyjV6dxcGLkjvfYUl3w8YJZbFbwR%2B6K6fUdXzrC8vvA2va1NfI05xVvHdn3pRFuDqgvWPBNbTWTU6y7tgA9iJuDHSzJCbwNGZ8HY%2F3iksP%2BLiPaIb5Bsjfoo61%2FeVeY9Z9jSichcD3yZtjKTLeLze0TaeXsJVrktW9QGuRSwhz808we4LgecyoUr7gPmVb42ZItZTjeNeVeV%2BATYQq9prHD9m%2FT900Ce6zXTg9swaxtha0lY2nZ4wC%2FgN9e10C1AmnL%2B6bY7eDhzs%2BGlbk7IntA9XQHFz9OqCLJtJO9H4nScqiy4gBpbS9vgTdNkhTs%2BHAL%2Bkys4Ggf%2BkNgsKvNQ8gD4bpt6Y6f5j6h7YBFZ4L%2BnQaLqf7TSWJzwrgX0S3gjZxkn6f0fgROL4vINYqx8lHo4YBe5J775EPGnqBbQg1%2FYy4ATgs%2F0ELyjgB4nnMSfHVz39Xo3tZFgp61sDLPSKKynC00zKGqH3EZna6S9i5umnyUuICdAgSVYgTuF3pbYbifuf0%2Fp6EdXU%2BL0eSmgSXWzvTFB%2FXmiQQ1JtXPf%2BLcCVxIBo%2FdvWeXvvr48MfldoLnFfYzBwDA4Rj6%2FkbuSnuHXEKWjXjIYpYKTL1aEc4nmgK6gORpmiff83D6IAJ4dXxOC7Vr6xU4L3gDzpeRb4OXFbfOYE%2Bhkh5hM3EWOFgfc6C2CbqBZFA9cj6bFUH%2BSobEj1%2FHMUj8rOUFxi2tchpaOyo5L%2BLOmBHuQbilXitylWlgzGVdUFrUxnzJ8RQlhMXJ6%2Frs2VCQMuMBGD0vLMG7bEYWl%2FmAo6j%2BTeCxyVeJj6E%2BN5x8SDDM8WhMgFKGWA%2FiqdIPOp8TrgdNfvVv9mwB9Lm0mM1KM9LOrTYn813fu8BgGwmrhgshLYwIejpwSoT1kjxOzxAWKi83phLXFJXltGT7bgb%2FSjqeBL4cTov6%2FiNwDHKQbHOZJ2kmo1%2FsclvaIY8JZIukvSmlQy9%2FRV2ArborClPpsLUvljSAqfzYUQVud4jlZD%2FwufzZXAKcOmsK7b5i6g2WblVvmadCrO85hCqk4n%2B3OXN%2BFNGBj%2BCy2wuKmjeQgzAAAAAElFTkSuQmCC
[badge-bpi]: https://img.shields.io/badge/BPI-InstaPay-D71920?style=for-the-badge&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAF0ElEQVR4nO2aTYgcRRTHf29mdheNKBhdPZj4lYtBIgZEvHhQkAT1JkRBCIoIgqIiKAiKehA9hIiSk1%2BEaDx4ihhyyMEv8CNEWI0aUA%2BJG9eYYNBEYtyZ6b%2BHqtqp7eme7pmdSCD1h6J7q7ve%2F%2FWrV%2B%2B9qllISEhISEhISEhISEhISDjrYJImRhwroLsgyEy1BkktwEbkxHOqLucY%2BOpB0oSkpqTTT9bjbC2VzyQ9NywvzqKHgB1AAzgSz4akppl1%2BwY6ZR8Hzo%2FkDIv3gSPAH2aWebktM%2BvkucxMkh4CLinjM0m1XLcEJ3EG%2BBr4BtgFfGVmRyU1goKRUg3gOLBsCZwdoA3MAB8DW8zs1%2FDBEVcwwEFgZZkwkzQ%2FoiINoFnQfwS438x2%2Bg9WUMz%2F%2FTNwGZB5GcMiH7P%2BBF43sydjvsgAe4E1pXwajEzSvKR2wTWLWjfqC9js5TcjroakX%2FzzbglnJ%2BLI8wWdYs6AbYFPkoXYIGlmEF%2FVDJi3eKvgariIbN6yoS%2FDueljkm4ys25shBpoRhx5vrCkYk4B88C9krb62FPbs8piQAgYR4Ht8fv%2B2XLgHoqXAJGih4BVQMe7YwM4AKyg3yUzL38X8FPEBXAecDflsUM4o08At5nZbvnAKGkGuK6Az48sRnCXvSWESFoj6W3vonn3Cu76u6TJaEzZEuj6MYcG8F0o6WlJx%2BSWSR7%2FejnP%2BPen%2FHVJS2BCLr9P%2BmtoTTP71szuA2a9ZbOC8X2pcAAM6Mqt4Ylca5nZMTN7EZdGm7gZj9H0etwsV%2Fy065C2Kp7LzNrKpRhYiOgNem46Dljg7FOkN1m7gcP05%2Fbw%2FAagZWan6hCOkoZ62rrio2jm8f1VBh6GK%2FNtDviLxTEixsmS%2FkJUKRj2Cvlg2TGzTNJy4AJ6ASxgHpgC3gXaKqjURoH3AtXQuzaqBLVL3LElaRXwPDCNW%2BtBuTbu4z8HXmBx%2BqqCAS1v7IzeTDbwbi3pTuByXAwo0v9chiixywwQBKyQ9FLUH4LdrbjqatIr2aS3HieBL4B1ZnZCBSXxAHTNrKgyzYCOpNXAlogv%2F04D%2BAzndYX7kTyqDDANPDVIYXq1gAFzwFvApiE%2FPvBdJOlNf%2F%2Bel3cO8KDnuR24lOKcHnTZ4YuvSepkoaLcGCGUwvnWUa8klaQTkjZJujqS23fOoHqlcBWygr55f90lnzY15lI43%2FJ5eBnwCPCBpO2S1ob0WTkD%2Fej4FmKAor78ljbEnAlc1fpENLYWqgwQk8cNTxpSUTDUalyJ%2FKWkh2Fh1ocxRKgvAr%2BivhAcu16PwDsL3GJmPwDDxJxSAwQB%2B3ER9wp%2FvdJf1wIvA7%2BxOMoH5VrAa8BWr8ww9UajRmt6jlncrF9rZt%2FJxZxhqs%2FSzVBQesbMri8bLOkaYCfOKEbPPcMObQq40cz2RMvtAMWbIXDGmxugb6g39uE2TdvM7LjXZdHMq3ceMMOAzVCdQqhBcdU1ZWb7Jb0KbKa3FqG3XRVwB7CnREb8YQ3cx19FxRrOfWgLlz5ru32MStf0grOoFM1837w3zkHcbOdlNXEfvcHLqeua3TxXvskdeLT8LHfqnkgXYSklpfl8e4rq2R1K7gBZgTgE5yVj1L0AUYm8Aef6ZQoNcxr0v2OkvQAsHDjcBWykvC4X8PeSNDzNqCqFV0p6peCZgPW4tFi27e3iPOMdWDgcHefZwVhQZYCLgUdHkBt2h7PAh74Qym%2BZzwhUngjRq7jC7MUnMJZ7FsrXIHe9mf0ovzMbsTQ%2Brah7dqaC%2B5DWwllcuAc38xvN7PuC6iz8shMXJuF%2BLJE9h7BfKC2ERv11OMY%2F%2FvoR8Anwhpkd83k6nwanB3BOj0GXPMIGrhAt3KnOKAiboH3Ap0DTzA4vPCw%2BkBDwLP0%2Fjob744wvUIal%2BQCwLse36KWxwa%2FxJq6aO%2BMifhGW8g8SAZlv4%2FiHBY3j8DTHV%2FYjbkJCQkJCQkJCQkJCQkLC2Yr%2FADSp%2Bo2cYXhdAAAAAElFTkSuQmCC
