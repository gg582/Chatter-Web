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
          <nav className="chatter-stage__nav" aria-label="화면 전환">
            <button
              type="button"
              className="chatter-stage__nav-button chatter-stage__nav-button--settings"
              data-view-target="settings"
              aria-label="설정 열기"
              aria-controls="chatter-settings-screen"
            >
              <span aria-hidden="true">⚙️</span>
            </button>
            <button
              type="button"
              className="chatter-stage__nav-button chatter-stage__nav-button--home"
              data-view-target="terminal"
              aria-label="터미널로 돌아가기"
              aria-controls="chatter-terminal-screen"
            >
              <span aria-hidden="true">🏠</span>
            </button>
          </nav>
          <section
            className="chatter-stage__screen chatter-stage__screen--terminal"
            id="chatter-terminal-screen"
            data-view-screen="terminal"
            aria-label="터미널"
          >
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
          </section>
          <section
            className="chatter-stage__screen chatter-stage__screen--settings"
            id="chatter-settings-screen"
            data-view-screen="settings"
            aria-label="설정"
            aria-hidden="true"
          >
            <header className="settings-screen__header">
              <div>
                <span className="taskbar-panel__badge">Chatter BBS</span>
                <h1>설정</h1>
              </div>
            </header>
            <div className="taskbar-panel__intro">
              <p>콘솔 연결과 엔트리를 관리하려면 여기에서 설정하세요.</p>
            </div>
            <div className="taskbar-panel__grid settings-screen__grid">
              <section className="taskbar-panel__section" data-component="session" />
              <section
                className="taskbar-panel__section taskbar-panel__section--utility"
                data-component="utility"
                aria-label="엔트리"
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
