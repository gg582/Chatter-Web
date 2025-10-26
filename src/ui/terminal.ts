import { ChatStore } from '../state/chatStore.js';
import { escapeHtml } from './helpers.js';

const runtimeMap = new WeakMap<HTMLElement, TerminalRuntime>();
const textEncoder = new TextEncoder();
const TARGET_STORAGE_KEY = 'chatter-terminal-target';

type TargetOverrides = {
  protocol?: 'telnet' | 'ssh';
  host?: string;
  port?: string;
};

const normaliseProtocolName = (value: string | undefined): 'telnet' | 'ssh' =>
  value === 'telnet' ? 'telnet' : 'ssh';

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
  const configuredHost = typeof config?.bbsHost === 'string' ? config.bbsHost.trim() : '';
  const configuredHostDefault =
    typeof config?.bbsHostDefault === 'string' ? config.bbsHostDefault.trim() : '';
  const defaultHost = configuredHost || configuredHostDefault;
  const configuredPort = typeof config?.bbsPort === 'string' ? config.bbsPort.trim() : '';
  const configuredPortDefault =
    typeof config?.bbsPortDefault === 'string' ? config.bbsPortDefault.trim() : '';
  const defaultPort = configuredPort || configuredPortDefault;
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
  return {
    available: Boolean(host),
    description,
    host,
    port,
    protocol,
    defaultUsername,
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
  binaryDecoder: TextDecoder;
  connected: boolean;
  connecting: boolean;
  socketUrl: string | null;
  target: TerminalTarget;
  appendLine: (text: string, kind?: TerminalLineKind) => void;
  updateStatus: (label: string, state: 'disconnected' | 'connecting' | 'connected') => void;
  updateConnectAvailability?: () => void;
};

type AnsiState = {
  color: string | null;
  background: string | null;
  bold: boolean;
};

const ANSI_FOREGROUND_COLOR_MAP: Record<number, string> = {
  30: '#1f2937',
  31: '#f87171',
  32: '#34d399',
  33: '#facc15',
  34: '#60a5fa',
  35: '#c084fc',
  36: '#22d3ee',
  37: '#f8fafc',
  90: '#94a3b8',
  91: '#fda4af',
  92: '#86efac',
  93: '#fde68a',
  94: '#93c5fd',
  95: '#f9a8d4',
  96: '#67e8f9',
  97: '#ffffff'
};

const ANSI_BACKGROUND_COLOR_MAP: Record<number, string> = {
  40: 'rgba(15, 23, 42, 0.85)',
  41: 'rgba(248, 113, 113, 0.35)',
  42: 'rgba(74, 222, 128, 0.35)',
  43: 'rgba(250, 204, 21, 0.35)',
  44: 'rgba(96, 165, 250, 0.35)',
  45: 'rgba(192, 132, 252, 0.35)',
  46: 'rgba(34, 211, 238, 0.35)',
  47: 'rgba(248, 250, 252, 0.18)',
  100: 'rgba(148, 163, 184, 0.35)',
  101: 'rgba(248, 180, 198, 0.35)',
  102: 'rgba(187, 247, 208, 0.35)',
  103: 'rgba(254, 243, 199, 0.35)',
  104: 'rgba(191, 219, 254, 0.35)',
  105: 'rgba(252, 207, 229, 0.35)',
  106: 'rgba(165, 243, 252, 0.35)',
  107: 'rgba(248, 250, 252, 0.28)'
};

