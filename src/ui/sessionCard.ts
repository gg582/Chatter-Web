import { ChatStore } from '../state/chatStore';
import { escapeHtml, formatRelative } from './helpers';

export const renderSession = (store: ChatStore, container: HTMLElement) => {
  const state = store.snapshot();
  const profile = state.currentUser;
  const helpFeedback = container.dataset.feedback ?? '';
  const helpType = container.dataset.feedbackType ?? 'info';

  container.innerHTML = `
    <h2>Session</h2>
    <div>
      <div class="card__badge">Connected as</div>
      <strong style="font-size:1.15rem">${escapeHtml(profile.username)}</strong>
      <p class="feedback">${state.sessionActive ? 'Session active' : 'Logged out'}</p>
      ${profile.status ? `<p class="feedback">Status: ${escapeHtml(profile.status)}</p>` : ''}
      ${profile.os ? `<p class="feedback">OS: ${escapeHtml(profile.os)}</p>` : ''}
      ${profile.birthday ? `<p class="feedback">Birthday: ${escapeHtml(profile.birthday)}</p>` : ''}
      <p class="feedback">Connected users: ${state.connectedUsers.length}</p>
      ${state.lastLogoutAt ? `<p class="feedback">Last exit: ${formatRelative(state.lastLogoutAt)}</p>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:0.6rem;">
      <button type="button" data-action="scroll-help">Help overview</button>
      <button type="button" data-action="toggle-session">${state.sessionActive ? 'Log out (/exit)' : 'Resume session'}</button>
      ${helpFeedback ? `<p class="feedback ${helpType === 'error' ? 'feedback--error' : 'feedback--success'}">${escapeHtml(helpFeedback)}</p>` : ''}
    </div>
  `;

  container.dataset.feedback = '';
  container.dataset.feedbackType = '';

  container.querySelector<HTMLButtonElement>('button[data-action="scroll-help"]')?.addEventListener('click', () => {
    const cheatsheet = document.querySelector('[data-component="cheatsheet"]');
    cheatsheet?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    container.dataset.feedback = 'Scrolled to help panel.';
    container.dataset.feedbackType = 'success';
    renderSession(store, container);
  });

  container.querySelector<HTMLButtonElement>('button[data-action="toggle-session"]')?.addEventListener('click', () => {
    const result = state.sessionActive ? store.endSession() : store.resumeSession();
    if (!result.ok) {
      container.dataset.feedback = result.error ?? 'Unable to update session.';
      container.dataset.feedbackType = 'error';
      renderSession(store, container);
      return;
    }
    container.dataset.feedback = result.message ?? 'Session updated.';
    container.dataset.feedbackType = 'success';
  });
};
