# Chatter-Web

A zero-dependency TypeScript dashboard that mirrors the SSH help output of the Chatter BBS. The interface is rendered with
vanilla DOM updates, bundled with Bun, and organised into panels that correspond one-to-one with every slash command exposed in
the terminal client.

## Project layout

- **`public/`** – static assets copied into the production bundle (`index.html`, `styles.css`).
- **`src/state/`** – the `ChatStore` state container with CLI-equivalent methods (`/pm`, `/delete-msg`, `/poll`, `/bbs`, …).
- **`src/ui/`** – rendering helpers for the chat feed, utility panel, session card, and cheat sheet.
- **`src/data/commandCatalog.ts`** – grouping of all CLI commands and their matching GUI affordances.
- **`scripts/`** – Bun-powered build and dev scripts used by the npm-style commands below.
- **`tests/`** – Bun test coverage for key state helpers such as `getMessageById`, `reactToMessage`, and `deleteMessages`.

## Requirements

Install [Bun](https://bun.sh) (v1.2 or newer). No external npm packages are required – the build and test steps run entirely
with the Bun toolchain.

## Running locally

```bash
bun install  # no-op, kept for parity with package managers
bun run dev  # rebuilds on change and serves http://localhost:3000
```

The development server copies `public/` into `dist/`, recompiles `src/main.ts` on file changes, and serves the static site. Use
`Ctrl+C` to exit.

## Production build

```bash
bun run build
```

The build script writes minified assets to `dist/` by copying `public/` and bundling `src/main.ts` (including sourcemaps).
Deploy the contents of `dist/` to any static host – Vercel can treat it as a static export.

## Testing

```bash
bun test
```

`tests/chatStore.test.ts` verifies that the `ChatStore` mirrors the CLI helpers used by the UI (message lookup, reactions, and
moderation deletions). Extend the suite with additional behaviour as new commands are surfaced.

## Matching the CLI

Every command advertised by the in-game `/help` has a dedicated UI surface:

- **Orientation:** `/help`, `/motd`, `/exit`, `/users`, `/connected`, `/search`, and scroll history.
- **Identity:** `/nick`, `/status`, `/showstatus`, `/os`, `/getos`, `/birthday`, `/soulmate`, `/pair`.
- **Messaging:** regular messages, `/reply`, `/pm`, `/chat`, `/delete-msg`, reactions (`/good`…`/wtf`).
- **Media:** `/image`, `/video`, `/audio`, `/files`, `/asciiart` with an attachment library per type.
- **Appearance & translation:** `/color`, `/systemcolor`, `/palette`, `/translate`, `/set-trans-lang`, `/set-target-lang`,
  `/translate-scope`, `/chat-spacing`.
- **Assistants & fun:** `/game`, `/suspend!`, `/gemini`, `/gemini-unfreeze`, `/eliza`, `/eliza-chat`, `/today`, `/date`, `/weather`.
- **Moderation:** `/grant`, `/revoke`, `/ban`, `/banlist`, `/pardon`, `/block`, `/unblock`, `/poke`, `/kick`, `/poll`, `/vote`,
  `/vote-single`, `/elect`, `/1 .. /5`.
- **BBS & feeds:** `/bbs` actions (list/read/post/comment/regen/delete) and `/rss` commands (list/read/add).

Use the utility panel to drive these workflows while the cheat sheet shows how each CLI command maps to its GUI control.
