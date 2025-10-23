import type { ChatMessage } from '../state/types';
import { ChatStore } from '../state/chatStore';
import { escapeHtml, formatRelative } from './helpers';

const renderReactions = (message: ChatMessage) => {
  const entries = Object.entries(message.reactions).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    return '<span class="chat-message__reaction-chip">No reactions yet</span>';
  }
  return entries
    .map(
      ([reaction, count]) =>
        `<span class="chat-message__reaction-chip">${reaction} · ${count.toString()}</span>`
    )
    .join('');
};

export const renderChatFeed = (store: ChatStore, container: HTMLElement) => {
  const state = store.snapshot();
  const feedback = container.dataset.feedback ?? '';
  const feedbackType = container.dataset.feedbackType ?? 'info';

  const messageItems = state.messages
    .map((message) => {
      const reply = message.replyTo ? state.messages.find((entry) => entry.id === message.replyTo) : undefined;
      return `
        <article class="chat-message">
          <div class="chat-message__meta">
            <strong>${escapeHtml(message.author)}</strong>
            <span>${formatRelative(message.postedAt)}</span>
          </div>
          <div class="chat-message__reply-to">
            <span>Message ID: <code>${escapeHtml(message.id)}</code></span>
            ${reply ? `<span>Reply to <code>${escapeHtml(reply.id)}</code> by ${escapeHtml(reply.author)}</span>` : ''}
          </div>
          <p class="chat-message__body">${escapeHtml(message.body)}</p>
          <div class="chat-message__reactions">${renderReactions(message)}</div>
        </article>
      `;
    })
    .join('');

  const replyOptions = state.messages
    .map((message) => `<option value="${escapeHtml(message.id)}">${escapeHtml(message.id)} · ${escapeHtml(message.author)}</option>`)
    .join('');

  container.innerHTML = `
    <header>
      <h2>Chat feed</h2>
      <p class="card__description">Regular messages appear here just like the live SSH room.</p>
    </header>
    <div class="chat-feed" data-element="chat-feed">${messageItems || '<p class="feedback">No messages yet.</p>'}</div>
    <form class="form-grid" data-action="post-message">
      <label for="chat-message-input">Message</label>
      <textarea id="chat-message-input" name="message" placeholder="Share something with everyone"></textarea>
      <label for="chat-reply-select">Reply to (optional)</label>
      <select id="chat-reply-select" name="reply">
        <option value="">No reply target</option>
        ${replyOptions}
      </select>
      <button type="submit">Post message</button>
      ${feedback ? `<p class="feedback ${feedbackType === 'error' ? 'feedback--error' : 'feedback--success'}">${escapeHtml(feedback)}</p>` : ''}
    </form>
  `;

  container.dataset.feedback = '';
  container.dataset.feedbackType = '';

  const form = container.querySelector<HTMLFormElement>('form[data-action="post-message"]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const message = String(formData.get('message') ?? '');
    const replyTo = String(formData.get('reply') ?? '');
    const result = store.sendMessage(message, replyTo || undefined);
    if (!result.ok) {
      container.dataset.feedback = result.error ?? 'Unable to post message.';
      container.dataset.feedbackType = 'error';
      renderChatFeed(store, container);
      return;
    }
    form.reset();
    container.dataset.feedback = 'Message posted.';
    container.dataset.feedbackType = 'success';
  });
};
