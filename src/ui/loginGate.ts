import type { ChatStore } from '../state/chatStore.js';

type FeedbackTone = 'info' | 'success' | 'error';

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

  const connectButton = container.querySelector<HTMLButtonElement>('[data-login-connect]');
  const disconnectButton = container.querySelector<HTMLButtonElement>('[data-login-disconnect]');
  const statusLabel = container.querySelector<HTMLElement>('[data-login-status]');
  const feedbackElement = container.querySelector<HTMLElement>('[data-login-feedback]');
  const focusTarget = container.querySelector<HTMLElement>('[data-login-focus]') ?? connectButton;

  let lastSessionActive = store.snapshot().sessionActive;
  let suppressTransitionMessage = false;

  const setFeedback = (message: string, tone: FeedbackTone = 'info', suppressTransition = false) => {
    if (!feedbackElement) {
      return;
    }

    feedbackElement.textContent = message;
    setElementTone(feedbackElement, tone);
    suppressTransitionMessage = suppressTransition;
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

    if (statusLabel) {
      statusLabel.textContent = sessionActive ? 'Connected' : 'Disconnected';
    }

    if (connectButton) {
      connectButton.disabled = sessionActive;
    }

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
      setFeedback('Log in to reach the lounge controls.');
    }

    lastSessionActive = sessionActive;
  };

  const handleConnect = () => {
    const result = store.resumeSession();
    if (!result.ok) {
      setFeedback(result.error ?? 'Unable to resume session.', 'error', true);
      return;
    }
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

  connectButton?.addEventListener('click', handleConnect);
  disconnectButton?.addEventListener('click', handleDisconnect);

  const unsubscribe = store.subscribe(update);

  setFeedback('Log in to reach the lounge controls.');
  update();

  return {
    dispose: () => {
      connectButton?.removeEventListener('click', handleConnect);
      disconnectButton?.removeEventListener('click', handleDisconnect);
      unsubscribe();
    }
  };
};
