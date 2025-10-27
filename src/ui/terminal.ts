import { ChatStore } from '../state/chatStore.js';
import { describeMobilePlatform, detectMobilePlatform, escapeHtml, isMobilePlatform } from './helpers.js';
import type { MobilePlatform } from './helpers.js';

const runtimeMap = new WeakMap<HTMLElement, TerminalRuntime>();
const textEncoder = new TextEncoder();
const TARGET_STORAGE_KEY = 'chatter-terminal-target';

const parseServiceDomain = (
  value: string
): { host: string; pathPrefix: string } | null => {
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    const host = url.host.trim();
    if (!host) {
      return null;
    }
    const trimmedPath = url.pathname.replace(/\/+$/, '');
    const pathPrefix = trimmedPath === '/' ? '' : trimmedPath;
    return { host, pathPrefix };
  } catch {
    return null;
  }
};

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

  const config = readRuntimeConfig();
  const datasetPath = container.dataset.terminalPath;
  const rawPath = (datasetPath && datasetPath.trim()) || '/terminal';
  const safePath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  const defaultScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const base = new URL(window.location.href);
  base.protocol = `${defaultScheme}:`;
  base.username = '';
  base.password = '';
  base.search = '';
  base.hash = '';
  let pathPrefix = '';

  const domainOverride =
    typeof config?.webServiceDomain === 'string' ? config.webServiceDomain.trim() : '';
  if (domainOverride) {
    const parsedDomain = parseServiceDomain(domainOverride);
    if (!parsedDomain) {
      console.warn('Ignoring invalid CHATTER_WEB_SERVICE_DOMAIN value:', domainOverride);
    } else {
      base.host = parsedDomain.host;
      pathPrefix = parsedDomain.pathPrefix;
    }
  }

  base.pathname = pathPrefix ? `${pathPrefix}${safePath}` : safePath;

  return base.toString();
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

let entryStatusIdCounter = 0;

const createEntryStatusId = () => {
  entryStatusIdCounter += 1;
  return `terminal-entry-status-${entryStatusIdCounter}`;
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
  incomingBuffer: string;
  incomingLineElement: HTMLPreElement | null;
  maxOutputLines: number;
  appendLine: (text: string, kind?: TerminalLineKind) => void;
  updateStatus: (label: string, state: 'disconnected' | 'connecting' | 'connected') => void;
  updateConnectAvailability?: () => void;
  updateViewportSizing?: () => void;
  mobilePlatform: MobilePlatform | null;
  mobileForm?: HTMLFormElement;
  mobileBuffer?: HTMLTextAreaElement;
  mobileSendButton?: HTMLButtonElement;
  mobileClearButton?: HTMLButtonElement;
  mobileStatus?: HTMLElement;
  setMobileStatus?: (message: string, tone?: 'default' | 'muted' | 'error') => void;
  updateMobileSendAvailability?: () => void;
};

type AnsiState = {
  color: string | null;
  colorCode: number | null;
  background: string | null;
  bold: boolean;
};

type ParsedAnsiLine = {
  fragment: DocumentFragment;
  trailingBackground: string | null;
};

const ANSI_FOREGROUND_COLOR_MAP: Record<number, string> = {
  30: '#000000',
  31: '#aa0000',
  32: '#00aa00',
  33: '#aa5500',
  34: '#0000aa',
  35: '#aa00aa',
  36: '#00aaaa',
  37: '#aaaaaa',
  90: '#555555',
  91: '#ff5555',
  92: '#55ff55',
  93: '#ffff55',
  94: '#5555ff',
  95: '#ff55ff',
  96: '#55ffff',
  97: '#ffffff'
};

const ANSI_BACKGROUND_COLOR_MAP: Record<number, string> = {
  40: '#000000',
  41: '#aa0000',
  42: '#00aa00',
  43: '#aa5500',
  44: '#0000aa',
  45: '#aa00aa',
  46: '#00aaaa',
  47: '#aaaaaa',
  100: '#555555',
  101: '#ff5555',
  102: '#55ff55',
  103: '#ffff55',
  104: '#5555ff',
  105: '#ff55ff',
  106: '#55ffff',
  107: '#ffffff'
};

