# Chatter-Web

A Vercel-ready Next.js + TypeScript control deck for the Chatter BBS. The client-side bootstrap reuses the `ChatStore` and
rendering helpers that mirror every `/help` command, while the App Router provides a deployable shell for hosting on Vercel or
any Node-compatible platform.

## Getting started

```bash
npm install
```

This installs the Next.js toolchain, React runtime, TypeScript typings, ESLint, and the Vitest test runner.

## Local development

```bash
npm run dev
```

The development server runs at `http://localhost:3000`, loading the same dashboard layout as the SSH client’s `/help`
reference. Hot refresh keeps the utility panel, chat feed, and cheat sheet in sync with the TypeScript modules under `src/`.

## Production build

```bash
npm run build
```

`next build` outputs an optimised production bundle in `.next/`, ready for `vercel deploy` or `npm run start`. The generated
app hydrates the existing DOM-based renderers so the GUI remains in lockstep with the CLI mapping.

## Testing

```bash
npm test
```

Vitest runs the existing `ChatStore` unit tests to ensure helpers for message lookup, reactions, and deletions keep matching
the CLI semantics.

## Project layout

- **`app/`** – App Router layout, metadata, and the page shell that hydrates the control deck.
- **`src/state/`** – the `ChatStore` state container with CLI-equivalent methods (`/pm`, `/delete-msg`, `/poll`, `/bbs`, …).
- **`src/ui/`** – rendering helpers for the chat feed, utility panel, session card, and cheat sheet.
- **`src/data/commandCatalog.ts`** – grouping of all CLI commands and their matching GUI affordances.
- **`tests/`** – Vitest coverage for key state helpers such as `getMessageById`, `reactToMessage`, and `deleteMessages`.

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
