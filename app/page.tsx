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
      <header className="chatter-stage__taskbar" data-taskbar>
        <div className="chatter-stage__taskbar-inner">
          <button
            type="button"
            className="taskbar-handle"
            data-taskbar-handle
            aria-expanded="false"
            aria-controls="chatter-taskbar-panel"
          >
            <span className="taskbar-handle__nub" aria-hidden="true" />
            <span className="taskbar-handle__label">
              <span className="taskbar-handle__icon" aria-hidden="true">
                ▾
              </span>
              작업표시줄
            </span>
          </button>
          <div
            className="chatter-stage__taskbar-panel"
            id="chatter-taskbar-panel"
            data-taskbar-panel
            aria-hidden="true"
          >
            <div className="taskbar-panel__intro">
              <span className="taskbar-panel__badge">Chatter BBS</span>
              <h1>Link your console</h1>
              <p>Hop straight into the telnet or SSH board and keep the lightweight lounge nearby.</p>
            </div>
            <div className="taskbar-panel__grid">
              <section className="taskbar-panel__section" data-component="session" />
              <section
                className="taskbar-panel__section taskbar-panel__section--utility"
                data-component="utility"
                aria-label="엔트리"
              />
            </div>
          </div>
        </div>
      </header>
      <main className="chatter-stage__main">
        <div className="chatter-stage__viewport">
          <div className="chatter-stage__terminal" data-component="terminal" />
          <details className="chatter-shortcuts" data-shortcuts>
            <summary className="chatter-shortcuts__toggle">
              <span className="chatter-shortcuts__icon" aria-hidden="true">
                ⌘
              </span>
              키 바로가기
            </summary>
            <section
              className="chatter-shortcuts__panel"
              data-component="cheatsheet"
              aria-label="키 바로가기"
            />
          </details>
        </div>
      </main>
    </div>
  );
}
