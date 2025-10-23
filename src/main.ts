import { ChatStore } from './state/chatStore';
import { renderChatFeed } from './ui/chatFeed';
import { renderUtilityPanel } from './ui/utilityPanel';
import { renderCheatSheet } from './ui/cheatsheet';
import { renderSession } from './ui/sessionCard';
import { renderMotd } from './ui/motd';

const store = new ChatStore();

const motdElement = document.querySelector<HTMLElement>('[data-component="motd"]');
const chatElement = document.querySelector<HTMLElement>('[data-component="chat-feed"]');
const utilityElement = document.querySelector<HTMLElement>('[data-component="utility"]');
const cheatsheetElement = document.querySelector<HTMLElement>('[data-component="cheatsheet"]');
const sessionElement = document.querySelector<HTMLElement>('[data-component="session"]');

if (!motdElement || !chatElement || !utilityElement || !cheatsheetElement || !sessionElement) {
  throw new Error('Failed to mount the Chatter UI.');
}

const render = () => {
  renderMotd(store, motdElement);
  renderSession(store, sessionElement);
  renderChatFeed(store, chatElement);
  renderUtilityPanel(store, utilityElement);
  renderCheatSheet(cheatsheetElement);
};

render();
store.subscribe(render);
