import { ChatStore } from './state/chatStore.js';
import { renderCheatSheet } from './ui/cheatsheet.js';
import { renderSession } from './ui/sessionCard.js';
import { renderTerminal } from './ui/terminal.js';
import { setupThemeToggle } from './ui/themeToggle.js';
import { describeMobilePlatform, detectMobilePlatform } from './ui/helpers.js';
import { renderUtilityPanel } from './ui/utilityPanel.js';
import { setupLoginGate } from './ui/loginGate.js';
type ViewName = 'terminal' | 'settings';

const isViewName = (value: string | undefined): value is ViewName =>
  value === 'terminal' || value === 'settings';

const setupViewSwitcher = (root: HTMLElement, options?: { enableTouchGestures?: boolean }) => {
  const screens = Array.from(root.querySelectorAll<HTMLElement>('[data-view-screen]'));
  if (!screens.length) {
    return () => {};
  }

  const buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-view-target]'));
  const enableTouchGestures = Boolean(options?.enableTouchGestures);
  const viewport = enableTouchGestures
    ? root.querySelector<HTMLElement>('[data-view-root]')
    : null;
  let current: ViewName = isViewName(root.dataset.view) ? root.dataset.view : 'terminal';
  let touchStartX: number | null = null;
  let touchStartY: number | null = null;

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

  const setView = (nextView: ViewName) => {
    if (nextView === current) {
      return;
    }
    current = nextView;
    apply();
  };

  const handleClick = (event: Event) => {
    const button = event.currentTarget as HTMLElement;
    const target = button.dataset.viewTarget;
    if (!isViewName(target)) {
      return;
    }
    setView(target);
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      touchStartX = null;
      touchStartY = null;
      return;
    }
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (touchStartX === null || touchStartY === null || event.changedTouches.length !== 1) {
      touchStartX = null;
      touchStartY = null;
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const threshold = 48;

    touchStartX = null;
    touchStartY = null;

    if (Math.max(absX, absY) < threshold) {
      return;
    }

    const isHorizontalGesture = absX >= absY;
    const isForward = isHorizontalGesture ? deltaX < 0 : deltaY < 0;
    setView(isForward ? 'settings' : 'terminal');
  };

  buttons.forEach((button) => {
    button.addEventListener('click', handleClick);
  });

  if (viewport && enableTouchGestures) {
    viewport.addEventListener('touchstart', handleTouchStart, { passive: true });
    viewport.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  apply();

  return () => {
    buttons.forEach((button) => {
      button.removeEventListener('click', handleClick);
    });
    if (viewport && enableTouchGestures) {
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchend', handleTouchEnd);
    }
    screens.forEach((screen) => {
      screen.classList.remove('is-active');
      screen.removeAttribute('aria-hidden');
      screen.removeAttribute('inert');
    });
  };
};


export const mountChatter = (root: HTMLElement) => {
  const store = new ChatStore();
  const loginGate = setupLoginGate(root, store);

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

  const detachViewSwitcher = setupViewSwitcher(root, {
    enableTouchGestures: Boolean(mobilePlatform)
  });
  const themeToggle = setupThemeToggle(root);

  let runtime: ReturnType<typeof renderTerminal> | null = null;
  let disposed = false;

  const render = () => {
    runtime = renderTerminal(store, terminalElement, {
      controlsHost: bridgeControlsElement,
      themeHost: root
    });
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
    runtime?.disposeResources?.();
    runtime?.requestDisconnect('Page closing');
    detachViewSwitcher();
    themeToggle.dispose();
    unsubscribe();
    loginGate.dispose();
  };
};
