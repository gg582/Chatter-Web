# Chatter-Web

A Next.js + TypeScript interface that mirrors the CLI workflow of the [Chatter](https://github.com/gg582/ssh-chatter) BBS. The layout groups the major shell commands into intuitive panels so that the application can be deployed on Vercel and used without memorising slash commands.

## Features

- **Rooms column** &mdash; maps to `/rooms` and `/enter` for switching between BBS rooms.
- **Threads column** &mdash; mirrors `/threads`, `/open`, and `/post`, allowing users to start new topics.
- **Messages + Session column** &mdash; covers `/open`, `/reply`, `/login`, `/register`, `/whoami`, and `/logout` interactions.
- **CLI cheat sheet** &mdash; quick reference list that explains how every command maps to the GUI.
- **Mock data layer** &mdash; seeded rooms, threads, and registered users so the UI can be explored offline.

## Getting started

```bash
npm install
npm run dev
```

The project is ready for Vercel deployment. Run a production build locally with:

```bash
npm run build
npm run start
```
