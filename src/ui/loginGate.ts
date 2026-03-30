import { pickRandomNickname } from '../data/nicknames.js';
import type { ChatStore } from '../state/chatStore.js';

type FeedbackTone = 'info' | 'success' | 'error';

type StoredCredentials = {
  host: string;
  port: string;
  username: string;
};

type RuntimeDefaults = {
  host: string;
  port: string;
  username: string;
  placeholders: { host: string; port: string };
};

const readRuntimeConfig = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.__CHATTER_CONFIG__;
};

const resolveRuntimeDefaults = (): RuntimeDefaults => {
  const config = readRuntimeConfig();

  const configuredHost = typeof config?.bbsHost === 'string' ? config.bbsHost.trim() : '';
  const configuredHostDefault =
    typeof config?.bbsHostDefault === 'string' ? config.bbsHostDefault.trim() : '';
  const host = configuredHost || configuredHostDefault || 'chatter.pw';

  const configuredPort = typeof config?.bbsPort === 'string' ? config.bbsPort.trim() : '';
  const configuredPortDefault =
    typeof config?.bbsPortDefault === 'string' ? config.bbsPortDefault.trim() : '';
  const port = configuredPort || configuredPortDefault || '2323';

  const username = typeof config?.bbsSshUser === 'string' ? config.bbsSshUser.trim() : '';

  const hostPlaceholder =
    (typeof config?.bbsHostPlaceholder === 'string' ? config.bbsHostPlaceholder.trim() : '') ||
    host ||
    'chatter.pw';

  return {
    host,
    port,
    username,
    placeholders: {
      host: hostPlaceholder,
      port: port || '2323'
    }
  };
};

const CREDENTIALS_STORAGE_KEY = 'chatter.login.credentials';

const readStoredCredentials = (): Partial<StoredCredentials> => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage?.getItem(CREDENTIALS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    const safe: Partial<StoredCredentials> = {};
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.host === 'string') {
        safe.host = parsed.host;
      }
      if (typeof parsed.port === 'string') {
        safe.port = parsed.port;
      }
      if (typeof parsed.username === 'string') {
        safe.username = parsed.username;
      }
    }
    return safe;
  } catch (error) {
    console.warn('Failed to read stored gate credentials', error);
    return {};
  }
};

const writeStoredCredentials = (credentials: StoredCredentials) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage?.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
  } catch (error) {
    console.warn('Failed to persist gate credentials', error);
  }
};

const setElementTone = (element: HTMLElement, tone: FeedbackTone) => {
  if (!element) {
    return;
  }

  if (tone === 'info') {
    element.removeAttribute('data-tone');
    return;
  }

  element.dataset.tone = tone;
};