const ANSI_PATTERN = /\u001b\[([0-9;]*)([A-Za-z])/g;

const createAnsiFragment = (line: string): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  const state: AnsiState = { color: null, background: null, bold: false };
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushSegment = (segment: string) => {
    if (!segment) {
      return;
    }
    if (!state.color && !state.background && !state.bold) {
      fragment.append(document.createTextNode(segment));
      return;
    }
    const span = document.createElement('span');
    span.textContent = segment;
    if (state.color) {
      span.style.color = state.color;
    }
    if (state.background) {
      span.style.backgroundColor = state.background;
    }
    if (state.bold) {
      span.style.fontWeight = '700';
    }
    fragment.append(span);
  };

  while ((match = ANSI_PATTERN.exec(line)) !== null) {
    const index = match.index;
    if (index > lastIndex) {
      pushSegment(line.slice(lastIndex, index));
    }
    lastIndex = ANSI_PATTERN.lastIndex;

    if (match[2] !== 'm') {
      continue;
    }

    const codes = match[1] ? match[1].split(';') : ['0'];

    for (const codeText of codes) {
      const code = Number.parseInt(codeText, 10);
      if (!Number.isFinite(code)) {
        continue;
      }
      if (code === 0) {
        state.color = null;
        state.background = null;
        state.bold = false;
        continue;
      }
      if (code === 1) {
        state.bold = true;
        continue;
      }
      if (code === 22) {
        state.bold = false;
        continue;
      }
      if (code === 39) {
        state.color = null;
        continue;
      }
      if (code === 49) {
        state.background = null;
        continue;
      }
      const foreground = ANSI_FOREGROUND_COLOR_MAP[code];
      if (foreground) {
        state.color = foreground;
        continue;
      }
      const background = ANSI_BACKGROUND_COLOR_MAP[code];
      if (background) {
        state.background = background;
        continue;
      }
    }
  }

  if (lastIndex < line.length) {
    pushSegment(line.slice(lastIndex));
  }

  return fragment;
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

const normaliseLineBreaks = (value: string): string =>
  value.replace(/\r\n?|\n/g, '\r\n');

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
          <h2>Terminal bridge</h2>
          <p class="card__description">
            Connect with the live board in a couple of taps. Protocol, host, and port come straight from the server
            defaults unless you store your own target.
          </p>
        </div>
        <div class="terminal__status">
          <span class="terminal__indicator" data-terminal-indicator></span>
          <span data-terminal-status>Disconnected</span>
        </div>
      </header>
      <div class="terminal__controls">
        <div class="terminal__controls-grid">
          <div class="terminal__endpoint">
            <span class="terminal__endpoint-label">Current target</span>
            <span class="terminal__endpoint-value" data-terminal-endpoint>${escapeHtml(target.description)}</span>
          </div>
          <label class="terminal__field terminal__field--inline" data-terminal-username-field>
            <span class="terminal__field-label">Username</span>
            <input
              type="text"
              data-terminal-username
              placeholder="Enter your handle"
              value="${escapeHtml(target.defaultUsername)}"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
            />
          </label>
        </div>
        <div class="terminal__controls-buttons">
          <button type="button" data-terminal-connect>Connect</button>
          <button type="button" data-terminal-disconnect disabled>Disconnect</button>
          <button type="button" data-terminal-focus>Focus terminal</button>
        </div>
      </div>
      <details class="terminal__options" data-terminal-options>
        <summary class="terminal__options-summary">
          <span>Connection settings</span>
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
                <span class="terminal__field-label">Host</span>
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
                <span class="terminal__field-label">Port</span>
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
              <button type="button" data-terminal-target-reset>Reset to server</button>
            </div>
          </form>
        </div>
      </details>
      <p class="terminal__note">
        Arrow keys, Tab, and Ctrl shortcuts reach the bridge. Tap Focus if the terminal stops listening.
      </p>
      <p class="terminal__note terminal__note--alpha">
        Need a refresher? The cheatsheet lists colourful ANSI cues for classic commands.
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
    binaryDecoder: new TextDecoder(),
    socketUrl: typeof socketUrl === 'string' && socketUrl.trim() ? socketUrl.trim() : null,
    target,
    connected: false,
    connecting: false,
    appendLine: (text: string, kind: TerminalLineKind = 'info') => {
      const lines = text.replace(/\r/g, '').split('\n');
      for (const line of lines) {
        const entry = document.createElement('pre');
        entry.className = `terminal__line terminal__line--${kind}`;
        entry.append(createAnsiFragment(line));
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

  const collectOverridesFromInputs = (): { overrides: TargetOverrides; errors: string[] } => {
    const protocolValue = protocolSelect.value.trim().toLowerCase();
    const hostValue = hostInput.value.trim();
    const portValue = portInput.value.trim();
    const errors: string[] = [];

    if (hostValue && (hostValue.length > 255 || /\s/.test(hostValue))) {
      errors.push('Host overrides cannot contain spaces and must be under 255 characters.');
    }

    if (portValue) {
      const parsedPort = Number.parseInt(portValue, 10);
      if (!Number.isFinite(parsedPort) || parsedPort <= 0 || parsedPort > 65_535) {
        errors.push('Port overrides must be a number between 1 and 65535.');
      }
    }

    const overrides: TargetOverrides = {};

    if ((protocolValue === 'ssh' || protocolValue === 'telnet') && protocolValue !== runtime.target.defaults.protocol) {
      overrides.protocol = protocolValue;
    }

    if (hostValue) {
      if (!runtime.target.defaults.host || hostValue !== runtime.target.defaults.host) {
        overrides.host = hostValue;
      }
    }

    if (portValue) {
      if (!runtime.target.defaults.port || portValue !== runtime.target.defaults.port) {
        overrides.port = portValue;
      }
    }

    return { overrides, errors };
  };

  const syncUsernameField = () => {
    runtime.usernameField.style.display = '';
    runtime.usernameInput.disabled = false;
    const placeholder =
      runtime.target.protocol === 'ssh'
        ? 'Enter your SSH username'
        : 'Enter your BBS handle';
    runtime.usernameInput.placeholder = placeholder;
    if (!runtime.usernameInput.value.trim() && runtime.target.defaultUsername) {
      runtime.usernameInput.value = runtime.target.defaultUsername;
    }
  };

  const hasUsername = () => runtime.usernameInput.value.trim().length > 0;

  const updateConnectAvailability = () => {
    if (runtime.connected || runtime.connecting) {
      runtime.connectButton.disabled = true;
      return;
    }
    runtime.connectButton.disabled = !runtime.target.available || !runtime.socketUrl || !hasUsername();
  };
  runtime.updateConnectAvailability = updateConnectAvailability;

  const updateTargetStatus = () => {
    if (!targetStatus) {
      return;
    }

    if (runtime.target.overridesApplied.host || runtime.target.overridesApplied.port || runtime.target.overridesApplied.protocol) {
      targetStatus.textContent =
        'Manual overrides are active in this browser. Clear the fields to enjoy the server defaults again.';
      return;
    }

    if (runtime.target.defaults.host) {
      const portLabel =
        runtime.target.defaults.port ||
        (runtime.target.defaults.protocol === 'ssh' ? '22' : runtime.target.defaults.protocol === 'telnet' ? '23' : '');
      const hostLabel = portLabel ? `${runtime.target.defaults.host}:${portLabel}` : runtime.target.defaults.host;
      targetStatus.textContent = `Server target ${hostLabel} is ready to dial.`;
      return;
    }

    targetStatus.textContent =
      'No server target configured yet. Enter a host to connect straight from the lounge.';
  };

  const updateFormPlaceholders = () => {
    const protocolValue =
      (protocolSelect.value === 'ssh' || protocolSelect.value === 'telnet'
        ? protocolSelect.value
        : runtime.target.defaults.protocol) ?? 'telnet';
    hostInput.placeholder = runtime.target.defaults.host || runtime.target.placeholders.host || 'bbs.example.com';
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
    protocolSelect.value = overrides.protocol ?? runtime.target.protocol ?? runtime.target.defaults.protocol;
    hostInput.value = overrides.host ?? runtime.target.host ?? runtime.target.defaults.host ?? '';
    portInput.value = overrides.port ?? runtime.target.port ?? runtime.target.defaults.port ?? '';

    updateFormPlaceholders();
    updateTargetStatus();

    if (!runtime.target.available) {
      runtime.optionsElement.open = true;
    }

    updateConnectAvailability();
  };

  runtime.updateStatus('Disconnected', 'disconnected');
  runtime.appendLine('Terminal bridge ready. Press Connect to reach the configured BBS target.');
  refreshTarget(false);
  if (!runtime.target.available) {
    runtime.appendLine('No BBS host is configured. Use Connection settings to dial a telnet or SSH host directly.', 'error');
  }
  if (!runtime.socketUrl) {
    runtime.appendLine('Unable to resolve terminal bridge URL from the current origin.', 'error');
    updateConnectAvailability();
  }

  connectButton.addEventListener('click', () => {
    if (runtime.connected) {
      runtime.appendLine('Already connected.', 'info');
      return;
    }

    const { overrides, errors } = collectOverridesFromInputs();
    if (errors.length > 0) {
      for (const message of errors) {
        runtime.appendLine(message, 'error');
      }
      return;
    }

    saveTargetOverrides(overrides);
    refreshTarget(false);

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
    if (!username) {
      runtime.appendLine('Enter a username before connecting.', 'error');
      return;
    }
    const protocolLabel = runtime.target.protocol ? runtime.target.protocol.toUpperCase() : 'TELNET';
    const hostPortLabel = runtime.target.port ? `${runtime.target.host}:${runtime.target.port}` : runtime.target.host;
    const displayTarget = username ? `${username}@${hostPortLabel}` : hostPortLabel;
    runtime.updateStatus('Connecting…', 'connecting');
    runtime.appendLine(`Connecting to ${protocolLabel} ${displayTarget} …`, 'info');
    runtime.connecting = true;
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
      runtime.binaryDecoder = new TextDecoder();
      socket.addEventListener('open', () => {
        runtime.connecting = false;
        runtime.connected = true;
        runtime.updateStatus('Connected', 'connected');
        runtime.appendLine('Connection established. Enjoy your TUI session!', 'info');
        runtime.disconnectButton.disabled = false;
        focusCapture();
        updateConnectAvailability();
      });
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          const pending = runtime.binaryDecoder.decode();
          if (pending) {
            runtime.appendLine(pending, 'incoming');
          }
          runtime.appendLine(event.data, 'incoming');
        } else if (event.data instanceof ArrayBuffer) {
          const decoded = runtime.binaryDecoder.decode(new Uint8Array(event.data), { stream: true });
          if (decoded) {
            runtime.appendLine(decoded, 'incoming');
          }
        }
      });
      socket.addEventListener('close', (event) => {
        const pending = runtime.binaryDecoder.decode();
        if (pending) {
          runtime.appendLine(pending, 'incoming');
        }
        runtime.connecting = false;
        runtime.connected = false;
        runtime.socket = null;
        runtime.disconnectButton.disabled = true;
        runtime.updateStatus('Disconnected', 'disconnected');
        runtime.appendLine(`Connection closed (code ${event.code}).`, 'info');
        refreshTarget(false);
        updateConnectAvailability();
      });
      socket.addEventListener('error', () => {
        runtime.appendLine('Terminal connection error.', 'error');
      });
    } catch (error) {
      runtime.connecting = false;
      runtime.connected = false;
      runtime.socket = null;
      runtime.disconnectButton.disabled = true;
      runtime.updateStatus('Disconnected', 'disconnected');
      runtime.appendLine(`Failed to connect: ${(error as Error).message}`, 'error');
      updateConnectAvailability();
    }
  });

  targetForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const { overrides, errors } = collectOverridesFromInputs();
    if (errors.length > 0) {
      for (const message of errors) {
        runtime.appendLine(message, 'error');
      }
      return;
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

  const focusCapture = () => {
    try {
      runtime.captureElement.focus({ preventScroll: true });
    } catch (error) {
      runtime.captureElement.focus();
    }
  };

  focusButton.addEventListener('click', () => {
    focusCapture();
  });

  viewport.addEventListener('click', () => {
    focusCapture();
  });

  runtime.captureElement.addEventListener('focus', () => {
    runtime.viewport.classList.add('terminal__viewport--focused');
  });

  runtime.captureElement.addEventListener('blur', () => {
    runtime.viewport.classList.remove('terminal__viewport--focused');
  });

  let isComposing = false;
  let pendingCompositionCommit: string | null = null;
  let compositionFlushTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelPendingCompositionFlush = () => {
    if (compositionFlushTimer !== null) {
      clearTimeout(compositionFlushTimer);
      compositionFlushTimer = null;
    }
  };

  const flushPendingComposition = (): boolean => {
    if (pendingCompositionCommit === null) {
      cancelPendingCompositionFlush();
      return false;
    }

    const value = pendingCompositionCommit;
    pendingCompositionCommit = null;
    cancelPendingCompositionFlush();

    if (value) {
      sendTextPayload(value);
    }

    clearCaptureValue();
    return Boolean(value);
  };

  if (typeof window !== 'undefined') {
    let unloadHandled = false;
    const handleUnload = () => {
      if (unloadHandled) {
        return;
      }
      unloadHandled = true;
      if (!runtime.socket) {
        return;
      }
      const state = runtime.socket.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        try {
          runtime.socket.close(1001, 'Page closed');
        } catch (error) {
          console.warn('Failed to close terminal socket on unload', error);
        }
      }
    };
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
  }

  const clearCaptureValue = () => {
    runtime.captureElement.value = '';
  };

  const sendTextPayload = (rawValue: string) => {
    if (!rawValue) {
      return;
    }

    if (!runtime.socket || runtime.socket.readyState !== WebSocket.OPEN) {
      runtime.appendLine('Text input dropped — not connected.', 'error');
      return;
    }

    const payload = normaliseLineBreaks(rawValue);
    if (!payload) {
      return;
    }

    runtime.socket.send(textEncoder.encode(payload));
  };

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
    }

    if (payload) {
      runtime.socket.send(textEncoder.encode(payload));
      event.preventDefault();
    }
  });

  runtime.captureElement.addEventListener('compositionstart', () => {
    isComposing = true;
    pendingCompositionCommit = null;
    cancelPendingCompositionFlush();
  });

  runtime.captureElement.addEventListener('compositionend', (event) => {
    isComposing = false;
    const compositionEvent = event as CompositionEvent;
    const committedValue =
      typeof compositionEvent.data === 'string' && compositionEvent.data.length > 0
        ? compositionEvent.data
        : runtime.captureElement.value;

    if (committedValue) {
      pendingCompositionCommit = committedValue;
      cancelPendingCompositionFlush();
      compositionFlushTimer = setTimeout(() => {
        flushPendingComposition();
      }, 0);
    } else {
      pendingCompositionCommit = null;
      cancelPendingCompositionFlush();
      clearCaptureValue();
    }
  });

  runtime.captureElement.addEventListener('input', (event) => {
    const inputEvent = event as InputEvent;

    if (inputEvent.isComposing || isComposing) {
      return;
    }

    if (flushPendingComposition()) {
      return;
    }

    if (inputEvent.inputType === 'insertLineBreak') {
      sendTextPayload('\u000d');
      clearCaptureValue();
      return;
    }

    if (inputEvent.inputType && inputEvent.inputType.startsWith('delete')) {
      sendTextPayload('\u0008');
      clearCaptureValue();
      return;
    }

    let valueToSend = '';

    if (inputEvent.inputType === 'insertFromPaste' || inputEvent.inputType === 'insertFromDrop') {
      valueToSend = runtime.captureElement.value;
    } else if (typeof inputEvent.data === 'string') {
      valueToSend = inputEvent.data;
    } else {
      valueToSend = runtime.captureElement.value;
    }

    if (valueToSend) {
      sendTextPayload(valueToSend);
    }

    clearCaptureValue();
  });

  runtime.usernameInput.addEventListener('input', () => {
    updateConnectAvailability();
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
    runtime.updateConnectAvailability?.();
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
