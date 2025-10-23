'use client';

import { useEffect, useRef } from 'react';
import { mountChatter } from '../src/bootstrap';

export default function Home() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }
    const cleanup = mountChatter(rootRef.current);
    return () => {
      cleanup();
    };
  }, []);

  return (
    <div className="page" data-chatter-root ref={rootRef}>
      <header className="page__header">
        <div className="page__title">
          <h1>Chatter BBS Control Deck</h1>
          <p>
            This dashboard mirrors the SSH help output of Chatter. Every command listed in the CLI has a matching control,
            so you can browse, moderate, and customise the BBS without typing a slash command.
          </p>
        </div>
        <div className="page__status" data-component="session" />
      </header>
      <main className="layout">
        <section className="column column--chat">
          <div className="card card--motd" data-component="motd" />
          <div className="card card--chat" data-component="chat-feed" />
        </section>
        <section className="column column--utility" data-component="utility" />
        <aside className="column column--cheatsheet" data-component="cheatsheet" />
      </main>
    </div>
  );
}
