# Chatter-Web

A standalone TypeScript front-end for the Chatter BBS control deck. The project mirrors every `/help` command with a matching
GUI workflow so the SSH client and the browser stay feature-aligned. The codebase avoids external npm dependencies so it can
build and test in constrained environments.

## Getting started

```bash
npm install
```

The project does not rely on third-party packages, so this step simply creates a lockfile.

## Build

```bash
npm run build
```

`npm run build` compiles the TypeScript sources with the system `tsc` and copies the static assets into `dist/`. Open
`dist/index.html` in any modern browser (or host the folder behind a static file server) to explore the dashboard.

## Serve locally

```bash
npm start
```

`npm start` launches the bundled Node static server (`dist/server.js`). It listens on `0.0.0.0:8081` by default so the
dashboard is immediately available at http://localhost:8081. Override the defaults with environment variables such as
`PORT=8081 HOST=127.0.0.1 npm start` when required.

Run `npm run build` whenever the TypeScript sources change so the server can serve the latest assets.

## Systemd integration

`deploy/chatter-frontend.service` provides a ready-to-use unit file. Copy it into `/etc/systemd/system/`, update the
`User`, `Group`, and `WorkingDirectory` to match your deployment, and then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chatter-frontend
```

The unit calls `node dist/server.js` so make sure the project has been built before starting the service. Use `systemctl
stop chatter-frontend` to shut down the listener or `systemctl restart chatter-frontend` after a rebuild.

## Testing

```bash
npm test
```

The test script performs a build and then executes the compiled unit tests with Node’s built-in `node:test` runner. Coverage
focuses on the `ChatStore` helpers that back the moderation, messaging, and archival workflows in the GUI.

## Project layout

- **`public/`** – HTML shell, global styles, and font links for the static bundle.
- **`scripts/`** – minimal Node scripts that drive the TypeScript compilation and asset copying.
- **`src/state/`** – the `ChatStore` state container with methods for messaging, media, moderation, polls, and RSS tools.
- **`src/ui/`** – DOM renderers for the chat feed, utility panes, cheat sheet, and session controls.
- **`src/data/commandCatalog.ts`** – catalogue that maps each CLI command to its corresponding GUI affordance.
- **`tests/`** – unit tests executed with Node’s built-in runner after compilation.

## Matching the CLI

Every command advertised by the Chatter SSH `/help` has a dedicated surface:

- **Orientation:** `/help`, `/motd`, `/exit`, `/users`, `/connected`, `/search`, and scroll history.
- **Identity:** `/nick`, `/status`, `/showstatus`, `/os`, `/getos`, `/birthday`, `/soulmate`, `/pair`.
- **Messaging:** regular messages, `/reply`, `/pm`, `/chat`, `/delete-msg`, reactions (`/good`…`/wtf`).
- **Media:** `/image`, `/video`, `/audio`, `/files`, `/asciiart` with dedicated attachment panes.
- **Appearance & translation:** `/color`, `/systemcolor`, `/palette`, `/translate`, `/set-trans-lang`, `/set-target-lang`,
  `/translate-scope`, `/chat-spacing`.
- **Assistants & fun:** `/game`, `/suspend!`, `/gemini`, `/gemini-unfreeze`, `/eliza`, `/eliza-chat`, `/today`, `/date`,
  `/weather`.
- **Moderation:** `/grant`, `/revoke`, `/ban`, `/banlist`, `/pardon`, `/block`, `/unblock`, `/poke`, `/kick`, `/poll`, `/vote`,
  `/vote-single`, `/elect`, `/1 .. /5`.
- **BBS & feeds:** `/bbs` actions (list/read/post/comment/regen/delete) and `/rss` commands (list/read/add).

Use the utility panel to drive these workflows while the cheat sheet shows how each CLI command maps to its GUI control.
