import { ChatStore } from '../state/chatStore.js';
import { escapeHtml } from './helpers.js';

const runtimeMap = new WeakMap<HTMLElement, TerminalRuntime>();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const TARGET_STORAGE_KEY = 'chatter-terminal-target';

type TargetOverrides = {
  protocol?: 'telnet' | 'ssh';
  host?: string;
  port?: string;
};

const normaliseProtocolName = (value: string | undefined): 'telnet' | 'ssh' =>
  value === 'ssh' ? 'ssh' : 'telnet';

const loadTargetOverrides = (): TargetOverrides => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(TARGET_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Partial<TargetOverrides>;
    const overrides: TargetOverrides = {};

    if (typeof parsed.protocol === 'string') {
      const protocol = parsed.protocol.trim().toLowerCase();
      if (protocol === 'telnet' || protocol === 'ssh') {
        overrides.protocol = protocol;
      }
    }

    if (typeof parsed.host === 'string') {
      const host = parsed.host.trim();
      if (host) {
        overrides.host = host;
      }
    }

    if (typeof parsed.port === 'string') {
      const port = parsed.port.trim();
      if (port) {
        overrides.port = port;
      }
    }

    return overrides;
  } catch (error) {
    console.warn('Failed to read terminal target overrides', error);
    return {};
  }
};

const saveTargetOverrides = (overrides: TargetOverrides) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  const payload: TargetOverrides = {};

  if (overrides.protocol === 'telnet' || overrides.protocol === 'ssh') {
    payload.protocol = overrides.protocol;
  }

  if (typeof overrides.host === 'string' && overrides.host.trim()) {
    payload.host = overrides.host.trim();
  }

  if (typeof overrides.port === 'string' && overrides.port.trim()) {
    payload.port = overrides.port.trim();
  }

  if (!payload.protocol && !payload.host && !payload.port) {
    window.localStorage.removeItem(TARGET_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify(payload));
};

const clearTargetOverrides = () => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  window.localStorage.removeItem(TARGET_STORAGE_KEY);
};

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
  protocol: 'telnet' | 'ssh';
  defaultUsername: string;
  overridesApplied: { host: boolean; port: boolean; protocol: boolean };
  defaults: { host: string; port: string; protocol: 'telnet' | 'ssh'; username: string };
  placeholders: { host: string; port: string };
};

