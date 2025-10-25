# Chatter-Web

A standalone TypeScript front-end for the Chatter BBS control deck. The project mirrors every `/help` command with a matching
GUI workflow so the SSH client and the browser stay feature-aligned. The codebase avoids external npm dependencies so it can
build and test in constrained environments.

## Getting started

```bash
npm install
```

The project does not rely on third-party packages, so this step simply creates a lockfile.
Ensure Node.js 22 or newer is installed before running the scripts.

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

## Terminal bridge configuration

The in-browser terminal pulls its defaults from environment variables. Define them before running `npm start`, or bake them
into the generated systemd unit via `deploy/install.sh`:

- `CHATTER_BBS_HOST`, `CHATTER_BBS_PORT`, `CHATTER_BBS_PROTOCOL` – direct the bridge to the SSH (default) or telnet endpoint
  you want to expose in the UI.
- `CHATTER_BBS_HOST_DEFAULT`, `CHATTER_BBS_PORT_DEFAULT` – pre-fill the Connection options form when the server itself does
  not supply a host or port but you still want to steer operators toward a common target.
- `CHATTER_BBS_SSH_USER`, `CHATTER_BBS_SSH_COMMAND` – supply optional SSH defaults when the bridge connects over SSH.
- `CHATTER_BBS_HOST_PLACEHOLDER` – customise the host placeholder shown in the Connection options drawer when no host is
  configured on the server.

The terminal keeps optional overrides, including the SSH username prompt, inside the Connection options drawer so the primary
controls stay compact. Expand the drawer to save local overrides or to enter the SSH username before connecting.

## Systemd integration

`deploy/chatter-frontend.service` provides a ready-to-use unit file. Copy it into `/etc/systemd/system/`, update the
`User`, `Group`, and `WorkingDirectory` to match your deployment, and then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chatter-frontend
```

The unit calls `node dist/server.js` so make sure the project has been built before starting the service. Use `systemctl
stop chatter-frontend` to shut down the listener or `systemctl restart chatter-frontend` after a rebuild.

## Automated install script

Run `deploy/install.sh` to build the project, copy the bundle into `/opt/chatter-web` (or a custom prefix), and (optionally) set up the service in one go:

```bash
./deploy/install.sh --prefix "$HOME/.local/chatter-web"   # build + stage assets without touching system directories
sudo ./deploy/install.sh --systemd --user www-data --group www-data
```

The script compiles the dashboard, replicates the contents of `dist/` into the installation directory, and changes the
ownership to match the service user when `--systemd` is enabled. It then writes the systemd unit into
`/etc/systemd/system/` and starts it immediately. Use `--service-name`, `--port`, `--user`, `--group`, `--node`, or
`--prefix` to override the defaults that land in the generated unit. Use `--bbs-host`, `--bbs-port`, and `--bbs-protocol`
(`telnet` or `ssh`) to bake the terminal bridge configuration into the unit. The installer writes
`CHATTER_BBS_HOST`, `CHATTER_BBS_PORT`, `CHATTER_BBS_PROTOCOL`, and any provided `CHATTER_BBS_SSH_COMMAND` so the in-browser
terminal immediately dials the chosen BBS without exposing manual URL entry. The SSH username is collected directly in the
browser before connecting, matching the expectations of the legacy client.

The default installation prefix is `/opt/chatter-web`, so run the script with elevated privileges (for example via
`sudo`) when targeting system locations. Supply a writable `--prefix` to stage the bundle for a single user without
administrator access.

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
