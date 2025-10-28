import { ChatStore } from './state/chatStore.js';
import { renderUtilityPanel } from './ui/utilityPanel.js';
import { renderCheatSheet } from './ui/cheatsheet.js';
import { renderSession } from './ui/sessionCard.js';
import { renderTerminal } from './ui/terminal.js';
import { describeMobilePlatform, detectMobilePlatform } from './ui/helpers.js';
type ViewName = 'terminal' | 'settings';

const isViewName = (value: string | undefined): value is ViewName =>
  value === 'terminal' || value === 'settings';

const setupViewSwitcher = (root: HTMLElement) => {
  const screens = Array.from(root.querySelectorAll<HTMLElement>('[data-view-screen]'));
  if (!screens.length) {
    return () => {};
  }

  const buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-view-target]'));
  let current: ViewName = isViewName(root.dataset.view) ? root.dataset.view : 'terminal';

  const apply = () => {
    root.dataset.view = current;
    screens.forEach((screen) => {
      const screenName = screen.dataset.viewScreen;
      const isActive = screenName === current;
      screen.classList.toggle('is-active', isActive);
      screen.setAttribute('aria-hidden', String(!isActive));
      if (isActive) {
        screen.removeAttribute('inert');
      } else {
        screen.setAttribute('inert', '');
      }
    });

    buttons.forEach((button) => {
      const target = button.dataset.viewTarget;
      if (target === current) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
  };

  const handleClick = (event: Event) => {
    const button = event.currentTarget as HTMLElement;
    const target = button.dataset.viewTarget;
    if (!isViewName(target) || target === current) {
      return;
    }
    current = target;
    apply();
  };

  buttons.forEach((button) => {
    button.addEventListener('click', handleClick);
  });

  apply();

  return () => {
    buttons.forEach((button) => {
      button.removeEventListener('click', handleClick);
    });
    screens.forEach((screen) => {
      screen.classList.remove('is-active');
      screen.removeAttribute('aria-hidden');
      screen.removeAttribute('inert');
    });
  };
};

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
  const bridgeControlsElement = root.querySelector<HTMLElement>(
    '[data-component="bridge-controls"]'
  );

  if (terminalElement && mobilePlatform) {
    terminalElement.dataset.mobilePlatform = mobilePlatform;
    terminalElement.dataset.mobilePlatformLabel = describeMobilePlatform(mobilePlatform);
  }

  if (
    !terminalElement ||
    !utilityElement ||
    !cheatsheetElement ||
    !sessionElement ||
    !bridgeControlsElement
  ) {
    throw new Error('Failed to mount the Chatter UI.');
  }

  const detachViewSwitcher = setupViewSwitcher(root);

  let runtime: ReturnType<typeof renderTerminal> | null = null;
  let disposed = false;

  const render = () => {
    runtime = renderTerminal(store, terminalElement, { controlsHost: bridgeControlsElement });
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
    detachViewSwitcher();
    unsubscribe();
  };
};
