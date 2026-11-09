# Checkers

English | [日本語](README.ja.md)

A web app for playing American checkers (English draughts) against the computer. It works on PC, smartphone and tablet. It is plain HTML/CSS/JS with no build step and no dependencies.

- Rules: Black moves first. Captures are mandatory and multi-jumps must be completed. A man that crowns ends its turn. Draws are declared on threefold repetition or after 40 moves each with no capture or man move.
- Difficulty: Easy, Medium, Hard. Hard uses an alpha-beta search with iterative deepening and a transposition table, running for about 2 seconds per move in a Web Worker.
- Language: Japanese when the browser's preferred language is Japanese, English otherwise.
- Sound: a wooden click synthesised with the Web Audio API (no audio files).

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000/
node --test 'tests/*.test.mjs'
node tools/selfplay.mjs 10 hard medium   # engine strength check
node tools/make-icons.mjs                # regenerate favicon.ico / apple-touch-icon.png
```

## Google Analytics

When `config.js` defines `GTM_ID`, the page loads the tag for that ID: gtag.js for `G-…` IDs, Google Tag Manager for `GTM-…` IDs.
On deploy, if the repository variable `GTM_ID` (Settings → Secrets and variables → Actions → Variables) is set, `config.js` is overwritten with that value. If it is not set, the repository's `config.js` is used as is.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which tests the code and publishes it to GitHub Pages.
In the repository settings, set Pages → Source to **GitHub Actions**.
