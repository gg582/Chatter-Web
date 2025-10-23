import { mountChatter } from './bootstrap.js';

const root = document.querySelector<HTMLElement>('[data-chatter-root]');

if (!root) {
  throw new Error('Failed to locate the Chatter root element.');
}

const teardown = mountChatter(root);

window.addEventListener('beforeunload', () => {
  teardown();
});
