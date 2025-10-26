import { ChatStore } from '../state/chatStore.js';
import { escapeHtml, formatRelative } from './helpers.js';

export const renderSession = (store: ChatStore, container: HTMLElement, root?: HTMLElement) => {
  const state = store.snapshot();
  const profile = state.currentUser;
  const helpFeedback = container.dataset.feedback ?? '';
  const helpType = container.dataset.feedbackType ?? 'info';
  const host = root ?? container.closest<HTMLElement>('[data-chatter-root]') ?? undefined;

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Handle', value: escapeHtml(profile.username) },
    { label: 'Session', value: state.sessionActive ? 'active' : 'logged out' }
  ];

  if (profile.status) {
    rows.push({ label: 'Status', value: escapeHtml(profile.status) });
  }
  if (profile.os) {
    rows.push({ label: 'OS', value: escapeHtml(profile.os) });
  }
  if (profile.birthday) {
    rows.push({ label: 'Birthday', value: escapeHtml(profile.birthday) });
  }

  rows.push({ label: 'Connected', value: `${state.connectedUsers.length.toString()} online` });

  if (state.lastLogoutAt) {
    rows.push({ label: 'Last exit', value: formatRelative(state.lastLogoutAt) });
  }

  const detailsMarkup = rows
    .map(
      (entry) => `
        <div class="session-panel__row">
          <dt>${entry.label}</dt>
          <dd>${entry.value}</dd>
        </div>
      `
    )
    .join('');

  container.innerHTML = `
    <div class="session-panel">
      <header class="session-panel__header">
        <span class="session-panel__glyph" aria-hidden="true">sys</span>
        <div class="session-panel__titles">
          <h2>Session link</h2>
          <p>${state.sessionActive ? 'Bridge ready for commands' : 'Reconnect to resume the bridge'}</p>
        </div>
        <span class="session-panel__status session-panel__status--${state.sessionActive ? 'online' : 'offline'}">
          ${state.sessionActive ? 'online' : 'offline'}
        </span>
      </header>
      <dl class="session-panel__grid">
        ${detailsMarkup}
      </dl>
      <div class="session-panel__actions">
        <button type="button" class="button button--ghost" data-action="scroll-help">Command index</button>
        <button type="button" data-action="toggle-session">${
          state.sessionActive ? 'Log out (/exit)' : 'Resume session'
        }</button>
        ${
          helpFeedback
            ? `<p class="feedback ${helpType === 'error' ? 'feedback--error' : 'feedback--success'}">${escapeHtml(helpFeedback)}</p>`
            : ''
        }
      </div>
    </div>
  `;

  container.dataset.feedback = '';
  container.dataset.feedbackType = '';

  container.querySelector<HTMLButtonElement>('button[data-action="scroll-help"]')?.addEventListener('click', () => {
    const cheatsheet =
      host?.querySelector<HTMLElement>('[data-component="cheatsheet"]') ??
      container.ownerDocument?.querySelector<HTMLElement>('[data-component="cheatsheet"]') ??
      undefined;
    cheatsheet?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    container.dataset.feedback = 'Scrolled to help panel.';
    container.dataset.feedbackType = 'success';
    renderSession(store, container, host);
  });

  container.querySelector<HTMLButtonElement>('button[data-action="toggle-session"]')?.addEventListener('click', () => {
    const result = state.sessionActive ? store.endSession() : store.resumeSession();
    if (!result.ok) {
      container.dataset.feedback = result.error ?? 'Unable to update session.';
      container.dataset.feedbackType = 'error';
      renderSession(store, container, host);
      return;
    }
    container.dataset.feedback = result.message ?? 'Session updated.';
    container.dataset.feedbackType = 'success';
  });
};
