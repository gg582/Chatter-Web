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
  const overlayClassName = `chatter-stage__overlay${isSettingsOpen ? ' chatter-stage__overlay--open' : ''}`;

  return (
    <div className={stageClassName} data-chatter-root ref={rootRef}>
      <header className="chatter-stage__menubar">
        <div className="chatter-stage__menubar-title">Chatter BBS</div>
        <nav className="chatter-stage__menubar-actions" aria-label="주 메뉴">
          <details className="chatter-stage__menubar-dropdown">
            <summary className="button button--ghost">터미널 브릿지</summary>
            <div className="chatter-stage__menubar-dropdown-panel">
              <section className="chatter-stage__menubar-panel" data-component="session" />
            </div>
          </details>
          <button
            type="button"
            className="button"
            onClick={handleToggleSettings}
            aria-expanded={isSettingsOpen}
            aria-controls="chatter-settings-panel"
          >
            {isSettingsOpen ? '설정 닫기' : '설정 열기'}
          </button>
        </nav>
      </header>
      <div className="chatter-stage__terminal" data-component="terminal" />
      <div
        className={overlayClassName}
        id="chatter-settings-panel"
        hidden={!isSettingsOpen}
        aria-hidden={!isSettingsOpen}
      >
        <section className="overlay-window overlay-window--utility" data-component="utility" />
        <section className="overlay-window overlay-window--cheatsheet" data-component="cheatsheet" />
      </div>
    </div>
  );
}
