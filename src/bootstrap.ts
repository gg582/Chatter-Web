import { ChatStore } from './state/chatStore.js';
import { renderUtilityPanel } from './ui/utilityPanel.js';
import { renderCheatSheet } from './ui/cheatsheet.js';
import { renderSession } from './ui/sessionCard.js';
import { renderTerminal } from './ui/terminal.js';
import { describeMobilePlatform, detectMobilePlatform } from './ui/helpers.js';
import { enhanceTaskbar } from './ui/taskbar.js';

export const mountChatter = (root: HTMLElement) => {
  const store = new ChatStore();

  const mobilePlatform = detectMobilePlatform();
  if (mobilePlatform) {
    root.classList.add('chatter-app--mobile');
    root.dataset.mobilePlatform = mobilePlatform;
    root.dataset.mobilePlatformLabel = describeMobilePlatform(mobilePlatform);
  } else {
    root.classList.remove('chatter-app--mobile');
    delete root.dataset.mobilePlatform;
    delete root.dataset.mobilePlatformLabel;
  }

  const terminalElement = root.querySelector<HTMLElement>('[data-component="terminal"]');
  const utilityElement = root.querySelector<HTMLElement>('[data-component="utility"]');
  const cheatsheetElement = root.querySelector<HTMLElement>('[data-component="cheatsheet"]');
  const sessionElement = root.querySelector<HTMLElement>('[data-component="session"]');

  if (terminalElement && mobilePlatform) {
    terminalElement.dataset.mobilePlatform = mobilePlatform;
    terminalElement.dataset.mobilePlatformLabel = describeMobilePlatform(mobilePlatform);
  }

  if (!terminalElement || !utilityElement || !cheatsheetElement || !sessionElement) {
    throw new Error('Failed to mount the Chatter UI.');
  }

  const detachTaskbar = enhanceTaskbar(root);

  let runtime: ReturnType<typeof renderTerminal> | null = null;
  let disposed = false;

  const render = () => {
    runtime = renderTerminal(store, terminalElement);
    renderSession(store, sessionElement, root);
    renderUtilityPanel(store, utilityElement);
    renderCheatSheet(cheatsheetElement);
  };

  render();
  const unsubscribe = store.subscribe(render);

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    runtime?.requestDisconnect('Page closing');
    detachTaskbar();
    unsubscribe();
  };
};
