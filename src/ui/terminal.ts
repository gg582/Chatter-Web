import { ChatStore } from '../state/chatStore.js';
import { describeMobilePlatform, detectMobilePlatform, escapeHtml, isMobilePlatform } from './helpers.js';
import type { MobilePlatform } from './helpers.js';

const runtimeMap = new WeakMap<HTMLElement, TerminalRuntime>();
const textEncoder = new TextEncoder();
const TARGET_STORAGE_KEY = 'chatter-terminal-target';
const IDENTITY_STORAGE_KEY = 'chatter-terminal-identity';

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

type StoredIdentityEntry = {
  username: string;
};

const readStoredIdentities = (): Record<string, StoredIdentityEntry> => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const result: Record<string, StoredIdentityEntry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!key || typeof value !== 'object' || value === null) {
        continue;
      }
      const username = (value as { username?: unknown }).username;
      if (typeof username === 'string' && username.trim()) {
        result[key] = { username: username.trim() };
      }
    }
    return result;
  } catch (error) {
    console.warn('Failed to read terminal identity overrides', error);
    return {};
  }
};

const writeStoredIdentities = (entries: Record<string, StoredIdentityEntry>) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  const keys = Object.keys(entries);
  if (keys.length === 0) {
    window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
    return;
  }

  try {
    window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('Failed to persist terminal identity overrides', error);
  }
};

const readStoredUsername = (key: string): string => {
  if (!key) {
    return '';
  }

  const entries = readStoredIdentities();
  const entry = entries[key];
  return typeof entry?.username === 'string' ? entry.username : '';
};

const writeStoredUsername = (key: string, username: string) => {
  if (!key) {
    return;
  }

  const trimmed = username.trim();
  const entries = readStoredIdentities();

  if (!trimmed) {
    if (key in entries) {
      delete entries[key];
      writeStoredIdentities(entries);
    }
    return;
  }

  entries[key] = { username: trimmed };
  writeStoredIdentities(entries);
};

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

const stripIpv6Brackets = (value: string) =>
  value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;

const stripZoneId = (value: string) => (value.includes('%') ? value.split('%', 1)[0] : value);

