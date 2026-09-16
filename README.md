# ☀ SolarFren X AutoFollower

A Tampermonkey userscript that automatically discovers and follows people posting founder, builder, indie-hacker and networking introductions on X.

## Repository files

- `src/xautofollow.user.js` — readable userscript source
- `dist/xautofollow.user.js` — compact Tampermonkey install build
- `build.cjs` — preserves the userscript metadata and minifies the code with Terser
- `package.json` / `package-lock.json` — build commands and locked dependencies
- `LICENSE` — MIT license
- `index.html` — standalone GitHub Pages landing page; no build required
- `assets/` — actual product screenshots and social preview image

To rebuild after editing the source:

```bash
npm ci
npm run build
npm run check
```

## Features

- Detects founder / builder / entrepreneur introduction posts
- Detects age-style introductions such as `I'm 24` and `I am 31`
- Detects phrases such as:
  - `Looking to connect`
  - `Happy to connect`
  - `Let's connect`
  - `Would love to connect`
  - `Solo founder`
  - `Indie hacker`
- Handles short networking replies such as `Let's connect`
- Scores and follows people inside quoted posts too
- Automatically detects the logged-in X username
- Never tries to follow your own account
- Skips promoted posts
- Detects accounts already followed
- Retries posts when X's menu temporarily fails to load
- Works while scrolling X's dynamically loaded timeline
- Handles X SPA navigation
- Completely disables AutoFollow actions inside:
  - `/i/chat`
  - `/messages`
- Built-in hourly local follow limit
- Pause / Resume control
- Minimize / Restore control with the panel size remembered across page reloads
- Scrollable list of every account followed during the current session
- Scans the X Notifications page as an active route
- Live SolarFren dashboard

## How to get the right feed

You create the signal first. SolarFren does not write posts or fake engagement.
Post an introduction like this from your own X account, replacing the brackets:

```text
I'm [your age].

[Your role] from [your location].

Looking to connect with more builders & indie hackers!
```

Then interact with similar posts—reply, like, and follow people doing the work
you want to discover. As X learns that this is the conversation you care about,
your feed fills with more of those introductions. Run SolarFren after that: it
scans the feed you built, including quoted posts and the Notifications page.

The same template is saved in `solar-fren-post-template.txt`.

## Install

You need a userscript manager such as Tampermonkey.

Open the raw script:

https://raw.githubusercontent.com/solarfren69420/xautofollow/main/dist/xautofollow.user.js

Tampermonkey should offer to install it.

Then open X and scroll normally.

## GitHub Pages

The landing page is plain HTML/CSS with local images and no external dependencies.
To deploy it, open [Settings → Pages](https://github.com/solarfren69420/xautofollow/settings/pages),
choose **Deploy from a branch**, select **main** and **/(root)**, and save.
The site will be available at https://solarfren69420.github.io/xautofollow/ after deployment.
Future pushes to `main` update the page automatically.

To preview locally, run `python3 -m http.server 8000 --bind 127.0.0.1` from the
repository and open http://127.0.0.1:8000/.

### Show the real product in shared links

- **GitHub repository links:** open [Settings](https://github.com/solarfren69420/xautofollow/settings),
  find **Social preview → Edit → Upload an image**, and upload `assets/social-preview.png`.
- **Landing page links:** the page already includes Open Graph and X Card metadata
  pointing to the same image. Publish Pages before sharing its URL.
- **An X post with an image:** attach `assets/social-preview.png` for the dashboard,
  or `assets/xautofollow-in-action.png` to show the full X timeline. The text draft
  is saved locally outside this repository.

The preview image uses the actual dashboard screenshot. Its editable HTML layout
is `assets/social-preview.html` (render at 1280 × 640). Existing link previews may
remain cached; updating this repository's HTML does not change GitHub's own preview.

## Dashboard

The panel displays:

- **FOLLOWED** — accounts actually followed by the script this session
- **ALREADY** — matching accounts X indicates you already follow
- **QUEUE** — matching posts waiting to be checked
- **1 HOUR** — follow actions performed during the rolling hourly window
- **LAST ACTION** — most recent matcher/follower action

Click **PAUSE** at any time to stop automatic actions.

Click **−** in the header to minimize the dashboard to a small status bar, and
**+** to restore it. Following continues while minimized; use **PAUSE** to stop it.

## Matching

Posts are assigned a score based upon networking and founder-oriented phrases.

The default threshold is:

```js
const MIN_SCORE = 3;
```

Edit the configuration constants near the top of the userscript to change the
matching threshold, delays, or hourly limit. The hourly counter is held in memory
for this page only; reloading or opening another tab starts a separate counter.

## Local installation

Before publishing, open Tampermonkey's dashboard, create a new script, replace
the editor contents with `dist/xautofollow.user.js`, and save it.

## Publishing and updates

From the directory containing `setup1.sh`, run:

```bash
./setup1.sh --publish
```

Publishing requires Git access to your existing GitHub repository. Configure
your Git author name and email and your GitHub credentials before publishing.
The publish command commits the project files and pushes the `main` branch to
`solarfren69420/xautofollow`. Existing remote history is never force-pushed.

Existing project files are preserved on subsequent setup runs. To regenerate them
from the embedded templates, use `./setup1.sh --overwrite`; changed originals are
saved in a sibling backup directory. Edit the generated userscript directly for
normal development in `src/xautofollow.user.js`, then run `npm run build`. Increment its `@version` (and the dashboard `VERSION` constant)
before publishing an update so userscript managers can detect the new release.

The raw installation link above becomes available after the repository is public
and the `main` branch has been pushed.

## License

MIT — see [LICENSE](LICENSE).
