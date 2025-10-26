import { ChatStore } from '../state/chatStore.js';
import { escapeHtml } from './helpers.js';

export const renderMotd = (store: ChatStore, container: HTMLElement) => {
  const state = store.snapshot();
  const feedback = container.dataset.feedback ?? '';
  const feedbackType = container.dataset.feedbackType ?? 'info';

  container.innerHTML = `
    <header class="card__header">
      <span class="card__glyph" aria-hidden="true">motd</span>
      <div class="card__titles">
        <h2>Message of the day</h2>
        <p class="card__subtitle">Straight from the BBS welcome board.</p>
      </div>
    </header>
    <article class="motd">
      <p class="motd__body">${escapeHtml(state.motd)}</p>
    </article>
    <footer class="card__footer">
      <button type="button" data-action="copy-motd">Copy MOTD</button>
      ${
        feedback
          ? `<p class="feedback ${feedbackType === 'error' ? 'feedback--error' : 'feedback--success'}">${escapeHtml(feedback)}</p>`
          : ''
      }
    </footer>
  `;

  container.dataset.feedback = '';
  container.dataset.feedbackType = '';

  container.querySelector<HTMLButtonElement>('button[data-action="copy-motd"]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard?.writeText(state.motd);
      container.dataset.feedback = 'Copied to clipboard.';
      container.dataset.feedbackType = 'success';
    } catch (error) {
      container.dataset.feedback = 'Copy is unavailable in this browser.';
      container.dataset.feedbackType = 'error';
    }
    renderMotd(store, container);
  });
};
