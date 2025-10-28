import { mountChatter } from './bootstrap.js';

const setupSettingsToggle = (stage: HTMLElement) => {
  const toggleButton = stage.querySelector<HTMLButtonElement>('[data-settings-toggle]');
  const panel = stage.querySelector<HTMLElement>('[data-settings-panel]');

  if (!toggleButton || !panel) {
    return () => {};
  }

  let open = stage.classList.contains('chatter-stage--settings-open');

  const applyState = () => {
    stage.classList.toggle('chatter-stage--settings-open', open);
    toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggleButton.textContent = open ? '설정 닫기' : '설정 열기';
  };

  applyState();

  const handleToggle = () => {
    open = !open;
    applyState();
  };

  toggleButton.addEventListener('click', handleToggle);

  return () => {
    toggleButton.removeEventListener('click', handleToggle);
  };
};

const root = document.querySelector<HTMLElement>('[data-chatter-root]');

if (!root) {
  throw new Error('Failed to locate the Chatter root element.');
}

const cleanupToggle = setupSettingsToggle(root);
const teardown = mountChatter(root);

const handlePageExit = () => {
  cleanupToggle();
  teardown();
};

window.addEventListener('beforeunload', handlePageExit);
window.addEventListener('pagehide', handlePageExit);
