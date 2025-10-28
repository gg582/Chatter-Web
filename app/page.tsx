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
    <div className="chatter-stage" data-chatter-root ref={rootRef}>
      <div className="chatter-stage__terminal" data-component="terminal" />
      <div className="chatter-stage__overlay">
        <section className="overlay-window overlay-window--session" data-component="session" />
        <section className="overlay-window overlay-window--utility" data-component="utility" />
        <section className="overlay-window overlay-window--cheatsheet" data-component="cheatsheet" />
      </div>
    </div>
  );
}
