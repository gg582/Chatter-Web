import type { ChatStore } from '../state/chatStore.js';

type FeedbackTone = 'info' | 'success' | 'error';

type StoredCredentials = {
  protocol: string;
  host: string;
  port: string;
  username: string;
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
  const connectButton = container.querySelector<HTMLButtonElement>('[data-login-connect]');
  const disconnectButton = container.querySelector<HTMLButtonElement>('[data-login-disconnect]');
  const statusLabel = container.querySelector<HTMLElement>('[data-login-status]');
  const feedbackElement = container.querySelector<HTMLElement>('[data-login-feedback]');
  const focusTarget = container.querySelector<HTMLElement>('[data-login-focus]') ?? connectButton;

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

  const syncPortPlaceholder = () => {
    if (!protocolSelect || !portInput) {
      return;
    }
    if (portInput.value.trim()) {
      return;
    }
    const protocol = protocolSelect.value.trim().toLowerCase();
    portInput.placeholder = protocol === 'telnet' ? '23' : '22';
  };

  const applyStoredCredentials = () => {
    const stored = readStoredCredentials();
    if (protocolSelect && stored.protocol) {
      const option = Array.from(protocolSelect.options).find((entry) => entry.value === stored.protocol);
      if (option) {
        protocolSelect.value = option.value;
      }
    }
    if (hostInput && stored.host) {
      hostInput.value = stored.host;
    }
    if (portInput && stored.port) {
      portInput.value = stored.port;
    }
    if (usernameInput && stored.username) {
      usernameInput.value = stored.username;
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

    if (disconnectButton) {
      disconnectButton.disabled = !sessionActive;
    }

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

    const result = store.resumeSession();
    if (!result.ok) {
      setFeedback(result.error ?? 'Unable to resume session.', 'error', true);
      return;
    }
    persistCredentials();
    setFeedback(result.message ?? 'Session restored.', 'success', true);
  };

  const handleDisconnect = () => {
    const result = store.endSession();
    if (!result.ok) {
      setFeedback(result.error ?? 'Session already closed.', 'error', true);
      return;
    }
    setFeedback(result.message ?? 'Session ended.', 'info', true);
  };

  disconnectButton?.addEventListener('click', handleDisconnect);

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
      disconnectButton?.removeEventListener('click', handleDisconnect);
      form?.removeEventListener('submit', handleFormSubmit);
      protocolSelect?.removeEventListener('change', handleProtocolChange);
      hostInput?.removeEventListener('input', handleFormInputChange);
      portInput?.removeEventListener('input', handleFormInputChange);
      usernameInput?.removeEventListener('input', handleFormInputChange);
      unsubscribe();
    }
  };
};