const resolveTarget = (): TerminalTarget => {
  const config = readRuntimeConfig();
  const overrides = loadTargetOverrides();

  const defaultProtocol = normaliseProtocolName(
    typeof config?.bbsProtocol === 'string' ? config.bbsProtocol.trim().toLowerCase() : undefined
  );
  const defaultHost = typeof config?.bbsHost === 'string' ? config.bbsHost.trim() : '';
  const defaultPort = typeof config?.bbsPort === 'string' ? config.bbsPort.trim() : '';
  const defaultUsername = typeof config?.bbsSshUser === 'string' ? config.bbsSshUser.trim() : '';
  const configuredHostPlaceholder =
    typeof config?.bbsHostPlaceholder === 'string' ? config.bbsHostPlaceholder.trim() : '';

  const protocol = normaliseProtocolName(overrides.protocol ?? defaultProtocol);
  const host = (overrides.host ?? defaultHost ?? '').trim();
  const port = (overrides.port ?? defaultPort ?? '').trim();

  const overridesApplied = {
    protocol: typeof overrides.protocol === 'string' && overrides.protocol !== defaultProtocol,
    host: typeof overrides.host === 'string' && overrides.host !== defaultHost,
    port: typeof overrides.port === 'string' && overrides.port !== defaultPort
  };

  const defaults = {
    host: defaultHost,
    port: defaultPort,
    protocol: defaultProtocol,
    username: defaultUsername
  };

  const hostPlaceholder = configuredHostPlaceholder || defaultHost || 'bbs.example.com';
  const portPlaceholder = defaultPort || (defaultProtocol === 'ssh' ? '22' : '23');

  const descriptorParts: string[] = [protocol.toUpperCase()];
  if (host) {
    const displayPort = port || defaultPort || (protocol === 'ssh' ? '22' : '23');
    descriptorParts.push(displayPort ? `${host}:${displayPort}` : host);
  }
  if (overridesApplied.host || overridesApplied.port || overridesApplied.protocol) {
    descriptorParts.push('· custom target');
  }

  const description = descriptorParts.join(' ');
  const username = protocol === 'ssh' ? defaultUsername : '';

  return {
    available: Boolean(host),
    description,
    host,
    port,
    protocol,
    defaultUsername: username,
    overridesApplied,
    defaults,
    placeholders: {
      host: hostPlaceholder,
      port: portPlaceholder
    }
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
  usernameInput: HTMLInputElement;
  usernameField: HTMLElement;
  optionsElement: HTMLDetailsElement;
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
  const hostPlaceholderText = target.placeholders.host || 'bbs.example.com';
  const portPlaceholderText =
    target.placeholders.port || (target.defaults.protocol === 'ssh' ? '22' : '23');

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
      <details class="terminal__options" data-terminal-options>
        <summary class="terminal__options-summary">
          <span>Optional connection settings</span>
          <span class="terminal__options-summary-icon" aria-hidden="true"></span>
        </summary>
        <div class="terminal__options-body">
          <form class="terminal__target-form" data-terminal-target-form>
            <p class="terminal__note terminal__note--muted" data-terminal-target-status></p>
            <div class="terminal__target-grid">
              <label class="terminal__field">
                <span class="terminal__field-label">Protocol</span>
                <select data-terminal-protocol>
                  <option value="telnet">Telnet</option>
                  <option value="ssh">SSH</option>
                </select>
              </label>
              <label class="terminal__field">
                <span class="terminal__field-label">Host override</span>
                <input
                  type="text"
                  data-terminal-host
                  placeholder="${escapeHtml(hostPlaceholderText)}"
                  autocomplete="off"
                  autocapitalize="none"
                  autocorrect="off"
                  spellcheck="false"
                />
              </label>
              <label class="terminal__field">
                <span class="terminal__field-label">Port override</span>
                <input
                  type="text"
                  data-terminal-port
                  placeholder="${escapeHtml(portPlaceholderText)}"
                  autocomplete="off"
                  autocorrect="off"
                  inputmode="numeric"
                  pattern="[0-9]*"
                />
              </label>
            </div>
            <div class="terminal__target-actions">
              <button type="submit">Save target</button>
              <button type="button" data-terminal-target-reset>Reset overrides</button>
            </div>
          </form>
          <label class="terminal__field" data-terminal-username-field>
            <span class="terminal__field-label">SSH username</span>
            <input
              type="text"
              data-terminal-username
              placeholder="Required for SSH"
              value="${escapeHtml(target.defaultUsername)}"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
            />
          </label>
        </div>
      </details>
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
  const usernameInput = container.querySelector<HTMLInputElement>('[data-terminal-username]');
  const usernameField = container.querySelector<HTMLElement>('[data-terminal-username-field]');
  const targetForm = container.querySelector<HTMLFormElement>('[data-terminal-target-form]');
  const protocolSelect = container.querySelector<HTMLSelectElement>('[data-terminal-protocol]');
  const hostInput = container.querySelector<HTMLInputElement>('[data-terminal-host]');
  const portInput = container.querySelector<HTMLInputElement>('[data-terminal-port]');
  const targetResetButton = container.querySelector<HTMLButtonElement>('[data-terminal-target-reset]');
  const targetStatus = container.querySelector<HTMLElement>('[data-terminal-target-status]');
  const optionsElement = container.querySelector<HTMLDetailsElement>('[data-terminal-options]');

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
    !endpointElement ||
    !usernameInput ||
    !usernameField ||
    !targetForm ||
    !protocolSelect ||
    !hostInput ||
    !portInput ||
    !targetResetButton ||
    !targetStatus ||
    !optionsElement
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
    usernameInput,
    usernameField,
    optionsElement,
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

  const syncUsernameField = () => {
    if (runtime.target.protocol === 'ssh') {
      runtime.usernameField.style.display = '';
      runtime.usernameInput.disabled = false;
      if (!runtime.usernameInput.value && runtime.target.defaultUsername) {
        runtime.usernameInput.value = runtime.target.defaultUsername;
      }
    } else {
      runtime.usernameField.style.display = 'none';
      runtime.usernameInput.disabled = true;
      runtime.usernameInput.value = '';
    }
  };

  const updateTargetStatus = () => {
    if (!targetStatus) {
      return;
    }

    if (runtime.target.overridesApplied.host || runtime.target.overridesApplied.port || runtime.target.overridesApplied.protocol) {
      targetStatus.textContent =
        'Using custom overrides saved in this browser. Leave fields blank to fall back to the server configuration.';
      return;
    }

    if (runtime.target.defaults.host) {
      const portLabel =
        runtime.target.defaults.port ||
        (runtime.target.defaults.protocol === 'ssh' ? '22' : runtime.target.defaults.protocol === 'telnet' ? '23' : '');
      const hostLabel = portLabel ? `${runtime.target.defaults.host}:${portLabel}` : runtime.target.defaults.host;
      targetStatus.textContent = `Using server-provided target ${hostLabel}.`;
      return;
    }

    targetStatus.textContent =
      'No server target configured. Expand Connection options to save a host override and connect directly.';
  };

  const updateFormPlaceholders = () => {
    const protocolValue =
      (protocolSelect.value === 'ssh' || protocolSelect.value === 'telnet'
        ? protocolSelect.value
        : runtime.target.defaults.protocol) ?? 'telnet';
    hostInput.placeholder = runtime.target.placeholders.host || 'bbs.example.com';
    const fallbackPort =
      runtime.target.defaults.port || (protocolValue === 'ssh' ? '22' : protocolValue === 'telnet' ? '23' : '');
    portInput.placeholder = fallbackPort || runtime.target.placeholders.port || '23';
  };

  let lastOverrideSignature = JSON.stringify(runtime.target.overridesApplied);
  let lastAvailability = runtime.target.available;

  const refreshTarget = (announce = false) => {
    const previousOverrides = lastOverrideSignature;
    const previousAvailability = lastAvailability;

    runtime.target = resolveTarget();
    runtime.endpointElement.textContent = runtime.target.description;
    syncUsernameField();

    const overridesSignature = JSON.stringify(runtime.target.overridesApplied);
    if (announce && overridesSignature !== previousOverrides) {
      if (runtime.target.overridesApplied.host || runtime.target.overridesApplied.port || runtime.target.overridesApplied.protocol) {
        runtime.appendLine('Custom terminal target overrides active — connections will use your manual settings.', 'info');
      } else {
        runtime.appendLine('Reverted to the server-provided terminal target.', 'info');
      }
    }
    lastOverrideSignature = overridesSignature;

    if (announce && runtime.target.available && !previousAvailability) {
      runtime.appendLine('Terminal target available. You can connect now.', 'info');
    } else if (announce && !runtime.target.available && previousAvailability) {
      runtime.appendLine('Terminal target cleared. Provide a host override to reconnect.', 'error');
    }
    lastAvailability = runtime.target.available;

    const overrides = loadTargetOverrides();
    protocolSelect.value = overrides.protocol ?? runtime.target.defaults.protocol;
    hostInput.value = overrides.host ?? '';
    portInput.value = overrides.port ?? '';

    updateFormPlaceholders();
    updateTargetStatus();

    if (!runtime.target.available) {
      runtime.optionsElement.open = true;
    }

    if (!runtime.connected) {
      runtime.connectButton.disabled = !runtime.target.available || !runtime.socketUrl;
    }
  };

  runtime.updateStatus('Disconnected', 'disconnected');
  runtime.appendLine('Web terminal ready. Press Connect to reach the configured BBS target.');
  refreshTarget(false);
  if (!runtime.target.available) {
    runtime.appendLine(
      'No BBS host is configured. Expand Connection options to provide a host override or contact the operator.',
      'error'
    );
  }
  if (!runtime.socketUrl) {
    runtime.appendLine('Unable to resolve terminal bridge URL from the current origin.', 'error');
    runtime.connectButton.disabled = true;
  }

  connectButton.addEventListener('click', () => {
    refreshTarget(false);
    if (runtime.connected) {
      runtime.appendLine('Already connected.', 'info');
      return;
    }
    if (!runtime.target.available) {
      runtime.appendLine(
        'Cannot connect without a target host. Expand Connection options to save overrides or configure the server.',
        'error'
      );
      return;
    }
    const socketUrlText = runtime.socketUrl;
    if (!socketUrlText) {
      runtime.appendLine('Cannot connect without a resolved terminal bridge.', 'error');
      return;
    }
    const username = runtime.usernameInput.value.trim();
    if (runtime.target.protocol === 'ssh' && !username) {
      runtime.appendLine('Enter an SSH username before connecting.', 'error');
      return;
    }
    const protocolLabel = runtime.target.protocol ? runtime.target.protocol.toUpperCase() : 'TELNET';
    const hostPortLabel = runtime.target.port ? `${runtime.target.host}:${runtime.target.port}` : runtime.target.host;
    const displayTarget =
      runtime.target.protocol === 'ssh' && username ? `${username}@${hostPortLabel}` : hostPortLabel;
    runtime.updateStatus('Connecting…', 'connecting');
    runtime.appendLine(`Connecting to ${protocolLabel} ${displayTarget} …`, 'info');
    runtime.connectButton.disabled = true;
    try {
      const socketUrl = new URL(socketUrlText);
      socketUrl.searchParams.set('protocol', runtime.target.protocol);
      if (runtime.target.host) {
        socketUrl.searchParams.set('host', runtime.target.host);
      } else {
        socketUrl.searchParams.delete('host');
      }
      if (runtime.target.port) {
        socketUrl.searchParams.set('port', runtime.target.port);
      } else {
        socketUrl.searchParams.delete('port');
      }
      if (username) {
        socketUrl.searchParams.set('username', username);
      } else {
        socketUrl.searchParams.delete('username');
      }
      const socket = new WebSocket(socketUrl.toString());
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
        refreshTarget(false);
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

  targetForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const protocolValue = protocolSelect.value.trim().toLowerCase();
    const hostValue = hostInput.value.trim();
    const portValue = portInput.value.trim();

    if (hostValue && (hostValue.length > 255 || /\s/.test(hostValue))) {
      runtime.appendLine('Host overrides cannot contain spaces and must be under 255 characters.', 'error');
      return;
    }

    if (portValue) {
      const parsedPort = Number.parseInt(portValue, 10);
      if (!Number.isFinite(parsedPort) || parsedPort <= 0 || parsedPort > 65_535) {
        runtime.appendLine('Port overrides must be a number between 1 and 65535.', 'error');
        return;
      }
    }

    const overrides: TargetOverrides = {};

    if ((protocolValue === 'ssh' || protocolValue === 'telnet') && protocolValue !== runtime.target.defaults.protocol) {
      overrides.protocol = protocolValue;
    }

    if (hostValue && hostValue !== runtime.target.defaults.host) {
      overrides.host = hostValue;
    }

    if (portValue && portValue !== runtime.target.defaults.port) {
      overrides.port = portValue;
    }

    const previousSignature = JSON.stringify(runtime.target.overridesApplied);
    saveTargetOverrides(overrides);
    refreshTarget(true);
    const currentSignature = JSON.stringify(runtime.target.overridesApplied);
    if (previousSignature === currentSignature) {
      runtime.appendLine('Terminal target overrides unchanged.', 'info');
    }
  });

  targetResetButton.addEventListener('click', () => {
    clearTargetOverrides();
    refreshTarget(true);
  });

  protocolSelect.addEventListener('change', () => {
    updateFormPlaceholders();
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
