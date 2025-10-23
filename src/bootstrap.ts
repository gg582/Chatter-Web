import { ChatStore } from './state/chatStore.js';
import { renderChatFeed } from './ui/chatFeed.js';
import { renderUtilityPanel } from './ui/utilityPanel.js';
import { renderCheatSheet } from './ui/cheatsheet.js';
import { renderSession } from './ui/sessionCard.js';
import { renderMotd } from './ui/motd.js';

export const mountChatter = (root: HTMLElement) => {
  const store = new ChatStore();

  const motdElement = root.querySelector<HTMLElement>('[data-component="motd"]');
  const chatElement = root.querySelector<HTMLElement>('[data-component="chat-feed"]');
  const utilityElement = root.querySelector<HTMLElement>('[data-component="utility"]');
  const cheatsheetElement = root.querySelector<HTMLElement>('[data-component="cheatsheet"]');
  const sessionElement = root.querySelector<HTMLElement>('[data-component="session"]');

  if (!motdElement || !chatElement || !utilityElement || !cheatsheetElement || !sessionElement) {
    throw new Error('Failed to mount the Chatter UI.');
  }

  const render = () => {
    renderMotd(store, motdElement);
    renderSession(store, sessionElement, root);
    renderChatFeed(store, chatElement);
    renderUtilityPanel(store, utilityElement);
    renderCheatSheet(cheatsheetElement);
  };

  render();
  const unsubscribe = store.subscribe(render);

  return () => {
    unsubscribe();
  };
};
