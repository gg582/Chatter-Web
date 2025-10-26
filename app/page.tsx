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
    <div className="chatter-app" data-chatter-root ref={rootRef}>
      <header className="chatter-shell">
        <div className="shell-brand">
          <span className="shell-brand__badge">Chatter BBS</span>
          <h1>Link your console</h1>
          <p>Hop straight into the telnet or SSH board and keep the lightweight lounge nearby.</p>
        </div>
        <section className="shell-mobile-banner" data-mobile-banner>
          <h2>Mobile lounge ready</h2>
          <p>
            When we detect iOS, Android, postmarketOS, UBports, or BlackBerry devices, we highlight the dedicated command entry
            beneath the terminal so keystrokes, arrows, and Ctrl shortcuts land reliably over telnet or SSH.
          </p>
        </section>
        <nav className="shell-menu" aria-label="Lounge menu">
          <details className="menu-item" data-menu="motd">
            <summary>Message of the day</summary>
            <section className="menu-panel" data-component="motd" />
          </details>
          <details className="menu-item" data-menu="session" open>
            <summary>Your session</summary>
            <section className="menu-panel" data-component="session" />
          </details>
          <details className="menu-item" data-menu="utility">
            <summary>Utilities</summary>
            <section className="menu-panel" data-component="utility" />
          </details>
          <details className="menu-item" data-menu="cheatsheet">
            <summary>Command cheatsheet</summary>
            <section className="menu-panel" data-component="cheatsheet" />
          </details>
        </nav>
      </header>
      <main className="chatter-layout">
        <section className="terminal-section">
          <div className="panel panel--terminal" data-component="terminal" />
        </section>
      </main>
    </div>
  );
}
