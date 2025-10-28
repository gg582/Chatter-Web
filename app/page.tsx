'use client';

import { useEffect, useRef, useState } from 'react';
import { mountChatter } from '../src/bootstrap';

export default function Home() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }
    const cleanup = mountChatter(rootRef.current);
    return () => {
      cleanup();
    };
  }, []);

  const handleToggleSettings = () => {
    setIsSettingsOpen((previous) => !previous);
  };

  const stageClassName = `chatter-stage${isSettingsOpen ? ' chatter-stage--settings-open' : ''}`;

  return (
    <div className={stageClassName} data-chatter-root ref={rootRef}>
      <header className="chatter-stage__menubar">
        <div className="chatter-stage__menubar-title">Chatter BBS</div>
        <button
          type="button"
          className="button"
          onClick={handleToggleSettings}
          aria-expanded={isSettingsOpen}
          aria-controls="chatter-settings-panel"
        >
          {isSettingsOpen ? '설정 닫기' : '설정 열기'}
        </button>
      </header>
      <div className="chatter-stage__terminal" data-component="terminal" />
      <div className="chatter-stage__overlay" id="chatter-settings-panel">
        <section className="overlay-window overlay-window--session" data-component="session" />
        <section className="overlay-window overlay-window--utility" data-component="utility" />
        <section className="overlay-window overlay-window--cheatsheet" data-component="cheatsheet" />
      </div>
    </div>
  );
}