const ANSI_PATTERN = /\u001b\[([0-9;]*)([A-Za-z])/g;

const ANSI_BOLD_FOREGROUND_ALIASES: Record<number, number> = {
  30: 90,
  31: 91,
  32: 92,
  33: 93,
  34: 94,
  35: 95,
  36: 96,
  37: 97
};

const resolveForegroundColor = (code: number, bold: boolean): string | null => {
  const effectiveCode = bold ? ANSI_BOLD_FOREGROUND_ALIASES[code] ?? code : code;
  return ANSI_FOREGROUND_COLOR_MAP[effectiveCode] ?? null;
};

const createAnsiFragment = (line: string): ParsedAnsiLine => {
  const fragment = document.createDocumentFragment();
  const state: AnsiState = { color: null, colorCode: null, background: null, bold: false };
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
    span.className = 'terminal__segment';
    span.textContent = segment;
    if (state.color) {
      span.style.color = state.color;
    }
    if (state.background) {
      span.style.setProperty('--segment-bg', state.background);
      span.classList.add('terminal__segment--background');
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
        state.colorCode = null;
        state.background = null;
        state.bold = false;
        continue;
      }
      if (code === 1) {
        state.bold = true;
        if (state.colorCode !== null) {
          const resolved = resolveForegroundColor(state.colorCode, state.bold);
          state.color = resolved;
        }
        continue;
      }
      if (code === 22) {
        state.bold = false;
        if (state.colorCode !== null) {
          const resolved = resolveForegroundColor(state.colorCode, state.bold);
          state.color = resolved;
        }
        continue;
      }
      if (code === 39) {
        state.color = null;
        state.colorCode = null;
        continue;
      }
      if (code === 49) {
        state.background = null;
        continue;
      }
      const foreground = resolveForegroundColor(code, state.bold);
      if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
        state.colorCode = code;
        state.color = foreground;
        continue;
      }
      if (foreground) {
        state.color = foreground;
        state.colorCode = code;
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

  return { fragment, trailingBackground: state.background };
};

const applyTrailingBackground = (element: HTMLElement, trailingBackground: string | null) => {
  if (trailingBackground) {
    element.style.setProperty('--terminal-trailing-bg', trailingBackground);
    element.classList.add('terminal__line--trailing-background');
    return;
  }

  element.style.removeProperty('--terminal-trailing-bg');
  element.classList.remove('terminal__line--trailing-background');
};

const renderAnsiLine = (target: HTMLElement, content: string) => {
  if (!content) {
    target.replaceChildren();
    applyTrailingBackground(target, null);
    return;
  }

  const { fragment, trailingBackground } = createAnsiFragment(content);
  target.replaceChildren(fragment);
  applyTrailingBackground(target, trailingBackground);
};

const limitOutputLines = (output: HTMLElement, maxLines = 600) => {
  const safeMaxLines = Number.isFinite(maxLines) && maxLines > 0 ? Math.floor(maxLines) : 600;
  while (output.childElementCount > safeMaxLines) {
    output.removeChild(output.firstElementChild as ChildNode);
  }
};

const computeViewportHeight = (windowHeight: number): number => {
  const minimum = 260;
  const suggested = Math.max(windowHeight * 0.65, minimum);
  const available = Math.max(windowHeight - 200, minimum);
  const capped = Math.min(suggested, available, 720);
  return Math.max(minimum, Math.round(capped));
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

  const root = container.closest<HTMLElement>('[data-chatter-root]');
  const containerDatasetPlatform = container.dataset.mobilePlatform;
  const containerDatasetLabel = container.dataset.mobilePlatformLabel;
  const rootDatasetPlatform = root?.dataset.mobilePlatform;
  const rootDatasetLabel = root?.dataset.mobilePlatformLabel;

  let detectedPlatform: MobilePlatform | null = null;
  let detectedLabel = '';

  if (containerDatasetPlatform && isMobilePlatform(containerDatasetPlatform)) {
    detectedPlatform = containerDatasetPlatform;
    if (containerDatasetLabel && containerDatasetLabel.trim()) {
      detectedLabel = containerDatasetLabel.trim();
    }
  } else if (rootDatasetPlatform && isMobilePlatform(rootDatasetPlatform)) {
    detectedPlatform = rootDatasetPlatform;
    if (rootDatasetLabel && rootDatasetLabel.trim()) {
      detectedLabel = rootDatasetLabel.trim();
    }
  }

  if (!detectedPlatform) {
    const fallbackPlatform = detectMobilePlatform();
    if (fallbackPlatform) {
      detectedPlatform = fallbackPlatform;
    }
  }

  if (detectedPlatform && !detectedLabel) {
    detectedLabel = describeMobilePlatform(detectedPlatform);
  }

  if (detectedPlatform) {
    container.dataset.mobilePlatform = detectedPlatform;
    if (detectedLabel) {
      container.dataset.mobilePlatformLabel = detectedLabel;
    }
    if (root) {
      root.classList.add('chatter-app--mobile');
      if (!root.dataset.mobilePlatform) {
        root.dataset.mobilePlatform = detectedPlatform;
      }
      if (detectedLabel && !root.dataset.mobilePlatformLabel) {
        root.dataset.mobilePlatformLabel = detectedLabel;
      }
    }
  } else {
    delete container.dataset.mobilePlatform;
    delete container.dataset.mobilePlatformLabel;
  }

  const entryIntro = detectedLabel
      ? `Detected ${escapeHtml(detectedLabel)}. Queue commands in the dedicated entry and we\'ll keep arrows and Ctrl shortcuts flowing to the bridge.`
      : 'Queue commands in the dedicated entry to keep arrows and Ctrl shortcuts flowing straight to the bridge.';

  const entryInstructions =
      'Type a command and press Enter or Send to forward the next line to the bridge. Shift+Enter adds a newline to the buffer.';

  const entryStatusId = createEntryStatusId();

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
            <span class="terminal__field-label">USERNAME</span>
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
          <p class="terminal__note terminal__note--muted">Handles can include letters, numbers, dots, underscores, or hyphens.</p>
        </div>
        <div class="terminal__controls-buttons">
          <button type="button" data-terminal-connect>Connect</button>
          <button type="button" data-terminal-disconnect disabled>Disconnect</button>
          <button type="button" data-terminal-focus>Focus command entry</button>
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
        Arrow keys, Tab, and Ctrl shortcuts flow through the command entry. Tap Focus if the bridge stops listening.
      </p>
      <p class="terminal__note terminal__note--alpha">
        Need a refresher? The cheatsheet lists colourful ANSI cues for classic commands.
      </p>
      <div class="terminal__viewport" data-terminal-viewport>
        <div class="terminal__output" data-terminal-output></div>
      </div>
      <section class="terminal__entry" data-terminal-entry>
        <header class="terminal__entry-header">
          <h3 class="terminal__entry-title">Command entry</h3>
          <p class="terminal__entry-subtitle">${entryIntro}</p>
        </header>
        <form class="terminal__entry-form" data-terminal-entry-form>
          <label class="terminal__entry-field">
            <span class="terminal__entry-label">Buffered input</span>
            <textarea
              class="terminal__capture"
              data-terminal-capture
              data-terminal-entry-buffer
              rows="4"
              placeholder="${escapeHtml(entryInstructions)}"
              aria-describedby="${entryStatusId}"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
            ></textarea>
          </label>
          <div class="terminal__entry-actions">
            <button type="submit" data-terminal-entry-send>Send next line</button>
            <button type="button" data-terminal-entry-clear>Clear buffer</button>
          </div>
          <p
            id="${entryStatusId}"
            class="terminal__entry-status"
            role="status"
            aria-live="polite"
            data-terminal-entry-status
          >${escapeHtml(entryInstructions)}</p>
        </form>
      </section>
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
  const entryElement = container.querySelector<HTMLElement>('[data-terminal-entry]');
  const entryForm = entryElement?.querySelector<HTMLFormElement>('[data-terminal-entry-form]');
  const entryStatusElement = entryElement?.querySelector<HTMLElement>('[data-terminal-entry-status]');
  const entrySendButton = entryElement?.querySelector<HTMLButtonElement>('[data-terminal-entry-send]');
  const entryClearButton = entryElement?.querySelector<HTMLButtonElement>('[data-terminal-entry-clear]');

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
    !optionsElement ||
    !entryElement ||
    !entryForm ||
    !entryStatusElement ||
    !entrySendButton ||
    !entryClearButton
    ) {
      throw new Error('Failed to mount the web terminal.');
    }

    const entryStatusNode = entryStatusElement;
    const entrySendControl = entrySendButton;
    const entryClearControl = entryClearButton;
    let entryStatusIdentifier = entryStatusNode.id.trim();

    if (!entryStatusIdentifier) {
      entryStatusIdentifier = createEntryStatusId();
      entryStatusNode.id = entryStatusIdentifier;
    }

    captureElement.setAttribute('aria-describedby', entryStatusIdentifier);

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
    incomingBuffer: '',
    incomingLineElement: null,
    maxOutputLines: 600,
    appendLine: (text: string, kind: TerminalLineKind = 'info') => {
      if (kind === 'incoming') {
        processIncomingChunk(text);
        return;
      }

      const lines = text.replace(/\r\n/g, '\n').split('\n');
      for (const line of lines) {
        const entry = document.createElement('pre');
        entry.className = `terminal__line terminal__line--${kind}`;
        const { fragment, trailingBackground } = createAnsiFragment(line);
        entry.append(fragment);
        applyTrailingBackground(entry, trailingBackground);
        runtime.outputElement.append(entry);
      }
      limitOutputLines(runtime.outputElement, runtime.maxOutputLines);
      if (runtime.incomingLineElement && !runtime.incomingLineElement.isConnected) {
        runtime.incomingLineElement = null;
        runtime.incomingBuffer = '';
      }
      runtime.outputElement.scrollTop = runtime.outputElement.scrollHeight;
    },
    updateStatus: (label, state) => {
      runtime.statusElement.textContent = label;
      runtime.indicatorElement.setAttribute('data-state', state);
    },
    mobilePlatform,
    mobileForm: mobileForm ?? undefined,
    mobileBuffer: mobileBuffer ?? undefined,
    mobileSendButton: mobileSendButton ?? undefined,
    mobileClearButton: mobileClearButton ?? undefined,
    mobileStatus: mobileStatus ?? undefined
  };

  if (mobilePlatform && mobileForm && mobileBuffer && mobileSendButton && mobileClearButton && mobileStatus) {
    const introLabel = resolvedLabel || describeMobilePlatform(mobilePlatform);
    const setMobileStatus = (message: string, tone: 'default' | 'muted' | 'error' = 'default') => {
      mobileStatus.textContent = message;
      mobileStatus.classList.remove('terminal__mobile-status--muted', 'terminal__mobile-status--error');
      if (tone === 'muted') {
        mobileStatus.classList.add('terminal__mobile-status--muted');
      } else if (tone === 'error') {
        mobileStatus.classList.add('terminal__mobile-status--error');
      }
    };

    const updateMobileSendAvailability = () => {
      const ready = Boolean(runtime.socket && runtime.socket.readyState === WebSocket.OPEN);
      mobileSendButton.disabled = !ready;
    };

    const sendBufferedLine = (): boolean => {
      if (!runtime.socket || runtime.socket.readyState !== WebSocket.OPEN) {
        setMobileStatus('Connect to the terminal bridge before sending commands.', 'error');
        return false;
      }

      const rawValue = mobileBuffer.value;
      if (!rawValue) {
        setMobileStatus('Type a command or add a newline to queue an empty line.', 'error');
        return false;
      }

      const normalised = rawValue.replace(/\r/g, '');
      if (!normalised) {
        setMobileStatus('Type a command or add a newline to queue an empty line.', 'error');
        return false;
      }

      const newlineIndex = normalised.indexOf('\n');
      const line = newlineIndex === -1 ? normalised : normalised.slice(0, newlineIndex);
      const remainder = newlineIndex === -1 ? '' : normalised.slice(newlineIndex + 1);

      if (!line && newlineIndex === -1) {
        setMobileStatus('Insert a newline to send an empty line or enter a command.', 'error');
        return false;
      }

      sendTextPayload(line ? `${line}\r` : '\r');
      mobileBuffer.value = remainder;
      mobileBuffer.focus();

      if (line) {
        setMobileStatus(remainder ? 'Line sent. Next buffered line is ready.' : 'Line sent. Buffer is now empty.', 'muted');
      } else {
        setMobileStatus('Sent a blank line.', 'muted');
      }

      return true;
    };

    mobileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      sendBufferedLine();
    });

    mobileClearButton.addEventListener('click', () => {
      mobileBuffer.value = '';
      setMobileStatus('Buffer cleared. Compose a new command when you are ready.', 'muted');
      mobileBuffer.focus();
    });

    runtime.setMobileStatus = setMobileStatus;
    runtime.updateMobileSendAvailability = updateMobileSendAvailability;
    updateMobileSendAvailability();
    setMobileStatus(
      `${introLabel} mobile mode ready. Connect to the bridge, type a command, then send a line when you are ready.`,
      'muted'
    );
  }

  function ensureIncomingLine(): HTMLPreElement {
    if (runtime.incomingLineElement && runtime.incomingLineElement.isConnected) {
      return runtime.incomingLineElement;
    }

    const entry = document.createElement('pre');
    entry.className = 'terminal__line terminal__line--incoming';
    runtime.outputElement.append(entry);
    runtime.incomingLineElement = entry;
    limitOutputLines(runtime.outputElement, runtime.maxOutputLines);
    if (runtime.incomingLineElement && !runtime.incomingLineElement.isConnected) {
      runtime.incomingLineElement = null;
      runtime.incomingBuffer = '';
    }
    return entry;
  }

  const updateViewportSizing = () => {
    if (typeof window === 'undefined') {
      runtime.maxOutputLines = 600;
      return;
    }

    const desiredHeight = computeViewportHeight(window.innerHeight);
    runtime.viewport.style.height = `${desiredHeight}px`;
    runtime.outputElement.style.height = `${desiredHeight}px`;
    runtime.outputElement.style.overflowY = 'hidden';

    const computed = window.getComputedStyle(runtime.outputElement);
    const lineHeightValue = Number.parseFloat(computed.lineHeight);
    const fontSizeValue = Number.parseFloat(computed.fontSize);
    const fallbackLineHeight = Number.isFinite(fontSizeValue) ? fontSizeValue * 1.45 : 18;
    const lineHeight = Number.isFinite(lineHeightValue) && lineHeightValue > 0 ? lineHeightValue : fallbackLineHeight;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const availableForLines = Math.max(desiredHeight - paddingTop - paddingBottom, lineHeight);
    runtime.maxOutputLines = Math.max(1, Math.floor(availableForLines / lineHeight));
    limitOutputLines(runtime.outputElement, runtime.maxOutputLines);
  };

  runtime.updateViewportSizing = updateViewportSizing;

  if (typeof window !== 'undefined') {
    updateViewportSizing();
    const handleResize = () => updateViewportSizing();
    window.addEventListener('resize', handleResize);
  }

  function processIncomingChunk(chunk: string) {
    if (!chunk) {
      return;
    }

    let buffer = runtime.incomingBuffer;
    let lineElement = runtime.incomingLineElement;
    let needsRender = false;

    for (const char of chunk) {
      if (char === '\r') {
        const target = ensureIncomingLine();
        renderAnsiLine(target, buffer);
        buffer = '';
        lineElement = runtime.incomingLineElement;
        needsRender = false;
        continue;
      }

      if (char === '\n') {
        if (buffer || !lineElement) {
          const target = ensureIncomingLine();
          renderAnsiLine(target, buffer);
        }
        buffer = '';
        lineElement = null;
        runtime.incomingBuffer = '';
        runtime.incomingLineElement = null;
        needsRender = false;
        continue;
      }

      if (char === '\u0008') {
        if (buffer) {
          buffer = buffer.slice(0, -1);
          needsRender = true;
        }
        continue;
      }

      buffer += char;
      needsRender = true;
    }

    if (needsRender) {
      const target = ensureIncomingLine();
      renderAnsiLine(target, buffer);
      lineElement = target;
    }

    runtime.incomingBuffer = buffer;
    runtime.incomingLineElement = lineElement;
    runtime.outputElement.scrollTop = runtime.outputElement.scrollHeight;
  }

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
      runtime.updateMobileSendAvailability?.();
      return;
    }
    runtime.connectButton.disabled = !runtime.target.available || !runtime.socketUrl || !hasUsername();
    runtime.updateMobileSendAvailability?.();
  };
  runtime.updateConnectAvailability = updateConnectAvailability;

  const setTargetStatusMessage = (message: string, variant: 'default' | 'muted' | 'error' = 'default') => {
    targetStatus.textContent = message;
    targetStatus.classList.remove('terminal__note--muted', 'terminal__note--error');
    if (variant === 'muted') {
      targetStatus.classList.add('terminal__note--muted');
    } else if (variant === 'error') {
      targetStatus.classList.add('terminal__note--error');
    }
  };

  const updateTargetStatus = () => {
    if (!targetStatus) {
      return;
    }

    if (runtime.target.overridesApplied.host || runtime.target.overridesApplied.port || runtime.target.overridesApplied.protocol) {
      setTargetStatusMessage(
        'Manual overrides are active in this browser. Clear the fields to enjoy the server defaults again.',
        'muted'
      );
      return;
    }

    if (runtime.target.defaults.host) {
      const portLabel =
        runtime.target.defaults.port ||
        (runtime.target.defaults.protocol === 'ssh' ? '22' : runtime.target.defaults.protocol === 'telnet' ? '23' : '');
      const hostLabel = portLabel ? `${runtime.target.defaults.host}:${portLabel}` : runtime.target.defaults.host;
      setTargetStatusMessage(`Server target ${hostLabel} is ready to dial.`, 'muted');
      return;
    }

    setTargetStatusMessage('No server target configured yet. Enter a host to connect straight from the lounge.', 'muted');
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

  let lastAvailability = runtime.target.available;

  const refreshTarget = (announce = false) => {
    const previousAvailability = lastAvailability;

    runtime.target = resolveTarget();
    runtime.endpointElement.textContent = runtime.target.description;
    syncUsernameField();

    if (announce && runtime.target.available && !previousAvailability) {
      runtime.updateStatus('Disconnected', 'disconnected');
      updateTargetStatus();
    } else if (announce && !runtime.target.available && previousAvailability) {
      runtime.updateStatus('Target cleared', 'disconnected');
      setTargetStatusMessage('Terminal target cleared. Provide a host override to reconnect.', 'error');
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
  refreshTarget(false);
    if (!runtime.socketUrl) {
      runtime.updateStatus('Bridge unavailable', 'disconnected');
      updateConnectAvailability();
      setEntryStatus('Bridge unavailable. Buffer stays queued until the service returns.', 'error');
      updateEntryControls();
    }

    connectButton.addEventListener('click', () => {
      if (runtime.connected) {
        return;
      }

    const { overrides, errors } = collectOverridesFromInputs();
    if (errors.length > 0) {
      setTargetStatusMessage(errors.join(' '), 'error');
      return;
    }

    saveTargetOverrides(overrides);
    refreshTarget(false);

    if (!runtime.target.available) {
      setTargetStatusMessage(
        'Cannot connect without a target host. Expand Connection options to save overrides or configure the server.',
        'error'
      );
      return;
    }
      const socketUrlText = runtime.socketUrl;
      if (!socketUrlText) {
        runtime.updateStatus('Bridge unavailable', 'disconnected');
        setEntryStatus('Bridge unavailable. Buffer stays queued until the service returns.', 'error');
        updateEntryControls();
        return;
      }
      const username = runtime.usernameInput.value.trim();
      if (!username) {
        runtime.updateStatus('Username required', 'disconnected');
        setEntryStatus('Enter a username before sending buffered commands.', 'error');
        return;
      }
      runtime.updateStatus('Connecting…', 'connecting');
      runtime.connecting = true;
      runtime.connectButton.disabled = true;
      setEntryStatus('Connecting to the bridge… buffered commands will send once ready.', 'muted');
      updateEntryControls();
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
          runtime.disconnectButton.disabled = false;
          focusCapture();
          updateConnectAvailability();
          setEntryStatus('Connected. Press Enter or Send to forward the next line.', 'muted');
          updateEntryControls();
        });
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          const pending = runtime.binaryDecoder.decode();
          if (pending) {
            runtime.appendLine(pending, 'incoming');
          }
          runtime.appendLine(event.data, 'incoming');
        } else if (event.data instanceof ArrayBuffer) {
          const decoded = runtime.binaryDecoder.decode(event.data, { stream: true });
          if (decoded) {
            runtime.appendLine(decoded, 'incoming');
          }
        }
      });
        socket.addEventListener('close', (event) => {
          const remainder = runtime.binaryDecoder.decode();
          if (remainder) {
            runtime.appendLine(remainder, 'incoming');
          }
          runtime.connecting = false;
          runtime.connected = false;
          runtime.socket = null;
          runtime.disconnectButton.disabled = true;
          runtime.updateStatus('Disconnected', 'disconnected');
          refreshTarget(false);
          updateConnectAvailability();
          setEntryStatus('Disconnected. Buffer stays queued until you reconnect.', 'muted');
          updateEntryControls();
        });
        socket.addEventListener('error', () => {
          runtime.updateStatus('Connection error', 'disconnected');
          setEntryStatus('Bridge error. Commands will resume after reconnecting.', 'error');
        });
      } catch (error) {
        runtime.connecting = false;
        runtime.connected = false;
        runtime.socket = null;
        runtime.disconnectButton.disabled = true;
        runtime.updateStatus('Connection failed', 'disconnected');
        console.error('Terminal connection failed', error);
        updateConnectAvailability();
        setEntryStatus('Connection failed. Buffer kept for your next attempt.', 'error');
        updateEntryControls();
      }
    });

  targetForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const { overrides, errors } = collectOverridesFromInputs();
    if (errors.length > 0) {
      setTargetStatusMessage(errors.join(' '), 'error');
      return;
    }

    const previousSignature = JSON.stringify(runtime.target.overridesApplied);
    saveTargetOverrides(overrides);
    refreshTarget(true);
    const currentSignature = JSON.stringify(runtime.target.overridesApplied);
    if (previousSignature === currentSignature) {
      setTargetStatusMessage('Terminal target overrides unchanged.', 'muted');
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
      const socket = runtime.socket;
      if (!socket) {
        return;
      }

      const sendDisconnectSequence = (value: string): boolean => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      try {
        socket.send(textEncoder.encode(value));
        return true;
      } catch (error) {
        console.warn('Failed to send disconnect sequence', error);
        return false;
      }
    };

      if (socket.readyState === WebSocket.OPEN) {
        runtime.updateStatus('Disconnecting…', 'connecting');
        runtime.disconnectButton.disabled = true;
        runtime.connected = false;
        runtime.connecting = true;
        runtime.updateConnectAvailability?.();
        setEntryStatus('Disconnect requested. Buffer stays available while we close the bridge.', 'muted');
        updateEntryControls();

        const modeSent = sendDisconnectSequence('/mode command\r');
        const exitSent = modeSent && sendDisconnectSequence('exit\r');

      if (modeSent && exitSent) {
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.close(1000, 'Client closed');
              } catch (error) {
                console.warn('Failed to close terminal socket after graceful disconnect attempt', error);
              }
            }
          }, 1500);
        }
        return;
      }
    }

    try {
      socket.close(1000, 'Client closed');
    } catch (error) {
      console.warn('Failed to close terminal socket', error);
    }
    setEntryStatus('Disconnect requested. Buffer stays available while we close the bridge.', 'muted');
    updateEntryControls();
  });

  const focusCapture = () => {
    const target = runtime.captureElement;
    try {
      target.focus({ preventScroll: true });
    } catch (error) {
      target.focus();
    }

    try {
      const position = target.value.length;
      target.setSelectionRange(position, position);
    } catch (error) {
      // Ignore selection updates in environments that do not support setSelectionRange.
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
    entryElement.classList.add('terminal__entry--focused');
  });

  runtime.captureElement.addEventListener('blur', () => {
    runtime.viewport.classList.remove('terminal__viewport--focused');
    entryElement.classList.remove('terminal__entry--focused');
  });

  function setEntryStatus(message: string, tone: 'default' | 'muted' | 'error' = 'default') {
    entryStatusNode.textContent = message;
    entryStatusNode.classList.remove('terminal__entry-status--muted', 'terminal__entry-status--error');
    if (tone === 'muted') {
      entryStatusNode.classList.add('terminal__entry-status--muted');
    } else if (tone === 'error') {
      entryStatusNode.classList.add('terminal__entry-status--error');
    }
  }

  function normaliseBufferValue(value: string): string {
    return value.replace(/\r\n?|\n/g, '\n');
  }

  function isSocketOpen(): boolean {
    return Boolean(runtime.socket && runtime.socket.readyState === WebSocket.OPEN);
  }

  function updateEntryControls() {
    const bufferedValue = normaliseBufferValue(runtime.captureElement.value);
    const hasBuffered = bufferedValue.length > 0;
    const socketOpen = isSocketOpen();
    entrySendControl.disabled = !hasBuffered || !socketOpen;
    entryClearControl.disabled = !hasBuffered;
  }

  function sendTextPayload(rawValue: string): boolean {
    if (!rawValue) {
      return false;
    }

    if (!isSocketOpen()) {
      setEntryStatus('Connect the bridge before sending commands.', 'error');
      updateEntryControls();
      return false;
    }

    const payload = normaliseLineBreaks(rawValue);
    if (!payload) {
      return false;
    }

    try {
      runtime.socket?.send(textEncoder.encode(payload));
      return true;
    } catch (error) {
      console.warn('Failed to send terminal payload', error);
      setEntryStatus('Failed to send the command to the bridge. Try again.', 'error');
      return false;
    }
  }

  function flushNextBufferedLine(allowBlank = false): boolean {
    const buffered = normaliseBufferValue(runtime.captureElement.value);
    if (!buffered && !allowBlank) {
      setEntryStatus('Buffer is empty. Type a command first or press Enter to send a blank line.', 'muted');
      return false;
    }

    let line = '';
    let remainder = '';

    if (buffered) {
      const newlineIndex = buffered.indexOf('\n');
      if (newlineIndex === -1) {
        line = buffered;
        remainder = '';
      } else {
        line = buffered.slice(0, newlineIndex);
        remainder = buffered.slice(newlineIndex + 1);
      }
    }

    const sent = sendTextPayload(`${line}\n`);
    if (!sent) {
      return false;
    }

    runtime.captureElement.value = remainder;
    try {
      const position = runtime.captureElement.value.length;
      runtime.captureElement.setSelectionRange(position, position);
    } catch (error) {
      // Ignore selection errors
    }
    runtime.captureElement.focus();

    if (line) {
      setEntryStatus('Sent the next line to the bridge.', 'default');
    } else {
      setEntryStatus('Sent a blank line to the bridge.', 'default');
    }

    updateEntryControls();
    return true;
  }

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

    runtime.captureElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        flushNextBufferedLine(true);
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

      if (!payload) {
        return;
      }

      if (!isSocketOpen()) {
        if (event.key === 'Tab') {
          event.preventDefault();
          const target = runtime.captureElement;
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? target.value.length;
          target.value = `${target.value.slice(0, start)}\t${target.value.slice(end)}`;
          try {
            target.setSelectionRange(start + 1, start + 1);
          } catch (error) {
            // Ignore selection errors when environments do not support setSelectionRange
          }
          updateEntryControls();
        }
        return;
      }

      if (sendTextPayload(payload)) {
        event.preventDefault();
      }
    });

    entryForm.addEventListener('submit', (event) => {
      event.preventDefault();
      flushNextBufferedLine(false);
    });

    entryClearControl.addEventListener('click', () => {
      runtime.captureElement.value = '';
      setEntryStatus('Buffer cleared. Nothing queued for the bridge.', 'muted');
      updateEntryControls();
      focusCapture();
    });

    runtime.captureElement.addEventListener('input', () => {
      updateEntryControls();
    });

    setEntryStatus(entryInstructions, 'muted');
    updateEntryControls();

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

  const datasetPlatform = container.dataset.mobilePlatform;
  if (datasetPlatform && isMobilePlatform(datasetPlatform)) {
    runtime.mobilePlatform = datasetPlatform;
  }

  runtime.target = resolveTarget();
  runtime.endpointElement.textContent = runtime.target.description;
  if (!runtime.connected) {
    runtime.updateConnectAvailability?.();
  }

  runtime.updateViewportSizing?.();

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
