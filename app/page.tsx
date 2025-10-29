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
    <>
      <section className="chatter-gate" data-login-screen data-state="disconnected">
        <div className="chatter-gate__panel">
          <header className="chatter-gate__header">
            <span className="chatter-gate__badge">Chatter BBS</span>
            <h1 className="chatter-gate__title">Connect to the lounge</h1>
            <p className="chatter-gate__subtitle">Dial the bridge to continue to the full experience.</p>
          </header>
          <div className="chatter-gate__status">
            <span className="chatter-gate__indicator" data-login-status-indicator aria-hidden="true" />
            <span className="chatter-gate__status-label" data-login-status>
              Disconnected
            </span>
          </div>
          <div className="chatter-gate__actions">
            <button
              type="button"
              className="button chatter-gate__button"
              data-login-connect
              data-login-focus
            >
              Connect
            </button>
            <button
              type="button"
              className="button button--ghost chatter-gate__button"
              data-login-disconnect
              disabled
            >
              Disconnect
            </button>
          </div>
          <p className="chatter-gate__feedback" data-login-feedback role="status" aria-live="polite" />
        </div>
      </section>
      <div
        className="chatter-stage"
        data-chatter-root
        data-view="terminal"
        ref={rootRef}
        hidden
        aria-hidden="true"
      >
      <main className="chatter-stage__main">
        <div className="chatter-stage__viewport" data-view-root>
          <nav className="chatter-stage__nav" aria-label="View switcher">
            <div className="chatter-stage__nav-cluster">
              <button
                type="button"
                className="chatter-stage__nav-button chatter-stage__nav-button--settings"
                data-view-target="settings"
                aria-label="Open settings"
                aria-controls="chatter-settings-screen"
              >
                <span aria-hidden="true">⚙️</span>
              </button>
            </div>
            <button
              type="button"
              className="chatter-stage__nav-button chatter-stage__nav-button--home"
              data-view-target="terminal"
              aria-label="Return to terminal"
              aria-controls="chatter-terminal-screen"
            >
              <span aria-hidden="true">🏠</span>
            </button>
          </nav>
          <section
            className="chatter-stage__screen chatter-stage__screen--terminal"
            id="chatter-terminal-screen"
            data-view-screen="terminal"
            aria-label="Terminal"
          >
            <div className="chatter-stage__terminal" data-component="terminal" />
            <details className="chatter-shortcuts" data-shortcuts hidden>
              <summary className="chatter-shortcuts__toggle">
                <span className="chatter-shortcuts__icon" aria-hidden="true">
                  ⌘
                </span>
                Keyboard shortcuts
              </summary>
              <section
                className="chatter-shortcuts__panel"
                data-component="cheatsheet"
                aria-label="Keyboard shortcuts"
              />
            </details>
          </section>
          <section
            className="chatter-stage__screen chatter-stage__screen--settings"
            id="chatter-settings-screen"
            data-view-screen="settings"
            aria-label="Settings"
            aria-hidden="true"
          >
            <header className="settings-screen__header">
              <div>
                <span className="taskbar-panel__badge">Chatter BBS</span>
                <h1>Settings</h1>
              </div>
            </header>
            <div className="taskbar-panel__intro">
              <p>Manage your bridge connection and entry tools from here.</p>
            </div>
            <div className="taskbar-panel__grid settings-screen__grid">
              <section
                className="taskbar-panel__section taskbar-panel__section--bridge"
                data-component="bridge-controls"
                aria-label="Bridge controls"
              />
              <section className="taskbar-panel__section" data-component="session" />
              <section
                className="taskbar-panel__section taskbar-panel__section--utility"
                data-component="utility"
                aria-label="Entry tools"
              />
            </div>
          </section>
        </div>
      </main>
      </div>
    </>
  );
}