export const setupLoginGate = (stage: HTMLElement, store: ChatStore) => {
  const doc = stage.ownerDocument ?? document;
  const container = doc.querySelector<HTMLElement>('[data-login-screen]');

  if (!container) {
    return {
      dispose: () => {}
    };
  }

  const form = container.querySelector<HTMLFormElement>('[data-login-form]');
  const hostInput = container.querySelector<HTMLInputElement>('[data-login-host]');
  const portInput = container.querySelector<HTMLInputElement>('[data-login-port]');
  const usernameInput = container.querySelector<HTMLInputElement>('[data-login-username]');
  const passwordInput = container.querySelector<HTMLInputElement>('[data-login-password]');
  const connectButton = container.querySelector<HTMLButtonElement>('[data-login-connect]');
  const statusLabel = container.querySelector<HTMLElement>('[data-login-status]');
  const feedbackElement = container.querySelector<HTMLElement>('[data-login-feedback]');
  const focusTarget = container.querySelector<HTMLElement>('[data-login-focus]') ?? connectButton;

  const runtimeDefaults = resolveRuntimeDefaults();

  let lastSessionActive = store.snapshot().sessionActive;
  let currentSessionActive = lastSessionActive;
  let suppressTransitionMessage = false;

  const setFeedback = (message: string, tone: FeedbackTone = 'info', suppressTransition = false) => {
    if (!feedbackElement) {
      return;
    }

    feedbackElement.textContent = message;
    setElementTone(feedbackElement, tone);
    suppressTransitionMessage = suppressTransition;
  };

  const parsePortValue = (): number | null => {
    if (!portInput) {
      return null;
    }
    const value = portInput.value.trim();
    if (!value) {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65_535) {
      return null;
    }
    return parsed;
  };

  type FormDetails = {
    host: string;
    port: string;
    username: string;
    password: string;
  };

  const readFormDetails = (): FormDetails | null => {
    if (!hostInput || !portInput || !usernameInput) {
      return null;
    }

    const host = hostInput.value.trim();
    const port = portInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput?.value ?? '';

    return { host, port, username, password };
  };

  const isFormValid = (): boolean => {
    if (!hostInput || !portInput || !usernameInput) {
      return false;
    }
    if (!hostInput.value.trim()) {
      return false;
    }
    if (!usernameInput.value.trim()) {
      return false;
    }
    return parsePortValue() !== null;
  };

  const storeTerminalOverrides = (details: FormDetails) => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload: Record<string, string> = {
      protocol: 'telnet'
    };

    if (details.host) {
      payload.host = details.host;
    }

    if (details.port) {
      payload.port = details.port;
    }

    const storageKey = 'chatter-terminal-target';
    try {
      window.localStorage?.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist terminal overrides', error);
    }
  };

  const applyDetailsToTerminal = (details: FormDetails): boolean => {
    const { host, port, username, password } = details;

    const terminalProtocol = stage.querySelector<HTMLSelectElement>('[data-terminal-protocol]');
    const terminalHost = stage.querySelector<HTMLInputElement>('[data-terminal-host]');
    const terminalPort = stage.querySelector<HTMLInputElement>('[data-terminal-port]');
    const terminalUsername = stage.querySelector<HTMLInputElement>('[data-terminal-username]');
    const terminalPassword = stage.querySelector<HTMLInputElement>('[data-terminal-password]');

    if (!terminalProtocol || !terminalHost || !terminalPort || !terminalUsername) {
      return false;
    }

    if (terminalProtocol.value !== 'telnet') {
      terminalProtocol.value = 'telnet';
      terminalProtocol.dispatchEvent(new Event('change', { bubbles: true }));
    }

    terminalHost.value = host;
    terminalHost.dispatchEvent(new Event('input', { bubbles: true }));

    terminalPort.value = port;
    terminalPort.dispatchEvent(new Event('input', { bubbles: true }));

    terminalUsername.value = username;
    terminalUsername.dispatchEvent(new Event('input', { bubbles: true }));

    if (terminalPassword) {
      terminalPassword.value = password;
      terminalPassword.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return true;
  };

  const scheduleTerminalConnect = (details: FormDetails) => {
    if (typeof window === 'undefined') {
      return;
    }

    let attempts = 0;
    const maxAttempts = 6;

    const tryConnect = () => {
      attempts += 1;
      const applied = applyDetailsToTerminal(details);
      const joinButton = stage.querySelector<HTMLButtonElement>('[data-terminal-connect]');
      let clicked = false;
      if (applied && joinButton && !joinButton.disabled) {
        joinButton.click();
        clicked = true;
      }
      if (!clicked && attempts < maxAttempts) {
        window.setTimeout(tryConnect, 120);
      }
    };

    window.setTimeout(tryConnect, 0);
  };

  if (hostInput) {
    hostInput.placeholder = runtimeDefaults.placeholders.host;
  }

  if (portInput) {
    portInput.placeholder = runtimeDefaults.placeholders.port;
  }

  const applyStoredCredentials = () => {
    const stored = readStoredCredentials();
    if (hostInput) {
      const hostValue = stored.host ?? runtimeDefaults.host;
      if (hostValue) {
        hostInput.value = hostValue;
      }
    }
    if (portInput) {
      portInput.value = stored.port ?? runtimeDefaults.port;
    }
    if (usernameInput) {
      const storedUsername = stored.username?.trim();
      const defaultUsername = runtimeDefaults.username.trim();
      const existingValue = usernameInput.value.trim();
      if (storedUsername) {
        usernameInput.value = storedUsername;
        return;
      }
      if (defaultUsername) {
        usernameInput.value = defaultUsername;
        return;
      }
      if (existingValue) {
        return;
      }
      usernameInput.value = pickRandomNickname();
    }
  };

  const persistCredentials = () => {
    if (!hostInput || !portInput || !usernameInput) {
      return;
    }
    const payload: StoredCredentials = {
      host: hostInput.value.trim(),
      port: portInput.value.trim(),
      username: usernameInput.value.trim()
    };
    if (!payload.host || !payload.port || !payload.username) {
      return;
    }
    writeStoredCredentials(payload);
  };

  const updateConnectAvailability = () => {
    if (!connectButton) {
      return;
    }
    connectButton.disabled = currentSessionActive || !isFormValid();
  };

  const applyState = (sessionActive: boolean) => {
    stage.hidden = !sessionActive;
    if (sessionActive) {
      stage.removeAttribute('aria-hidden');
      stage.removeAttribute('inert');
    } else {
      stage.setAttribute('aria-hidden', 'true');
      stage.setAttribute('inert', '');
    }

    container.hidden = sessionActive;
    container.setAttribute('aria-hidden', String(sessionActive));
    container.dataset.state = sessionActive ? 'connected' : 'disconnected';

    currentSessionActive = sessionActive;

    if (statusLabel) {
      statusLabel.textContent = sessionActive ? 'Connected' : 'Disconnected';
    }

    updateConnectAvailability();

    if (!sessionActive && focusTarget && lastSessionActive !== sessionActive) {
      focusTarget.focus({ preventScroll: true });
    }
  };

  const update = () => {
    const { sessionActive } = store.snapshot();

    applyState(sessionActive);

    if (sessionActive !== lastSessionActive) {
      if (!suppressTransitionMessage) {
        if (sessionActive) {
          setFeedback('Session restored. Loading the lounge…', 'success');
        } else {
          setFeedback('Session closed. Join to re-enter the lounge.');
        }
      }
      suppressTransitionMessage = false;
    } else if (!sessionActive && feedbackElement && feedbackElement.textContent?.trim() === '') {
      setFeedback('Enter your TELNET bridge details to continue.');
    }

    lastSessionActive = sessionActive;
  };

  const handleConnect = () => {
    if (!isFormValid()) {
      form?.reportValidity();
      setFeedback('Complete the address, port, and username fields.', 'error', true);
      updateConnectAvailability();
      return;
    }

    const details = readFormDetails();
    if (!details) {
      setFeedback('Provide complete TELNET bridge details before joining.', 'error', true);
      return;
    }

    const result = store.resumeSession();
    if (!result.ok) {
      setFeedback(result.error ?? 'Unable to resume session.', 'error', true);
      return;
    }
    persistCredentials();
    storeTerminalOverrides(details);
    scheduleTerminalConnect(details);
    setFeedback('Join requested. Complete the captcha to enter the lounge.', 'success', true);
  };

  const handleFormSubmit = (event: Event) => {
    event.preventDefault();
    handleConnect();
  };

  const handleFormInputChange = () => {
    updateConnectAvailability();
  };

  form?.addEventListener('submit', handleFormSubmit);
  hostInput?.addEventListener('input', handleFormInputChange);
  portInput?.addEventListener('input', handleFormInputChange);
  usernameInput?.addEventListener('input', handleFormInputChange);

  const unsubscribe = store.subscribe(update);

  applyStoredCredentials();
  updateConnectAvailability();

  setFeedback('Enter your TELNET bridge details to continue.');
  update();

  return {
    dispose: () => {
      form?.removeEventListener('submit', handleFormSubmit);
      hostInput?.removeEventListener('input', handleFormInputChange);
      portInput?.removeEventListener('input', handleFormInputChange);
      usernameInput?.removeEventListener('input', handleFormInputChange);
      unsubscribe();
    }
  };
};
