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
    <div className="chatter-stage" data-chatter-root data-view="terminal" ref={rootRef}>
      <main className="chatter-stage__main">
        <div className="chatter-stage__viewport" data-view-root>
          <nav className="chatter-stage__nav" aria-label="View switcher">
            <button
              type="button"
              className="chatter-stage__nav-button chatter-stage__nav-button--settings"
              data-view-target="settings"
              aria-label="Open settings"
              aria-controls="chatter-settings-screen"
            >
              <span aria-hidden="true">⚙️</span>
            </button>
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
            <details className="chatter-shortcuts" data-shortcuts>
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
              <p>Use this view to manage console connections and entry behaviour.</p>
              <section
                className="settings-screen__summary"
                aria-label="Terminal bridge status overview"
              >
                <header className="settings-screen__summary-header">
                  <h2>Chatter terminal</h2>
                  <p className="settings-screen__summary-subtitle">Bridge control bar</p>
                </header>
                <p className="settings-screen__summary-status">Disconnected</p>
                <p>
                  <strong>Target</strong> TELNET chat.korokorok.com:23 · custom target
                </p>
                <p>Manage your connection, identity, and overrides from the control bar above.</p>
                <p>No active game selected. Choose one from the Assistants panel.</p>
                <h3>Identity</h3>
                <p>
                  <strong>Username</strong>
                </p>
                <p>Usernames and passwords never leave the browser. They're sent directly to the terminal bridge.</p>
                <h3>Connection settings</h3>
                <p>Manual overrides are active in this browser. Clear the fields to enjoy the server defaults again.</p>
                <ul className="settings-screen__summary-list">
                  <li>
                    <strong>Protocol</strong>
                  </li>
                  <li>
                    <strong>Host</strong>
                  </li>
                  <li>
                    <strong>Port</strong>
                  </li>
                </ul>
                <p>
                  Type a command and press Enter or Send to forward the next line to the bridge. Shift+Enter adds a newline and
                  the shortcut bar sends arrows or Ctrl keys instantly.
                </p>
                <p className="settings-screen__summary-buffer">Buffered input</p>
                <pre className="settings-screen__summary-buffer-visual" aria-hidden="true">^^^</pre>
              </section>
            </div>
            <div className="taskbar-panel__grid settings-screen__grid">
              <section className="taskbar-panel__section" data-component="session" />
              <section
                className="taskbar-panel__section taskbar-panel__section--utility"
                data-component="utility"
                aria-label="Entry"
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
