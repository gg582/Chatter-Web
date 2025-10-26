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
      <header className="chatter-app__header">
        <p className="chatter-app__ribbon">Chatter BBS</p>
        <h1>Welcome to the lounge</h1>
        <p>
          Catch up with the community, share quick updates, and keep a terminal bridge handy for hopping into the live
          TUI room.
        </p>
      </header>
      <main className="chatter-app__main">
        <section className="panel panel--chat" data-component="chat-feed" />
        <aside className="chatter-app__sidebar">
          <section className="panel" data-component="motd" />
          <section className="panel" data-component="session" />
          <section className="panel" data-component="utility" />
          <section className="panel" data-component="cheatsheet" />
        </aside>
      </main>
      <section className="chatter-app__terminal">
        <div className="panel panel--terminal" data-component="terminal" />
      </section>
    </div>
  );
}
