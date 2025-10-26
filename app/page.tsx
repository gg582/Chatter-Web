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
    <div className="terminal-shell" data-chatter-root ref={rootRef}>
      <div className="terminal-shell__scanlines" aria-hidden="true" />
      <div className="terminal-shell__frame">
        <header className="terminal-shell__header">
          <div className="terminal-shell__brand">
            <span className="terminal-shell__brand-code">:: chatter bbs ::</span>
            <h1>Hypertext Bridge Console</h1>
            <p>
              Operate the telnet and SSH matrix through a web-native viewport. Every slash command is mapped to controls,
              toggles, and keyboards that feel like a classic terminal brought online.
            </p>
          </div>
          <div className="terminal-shell__session card card--session" data-component="session" />
        </header>
        <main className="terminal-shell__grid">
          <section className="terminal-shell__column terminal-shell__column--left">
            <div className="card card--terminal" data-component="terminal" />
            <div className="card card--motd" data-component="motd" />
          </section>
          <section className="terminal-shell__column terminal-shell__column--center">
            <div className="card card--chat" data-component="chat-feed" />
          </section>
          <section className="terminal-shell__column terminal-shell__column--right">
            <div className="card card--utility" data-component="utility" />
            <div className="card card--cheatsheet" data-component="cheatsheet" />
          </section>
        </main>
      </div>
    </div>
  );
}
