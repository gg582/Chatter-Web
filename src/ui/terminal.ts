import { ChatStore } from '../state/chatStore.js';
import { escapeHtml } from './helpers.js';

const runtimeMap = new WeakMap<HTMLElement, TerminalRuntime>();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const readRuntimeConfig = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.__CHATTER_CONFIG__;
};

type TerminalTarget = {
  available: boolean;
  description: string;
  host: string;
  port: string;
  protocol: string;
  sshUser: string;
};

const resolveTarget = (): TerminalTarget => {
  const config = readRuntimeConfig();
  const protocol = (config?.bbsProtocol ?? 'telnet').trim().toLowerCase();
  const host = typeof config?.bbsHost === 'string' ? config.bbsHost.trim() : '';
  const port = typeof config?.bbsPort === 'string' ? config.bbsPort.trim() : '';
  const sshUser = typeof config?.bbsSshUser === 'string' ? config.bbsSshUser.trim() : '';

  if (!host) {
    return {
      available: false,
      description: 'BBS target is not configured. Ask the operator to set CHATTER_BBS_*.',
      host: '',
      port: '',
      protocol,
      sshUser
    };
  }

  const pieces = [protocol ? protocol.toUpperCase() : 'TELNET'];
  const hostLabel = sshUser ? `${sshUser}@${host}` : host;
  pieces.push(port ? `${hostLabel}:${port}` : hostLabel);

  return {
    available: true,
    description: pieces.join(' '),
    host,
    port,
    protocol,
    sshUser
  };
};

const resolveSocketUrl = (container: HTMLElement): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const path = container.dataset.terminalPath ?? '/terminal';
  const trimmedPath = path.trim() || '/terminal';
  const safePath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  return `${scheme}://${host}${safePath}`;
};

const keySequences: Record<string, string> = {
  Enter: '\r',
  Backspace: '\u0008',
  Tab: '\t',
  Escape: '\u001b',
  ArrowUp: '\u001b[A',
  ArrowDown: '\u001b[B',
  ArrowRight: '\u001b[C',
  ArrowLeft: '\u001b[D',
  Home: '\u001b[H',
  End: '\u001b[F',
  PageUp: '\u001b[5~',
  PageDown: '\u001b[6~',
  Delete: '\u001b[3~',
  Insert: '\u001b[2~'
};

type TerminalLineKind = 'info' | 'error' | 'incoming' | 'outgoing';

type TerminalRuntime = {
  socket: WebSocket | null;
  statusElement: HTMLElement;
  indicatorElement: HTMLElement;
  outputElement: HTMLElement;
  captureElement: HTMLTextAreaElement;
  connectButton: HTMLButtonElement;
  disconnectButton: HTMLButtonElement;
  focusButton: HTMLButtonElement;
  viewport: HTMLElement;
  gameStatus: HTMLElement;
  endpointElement: HTMLElement;
  connected: boolean;
  socketUrl: string | null;
  target: TerminalTarget;
  appendLine: (text: string, kind?: TerminalLineKind) => void;
  updateStatus: (label: string, state: 'disconnected' | 'connecting' | 'connected') => void;
};

const limitOutputLines = (output: HTMLElement, maxLines = 600) => {
  while (output.childElementCount > maxLines) {
    output.removeChild(output.firstElementChild as ChildNode);
  }
};

const describeKey = (event: KeyboardEvent): string => {
  if (event.ctrlKey && event.key.length === 1) {
    return `Ctrl+${event.key.toUpperCase()}`;
  }
  if (event.key === ' ') {
    return 'Space';
  }
  return event.key;
};

