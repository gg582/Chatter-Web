import { mountChatter } from './bootstrap.js';

const root = document.querySelector<HTMLElement>('[data-chatter-root]');

if (!root) {
  throw new Error('Failed to locate the Chatter root element.');
}

const teardown = mountChatter(root);

const handlePageExit = () => {
  teardown();
};

window.addEventListener('beforeunload', handlePageExit);
window.addEventListener('pagehide', handlePageExit);