const isPrivateIpv4 = (segments: number[]) => {
  if (segments.length !== 4 || segments.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = segments;

  if (a === 10 || a === 127 || a === 0) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  return false;
};

const isPrivateIpv6 = (value: string) => {
  const normalised = value.toLowerCase();

  if (normalised === '::1' || normalised === '::') {
    return true;
  }

  if (normalised.startsWith('fc') || normalised.startsWith('fd')) {
    return true;
  }

  if (normalised.startsWith('fe8') || normalised.startsWith('fe9') || normalised.startsWith('fea') || normalised.startsWith('feb')) {
    return true;
  }

  return false;
};

const isBlockedHostOverride = (value: string): boolean => {
  const withoutBrackets = stripIpv6Brackets(value);
  const stripped = stripZoneId(withoutBrackets);
  const lower = stripped.toLowerCase();

  if (!stripped) {
    return true;
  }

  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    return true;
  }

  const ipv4Parts = stripped.split('.');
  const isPotentialIpv4 = ipv4Parts.length === 4 && ipv4Parts.every((segment) => /^\d+$/.test(segment));
  if (isPotentialIpv4) {
    return isPrivateIpv4(ipv4Parts.map((segment) => Number.parseInt(segment, 10)));
  }

  const ipv6Candidate = stripped.replace(/[^0-9a-f:]/gi, '');
  if (ipv6Candidate.includes(':') && /^[0-9a-f:]+$/i.test(ipv6Candidate)) {
    return isPrivateIpv6(stripped);
  }

  return false;
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

const deriveIdentityKey = (target: TerminalTarget): string | null => {
  const protocol = target.protocol || target.defaults.protocol;
  const host = target.host || target.defaults.host;
  if (!host) {
    return null;
  }

  const port = target.port || target.defaults.port;
  const portSuffix = port ? `:${port}` : '';
  return `${protocol ?? 'ssh'}://${host}${portSuffix}`;
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

const SCROLL_LOCK_EPSILON = 4;

const keySequences: Record<string, string> = {
  Enter: '\r',
  Backspace: '\u007f',
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

const ENTRY_INPUT_GROUP = 'entry-buffer';

const onScreenShortcuts: Record<
  string,
  {
    payload: string;
    label: string;
    inputGroup: string;
  }
> = {
  'ctrl-c': { payload: '\u0003', label: 'Ctrl+C', inputGroup: ENTRY_INPUT_GROUP },
  'ctrl-z': { payload: '\u001a', label: 'Ctrl+Z', inputGroup: ENTRY_INPUT_GROUP },
  'ctrl-s': { payload: '\u0013', label: 'Ctrl+S', inputGroup: ENTRY_INPUT_GROUP },
  'ctrl-a': { payload: '\u0001', label: 'Ctrl+A', inputGroup: ENTRY_INPUT_GROUP },
  'arrow-up': { payload: keySequences.ArrowUp, label: 'Arrow up', inputGroup: 'arrow-up' },
  'arrow-down': { payload: keySequences.ArrowDown, label: 'Arrow down', inputGroup: 'arrow-down' },
  'arrow-left': { payload: keySequences.ArrowLeft, label: 'Arrow left', inputGroup: 'arrow-left' },
  'arrow-right': { payload: keySequences.ArrowRight, label: 'Arrow right', inputGroup: 'arrow-right' }
};

let entryStatusIdCounter = 0;

const createEntryStatusId = () => {
  entryStatusIdCounter += 1;
  return `terminal-entry-status-${entryStatusIdCounter}`;
};

type TerminalLineKind = 'info' | 'error' | 'incoming' | 'outgoing';

type TerminalRuntime = {
  socket: WebSocket | null;
  statusElements: HTMLElement[];
  indicatorElements: HTMLElement[];
  outputElement: HTMLElement;
  captureElement: HTMLTextAreaElement;
  entryElement: HTMLElement;
  entryForm: HTMLFormElement;
  entryStatusElement: HTMLElement;
  connectButtons: HTMLButtonElement[];
  disconnectButtons: HTMLButtonElement[];
  focusButton: HTMLButtonElement;
  keyboardToggleButton: HTMLButtonElement | null;
  keyboardPanel: HTMLElement;
  viewport: HTMLElement;
  gameStatus: HTMLElement;
  endpointElement: HTMLElement;
  usernameInput: HTMLInputElement;
  usernameField: HTMLElement;
  passwordInput: HTMLInputElement;
  passwordField: HTMLElement;
  controlsHost: HTMLElement | null;
  binaryDecoder: TextDecoder;
  connected: boolean;
  connecting: boolean;
  socketUrl: string | null;
  target: TerminalTarget;
  incomingBuffer: string;
  incomingLineElement: HTMLPreElement | null;
  asciiArtBlock: {
    element: HTMLPreElement;
    lines: string[];
    currentLine: string;
  } | null;
  maxOutputLines: number;
  autoScrollLocked: boolean;
  pendingAutoScroll: boolean;
  identityKey: string | null;
  lastStoredUsername: string;
  appendLine: (text: string, kind?: TerminalLineKind) => void;
  updateStatus: (label: string, state: 'disconnected' | 'connecting' | 'connected') => void;
  updateConnectAvailability?: () => void;
  updateViewportSizing?: () => void;
  mobilePlatform: MobilePlatform | null;
  requestDisconnect: (reason?: string) => boolean;
};

type RenderTerminalOptions = {
  controlsHost?: HTMLElement | null;
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

const ANSI_256_BASE_COLORS: readonly string[] = [
  '#000000',
  '#800000',
  '#008000',
  '#808000',
  '#000080',
  '#800080',
  '#008080',
  '#c0c0c0',
  '#808080',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#0000ff',
  '#ff00ff',
  '#00ffff',
  '#ffffff'
];

const ANSI_256_COMPONENT_VALUES = [0, 95, 135, 175, 215, 255];

const toHexComponent = (value: number) => value.toString(16).padStart(2, '0');

const clampColorComponent = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const rgbToHex = (r: number, g: number, b: number) =>
  `#${toHexComponent(clampColorComponent(r))}${toHexComponent(clampColorComponent(g))}${toHexComponent(
    clampColorComponent(b)
  )}`;

const resolveAnsi256Color = (index: number): string | null => {
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    return null;
  }

  if (index < ANSI_256_BASE_COLORS.length) {
    return ANSI_256_BASE_COLORS[index];
  }

  if (index < 232) {
    const offset = index - 16;
    const r = Math.floor(offset / 36);
    const g = Math.floor((offset % 36) / 6);
    const b = offset % 6;

    return rgbToHex(
      ANSI_256_COMPONENT_VALUES[r],
      ANSI_256_COMPONENT_VALUES[g],
      ANSI_256_COMPONENT_VALUES[b]
    );
  }

  const level = 8 + (index - 232) * 10;
  return rgbToHex(level, level, level);
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
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      pushSegment(line.slice(lastIndex, matchIndex));
    }
    lastIndex = ANSI_PATTERN.lastIndex;

    if (match[2] !== 'm') {
      continue;
    }

    const codes = match[1] ? match[1].split(';') : ['0'];

    let codeIndex = 0;

    while (codeIndex < codes.length) {
      const codeText = codes[codeIndex];
      codeIndex += 1;

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
      if (code === 38 || code === 48) {
        const modeText = codes[codeIndex];
        const mode = modeText ? Number.parseInt(modeText, 10) : Number.NaN;
        if (!Number.isFinite(mode)) {
          continue;
        }
        codeIndex += 1;

        if (mode === 5) {
          const colorIndexText = codes[codeIndex];
          const colorIndex = colorIndexText ? Number.parseInt(colorIndexText, 10) : Number.NaN;
          if (Number.isFinite(colorIndex)) {
            const resolved = resolveAnsi256Color(colorIndex);
            if (resolved) {
              if (code === 38) {
                state.color = resolved;
                state.colorCode = null;
              } else {
                state.background = resolved;
              }
            }
          }
          codeIndex += 1;
          continue;
        }

        if (mode === 2) {
          const rText = codes[codeIndex];
          const gText = codes[codeIndex + 1];
          const bText = codes[codeIndex + 2];
          if (typeof rText === 'string' && typeof gText === 'string' && typeof bText === 'string') {
            const r = Number.parseInt(rText, 10);
            const g = Number.parseInt(gText, 10);
            const b = Number.parseInt(bText, 10);
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
              const resolved = rgbToHex(r, g, b);
              if (code === 38) {
                state.color = resolved;
                state.colorCode = null;
              } else {
                state.background = resolved;
              }
            }
          }
          codeIndex += 3;
          continue;
        }

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

const createRuntime = (
  container: HTMLElement,
  options?: RenderTerminalOptions
): TerminalRuntime => {
  const controlsHost = options?.controlsHost ?? null;
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

  const mobilePlatform = detectedPlatform;
  const resolvedLabel = detectedLabel;

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

  const shellClasses = ['terminal-chat'];
  if (mobilePlatform) {
    shellClasses.push('terminal-chat--mobile');
  }

  const settingsHint = mobilePlatform
    ? resolvedLabel
      ? `Touch controls are enabled for ${escapeHtml(resolvedLabel)}. Manage additional options from the Settings view.`
      : 'Touch controls are enabled. Manage additional options from the Settings view.'
    : 'Open the ⚙️ Settings view to review connection overrides and bridge guidance.';

  const entryInstructions =
    'Type commands and press Enter to forward them to the bridge. Shift+Enter adds a newline.';

  const entryStatusId = createEntryStatusId();

  const controlBarMarkup = `
        <nav class="terminal-chat__menu-bar" aria-label="Terminal bridge controls">
          <div class="terminal-chat__menu-title">
            <span class="terminal-chat__menu-heading">Chatter terminal</span>
            <span class="terminal-chat__menu-subtitle">Bridge control bar</span>
          </div>
          <div class="terminal-chat__menu-rail">
            <div class="terminal-chat__menu-block terminal-chat__menu-block--status" role="group" aria-label="Connection status">
              <div class="terminal-chat__menu-status">
                <span class="terminal-chat__indicator" data-terminal-indicator data-state="disconnected"></span>
                <span class="terminal-chat__menu-status-label" data-terminal-status data-state="disconnected">Disconnected</span>
              </div>
              <div class="terminal-chat__menu-actions">
                <button type="button" class="terminal-chat__menu-button" data-terminal-connect>Connect</button>
                <button type="button" class="terminal-chat__menu-button" data-terminal-disconnect disabled>Disconnect</button>
              </div>
              <div class="terminal-chat__menu-endpoint">
                <span class="terminal-chat__menu-endpoint-label">Target</span>
                <span class="terminal-chat__endpoint-value" data-terminal-endpoint>${escapeHtml(target.description)}</span>
              </div>
              <p class="terminal-chat__menu-note">${settingsHint}</p>
              <p class="terminal-chat__menu-game terminal__game" data-terminal-game></p>
            </div>
            <div class="terminal-chat__menu-block terminal-chat__menu-block--identity" role="group" aria-label="Identity controls">
              <span class="terminal-chat__menu-block-title">Identity</span>
              <div class="terminal-chat__menu-inline-fields">
                <label class="terminal-chat__field terminal__field--compact" data-terminal-username-field>
                  <span class="terminal-chat__field-label">Username</span>
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
                <label class="terminal-chat__field terminal__field--compact" data-terminal-password-field>
                  <span class="terminal-chat__field-label">Password</span>
                  <input
                    type="password"
                    data-terminal-password
                    placeholder="Optional password"
                    autocomplete="current-password"
                    autocapitalize="none"
                    spellcheck="false"
                  />
                </label>
              </div>
              <p class="terminal-chat__hint terminal__note terminal__note--muted">
                Usernames and passwords never leave the browser. They're sent directly to the terminal bridge.
              </p>
            </div>
            <form
              class="terminal-chat__menu-block terminal-chat__menu-block--target terminal-chat__target-form terminal__target-form"
              data-terminal-target-form
            >
              <span class="terminal-chat__menu-block-title">Connection settings</span>
              <p class="terminal-chat__hint terminal__note terminal__note--muted" data-terminal-target-status></p>
              <div class="terminal-chat__menu-inline-fields">
                <label class="terminal-chat__field">
                  <span class="terminal-chat__field-label">Protocol</span>
                  <select data-terminal-protocol>
                    <option value="telnet">Telnet</option>
                    <option value="ssh">SSH</option>
                  </select>
                </label>
                <label class="terminal-chat__field">
                  <span class="terminal-chat__field-label">Host</span>
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
                <label class="terminal-chat__field">
                  <span class="terminal-chat__field-label">Port</span>
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
              <div class="terminal-chat__menu-actions terminal-chat__menu-actions--target">
                <button type="submit" class="terminal-chat__menu-button terminal-chat__menu-button--primary">Save target</button>
                <button type="button" class="terminal-chat__menu-button" data-terminal-target-reset>Reset to server</button>
              </div>
            </form>
          </div>
        </nav>`;

  if (controlsHost) {
    controlsHost.innerHTML = `
      <div class="settings-screen__bridge-panel">
        ${controlBarMarkup}
      </div>
    `;
  }

  container.innerHTML = `
    <section class="${shellClasses.join(' ')}" data-terminal-shell>
      <div class="terminal-chat__fullscreen">
        ${controlsHost ? '' : controlBarMarkup}
        <div class="terminal-chat__viewport terminal__viewport" data-terminal-viewport>
          <div class="terminal-chat__output terminal__output" data-terminal-output></div>
        </div>
        <div class="terminal-chat__entry-region">
          <div class="terminal-chat__entry-main">
            <div class="terminal-chat__keyboard" id="${entryStatusId}-kbd" data-terminal-kbd>
              <div class="terminal-chat__keyboard-grid">
                <button type="button" data-terminal-kbd-key="ctrl-c" data-terminal-kbd-group="entry-buffer">Ctrl+C</button>
                <button type="button" data-terminal-kbd-key="ctrl-z" data-terminal-kbd-group="entry-buffer">Ctrl+Z</button>
                <button type="button" data-terminal-kbd-key="ctrl-s" data-terminal-kbd-group="entry-buffer">Ctrl+S</button>
                <button type="button" data-terminal-kbd-key="ctrl-a" data-terminal-kbd-group="entry-buffer">Ctrl+A</button>
                <button type="button" data-terminal-kbd-key="arrow-up" data-terminal-kbd-group="arrow-up">↑</button>
                <button type="button" data-terminal-kbd-key="arrow-down" data-terminal-kbd-group="arrow-down">↓</button>
                <button type="button" data-terminal-kbd-key="arrow-left" data-terminal-kbd-group="arrow-left">←</button>
                <button type="button" data-terminal-kbd-key="arrow-right" data-terminal-kbd-group="arrow-right">→</button>
              </div>
              <p class="terminal-chat__keyboard-foot">Shortcuts send immediately. Keep composing in the buffer above.</p>
            </div>
            <section class="terminal-chat__panel-section terminal-chat__panel-section--entry terminal__entry" data-terminal-entry>
              <div class="terminal-chat__entry-head">
                <button type="button" class="terminal-chat__focus" data-terminal-focus>Focus</button>
                <p
                  id="${entryStatusId}"
                  class="terminal-chat__entry-status terminal__entry-status"
                  role="status"
                  aria-live="polite"
                  data-terminal-entry-status
                >${escapeHtml(entryInstructions)}</p>
              </div>
              <form class="terminal-chat__entry-form" data-terminal-entry-form>
                <label class="terminal-chat__entry-field">
                  <span class="terminal-chat__entry-label">Command buffer</span>
                  <textarea
                    class="terminal-chat__entry-textarea terminal__capture"
                    data-terminal-capture
                    data-terminal-entry-buffer
                    rows="1"
                    placeholder=""
                    aria-describedby="${entryStatusId}"
                    aria-label="Command buffer"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                  ></textarea>
                </label>
              </form>
            </section>
          </div>
        </div>
      </div>
    </section>
  `;



  const queryAll = <T extends Element>(selector: string): T[] => {
    const matches = Array.from(container.querySelectorAll<T>(selector));
    if (controlsHost) {
      matches.push(...Array.from(controlsHost.querySelectorAll<T>(selector)));
    }
    return matches;
  };

  const query = <T extends Element>(selector: string): T | null => {
    const withinContainer = container.querySelector<T>(selector);
    if (withinContainer) {
      return withinContainer;
    }
    return controlsHost?.querySelector<T>(selector) ?? null;
  };

  const statusElements = queryAll<HTMLElement>('[data-terminal-status]');
  const indicatorElements = queryAll<HTMLElement>('[data-terminal-indicator]');
  const outputElement = query<HTMLElement>('[data-terminal-output]');
  const connectButtons = queryAll<HTMLButtonElement>('[data-terminal-connect]');
  const disconnectButtons = queryAll<HTMLButtonElement>('[data-terminal-disconnect]');
  const focusButton = query<HTMLButtonElement>('[data-terminal-focus]');
  const viewport = query<HTMLElement>('[data-terminal-viewport]');
  const gameStatus = query<HTMLElement>('[data-terminal-game]');
  const endpointElement = query<HTMLElement>('[data-terminal-endpoint]');
  const usernameInput = query<HTMLInputElement>('[data-terminal-username]');
  const usernameField = query<HTMLElement>('[data-terminal-username-field]');
  const passwordInput = query<HTMLInputElement>('[data-terminal-password]');
  const passwordField = query<HTMLElement>('[data-terminal-password-field]');
  const targetForm = query<HTMLFormElement>('[data-terminal-target-form]');
  const protocolSelect = query<HTMLSelectElement>('[data-terminal-protocol]');
  const hostInput = query<HTMLInputElement>('[data-terminal-host]');
  const portInput = query<HTMLInputElement>('[data-terminal-port]');
  const targetResetButton = query<HTMLButtonElement>('[data-terminal-target-reset]');
  const targetStatus = query<HTMLElement>('[data-terminal-target-status]');
  const keyboardToggleButton = query<HTMLButtonElement>('[data-terminal-kbd-toggle]');
  const keyboardPanel = query<HTMLElement>('[data-terminal-kbd]');
  const entryElement = query<HTMLElement>('[data-terminal-entry]');
  const entryForm = entryElement?.querySelector<HTMLFormElement>('[data-terminal-entry-form]');
  const entryBufferElement = entryElement?.querySelector<HTMLTextAreaElement>('[data-terminal-entry-buffer]');
  const entryStatusElement = entryElement?.querySelector<HTMLElement>('[data-terminal-entry-status]');
  const mobileForm = query<HTMLFormElement>('[data-terminal-mobile-form]');
  const mobileBuffer = query<HTMLTextAreaElement>('[data-terminal-mobile-buffer]');
  const mobileSendButton = query<HTMLButtonElement>('[data-terminal-mobile-send]');
  const mobileClearButton = query<HTMLButtonElement>('[data-terminal-mobile-clear]');
  const mobileStatus = query<HTMLElement>('[data-terminal-mobile-status]');

  if (
    statusElements.length === 0 ||
    indicatorElements.length === 0 ||
    !outputElement ||
    !entryBufferElement ||
    connectButtons.length === 0 ||
    disconnectButtons.length === 0 ||
    !focusButton ||
    !viewport ||
    !gameStatus ||
    !endpointElement ||
    !usernameInput ||
    !usernameField ||
    !passwordInput ||
    !passwordField ||
    !keyboardPanel ||
    !targetForm ||
    !protocolSelect ||
    !hostInput ||
    !portInput ||
    !targetResetButton ||
    !targetStatus ||
    !entryElement ||
    !entryForm ||
    !entryStatusElement
  ) {
      throw new Error('Failed to mount the web terminal.');
    }

  const captureElement = entryBufferElement;
  let entryStatusIdentifier = entryStatusElement.id.trim();

  if (!entryStatusIdentifier) {
    entryStatusIdentifier = createEntryStatusId();
    entryStatusElement.id = entryStatusIdentifier;
  }

  captureElement.setAttribute('aria-describedby', entryStatusIdentifier);

  const parsePixelValue = (value: string | null): number => {
    if (!value) {
      return 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const resolveViewportHeight = (): number => {
    if (typeof window === 'undefined') {
      return 0;
    }

    const visualViewportHeight = window.visualViewport?.height;
    if (Number.isFinite(visualViewportHeight)) {
      return Number(visualViewportHeight);
    }

    if (Number.isFinite(window.innerHeight)) {
      return Number(window.innerHeight);
    }

    const docElement = window.document?.documentElement;
    if (docElement && Number.isFinite(docElement.clientHeight)) {
      return Number(docElement.clientHeight);
    }

    return 0;
  };

  let baseEntryHeight = 0;

  const measureBaseEntryHeight = (target: HTMLTextAreaElement): number => {
    if (baseEntryHeight > 0) {
      return baseEntryHeight;
    }

    if (typeof window === 'undefined') {
      baseEntryHeight = target.scrollHeight;
      return baseEntryHeight;
    }

    const computed = window.getComputedStyle(target);
    const minHeight = parsePixelValue(computed.minHeight);
    const lineHeight = parsePixelValue(computed.lineHeight);
    const paddingTop = parsePixelValue(computed.paddingTop);
    const paddingBottom = parsePixelValue(computed.paddingBottom);
    const borderTop = parsePixelValue(computed.borderTopWidth);
    const borderBottom = parsePixelValue(computed.borderBottomWidth);
    const intrinsic = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom;

    baseEntryHeight = Math.max(minHeight, intrinsic, target.scrollHeight);
    return baseEntryHeight;
  };

  let scrollOutputToBottom: (force?: boolean) => void = () => {};
  let updateScrollLockState: () => void = () => {};

  const runtime: TerminalRuntime = {
    socket: null,
    statusElements,
    indicatorElements,
    outputElement,
    captureElement,
    entryElement,
    entryForm,
    entryStatusElement,
    connectButtons,
    disconnectButtons,
    focusButton,
    keyboardToggleButton,
    keyboardPanel,
    viewport,
    gameStatus,
    endpointElement,
    usernameInput,
    usernameField,
    passwordInput,
    passwordField,
    controlsHost,
    mobilePlatform,
    binaryDecoder: new TextDecoder(),
    socketUrl: typeof socketUrl === 'string' && socketUrl.trim() ? socketUrl.trim() : null,
    target,
    connected: false,
    connecting: false,
    incomingBuffer: '',
    incomingLineElement: null,
    asciiArtBlock: null,
    maxOutputLines: 600,
    autoScrollLocked: false,
    pendingAutoScroll: false,
    identityKey: null,
    lastStoredUsername: '',
    requestDisconnect: () => false,
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
      scrollOutputToBottom();
    },
    updateStatus: (label, state) => {
      for (const element of runtime.statusElements) {
        element.textContent = label;
        element.setAttribute('data-state', state);
      }
      for (const indicator of runtime.indicatorElements) {
        indicator.setAttribute('data-state', state);
      }
    }
  };

  updateScrollLockState = () => {
    const { scrollHeight, scrollTop, clientHeight } = runtime.outputElement;
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
    runtime.autoScrollLocked = distanceToBottom > SCROLL_LOCK_EPSILON;
  };

  scrollOutputToBottom = (force = false) => {
    if (force || !runtime.autoScrollLocked) {
      runtime.outputElement.scrollTop = runtime.outputElement.scrollHeight;
      runtime.pendingAutoScroll = false;
      updateScrollLockState();
    } else {
      runtime.pendingAutoScroll = true;
    }
  };

  const handleOutputScroll = () => {
    const wasLocked = runtime.autoScrollLocked;
    updateScrollLockState();
    if (wasLocked && !runtime.autoScrollLocked && runtime.pendingAutoScroll) {
      scrollOutputToBottom(true);
    }
  };

  const handleOutputWheel = (event: WheelEvent) => {
    if (event.deltaY < 0) {
      runtime.autoScrollLocked = true;
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        updateScrollLockState();
      });
      return;
    }
    updateScrollLockState();
  };

  runtime.outputElement.addEventListener('scroll', handleOutputScroll, { passive: true });
  runtime.outputElement.addEventListener('wheel', handleOutputWheel, { passive: true });

  updateScrollLockState();
  scrollOutputToBottom(true);

  const adjustEntryBufferHeight = () => {
    const target = runtime.captureElement;

    if (!target) {
      return;
    }

    if (typeof window === 'undefined') {
      target.style.height = '';
      target.style.overflowY = 'hidden';
      return;
    }

    const minimumHeight = measureBaseEntryHeight(target);
    target.style.height = 'auto';

    const viewportHeight = resolveViewportHeight();
    const maxHeight = viewportHeight > 0 ? Math.max(minimumHeight * 3, viewportHeight * 0.4) : minimumHeight * 3;
    const nextHeight = Math.min(Math.max(target.scrollHeight, minimumHeight), maxHeight);
    target.style.height = `${nextHeight}px`;
    target.style.overflowY = target.scrollHeight > maxHeight ? 'auto' : 'hidden';

    updateViewportSizing();
  };

  let entryResizeScheduled = false;

  const scheduleEntryResize = () => {
    if (typeof window === 'undefined') {
      adjustEntryBufferHeight();
      return;
    }

    if (entryResizeScheduled) {
      return;
    }

    entryResizeScheduled = true;
    window.requestAnimationFrame(() => {
      entryResizeScheduled = false;
      adjustEntryBufferHeight();
    });
  };

  const keyboardButtons = Array.from(
    keyboardPanel.querySelectorAll<HTMLButtonElement>('[data-terminal-kbd-key]')
  );

  const KEEP_ALIVE_INTERVAL_MS = 20000;
  const KEEP_ALIVE_PAYLOAD = new Uint8Array([0]);
  let keepAliveTimer: number | null = null;
  let lastBridgeActivity = Date.now();

  const markBridgeActivity = () => {
    lastBridgeActivity = Date.now();
  };

  const stopKeepAliveTimer = () => {
    if (keepAliveTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  };

  const ensureKeepAliveTimer = () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (keepAliveTimer !== null) {
      return;
    }

    keepAliveTimer = window.setInterval(() => {
      const socket = runtime.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const now = Date.now();
      if (now - lastBridgeActivity < KEEP_ALIVE_INTERVAL_MS) {
        return;
      }

      try {
        socket.send(KEEP_ALIVE_PAYLOAD);
        markBridgeActivity();
      } catch (error) {
        console.warn('Failed to send terminal keep-alive payload', error);
        stopKeepAliveTimer();
      }
    }, KEEP_ALIVE_INTERVAL_MS);
  };

  const revealKeyboardPanel = () => {
    keyboardPanel.hidden = false;
    container.classList.add('terminal-chat--keyboard-open');
  };

  let keyboardOpen = false;
  const setKeyboardOpen = (open: boolean) => {
    keyboardOpen = open;
    if (keyboardToggleButton) {
      keyboardPanel.hidden = !open;
      keyboardToggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      container.classList.toggle('terminal-chat--keyboard-open', open);
    } else {
      revealKeyboardPanel();
    }

    if (open && keyboardButtons.length > 0) {
      keyboardButtons[0].focus();
    } else if (
      !open &&
      keyboardToggleButton &&
      document.activeElement &&
      keyboardPanel.contains(document.activeElement)
    ) {
      keyboardToggleButton.focus();
    }
  };

  if (keyboardToggleButton) {
    keyboardToggleButton.addEventListener('click', () => {
      setKeyboardOpen(!keyboardOpen);
    });

    keyboardPanel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setKeyboardOpen(false);
        keyboardToggleButton.focus();
      }
    });
  } else {
    revealKeyboardPanel();
    keyboardOpen = true;
  }

  keyboardButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const shortcutKey = button.dataset.terminalKbdKey;
      if (!shortcutKey) {
        return;
      }
      const shortcut = onScreenShortcuts[shortcutKey];
      if (!shortcut) {
        return;
      }
      const buttonGroup = button.dataset.terminalKbdGroup?.trim();
      const inputGroup = buttonGroup || shortcut.inputGroup;
      const sent = sendTextPayload(shortcut.payload);
      if (sent) {
        setEntryStatus(`${shortcut.label} sent to the bridge.`, 'muted');
        if (inputGroup === ENTRY_INPUT_GROUP) {
          focusCapture();
        } else if (typeof button.focus === 'function') {
          try {
            button.focus({ preventScroll: true });
          } catch (error) {
            try {
              button.focus();
            } catch (fallbackError) {
              // Ignore focus errors for unsupported environments.
            }
          }
        }
      }
    });
  });

  function ensureIncomingLine(): HTMLPreElement {
    if (runtime.asciiArtBlock) {
      runtime.incomingLineElement = runtime.asciiArtBlock.element;
      return runtime.asciiArtBlock.element;
    }

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

    runtime.viewport.style.removeProperty('height');
    runtime.viewport.style.removeProperty('max-height');
    runtime.viewport.style.removeProperty('min-height');
    runtime.outputElement.style.removeProperty('height');
    runtime.outputElement.style.removeProperty('max-height');
    runtime.outputElement.style.removeProperty('min-height');
    runtime.outputElement.style.overflowY = 'auto';

    const computed = window.getComputedStyle(runtime.outputElement);
    const lineHeightValue = Number.parseFloat(computed.lineHeight);
    const fontSizeValue = Number.parseFloat(computed.fontSize);
    const fallbackLineHeight = Number.isFinite(fontSizeValue) ? fontSizeValue * 1.45 : 18;
    const lineHeight = Number.isFinite(lineHeightValue) && lineHeightValue > 0 ? lineHeightValue : fallbackLineHeight;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const measuredHeight = runtime.outputElement.clientHeight;

    if (measuredHeight > 0) {
      const availableForLines = Math.max(measuredHeight - paddingTop - paddingBottom, lineHeight);
      runtime.maxOutputLines = Math.max(1, Math.floor(availableForLines / lineHeight));
      limitOutputLines(runtime.outputElement, runtime.maxOutputLines);
      return;
    }

    runtime.maxOutputLines = 600;
  };

  runtime.updateViewportSizing = updateViewportSizing;

  if (typeof window !== 'undefined') {
    updateViewportSizing();
    scheduleEntryResize();
    const handleResize = () => {
      updateViewportSizing();
      scheduleEntryResize();
    };
    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }
  }

  const asciiArtHeaderPattern = /shared ascii art:/i;
  const asciiArtPromptPattern = /^│\s*>/i;
  const asciiArtMessagePattern = /^#\d+\]/;

  const shouldStartAsciiArtBlock = (line: string) => asciiArtHeaderPattern.test(line);

  const isAsciiArtTerminator = (line: string) => {
    const trimmed = line.trimStart();
    return asciiArtPromptPattern.test(trimmed) || asciiArtMessagePattern.test(trimmed);
  };

  const updateAsciiArtPreview = (currentLine: string) => {
    const block = runtime.asciiArtBlock;
    if (!block) {
      return;
    }
    block.currentLine = currentLine;
    const visibleLines = currentLine ? [...block.lines, currentLine] : [...block.lines];
    block.element.textContent = visibleLines.join('\n');
  };

  const startAsciiArtBlock = (headerLine: string, element: HTMLPreElement) => {
    runtime.asciiArtBlock = {
      element,
      lines: [headerLine],
      currentLine: ''
    };
    element.classList.add('terminal__line--ascii-art');
    element.dataset.terminalBlock = 'ascii-art';
    applyTrailingBackground(element, null);
    element.textContent = headerLine;
    runtime.incomingLineElement = element;
    runtime.incomingBuffer = '';
  };

  const appendAsciiArtLine = (line: string) => {
    const block = runtime.asciiArtBlock;
    if (!block) {
      return;
    }
    block.lines.push(line);
    block.currentLine = '';
    block.element.textContent = block.lines.join('\n');
  };

  const finishAsciiArtBlock = () => {
    const block = runtime.asciiArtBlock;
    if (!block) {
      return;
    }
    block.currentLine = '';
    block.element.textContent = block.lines.join('\n');
    runtime.asciiArtBlock = null;
    runtime.incomingLineElement = null;
    runtime.incomingBuffer = '';
  };

  const appendStandaloneLine = (line: string) => {
    const entry = document.createElement('pre');
    entry.className = 'terminal__line terminal__line--incoming';
    const { fragment, trailingBackground } = createAnsiFragment(line);
    entry.append(fragment);
    applyTrailingBackground(entry, trailingBackground);
    runtime.outputElement.append(entry);
    limitOutputLines(runtime.outputElement, runtime.maxOutputLines);
  };

  const handleAsciiLineCommit = (line: string) => {
    if (!runtime.asciiArtBlock) {
      return;
    }

    if (isAsciiArtTerminator(line)) {
      finishAsciiArtBlock();
      if (line) {
        appendStandaloneLine(line);
      }
      return;
    }

    appendAsciiArtLine(line);
  };

  const handleRegularLineCommit = (line: string, element: HTMLPreElement | null) => {
    if (!shouldStartAsciiArtBlock(line)) {
      return;
    }

    const target = element ?? ensureIncomingLine();
    startAsciiArtBlock(line, target);
  };

  function processIncomingChunk(chunk: string) {
    if (!chunk) {
      return;
    }

    let buffer = runtime.incomingBuffer;
    let lineElement = runtime.incomingLineElement;
    let needsRender = false;

    for (const char of chunk) {
      if (char === '\r') {
        if (runtime.asciiArtBlock) {
          updateAsciiArtPreview(buffer);
          lineElement = runtime.asciiArtBlock.element;
          runtime.incomingLineElement = runtime.asciiArtBlock.element;
        } else {
          const target = ensureIncomingLine();
          renderAnsiLine(target, buffer);
          lineElement = runtime.incomingLineElement;
        }
        buffer = '';
        needsRender = false;
        continue;
      }

      if (char === '\n') {
        if (runtime.asciiArtBlock) {
          updateAsciiArtPreview(buffer);
          handleAsciiLineCommit(buffer);
        } else {
          if (buffer || !lineElement) {
            const target = ensureIncomingLine();
            renderAnsiLine(target, buffer);
            lineElement = runtime.incomingLineElement;
          }
          handleRegularLineCommit(buffer, lineElement);
        }

        buffer = '';
        lineElement = runtime.asciiArtBlock ? runtime.asciiArtBlock.element : null;
        runtime.incomingBuffer = '';
        runtime.incomingLineElement = runtime.asciiArtBlock ? runtime.asciiArtBlock.element : null;
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
      if (runtime.asciiArtBlock) {
        updateAsciiArtPreview(buffer);
        lineElement = runtime.asciiArtBlock.element;
        runtime.incomingLineElement = runtime.asciiArtBlock.element;
      } else {
        const target = ensureIncomingLine();
        renderAnsiLine(target, buffer);
        lineElement = target;
      }
    }

    runtime.incomingBuffer = buffer;
    runtime.incomingLineElement = lineElement;
    scrollOutputToBottom();
  }

  const collectOverridesFromInputs = (): { overrides: TargetOverrides; errors: string[] } => {
    const protocolValue = protocolSelect.value.trim().toLowerCase();
    const hostValue = hostInput.value.trim();
    const portValue = portInput.value.trim();
    const errors: string[] = [];

    if (hostValue && (hostValue.length > 255 || /\s/.test(hostValue))) {
      errors.push('Host overrides cannot contain spaces and must be under 255 characters.');
    }

    if (hostValue && isBlockedHostOverride(hostValue)) {
      errors.push('Host overrides cannot target private or loopback addresses.');
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

    if (hostValue && !isBlockedHostOverride(hostValue)) {
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
    const identityKey = deriveIdentityKey(runtime.target);
    const currentValue = runtime.usernameInput.value.trim();
    runtime.identityKey = identityKey;

    const storedUsername = identityKey ? readStoredUsername(identityKey) : '';
    runtime.lastStoredUsername = storedUsername;
    if (identityKey && storedUsername && (!currentValue || currentValue === runtime.target.defaultUsername)) {
      runtime.usernameInput.value = storedUsername;
      return;
    }

    if (!identityKey) {
      runtime.lastStoredUsername = '';
    }

    if (!runtime.usernameInput.value.trim() && runtime.target.defaultUsername) {
      runtime.usernameInput.value = runtime.target.defaultUsername;
    }
  };

  const hasUsername = () => runtime.usernameInput.value.trim().length > 0;

  const persistIdentity = () => {
    const key = runtime.identityKey ?? deriveIdentityKey(runtime.target);
    if (!key) {
      return;
    }
    runtime.identityKey = key;
    const trimmed = runtime.usernameInput.value.trim();
    if (trimmed === runtime.lastStoredUsername) {
      return;
    }
    writeStoredUsername(key, runtime.usernameInput.value);
    runtime.lastStoredUsername = trimmed;
  };

  const syncPasswordField = () => {
    if (runtime.target.protocol === 'ssh') {
      runtime.passwordField.style.display = '';
      runtime.passwordInput.disabled = false;
    } else {
      runtime.passwordField.style.display = 'none';
      runtime.passwordInput.disabled = true;
      runtime.passwordInput.value = '';
    }
  };

  const setConnectButtonsDisabled = (disabled: boolean) => {
    for (const button of runtime.connectButtons) {
      button.disabled = disabled;
    }
  };

  const setDisconnectButtonsDisabled = (disabled: boolean) => {
    for (const button of runtime.disconnectButtons) {
      button.disabled = disabled;
    }
  };

  const updateConnectAvailability = () => {
    if (runtime.connected || runtime.connecting) {
      setConnectButtonsDisabled(true);
      return;
    }
    const shouldDisable = !runtime.target.available || !runtime.socketUrl || !hasUsername();
    setConnectButtonsDisabled(shouldDisable);
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
    syncPasswordField();

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
      if (announce && hostInput) {
        hostInput.focus();
      }
      setEntryStatus('No server target configured. Use the control bar to add connection details.', 'error');
    } else if (!runtime.connected && !runtime.connecting) {
      setEntryStatus(entryInstructions, 'muted');
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

  for (const button of connectButtons) {
    button.addEventListener('click', () => {
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
        setTargetStatusMessage('Cannot connect without a target host. Use the control bar to add overrides.', 'error');
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
      const passwordValue = runtime.passwordInput.disabled ? '' : runtime.passwordInput.value;
      if (!username) {
        runtime.updateStatus('Username required', 'disconnected');
        setEntryStatus('Enter a username before sending buffered commands.', 'error');
        return;
      }
      runtime.updateStatus('Connecting…', 'connecting');
      runtime.connecting = true;
      setConnectButtonsDisabled(true);
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
        if (passwordValue) {
          socketUrl.searchParams.set('password', passwordValue);
        } else {
          socketUrl.searchParams.delete('password');
        }
        const socket = new WebSocket(socketUrl.toString());
        socket.binaryType = 'arraybuffer';

        runtime.socket = socket;
        runtime.binaryDecoder = new TextDecoder();
        socket.addEventListener('open', () => {
          markBridgeActivity();
          ensureKeepAliveTimer();
          runtime.connecting = false;
          runtime.connected = true;
          runtime.updateStatus('Connected', 'connected');
          setDisconnectButtonsDisabled(false);
          focusCapture();
          updateConnectAvailability();
          setEntryStatus('Connected. Press Enter to forward the next line.', 'muted');
          updateEntryControls();
        });
        socket.addEventListener('message', (event) => {
          markBridgeActivity();
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
          stopKeepAliveTimer();
          const remainder = runtime.binaryDecoder.decode();
          if (remainder) {
            runtime.appendLine(remainder, 'incoming');
          }
          runtime.connecting = false;
          runtime.connected = false;
          runtime.socket = null;
          setDisconnectButtonsDisabled(true);
          runtime.updateStatus('Disconnected', 'disconnected');
          refreshTarget(false);
          updateConnectAvailability();
          setEntryStatus('Disconnected. Buffer stays queued until you reconnect.', 'muted');
          updateEntryControls();
        });
        socket.addEventListener('error', () => {
          stopKeepAliveTimer();
          runtime.updateStatus('Connection error', 'disconnected');
          setEntryStatus('Bridge error. Commands will resume after reconnecting.', 'error');
        });
      } catch (error) {
        runtime.connecting = false;
        runtime.connected = false;
        runtime.socket = null;
        setDisconnectButtonsDisabled(true);
        runtime.updateStatus('Connection failed', 'disconnected');
        console.error('Terminal connection failed', error);
        updateConnectAvailability();
        setEntryStatus('Connection failed. Buffer kept for your next attempt.', 'error');
        updateEntryControls();
      }
    });
  }

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

  const requestDisconnect = (reason?: string): boolean => {
    const socket = runtime.socket;
    if (!socket) {
      return false;
    }

    stopKeepAliveTimer();
    const closeReason = reason && reason.trim() ? reason : 'Client closed';
    let statusApplied = false;

    const sendDisconnectSequence = (value: string): boolean => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      try {
        socket.send(textEncoder.encode(value));
        markBridgeActivity();
        return true;
      } catch (error) {
        console.warn('Failed to send disconnect sequence', error);
        return false;
      }
    };

    if (socket.readyState === WebSocket.OPEN) {
      runtime.updateStatus('Disconnecting…', 'connecting');
      setDisconnectButtonsDisabled(true);
      runtime.connected = false;
      runtime.connecting = true;
      runtime.updateConnectAvailability?.();
      setEntryStatus('Disconnect requested. Buffer stays available while we close the bridge.', 'muted');
      updateEntryControls();
      statusApplied = true;

      const modeSent = sendDisconnectSequence('/mode command\r');
      const exitSent = modeSent && sendDisconnectSequence('exit\r');

      if (modeSent && exitSent) {
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.close(1000, closeReason);
              } catch (error) {
                console.warn('Failed to close terminal socket after graceful disconnect attempt', error);
              }
            }
          }, 1500);
        }
        return true;
      }
    }

    try {
      socket.close(1000, closeReason);
    } catch (error) {
      console.warn('Failed to close terminal socket', error);
    }

    if (!statusApplied) {
      setEntryStatus('Disconnect requested. Buffer stays available while we close the bridge.', 'muted');
      updateEntryControls();
    }

    return true;
  };

  runtime.requestDisconnect = requestDisconnect;

  for (const button of disconnectButtons) {
    button.addEventListener('click', () => {
      requestDisconnect();
    });
  }

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
    runtime.entryElement.classList.add('terminal__entry--focused');
  });

  runtime.captureElement.addEventListener('blur', () => {
    runtime.viewport.classList.remove('terminal__viewport--focused');
    runtime.entryElement.classList.remove('terminal__entry--focused');
  });

  function setEntryStatus(message: string, tone: 'default' | 'muted' | 'error' = 'default') {
    runtime.entryStatusElement.textContent = message;
    runtime.entryStatusElement.classList.remove('terminal__entry-status--muted', 'terminal__entry-status--error');
    if (tone === 'muted') {
      runtime.entryStatusElement.classList.add('terminal__entry-status--muted');
    } else if (tone === 'error') {
      runtime.entryStatusElement.classList.add('terminal__entry-status--error');
    }
  }

  function normaliseBufferValue(value: string): string {
    return value.replace(/\r\n?|\n/g, '\n');
  }

  function isSocketOpen(): boolean {
    return Boolean(runtime.socket && runtime.socket.readyState === WebSocket.OPEN);
  }

  function updateEntryControls() {}

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
      markBridgeActivity();
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
    scheduleEntryResize();
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
    scheduleEntryResize();
    return true;
  }

    runtime.captureElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        flushNextBufferedLine(true);
        return;
      }

      if (event.key === 'Backspace') {
        const target = event.currentTarget as HTMLTextAreaElement;
        const selectionStart = target.selectionStart;
        const selectionEnd = target.selectionEnd;
        const hasSelection =
          typeof selectionStart === 'number' &&
          typeof selectionEnd === 'number' &&
          selectionStart !== selectionEnd;
        const caretBeyondStart = typeof selectionStart === 'number' && selectionStart > 0;

        if (hasSelection || caretBeyondStart) {
          return;
        }

        if (
          (selectionStart === null || selectionEnd === null) &&
          target.value.length > 0
        ) {
          return;
        }
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

    runtime.entryForm.addEventListener('submit', (event) => {
      event.preventDefault();
      flushNextBufferedLine(false);
    });

    runtime.captureElement.addEventListener('input', () => {
      updateEntryControls();
      scheduleEntryResize();
    });

    setEntryStatus(entryInstructions, 'muted');
    updateEntryControls();
    scheduleEntryResize();

  runtime.usernameInput.addEventListener('input', () => {
    updateConnectAvailability();
    persistIdentity();
  });

  return runtime;
};

export const renderTerminal = (
  store: ChatStore,
  container: HTMLElement,
  options?: RenderTerminalOptions
): TerminalRuntime => {
  const controlsHost = options?.controlsHost ?? null;

  let runtime = runtimeMap.get(container);
  if (!runtime || runtime.controlsHost !== controlsHost) {
    runtime?.requestDisconnect('Rebuilding terminal controls');
    runtime = createRuntime(container, { controlsHost });
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
  container.classList.toggle('terminal-chat--game', Boolean(state.activeGame));
  if (state.activeGame === 'alpha') {
    runtime.gameStatus.innerHTML =
      'Fly me to Alpha Centauri armed: connect the terminal, then follow the nav charts broadcast in the BBS feeds.';
    runtime.gameStatus.hidden = false;
  } else if (state.activeGame) {
    runtime.gameStatus.textContent = `Running game: ${state.activeGame}. Use the terminal to control it.`;
    runtime.gameStatus.hidden = false;
  } else {
    runtime.gameStatus.textContent = '';
    runtime.gameStatus.hidden = true;
  }

  return runtime;
};