const createRuntime = (container: HTMLElement): TerminalRuntime => {
  const target = resolveTarget();
  const socketUrl = resolveSocketUrl(container);

  container.innerHTML = `
    <section class="card card--terminal">
      <header class="terminal__header">
        <div>
          <h2>Web terminal</h2>
          <p class="card__description">
            Launch TUI helpers directly from the browser. Focus the terminal below to send real keystrokes.
          </p>
        </div>
        <div class="terminal__status">
          <span class="terminal__indicator" data-terminal-indicator></span>
          <span data-terminal-status>Disconnected</span>
        </div>
      </header>
      <div class="terminal__controls">
        <div class="terminal__endpoint">
          <span class="terminal__endpoint-label">Target:</span>
          <span class="terminal__endpoint-value" data-terminal-endpoint>${escapeHtml(target.description)}</span>
        </div>
        <div class="terminal__controls-buttons">
          <button type="button" data-terminal-connect>Connect</button>
          <button type="button" data-terminal-disconnect disabled>Disconnect</button>
          <button type="button" data-terminal-focus>Focus terminal</button>
        </div>
      </div>
      <p class="terminal__note">
        Tip: Arrow keys, Tab, and Ctrl shortcuts are forwarded to the session. Use the focus button if the terminal stops
        receiving input.
      </p>
      <p class="terminal__note terminal__note--alpha">
        Fly me to Alpha Centauri needs the BBS navigation charts—review them before starting <code>/game alpha</code>.
      </p>
      <div class="terminal__viewport" data-terminal-viewport>
        <div class="terminal__output" data-terminal-output></div>
      </div>
      <textarea
        class="terminal__capture"
        data-terminal-capture
        aria-label="Web terminal input"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
      ></textarea>
      <p class="terminal__game" data-terminal-game></p>
    </section>
  `;

  const statusElement = container.querySelector<HTMLElement>('[data-terminal-status]');
  const indicatorElement = container.querySelector<HTMLElement>('[data-terminal-indicator]');
  const outputElement = container.querySelector<HTMLElement>('[data-terminal-output]');
  const captureElement = container.querySelector<HTMLTextAreaElement>('[data-terminal-capture]');
  const connectButton = container.querySelector<HTMLButtonElement>('[data-terminal-connect]');
  const disconnectButton = container.querySelector<HTMLButtonElement>('[data-terminal-disconnect]');
  const focusButton = container.querySelector<HTMLButtonElement>('[data-terminal-focus]');
  const viewport = container.querySelector<HTMLElement>('[data-terminal-viewport]');
  const gameStatus = container.querySelector<HTMLElement>('[data-terminal-game]');
  const endpointElement = container.querySelector<HTMLElement>('[data-terminal-endpoint]');

  if (
    !statusElement ||
    !indicatorElement ||
    !outputElement ||
    !captureElement ||
    !connectButton ||
    !disconnectButton ||
    !focusButton ||
    !viewport ||
    !gameStatus ||
    !endpointElement
  ) {
    throw new Error('Failed to mount the web terminal.');
  }

  const runtime: TerminalRuntime = {
    socket: null,
    statusElement,
    indicatorElement,
    outputElement,
    captureElement,
    connectButton,
    disconnectButton,
    focusButton,
    viewport,
    gameStatus,
    endpointElement,
    socketUrl: typeof socketUrl === 'string' && socketUrl.trim() ? socketUrl.trim() : null,
    target,
    connected: false,
    appendLine: (text: string, kind: TerminalLineKind = 'info') => {
      const lines = text.replace(/\r/g, '').split('\n');
      for (const line of lines) {
        const entry = document.createElement('pre');
        entry.className = `terminal__line terminal__line--${kind}`;
        entry.textContent = line;
        runtime.outputElement.append(entry);
      }
      limitOutputLines(runtime.outputElement);
      runtime.outputElement.scrollTop = runtime.outputElement.scrollHeight;
    },
    updateStatus: (label, state) => {
      runtime.statusElement.textContent = label;
      runtime.indicatorElement.setAttribute('data-state', state);
    }
  };

  runtime.updateStatus('Disconnected', 'disconnected');
  runtime.appendLine('Web terminal ready. Press Connect to reach the configured BBS target.');
  if (!runtime.target.available) {
    runtime.appendLine('No BBS host is configured; contact the service operator.', 'error');
    runtime.connectButton.disabled = true;
  }
  if (!runtime.socketUrl) {
    runtime.appendLine('Unable to resolve terminal bridge URL from the current origin.', 'error');
    runtime.connectButton.disabled = true;
  }

  connectButton.addEventListener('click', () => {
    runtime.target = resolveTarget();
    runtime.endpointElement.textContent = runtime.target.description;
    if (runtime.connected) {
      runtime.appendLine('Already connected.', 'info');
      return;
    }
    if (!runtime.target.available) {
      runtime.appendLine('Cannot connect without a configured BBS target.', 'error');
      return;
    }
    if (!runtime.socketUrl) {
      runtime.appendLine('Cannot connect without a resolved terminal bridge.', 'error');
      return;
    }
    runtime.updateStatus('Connecting…', 'connecting');
    runtime.appendLine(`Connecting to ${runtime.target.description} …`, 'info');
    runtime.connectButton.disabled = true;
    try {
      const socket = new WebSocket(runtime.socketUrl);
      socket.binaryType = 'arraybuffer';
      runtime.socket = socket;
      socket.addEventListener('open', () => {
        runtime.connected = true;
        runtime.updateStatus('Connected', 'connected');
        runtime.appendLine('Connection established. Enjoy your TUI session!', 'info');
        runtime.disconnectButton.disabled = false;
        runtime.captureElement.focus();
      });
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          runtime.appendLine(event.data, 'incoming');
        } else if (event.data instanceof ArrayBuffer) {
          runtime.appendLine(textDecoder.decode(event.data), 'incoming');
        }
      });
      socket.addEventListener('close', (event) => {
        runtime.connected = false;
        runtime.socket = null;
        runtime.disconnectButton.disabled = true;
        runtime.connectButton.disabled = false;
        runtime.updateStatus('Disconnected', 'disconnected');
        runtime.appendLine(`Connection closed (code ${event.code}).`, 'info');
      });
      socket.addEventListener('error', () => {
        runtime.appendLine('Terminal connection error.', 'error');
      });
    } catch (error) {
      runtime.connected = false;
      runtime.socket = null;
      runtime.connectButton.disabled = false;
      runtime.disconnectButton.disabled = true;
      runtime.updateStatus('Disconnected', 'disconnected');
      runtime.appendLine(`Failed to connect: ${(error as Error).message}`, 'error');
    }
  });

  disconnectButton.addEventListener('click', () => {
    if (!runtime.socket) {
      runtime.appendLine('No active connection to close.', 'info');
      return;
    }
    runtime.appendLine('Closing connection …', 'info');
    runtime.socket.close(1000, 'Client closed');
  });

  focusButton.addEventListener('click', () => {
    runtime.captureElement.focus();
  });

  viewport.addEventListener('click', () => {
    runtime.captureElement.focus();
  });

  runtime.captureElement.addEventListener('focus', () => {
    runtime.viewport.classList.add('terminal__viewport--focused');
  });

  runtime.captureElement.addEventListener('blur', () => {
    runtime.viewport.classList.remove('terminal__viewport--focused');
  });

  runtime.captureElement.addEventListener('keydown', (event) => {
    if (!runtime.socket || runtime.socket.readyState !== WebSocket.OPEN) {
      runtime.appendLine(`Keystroke ${describeKey(event)} dropped — not connected.`, 'error');
      event.preventDefault();
      return;
    }
    let payload = '';
    if (event.ctrlKey && event.key.length === 1) {
      const upper = event.key.toUpperCase();
      const code = upper.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        payload = String.fromCharCode(code - 64);
      }
    } else if (keySequences[event.key]) {
      payload = keySequences[event.key];
    } else if (event.key.length === 1 && !event.metaKey) {
      payload = event.key;
    }
    if (payload) {
      runtime.socket.send(textEncoder.encode(payload));
      event.preventDefault();
    }
  });

  runtime.captureElement.addEventListener('input', () => {
    runtime.captureElement.value = '';
  });

  return runtime;
};

export const renderTerminal = (store: ChatStore, container: HTMLElement) => {
  let runtime = runtimeMap.get(container);
  if (!runtime) {
    runtime = createRuntime(container);
    runtimeMap.set(container, runtime);
  }

  runtime.target = resolveTarget();
  runtime.endpointElement.textContent = runtime.target.description;
  if (!runtime.connected) {
    runtime.connectButton.disabled = !runtime.target.available || !runtime.socketUrl;
  }

  const state = store.snapshot();
  if (state.activeGame === 'alpha') {
    runtime.gameStatus.innerHTML =
      'Fly me to Alpha Centauri armed: connect the terminal, then follow the nav charts broadcast in the BBS feeds.';
  } else if (state.activeGame) {
    runtime.gameStatus.textContent = `Running game: ${state.activeGame}. Use the terminal to control it.`;
  } else {
    runtime.gameStatus.textContent = 'No active game selected. Choose one from the Assistants panel.';
  }
};
