import { ChatStore } from '../state/chatStore';
import { escapeHtml } from './helpers';

export const renderMotd = (store: ChatStore, container: HTMLElement) => {
  const state = store.snapshot();
  const feedback = container.dataset.feedback ?? '';
  const feedbackType = container.dataset.feedbackType ?? 'info';

  container.innerHTML = `
    <div class="card__badge">/motd</div>
    <h2>Message of the day</h2>
    <p class="card__description">${escapeHtml(state.motd)}</p>
    <button type="button" data-action="copy-motd">Copy MOTD</button>
    ${feedback ? `<p class="feedback ${feedbackType === 'error' ? 'feedback--error' : 'feedback--success'}">${escapeHtml(feedback)}</p>` : ''}
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
