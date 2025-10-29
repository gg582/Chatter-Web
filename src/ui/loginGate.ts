import { pickRandomNickname } from '../data/nicknames.js';
import type { ChatStore } from '../state/chatStore.js';

type FeedbackTone = 'info' | 'success' | 'error';

type StoredCredentials = {
  protocol: string;
  host: string;
  port: string;
  username: string;
};

type RuntimeDefaults = {
  protocol: 'telnet' | 'ssh';
  host: string;
  port: string;
  username: string;
  placeholders: { host: string; port: string };
};

const normaliseProtocolName = (value: string | undefined): 'telnet' | 'ssh' =>
  value === 'telnet' ? 'telnet' : 'ssh';

const readRuntimeConfig = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.__CHATTER_CONFIG__;
};

const resolveRuntimeDefaults = (): RuntimeDefaults => {
  const config = readRuntimeConfig();

  const protocol = normaliseProtocolName(
    typeof config?.bbsProtocol === 'string' ? config.bbsProtocol.trim().toLowerCase() : undefined
  );

  const configuredHost = typeof config?.bbsHost === 'string' ? config.bbsHost.trim() : '';
  const configuredHostDefault =
    typeof config?.bbsHostDefault === 'string' ? config.bbsHostDefault.trim() : '';
  const host = configuredHost || configuredHostDefault;

  const configuredPort = typeof config?.bbsPort === 'string' ? config.bbsPort.trim() : '';
  const configuredPortDefault =
    typeof config?.bbsPortDefault === 'string' ? config.bbsPortDefault.trim() : '';
  const port = configuredPort || configuredPortDefault;

  const username = typeof config?.bbsSshUser === 'string' ? config.bbsSshUser.trim() : '';

  const hostPlaceholder =
    (typeof config?.bbsHostPlaceholder === 'string' ? config.bbsHostPlaceholder.trim() : '') ||
    host ||
    'bbs.example.com';

  const fallbackPortPlaceholder = protocol === 'telnet' ? '23' : '22';
  const portPlaceholder = port || fallbackPortPlaceholder;

  return {
    protocol,
    host,
    port,
    username,
    placeholders: {
      host: hostPlaceholder,
      port: portPlaceholder
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
      if (typeof parsed.protocol === 'string') {
        safe.protocol = parsed.protocol;
      }
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
  const protocolSelect = container.querySelector<HTMLSelectElement>('[data-login-protocol]');
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
    protocol: 'telnet' | 'ssh';
    host: string;
    port: string;
    username: string;
    password: string;
  };

  const readFormDetails = (): FormDetails | null => {
    if (!protocolSelect || !hostInput || !portInput || !usernameInput) {
      return null;
    }

    const protocol = normaliseProtocolName(protocolSelect.value.trim().toLowerCase());
    const host = hostInput.value.trim();
    const port = portInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput?.value ?? '';

    return { protocol, host, port, username, password };
  };

  const isFormValid = (): boolean => {
    if (!protocolSelect || !hostInput || !portInput || !usernameInput) {
      return false;
    }
    if (!protocolSelect.value.trim()) {
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

    const payload: Record<string, string> = {};
    const { protocol, host, port } = details;

    if (protocol === 'ssh' || protocol === 'telnet') {
      payload.protocol = protocol;
    }

    if (host) {
      payload.host = host;
    }

    if (port) {
      payload.port = port;
    }

    const storageKey = 'chatter-terminal-target';
    const keys = Object.keys(payload);
    try {
      if (keys.length === 0) {
        window.localStorage?.removeItem(storageKey);
      } else {
        window.localStorage?.setItem(storageKey, JSON.stringify(payload));
      }
    } catch (error) {
      console.warn('Failed to persist terminal overrides', error);
    }
  };

  const applyDetailsToTerminal = (details: FormDetails): boolean => {
    const { protocol, host, port, username, password } = details;

    const terminalProtocol = stage.querySelector<HTMLSelectElement>('[data-terminal-protocol]');
    const terminalHost = stage.querySelector<HTMLInputElement>('[data-terminal-host]');
    const terminalPort = stage.querySelector<HTMLInputElement>('[data-terminal-port]');
    const terminalUsername = stage.querySelector<HTMLInputElement>('[data-terminal-username]');
    const terminalPassword = stage.querySelector<HTMLInputElement>('[data-terminal-password]');

    if (!terminalProtocol || !terminalHost || !terminalPort || !terminalUsername) {
      return false;
    }

    if (terminalProtocol.value !== protocol) {
      terminalProtocol.value = protocol;
      terminalProtocol.dispatchEvent(new Event('change', { bubbles: true }));
    }

    terminalHost.value = host;
    terminalHost.dispatchEvent(new Event('input', { bubbles: true }));

    terminalPort.value = port;
    terminalPort.dispatchEvent(new Event('input', { bubbles: true }));

    terminalUsername.value = username;
    terminalUsername.dispatchEvent(new Event('input', { bubbles: true }));

    if (terminalPassword) {
      if (protocol === 'ssh') {
        terminalPassword.disabled = false;
        terminalPassword.value = password;
        terminalPassword.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        terminalPassword.value = '';
        terminalPassword.disabled = true;
      }
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
      const connectButton = stage.querySelector<HTMLButtonElement>('[data-terminal-connect]');
      let clicked = false;
      if (applied && connectButton && !connectButton.disabled) {
        connectButton.click();
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

  const syncPortPlaceholder = () => {
    if (!protocolSelect || !portInput) {
      return;
    }
    if (portInput.value.trim()) {
      return;
    }
    if (runtimeDefaults.port) {
      portInput.placeholder = runtimeDefaults.port;
      return;
    }
    const protocol = protocolSelect.value.trim().toLowerCase();
    portInput.placeholder = protocol === 'telnet' ? '23' : '22';
  };

  const applyStoredCredentials = () => {
    const stored = readStoredCredentials();
    if (protocolSelect) {
      const protocolValue = stored.protocol ?? runtimeDefaults.protocol;
      const option = Array.from(protocolSelect.options).find((entry) => entry.value === protocolValue);
      if (option) {
        protocolSelect.value = option.value;
      }
    }
    if (hostInput) {
      const hostValue = stored.host ?? runtimeDefaults.host;
      if (hostValue) {
        hostInput.value = hostValue;
      }
    }
    if (portInput) {
      const portValue = stored.port ?? runtimeDefaults.port;
      if (portValue) {
        portInput.value = portValue;
      }
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
      const state = store.snapshot();
      const taken = new Set<string>();
      if (typeof state?.currentUser?.username === 'string') {
        const trimmed = state.currentUser.username.trim();
        if (trimmed) {
          taken.add(trimmed);
        }
      }
      if (state && typeof state === 'object') {
        const profileEntries = state.profiles ?? {};
        for (const profile of Object.values(profileEntries)) {
          if (profile && typeof profile === 'object' && 'username' in profile) {
            const candidate = (profile as { username?: string }).username;
            if (typeof candidate === 'string') {
              const trimmed = candidate.trim();
              if (trimmed) {
                taken.add(trimmed);
              }
            }
          }
        }
        if (Array.isArray(state.connectedUsers)) {
          for (const handle of state.connectedUsers) {
            if (typeof handle === 'string') {
              const trimmed = handle.trim();
              if (trimmed) {
                taken.add(trimmed);
              }
            }
          }
        }
      }
      usernameInput.value = pickRandomNickname(taken);
    }
  };

  const persistCredentials = () => {
    if (!protocolSelect || !hostInput || !portInput || !usernameInput) {
      return;
    }
    const payload: StoredCredentials = {
      protocol: protocolSelect.value.trim(),
      host: hostInput.value.trim(),
      port: portInput.value.trim(),
      username: usernameInput.value.trim()
    };
    if (!payload.protocol || !payload.host || !payload.port || !payload.username) {
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
    if (sessionActive) {
      container.setAttribute('aria-hidden', 'true');
    } else {
      container.setAttribute('aria-hidden', 'false');
    }

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
          setFeedback('Session closed. Connect to re-enter the lounge.');
        }
      }
      suppressTransitionMessage = false;
    } else if (!sessionActive && feedbackElement && feedbackElement.textContent?.trim() === '') {
      setFeedback('Enter your bridge details to continue.');
    }

    lastSessionActive = sessionActive;
  };

  const handleConnect = () => {
    if (!isFormValid()) {
      form?.reportValidity();
      setFeedback('Complete the protocol, address, port, and username fields.', 'error', true);
      updateConnectAvailability();
      return;
    }

    const details = readFormDetails();
    if (!details) {
      setFeedback('Provide complete bridge details before connecting.', 'error', true);
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
    setFeedback('Bridge connection requested. Complete the captcha to enter the lounge.', 'success', true);
  };

  const handleFormSubmit = (event: Event) => {
    event.preventDefault();
    handleConnect();
  };

  const handleFormInputChange = () => {
    updateConnectAvailability();
  };

  const handleProtocolChange = () => {
    syncPortPlaceholder();
    updateConnectAvailability();
  };

  form?.addEventListener('submit', handleFormSubmit);
  protocolSelect?.addEventListener('change', handleProtocolChange);
  hostInput?.addEventListener('input', handleFormInputChange);
  portInput?.addEventListener('input', handleFormInputChange);
  usernameInput?.addEventListener('input', handleFormInputChange);

  const unsubscribe = store.subscribe(update);

  applyStoredCredentials();
  syncPortPlaceholder();
  updateConnectAvailability();

  setFeedback('Enter your bridge details to continue.');
  update();

  return {
    dispose: () => {
      form?.removeEventListener('submit', handleFormSubmit);
      protocolSelect?.removeEventListener('change', handleProtocolChange);
      hostInput?.removeEventListener('input', handleFormInputChange);
      portInput?.removeEventListener('input', handleFormInputChange);
      usernameInput?.removeEventListener('input', handleFormInputChange);
      unsubscribe();
    }
  };
};
