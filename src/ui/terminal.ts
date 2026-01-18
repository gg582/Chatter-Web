import { ChatStore } from '../state/chatStore.js';
import { pickRandomNickname } from '../data/nicknames.js';
import { describeMobilePlatform, detectMobilePlatform, escapeHtml, isMobilePlatform } from './helpers.js';
import type { MobilePlatform } from './helpers.js';

// xterm.js types - modules will be loaded dynamically at runtime
interface ITerminal {
  open(container: HTMLElement): void;
  write(data: string | Uint8Array): void;
  writeln(data: string): void;
  clear(): void;
  dispose(): void;
  loadAddon(addon: unknown): void;
}

interface IFitAddon {
  fit(): void;
  dispose(): void;
}

interface TerminalConstructor {
  new(options?: Record<string, unknown>): ITerminal;
}

interface FitAddonConstructor {
  new(): IFitAddon;
}

const runtimeMap = new WeakMap<HTMLElement, TerminalRuntime>();
const textEncoder = new TextEncoder();
const TARGET_STORAGE_KEY = 'chatter-terminal-target';
const IDENTITY_STORAGE_KEY = 'chatter-terminal-identity';
const ANSI_ESCAPE_SEQUENCE_PATTERN = /\u001b\[[0-9;?]*[ -\/]*[@-~]/gu;
const COLUMN_RESET_SEQUENCE = '\u001b[1G';

const stripAnsiSequences = (value: string): string => value.replace(ANSI_ESCAPE_SEQUENCE_PATTERN, '');

const normaliseEchoText = (value: string): string =>
  stripAnsiSequences(value)
    .replace(/\u0008/g, '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();

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
  value === 'ssh' ? 'ssh' : 'telnet';

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

type EntryPreferences = {
  showTerminateShortcut: boolean;
};

const ENTRY_PREFERENCES_STORAGE_KEY = 'chatter-terminal-entry-preferences';

const defaultEntryPreferences: EntryPreferences = {
  showTerminateShortcut: false
};

const readEntryPreferences = (): EntryPreferences => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { ...defaultEntryPreferences };
  }

  try {
    const raw = window.localStorage.getItem(ENTRY_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return { ...defaultEntryPreferences };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { ...defaultEntryPreferences };
    }

    const showTerminate = Boolean(
      (parsed as { showTerminateShortcut?: unknown }).showTerminateShortcut
    );

    return { showTerminateShortcut: showTerminate };
  } catch (error) {
    console.warn('Failed to read terminal entry preferences', error);
    return { ...defaultEntryPreferences };
  }
};

const writeEntryPreferences = (preferences: EntryPreferences) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      ENTRY_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        showTerminateShortcut: Boolean(preferences.showTerminateShortcut)
      })
    );
  } catch (error) {
    console.warn('Failed to persist terminal entry preferences', error);
  }
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

let cachedDefaultUsername: string | null = null;

const resolveDefaultUsername = () => {
  if (!cachedDefaultUsername) {
    cachedDefaultUsername = pickRandomNickname();
  }
  return cachedDefaultUsername;
};

const palettesRequiringDarkText = new Set([
  'moe',
  'adwaita',
  'neon-genesis-evangelion',
]);

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
  const configuredDefaultUsername =
    typeof config?.bbsSshUser === 'string' ? config.bbsSshUser.trim() : '';
  const defaultUsername = configuredDefaultUsername;
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

  const hostPlaceholder = configuredHostPlaceholder || defaultHost || 'chat.korokorok.com';
  const portPlaceholder = defaultPort || (defaultProtocol === 'ssh' ? '22' : '2323');

  const descriptorParts: string[] = [protocol.toUpperCase()];
  if (host) {
    const displayPort = port || defaultPort || (protocol === 'ssh' ? '22' : '2323');
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
  return `${protocol ?? 'telnet'}://${host}${portSuffix}`;
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
const INTRO_MARKER = 'Connection established.';
const INTRO_CAPTURE_LIMIT = 16000;
const TOUCH_ARROW_THRESHOLD_PX = 120;

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
  'ctrl-c': { payload: '\u0003', label: 'Copy', inputGroup: ENTRY_INPUT_GROUP },
  'ctrl-z': { payload: '\u001a', label: 'Undo', inputGroup: ENTRY_INPUT_GROUP },
  'ctrl-s': { payload: '\u0013', label: 'Save', inputGroup: ENTRY_INPUT_GROUP },
  'ctrl-a': { payload: '\u0001', label: 'Select all', inputGroup: ENTRY_INPUT_GROUP },
  'arrow-up': { payload: keySequences.ArrowUp, label: 'Arrow up', inputGroup: 'arrow-up' },
  'arrow-down': { payload: keySequences.ArrowDown, label: 'Arrow down', inputGroup: 'arrow-down' },
  'arrow-left': { payload: keySequences.ArrowLeft, label: 'Arrow left', inputGroup: 'arrow-left' },
  'arrow-right': { payload: keySequences.ArrowRight, label: 'Arrow right', inputGroup: 'arrow-right' }
};

const ARROW_KEY_NAMES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const ARROW_SHORTCUT_KEYS = new Set(['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right']);

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
  shellElement: HTMLElement;
  terminal: ITerminal | null;
  fitAddon: IFitAddon | null;
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
  themeHost: HTMLElement | null;
  entryPreferences: EntryPreferences;
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
  asciiEditorLine: string | null;
  introSilenced: boolean;
  introBuffer: string;
  maxOutputLines: number;
  autoScrollLocked: boolean;
  pendingAutoScroll: boolean;
  identityKey: string | null;
  lastStoredUsername: string;
  echoSuppressBuffer: string;
  echoSuppressActiveCandidate: string | null;
  xtermColumnResetPending: boolean;
  appendLine: (text: string, kind?: TerminalLineKind) => void;
  updateStatus: (label: string, state: 'disconnected' | 'connecting' | 'connected') => void;
  updateConnectAvailability?: () => void;
  updateViewportSizing?: () => void;
  mobilePlatform: MobilePlatform | null;
  requestDisconnect: (reason?: string) => boolean;
  disposeResources?: () => void;
  clearOutput: () => void;
};

type RenderTerminalOptions = {
  controlsHost?: HTMLElement | null;
  themeHost?: HTMLElement | null;
};

type ThemeName = 'dark' | 'light';

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

const applyColumnResetToChunk = (value: string, runtime: TerminalRuntime): string => {
  if (!value) {
    if (runtime.xtermColumnResetPending) {
      runtime.xtermColumnResetPending = false;
      return COLUMN_RESET_SEQUENCE;
    }
    return value;
  }

  let needsReset = runtime.xtermColumnResetPending;
  let result = '';

  for (const char of value) {
    if (needsReset && char !== '\n' && char !== '\r') {
      result += COLUMN_RESET_SEQUENCE;
      needsReset = false;
    }

    result += char;

    if (char === '\n' || char === '\r') {
      needsReset = true;
    }
  }

  runtime.xtermColumnResetPending = needsReset;
  return result;
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
  '#808000',
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

const createAnsiFragment = (line: string, runtime: TerminalRuntime): ParsedAnsiLine => {
  const fragment = document.createDocumentFragment();
  const state: AnsiState = { color: null, colorCode: null, background: null, bold: false };
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushSegment = (segment: string) => {
    if (!segment) {
      return;
    }
    // Custom trim to remove spaces and tabs, but preserve \r
    const trimmedSegment = segment.replace(/^[ \t]+|[ \t]+$/g, '');

    if (!trimmedSegment) { // If the segment was only whitespace (spaces/tabs), skip it.
      return;
    }

    // Always create a span element, even for unstyled text
    // This ensures consistent rendering and styling inheritance
    const span = document.createElement('span');
    span.className = 'terminal__segment';
    span.textContent = trimmedSegment;
    
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
    
        const command = match[2];
        const codes = match[1] ? match[1].split(';') : ['0'];
    
        if (command === 'J') { // Erase in Display
          const code = Number.parseInt(codes[0], 10);
          if (code === 2) { // Clear entire screen
            runtime.clearOutput();
          }
          continue;
        }
    
        if (command === 'K') { // Erase in Line
          const code = Number.parseInt(codes[0], 10);
          if (code === 2) { // Clear entire line
            if (runtime.incomingLineElement) {
              runtime.incomingLineElement.textContent = '';
              runtime.incomingBuffer = '';
            }
          }
          continue;
        }
    
        if (command !== 'm') { // Only process 'm' (SGR) commands if not J or K
          continue;
        }

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

const pendingLineRenders = new Map<HTMLElement, { content: string; runtime: TerminalRuntime }>();
const lastRenderedLine = new WeakMap<HTMLElement, string>();
let lineRenderScheduled = false;

const flushPendingLineRenders = () => {
  lineRenderScheduled = false;
  if (pendingLineRenders.size === 0) {
    return;
  }

  const entries = Array.from(pendingLineRenders.entries());
  pendingLineRenders.clear();

  for (const [target, { content: nextContent, runtime }] of entries) {
    if (!target.isConnected) {
      lastRenderedLine.delete(target);
      continue;
    }

    const previous = lastRenderedLine.get(target) ?? '';
    if (previous === nextContent) {
      continue;
    }

    if (!nextContent) {
      target.replaceChildren();
      applyTrailingBackground(target, null);
      lastRenderedLine.set(target, '');
      continue;
    }

    const { fragment, trailingBackground } = createAnsiFragment(nextContent, runtime);
    target.replaceChildren(fragment);
    applyTrailingBackground(target, trailingBackground);
    lastRenderedLine.set(target, nextContent);
  }
};

const schedulePendingLineRenderFlush = () => {
  if (lineRenderScheduled) {
    return;
  }
  lineRenderScheduled = true;

  const schedule =
    typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) => {
          setTimeout(() => {
            const timestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
            callback(timestamp);
          }, 0);
        };

  schedule(() => {
    flushPendingLineRenders();
  });
};

const renderAnsiLine = (target: HTMLElement, content: string, runtime: TerminalRuntime) => {
  const normalisedContent = content.replace(/\r/g, '');
  pendingLineRenders.set(target, { content: normalisedContent, runtime });
  schedulePendingLineRenderFlush();
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
  store: ChatStore,
  container: HTMLElement,
  options?: RenderTerminalOptions
): TerminalRuntime => {
  const controlsHost = options?.controlsHost ?? null;
  const target = resolveTarget();
  const socketUrl = resolveSocketUrl(container);
  const hostPlaceholderText = target.placeholders.host || 'chat.korokorok.com';
  const portPlaceholderText =
    target.placeholders.port || (target.defaults.protocol === 'ssh' ? '22' : '2323');

  const root = container.closest<HTMLElement>('[data-chatter-root]');
  const containerDatasetPlatform = container.dataset.mobilePlatform;
  const containerDatasetLabel = container.dataset.mobilePlatformLabel;
  const rootDatasetPlatform = root?.dataset.mobilePlatform;
  const rootDatasetLabel = root?.dataset.mobilePlatformLabel;

  const fallbackDocumentElement =
    typeof document !== 'undefined' ? (document.documentElement as HTMLElement | null) : null;
  const themeHost = (options?.themeHost ?? root ?? fallbackDocumentElement) ?? null;

  const readTheme = (): ThemeName => {
    if (themeHost?.dataset.theme === 'light') {
      return 'light';
    }
    if (fallbackDocumentElement?.dataset.theme === 'light') {
      return 'light';
    }
    return 'dark';
  };

  let currentTheme: ThemeName = readTheme();
  let paletteOverrideApplied = false;
  let paletteAutoCommandSent = false;
  let paletteDarkTextApplied = container.dataset.paletteForceDarkText === 'true';

  if (!paletteDarkTextApplied && 'paletteForceDarkText' in container.dataset) {
    delete container.dataset.paletteForceDarkText;
  }

  const applyLightPaletteOverride = (enabled: boolean) => {
    if (enabled === paletteOverrideApplied) {
      return;
    }
    paletteOverrideApplied = enabled;
    if (enabled) {
      container.dataset.lightPaletteOverride = 'true';
    } else {
      delete container.dataset.lightPaletteOverride;
    }
  };

  const applyPaletteDarkText = (enabled: boolean) => {
    if (paletteDarkTextApplied === enabled) {
      return;
    }
    paletteDarkTextApplied = enabled;
    if (enabled) {
      container.dataset.paletteForceDarkText = 'true';
    } else {
      delete container.dataset.paletteForceDarkText;
    }
  };

  const syncLightPaletteOverride = () => {
    const shouldApply = currentTheme === 'light' && !paletteAutoCommandSent;
    applyLightPaletteOverride(shouldApply);
  };

  const resetLightPaletteAutoState = () => {
    paletteAutoCommandSent = false;
    syncLightPaletteOverride();
  };

  syncLightPaletteOverride();

  const handleThemeChange = (event: Event) => {
    const detail = (event as CustomEvent<{ theme?: string }>).detail;
    const nextThemeName = detail?.theme === 'light' ? 'light' : detail?.theme === 'dark' ? 'dark' : readTheme();
    currentTheme = nextThemeName;
    if (nextThemeName === 'light') {
      resetLightPaletteAutoState();
    } else {
      paletteAutoCommandSent = false;
      applyLightPaletteOverride(false);
      applyPaletteDarkText(false);
    }
  };

  themeHost?.addEventListener('chatter:theme-change', handleThemeChange as EventListener);

  const detachThemeListener = () => {
    themeHost?.removeEventListener('chatter:theme-change', handleThemeChange as EventListener);
  };

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

  const entryPreferences = readEntryPreferences();
  const showTerminateShortcut = Boolean(entryPreferences.showTerminateShortcut);

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
            <div class="terminal-chat__menu-block terminal-chat__menu-block--connection" role="group" aria-label="Connection options">
              <span class="terminal-chat__menu-block-title">Connection options</span>
              <form class="terminal-chat__target-form" data-terminal-target-form>
                <label class="terminal-chat__field">
                  <span class="terminal-chat__field-label">Protocol</span>
                  <select class="terminal-chat__input" data-terminal-protocol>
                    <option value="ssh">SSH</option>
                    <option value="telnet">Telnet</option>
                  </select>
                </label>
                <label class="terminal-chat__field">
                  <span class="terminal-chat__field-label">Host</span>
                  <input type="text" class="terminal-chat__input" data-terminal-host placeholder="${escapeHtml(hostPlaceholderText)}" />
                </label>
                <label class="terminal-chat__field">
                  <span class="terminal-chat__field-label">Port</span>
                  <input type="number" min="1" max="65535" class="terminal-chat__input" data-terminal-port placeholder="${escapeHtml(portPlaceholderText)}" />
                </label>
                <div class="terminal-chat__field-actions">
                  <button type="submit" class="terminal-chat__menu-button">Apply</button>
                  <button type="button" class="terminal-chat__menu-button" data-terminal-target-reset>Reset</button>
                </div>
                <p class="terminal__note" data-terminal-target-status></p>
              </form>
            </div>
            <div class="terminal-chat__menu-block terminal-chat__menu-block--identity" role="group" aria-label="Identity">
              <span class="terminal-chat__menu-block-title">Identity</span>
              <div class="terminal-chat__field" data-terminal-username-field>
                <label class="terminal-chat__field-label" for="terminal-username">Username</label>
                <input type="text" id="terminal-username" class="terminal-chat__input" data-terminal-username placeholder="Enter username" autocomplete="off" />
              </div>
              <div class="terminal-chat__field" data-terminal-password-field>
                <label class="terminal-chat__field-label" for="terminal-password">Password</label>
                <input type="password" id="terminal-password" class="terminal-chat__input" data-terminal-password placeholder="Optional" autocomplete="off" />
              </div>
            </form>
            <div class="terminal-chat__menu-block terminal-chat__menu-block--entry" role="group" aria-label="Entry preferences">
              <span class="terminal-chat__menu-block-title">Entry preferences</span>
              <label class="terminal-chat__option">
                <input type="checkbox" data-terminal-toggle-terminate ${showTerminateShortcut ? 'checked' : ''} />
                <span>Show Terminate shortcut</span>
              </label>
              <p class="terminal-chat__hint terminal__note terminal__note--muted">Expose the Ctrl+Z shortcut button in the on-screen keyboard.</p>
            </div>
          </div>
        </nav>`;

  if (controlsHost) {
    controlsHost.innerHTML =
      `
      <div class="settings-screen__bridge-panel">
        ${controlBarMarkup}
      </div>
    `;
  }

  container.innerHTML =
    `
    <section class="${shellClasses.join(' ')}" data-terminal-shell>
      <div class="terminal-chat__fullscreen">
        ${controlsHost ? '' : controlBarMarkup}
        <div class="terminal-chat__viewport terminal__viewport" data-terminal-viewport>
          <div class="terminal-chat__output terminal__output" data-terminal-output></div>
        </div>
        <div class="terminal-chat__entry-region">
          <div class="terminal-chat__entry-main">
            <div class="terminal-chat__keyboard" id="${entryStatusId}-kbd" data-terminal-kbd hidden>
              <div class="terminal-chat__keyboard-grid">
                <button type="button" data-terminal-kbd-key="ctrl-c" data-terminal-kbd-group="entry-buffer">Cancel</button>
                <button type="button" data-terminal-kbd-key="ctrl-z" data-terminal-kbd-group="entry-buffer" data-terminal-terminate-shortcut ${showTerminateShortcut ? '' : 'hidden'}>Terminate</button>
                <button type="button" data-terminal-kbd-key="ctrl-s" data-terminal-kbd-group="entry-buffer">Save</button>
                <button type="button" data-terminal-kbd-key="ctrl-a" data-terminal-kbd-group="entry-buffer">Abort</button>
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
  const shellElement = query<HTMLElement>('[data-terminal-shell]');
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
  const terminateToggle = query<HTMLInputElement>('[data-terminal-toggle-terminate]');
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
    !shellElement ||
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
  if ('enterKeyHint' in captureElement) {
    captureElement.enterKeyHint = 'send';
  }
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
  const pendingOutgoingEchoes: string[] = [];

  const runtime: TerminalRuntime = {
    socket: null,
    statusElements,
    indicatorElements,
    outputElement,
    shellElement,
    terminal: null,
    fitAddon: null,
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
    themeHost,
    entryPreferences: { ...entryPreferences },
    mobilePlatform,
    binaryDecoder: new TextDecoder(),
    socketUrl: typeof socketUrl === 'string' && socketUrl.trim() ? socketUrl.trim() : null,
    target,
    connected: false,
    connecting: false,
    incomingBuffer: '',
    incomingLineElement: null,
    asciiArtBlock: null,
    asciiEditorLine: null,
    introSilenced: true,
    introBuffer: '',
    maxOutputLines: 600,
    autoScrollLocked: false,
    pendingAutoScroll: false,
    identityKey: null,
    lastStoredUsername: '',
    echoSuppressBuffer: '',
    echoSuppressActiveCandidate: null,
    xtermColumnResetPending: true,
    requestDisconnect: () => false,
    clearOutput: () => {
      runtime.xtermColumnResetPending = true;
      if (runtime.terminal) {
        runtime.terminal.clear();
      } else {
        runtime.outputElement.innerHTML = '';
        runtime.incomingLineElement = null;
        runtime.incomingBuffer = '';
      }
      scrollOutputToBottom(true);
    },
    appendLine: (text: string, kind: TerminalLineKind = 'info') => {
      if (kind === 'incoming') {
        deliverIncomingPayload(text);
        return;
      }

      // Use xterm if available
      if (runtime.terminal) {
        const prefix = kind === 'error' ? '\u001b[31m[ERROR] ' : kind === 'outgoing' ? '\u001b[32m> ' : '\u001b[90m';
        const suffix = kind === 'error' || kind === 'outgoing' || kind === 'info' ? '\u001b[0m' : '';
        const lines = text.split('\n');
        for (const line of lines) {
          const normalisedLine = line.trimStart();
          const preparedLine = applyColumnResetToChunk(prefix + normalisedLine + suffix, runtime);
          runtime.terminal.writeln(preparedLine);
          runtime.xtermColumnResetPending = true;
        }
        return;
      }

      // Fallback to custom rendering
      const lines = text.split('\n');
      for (const line of lines) {
        const normalisedLine = line.trimStart();
        const entry = document.createElement('pre');
        entry.className = `terminal__line terminal__line--${kind}`;
        const { fragment, trailingBackground } = createAnsiFragment(normalisedLine, runtime);
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

  const registerOutgoingEchoCandidate = (value: string) => {
    const normalised = normaliseEchoText(value);
    if (!normalised) {
      return;
    }
    pendingOutgoingEchoes.push(normalised);
    const overflow = pendingOutgoingEchoes.length - 32;
    if (overflow > 0) {
      pendingOutgoingEchoes.splice(0, overflow);
    }
    if (!runtime.echoSuppressActiveCandidate) {
      runtime.echoSuppressActiveCandidate = pendingOutgoingEchoes[0] ?? null;
    }
  };

  const checkIfShouldSuppressEcho = (line: string): boolean => {
    const normalised = normaliseEchoText(line);
    if (!normalised) {
      return false;
    }
    return pendingOutgoingEchoes.some((entry) => entry === normalised);
  };

  const shouldSuppressOutgoingEcho = (line: string): boolean => {
    const normalised = normaliseEchoText(line);
    if (!normalised) {
      return false;
    }
    const index = pendingOutgoingEchoes.findIndex((entry) => entry === normalised);
    if (index === -1) {
      return false;
    }
    pendingOutgoingEchoes.splice(index, 1);
    if (runtime.echoSuppressActiveCandidate === normalised) {
      runtime.echoSuppressActiveCandidate = pendingOutgoingEchoes[0] ?? null;
      runtime.echoSuppressBuffer = '';
    }
    if (!runtime.echoSuppressActiveCandidate && pendingOutgoingEchoes.length > 0) {
      runtime.echoSuppressActiveCandidate = pendingOutgoingEchoes[0];
    }
    return true;
  };

  const filterOutgoingEchoesFromChunk = (chunk: string): string => {
    if (!chunk) {
      return '';
    }

    let result = '';

    for (const char of chunk) {
      if (!runtime.echoSuppressActiveCandidate && pendingOutgoingEchoes.length > 0) {
        runtime.echoSuppressActiveCandidate = pendingOutgoingEchoes[0];
      }

      const active = runtime.echoSuppressActiveCandidate;
      if (active) {
        runtime.echoSuppressBuffer += char;

        if (char === '\n') {
          const buffer = runtime.echoSuppressBuffer;
          const line = buffer.replace(/\r?\n$/, '');
          const suppressed = shouldSuppressOutgoingEcho(line);
          runtime.echoSuppressBuffer = '';
          runtime.echoSuppressActiveCandidate = pendingOutgoingEchoes[0] ?? null;
          if (!suppressed) {
            result += buffer;
          }
        } else {
          const normalisedPartial = normaliseEchoText(runtime.echoSuppressBuffer);
          if (!active.startsWith(normalisedPartial)) {
            result += runtime.echoSuppressBuffer;
            runtime.echoSuppressBuffer = '';
            runtime.echoSuppressActiveCandidate = pendingOutgoingEchoes[0] ?? active;
          }
        }

        continue;
      }

      result += char;
    }

    return result;
  };

  // Initialize xterm.js Terminal - load dynamically at runtime
  const initializeXterm = async () => {
    try {
      // Dynamic imports resolved at browser runtime, not during TypeScript compilation
      // @ts-expect-error - xterm.js modules are copied to dist/lib but not available during TS compilation
      const xtermModule = await import('../../lib/xterm.js') as any;
      // @ts-expect-error - addon-fit.js module is copied to dist/lib but not available during TS compilation
      const fitModule = await import('../../lib/addon-fit.js') as any;

      const Terminal = xtermModule.Terminal as TerminalConstructor;
      const FitAddon = fitModule.FitAddon as FitAddonConstructor;

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 10000,
        fontSize: 14,
        fontFamily: '"IBM Plex Mono", "Courier New", Courier, monospace',
        theme: {
          background: currentTheme === 'dark' ? '#1a1a1a' : '#ffffff',
          foreground: currentTheme === 'dark' ? '#e0e0e0' : '#000000',
          cursor: currentTheme === 'dark' ? '#00ff00' : '#000000',
          selection: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'
        },
        convertEol: false,
        disableStdin: true
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      const host = document.createElement('div');
      host.className = 'terminal-chat__xterm';
      runtime.outputElement.replaceChildren(host);
      runtime.outputElement.classList.add('terminal-chat__output--xterm');
      runtime.shellElement.classList.add('terminal-chat--xterm-ready');
      term.open(host);

      try {
        fitAddon.fit();
      } catch (error) {
        console.warn('Failed to fit terminal on init', error);
      }

      runtime.terminal = term;
      runtime.fitAddon = fitAddon;

      // Handle theme changes
      const updateTerminalTheme = () => {
        if (!runtime.terminal) {
          return;
        }
        runtime.terminal.write('\u001b[0m'); // Reset any formatting
      };

      // Trigger initial theme update
      updateTerminalTheme();
    } catch (error) {
      console.error('Failed to initialize xterm.js, falling back to custom rendering', error);
      runtime.outputElement.classList.remove('terminal-chat__output--xterm');
      runtime.shellElement.classList.remove('terminal-chat--xterm-ready');
      runtime.outputElement.replaceChildren();
      runtime.terminal = null;
      runtime.fitAddon = null;
    }
  };

  // Start xterm initialization asynchronously
  void initializeXterm();

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

  const resetOutputScroll = () => {
    runtime.autoScrollLocked = false;
    runtime.pendingAutoScroll = false;

    const applyScroll = () => {
      scrollOutputToBottom(true);
    };

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      applyScroll();
      return;
    }

    window.requestAnimationFrame(applyScroll);
  };

  const handleOutputScroll = () => {
    const wasLocked = runtime.autoScrollLocked;
    updateScrollLockState();
    if (wasLocked && !runtime.autoScrollLocked && runtime.pendingAutoScroll) {
      scrollOutputToBottom(true);
    }
  };

  const resolveOutputLineHeight = (() => {
    let cached = 0;
    return (): number => {
      if (cached > 0) {
        return cached;
      }

      if (typeof window === 'undefined') {
        cached = 24;
        return cached;
      }

      const computed = window.getComputedStyle(runtime.outputElement);
      const lineHeight = parsePixelValue(computed.lineHeight);
      cached = lineHeight > 0 ? lineHeight : 24;
      return cached;
    };
  })();

  runtime.outputElement.addEventListener('scroll', handleOutputScroll, { passive: true });

  const handleManualScrollIntent = () => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      updateScrollLockState();
      return;
    }

    window.requestAnimationFrame(() => {
      updateScrollLockState();
    });
  };

  runtime.outputElement.addEventListener('wheel', handleManualScrollIntent, { passive: true });
  runtime.outputElement.addEventListener('touchmove', handleManualScrollIntent, { passive: true });

  if (runtime.mobilePlatform) {
    let trackingTouch = false;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let accumX = 0;
    let accumY = 0;

    const sendArrowCommand = (key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
      const payload = keySequences[key];
      if (!payload) {
        return false;
      }
      return sendTextPayload(payload);
    };

    const resetTouchTracking = () => {
      trackingTouch = false;
      accumX = 0;
      accumY = 0;
    };

    const handleArrowTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        resetTouchTracking();
        return;
      }
      const touch = event.touches[0];
      trackingTouch = true;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      accumX = 0;
      accumY = 0;
    };

    const applyAxisDispatch =
      (accumulator: number,
      positiveKey: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
      negativeKey: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
    ) => {
      let consumed = false;
      while (accumulator >= TOUCH_ARROW_THRESHOLD_PX) {
        if (!sendArrowCommand(positiveKey)) {
          break;
        }
        accumulator -= TOUCH_ARROW_THRESHOLD_PX;
        consumed = true;
      }
      while (accumulator <= -TOUCH_ARROW_THRESHOLD_PX) {
        if (!sendArrowCommand(negativeKey)) {
          break;
        }
        accumulator += TOUCH_ARROW_THRESHOLD_PX;
        consumed = true;
      }
      return { accumulator, consumed };
    };

    const handleArrowTouchMove = (event: TouchEvent) => {
      if (!trackingTouch || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const deltaX = lastTouchX - touch.clientX;
      const deltaY = lastTouchY - touch.clientY;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      accumX += deltaX;
      accumY += deltaY;

      let consumed = false;
      const vertical = applyAxisDispatch(accumY, 'ArrowUp', 'ArrowDown');
      accumY = vertical.accumulator;
      consumed = consumed || vertical.consumed;

      const horizontal = applyAxisDispatch(accumX, 'ArrowLeft', 'ArrowRight');
      accumX = horizontal.accumulator;
      consumed = consumed || horizontal.consumed;

      if (consumed) {
        try {
          event.preventDefault();
        } catch (error) {
          // ignore preventDefault failures on passive listeners fallback
        }
      }
    };

    const handleArrowTouchEnd = () => {
      resetTouchTracking();
    };

    runtime.outputElement.addEventListener('touchstart', handleArrowTouchStart, { passive: true });
    runtime.outputElement.addEventListener('touchmove', handleArrowTouchMove, { passive: false });
    runtime.outputElement.addEventListener('touchend', handleArrowTouchEnd, { passive: true });
    runtime.outputElement.addEventListener('touchcancel', handleArrowTouchEnd, { passive: true });
  }

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

      const conditionallyVisibleKeys = new Set(['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right']);
      const keyboardButtons = Array.from(
        keyboardPanel.querySelectorAll<HTMLButtonElement>('[data-terminal-kbd-key]')
      );
  const terminateShortcutButton = keyboardPanel.querySelector<HTMLButtonElement>(
    '[data-terminal-terminate-shortcut]'
  );

  const applyTerminateShortcutVisibility = (visible: boolean) => {
    if (terminateShortcutButton) {
      terminateShortcutButton.hidden = !visible;
    }
    runtime.entryPreferences.showTerminateShortcut = visible;
  };

  applyTerminateShortcutVisibility(showTerminateShortcut);

  if (terminateToggle) {
    terminateToggle.checked = showTerminateShortcut;
    terminateToggle.addEventListener('change', () => {
      const visible = terminateToggle.checked;
      applyTerminateShortcutVisibility(visible);
      writeEntryPreferences(runtime.entryPreferences);
      setEntryStatus(
        visible
          ? 'Terminate shortcut enabled. The on-screen Ctrl+Z key is now visible.'
          : 'Terminate shortcut hidden from the on-screen keyboard.',
        'muted'
      );
    });
  }


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

    // New logic to control individual button visibility
    const showConditionalButtons = open || runtime.mobilePlatform;
    for (const button of keyboardButtons) {
      const key = button.dataset.terminalKbdKey;
      if (key && conditionallyVisibleKeys.has(key)) {
        button.hidden = !showConditionalButtons;
      }
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
        if (ARROW_SHORTCUT_KEYS.has(shortcutKey)) {
          resetOutputScroll();
        }
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
      if (runtime.fitAddon) {
        try {
          runtime.fitAddon.fit();
        } catch (error) {
          console.warn('Failed to fit terminal on resize', error);
        }
      }
    };
    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }
  }

  const asciiArtHeaderPattern = /shared ascii art:/i;
  const asciiArtPromptPattern = /^│\s*>/i;
  const asciiArtMessagePattern = /^#\d+]/;
  const asciiEditorLinePattern = /^\s*(?:│\s*)?>\s?(.*)$/;

  const syncAsciiEditorEntry = (line: string) => {
    if (!runtime.asciiArtBlock) {
      runtime.asciiEditorLine = null;
      return;
    }

    const match = line.match(asciiEditorLinePattern);
    if (!match) {
      runtime.asciiEditorLine = null;
      return;
    }

    const content = match[1] ?? '';
    const normalisedContent = content.replace(/\s+$/u, '');
    const previous = runtime.asciiEditorLine;
    runtime.asciiEditorLine = normalisedContent;

    if (previous === normalisedContent) {
      return;
    }

    runtime.captureElement.value = normalisedContent;
    updateEntryControls();
    scheduleEntryResize();

    try {
      runtime.captureElement.setSelectionRange(
        normalisedContent.length,
        normalisedContent.length
      );
    } catch (error) {
      // Ignore selection errors for unsupported environments.
    }

    if (previous === null) {
      try {
        runtime.captureElement.focus({ preventScroll: true });
      } catch (error) {
        runtime.captureElement.focus();
      }
      setEntryStatus('Synced the ASCII editor line with the entry buffer.', 'muted');
    }
  };

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
    const content = visibleLines.join('\n');
    block.element.textContent = content;
    lastRenderedLine.set(block.element, content);
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
    lastRenderedLine.set(element, headerLine);
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
    const content = block.lines.join('\n');
    block.element.textContent = content;
    lastRenderedLine.set(block.element, content);
  };

  const finishAsciiArtBlock = () => {
    const block = runtime.asciiArtBlock;
    if (!block) {
      return;
    }
    block.currentLine = '';
    const content = block.lines.join('\n');
    block.element.textContent = content;
    lastRenderedLine.set(block.element, content);
    runtime.asciiArtBlock = null;
    runtime.incomingLineElement = null;
    runtime.incomingBuffer = '';
    runtime.asciiEditorLine = null;
  };

  const appendStandaloneLine = (line: string) => {
    const normalisedLine = line.replace(/\r/g, '');
    const entry = ensureIncomingLine(); // Use the element from ensureIncomingLine
    const { fragment, trailingBackground } = createAnsiFragment(normalisedLine, runtime);
    entry.replaceChildren(fragment); // Replace content of existing element
    applyTrailingBackground(entry, trailingBackground);
    lastRenderedLine.set(entry, normalisedLine);
    // No need to append again, ensureIncomingLine already did if it was new
    // If it was an existing element, it's already in the DOM.
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

  function deliverIncomingPayload(chunk: string) {
    if (!chunk) {
      return;
    }

    // Use xterm.js if available - it handles all ANSI sequences correctly
    if (runtime.terminal) {
      if (runtime.introSilenced) {
        runtime.introBuffer += chunk;
        if (runtime.introBuffer.length > INTRO_CAPTURE_LIMIT) {
          runtime.introBuffer = runtime.introBuffer.slice(-INTRO_CAPTURE_LIMIT);
        }
        const markerIndex = runtime.introBuffer.indexOf(INTRO_MARKER);
        if (markerIndex === -1) {
          return;
        }
        const output = runtime.introBuffer.slice(markerIndex);
        runtime.introBuffer = '';
        runtime.introSilenced = false;
        const filteredOutput = filterOutgoingEchoesFromChunk(output);
        if (filteredOutput) {
          const preparedOutput = applyColumnResetToChunk(filteredOutput, runtime);
          runtime.terminal.write(preparedOutput);
        }
        return;
      }
      const filteredChunk = filterOutgoingEchoesFromChunk(chunk);
      if (filteredChunk) {
        const preparedChunk = applyColumnResetToChunk(filteredChunk, runtime);
        runtime.terminal.write(preparedChunk);
      }
      return;
    }

    // Fallback to custom rendering for browsers that don't support xterm
    if (chunk.includes('\u001b[2J')) {
      const parts = chunk.split('\u001b[2J');
      let first = true;
      for (const part of parts) {
        if (!first) {
          runtime.clearOutput();
        }
        first = false;
        if (part) {
          deliverIncomingPayload(part);
        }
      }
      return;
    }

    if (runtime.introSilenced) {
      runtime.introBuffer += chunk;
      if (runtime.introBuffer.length > INTRO_CAPTURE_LIMIT) {
        runtime.introBuffer = runtime.introBuffer.slice(-INTRO_CAPTURE_LIMIT);
      }
      const markerIndex = runtime.introBuffer.indexOf(INTRO_MARKER);
      if (markerIndex === -1) {
        return;
      }
      const output = runtime.introBuffer.slice(markerIndex);
      runtime.introBuffer = '';
      runtime.introSilenced = false;
      processIncomingChunk(output);
      return;
    }

    processIncomingChunk(chunk);
  }

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
    let lastLineBuffer = ''; // Track the last line content for echo suppression

    for (const char of chunk) {
      if (char === '\r') {
        if (runtime.asciiArtBlock) {
          updateAsciiArtPreview(buffer);
          lineElement = runtime.asciiArtBlock.element;
          runtime.incomingLineElement = runtime.asciiArtBlock.element;
        } else {
          // Check if this line should be suppressed before rendering
          // Use non-destructive check so we can still remove it on \n
          const shouldSuppress = checkIfShouldSuppressEcho(buffer);
          if (!shouldSuppress) {
            const target = ensureIncomingLine();
            renderAnsiLine(target, buffer, runtime);
            lineElement = runtime.incomingLineElement;
          } else {
            // Don't render the line at all if it should be suppressed
            lineElement = null;
          }
        }
        lastLineBuffer = buffer; // Save the line content before clearing
        buffer = '';
        needsRender = false;
        continue;
      }

      if (char === '\n') {
        if (runtime.asciiArtBlock) {
          updateAsciiArtPreview(buffer);
          handleAsciiLineCommit(buffer);
        } else {
          // Use the saved line content if buffer is empty (after \r)
          // Explicit check for empty string to avoid falsy coercion
          const lineToCheck = buffer !== '' ? buffer : lastLineBuffer;
          // Check and consume matching echo entry from the queue if found
          const suppressEcho = shouldSuppressOutgoingEcho(lineToCheck);
          if (!suppressEcho) {
            // Only render if we have new buffer content (no \r before \n)
            if (buffer !== '') {
              const target = ensureIncomingLine();
              renderAnsiLine(target, buffer, runtime);
              lineElement = runtime.incomingLineElement;
            }
            // Handle line commit for non-suppressed lines
            if (lineElement) {
              handleRegularLineCommit(lineToCheck, lineElement);
            }
          }
          // If suppressed, lineElement is null from \r handling (when echo was detected) or remains null (when no rendering occurred)
        }

        buffer = '';
        lastLineBuffer = ''; // Clear the saved content
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
        renderAnsiLine(target, buffer, runtime);
        lineElement = target;
      }
    }

    runtime.incomingBuffer = buffer;
    runtime.incomingLineElement = lineElement;
    scrollOutputToBottom();
  }

  const collectOverridesFromInputs = (): { overrides: TargetOverrides; errors: string[] } => {
    const protocolValue =
      (protocolSelect.value === 'ssh' || protocolSelect.value === 'telnet'
        ? protocolSelect.value
        : runtime.target.defaults.protocol) ?? 'telnet';
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
        (runtime.target.defaults.protocol === 'ssh' ? '22' : runtime.target.defaults.protocol === 'telnet' ? '2323' : '');
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
      runtime.target.defaults.port || (protocolValue === 'ssh' ? '22' : protocolValue === 'telnet' ? '2323' : '');
    portInput.placeholder = fallbackPort || runtime.target.placeholders.port || '2323';
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
        runtime.introSilenced = true;
        runtime.introBuffer = '';
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
          resetLightPaletteAutoState();
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
          runtime.introSilenced = true;
          runtime.introBuffer = '';
          setDisconnectButtonsDisabled(true);
          runtime.updateStatus('Disconnected', 'disconnected');
          refreshTarget(false);
          updateConnectAvailability();
          setEntryStatus('Disconnected. Buffer stays queued until you reconnect.', 'muted');
          updateEntryControls();
          resetLightPaletteAutoState();
        });
        socket.addEventListener('error', () => {
          stopKeepAliveTimer();
          runtime.updateStatus('Connection error', 'disconnected');
          runtime.introSilenced = true;
          runtime.introBuffer = '';
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
    let displayMessage = message;
    if (runtime.mobilePlatform && displayMessage) {
      const lower = displayMessage.toLowerCase();
      const captchaIndex = lower.indexOf('captcha');
      if (captchaIndex > 0) {
        displayMessage = displayMessage.slice(captchaIndex).replace(/^\s+/, '');
      }
    }

    runtime.entryStatusElement.textContent = displayMessage;
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

  const maybeSendLightModePaletteCommand = () => {
    if (currentTheme !== 'light') {
      return;
    }
    if (paletteAutoCommandSent) {
      return;
    }

    paletteAutoCommandSent = true;
    const sentPalette = sendTextPayload('/palette adwaita\n');
    if (!sentPalette) {
      paletteAutoCommandSent = false;
      syncLightPaletteOverride();
      return;
    }

    setEntryStatus('Applied the Adwaita palette for light mode readability.', 'muted');
    applyLightPaletteOverride(false);
    applyPaletteDarkText(true);
  };

  const handleUserLineSent = (value: string) => {
    // ALWAYS register the echo candidate for any user input, including empty strings
    // This ensures that ALL user input from the entry field is suppressed from display
    const trimmed = value.trim();
    
    // Register both the value and trimmed version to catch all echo variations
    // The trimmed version catches most echoes, but some servers may echo with
    // leading/trailing whitespace intact, so we register both forms
    if (trimmed) {
      registerOutgoingEchoCandidate(trimmed);
    }
    // Register the exact value if it has whitespace differences from trimmed
    // This handles cases like " hello " where the server echoes back with spaces
    // Note: Empty strings (whitespace-only values) are intentionally registered
    // to suppress blank line echoes from the server
    if (value && value !== trimmed) {
      registerOutgoingEchoCandidate(value);
    }

    if (!trimmed) {
      return;
    }

    maybeSendLightModePaletteCommand();

    const paletteMatch = trimmed.match(/^\/?palette\s+(.*)$/i);
    if (!paletteMatch) {
      return;
    }

    const paletteName = paletteMatch[1]?.trim().split(/\s+/u, 1)[0]?.toLowerCase() ?? '';
    if (!paletteName) {
      applyPaletteDarkText(false);
      return;
    }

    if (palettesRequiringDarkText.has(paletteName)) {
      applyPaletteDarkText(true);
    } else {
      applyPaletteDarkText(false);
    }
  };

  function flushNextBufferedLine(allowBlank = false, flushAll = false): boolean {
    const buffered = normaliseBufferValue(runtime.captureElement.value);

    if (!buffered) {
      if (!allowBlank) {
        setEntryStatus('Buffer is empty. Type a command first or press Enter to send a blank line.', 'muted');
        return false;
      }

      const sentBlank = sendTextPayload('\n');
      if (!sentBlank) {
        return false;
      }

      setEntryStatus('Sent a blank line to the bridge.', 'default');
      handleUserLineSent('');
      updateEntryControls();
      scheduleEntryResize();
      return true;
    }

    let remainder = '';
    const linesToSend: string[] = [];

    if (flushAll) {
      linesToSend.push(...buffered.split('\n'));
    } else {
      const newlineIndex = buffered.indexOf('\n');
      if (newlineIndex === -1) {
        linesToSend.push(buffered);
      } else {
        linesToSend.push(buffered.slice(0, newlineIndex));
        remainder = buffered.slice(newlineIndex + 1);
      }
    }

    if (flushAll) {
      remainder = '';
    }

    let sentCount = 0;
    for (const line of linesToSend) {
      const sent = sendTextPayload(`${line}\n`);
      if (!sent) {
        const unsentLines = linesToSend.slice(sentCount).join('\n');
        const newBuffer = flushAll
          ? [unsentLines, remainder].filter(Boolean).join('\n')
          : [line, remainder].filter(Boolean).join('\n');
        runtime.captureElement.value = newBuffer;
        scheduleEntryResize();
        try {
          const position = runtime.captureElement.value.length;
          runtime.captureElement.setSelectionRange(position, position);
        } catch (error) {
          // Ignore selection errors
        }
        runtime.captureElement.focus();
        updateEntryControls();
        return false;
      }

      handleUserLineSent(line);
      sentCount += 1;
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

    if (flushAll && linesToSend.length > 1) {
      setEntryStatus(`Sent ${linesToSend.length} lines to the bridge.`, 'default');
    } else if (linesToSend[0]) {
      setEntryStatus('Sent the next line to the bridge.', 'default');
    } else {
      setEntryStatus('Sent a blank line to the bridge.', 'default');
    }

    updateEntryControls();
    scheduleEntryResize();
    return true;
  }

    const hasMultipleBufferedLines = () =>
      normaliseBufferValue(runtime.captureElement.value).includes('\n');

    const LOCAL_EDITING_KEYS = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'Delete',
      'Insert'
    ]);

    const insertTabCharacter = (target: HTMLTextAreaElement) => {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const before = target.value.slice(0, start);
      const after = target.value.slice(end);
      target.value = `${before}\t${after}`;
      try {
        const nextPosition = start + 1;
        target.setSelectionRange(nextPosition, nextPosition);
      } catch (error) {
        // Ignore selection errors when environments do not support setSelectionRange
      }
      updateEntryControls();
      scheduleEntryResize();
    };

    const isEditingMultilineBuffer = () => {
      const target = runtime.captureElement;
      const value = target.value;
      if (!value) {
        return false;
      }

      if (value.includes('\n')) {
        return true;
      }

      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;

      if (typeof selectionStart !== 'number' || typeof selectionEnd !== 'number') {
        return false;
      }

      const caretAtEnd = selectionStart === value.length && selectionEnd === value.length;
      return !caretAtEnd;
    };

    runtime.captureElement.addEventListener('keydown', (event) => {
      const editingBuffer = isEditingMultilineBuffer();

      if (event.key === 'Enter') {
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          const flushAll = editingBuffer || hasMultipleBufferedLines();
          flushNextBufferedLine(true, flushAll);
          return;
        }

        if (event.altKey || event.metaKey || event.shiftKey || editingBuffer) {
          return;
        }

        event.preventDefault();
        flushNextBufferedLine(true);
        return;
      }

      if (editingBuffer && !event.ctrlKey && !event.metaKey) {
        if (event.key === 'Tab') {
          event.preventDefault();
          insertTabCharacter(runtime.captureElement);
          return;
        }

        if (LOCAL_EDITING_KEYS.has(event.key)) {
          return;
        }
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
          insertTabCharacter(runtime.captureElement);
          return;
        }
        return;
      }

      if (sendTextPayload(payload)) {
        if (ARROW_KEY_NAMES.has(event.key)) {
          store.setServerScrolling(true);
          setTimeout(() => {
            store.setServerScrolling(false);
          }, 500);
          resetOutputScroll();
        }
        event.preventDefault();
      }
    });

    runtime.captureElement.addEventListener('paste', (event) => {
      if (!isSocketOpen()) {
        return;
      }
      const clipboardEvent = event as ClipboardEvent;
      const clipboardText = clipboardEvent.clipboardData?.getData('text') ?? '';
      if (!clipboardText) {
        return;
      }
      const normalised = normaliseBufferValue(clipboardText);
      if (!normalised.includes('\n')) {
        return;
      }

      event.preventDefault();

      const lines = normalised.split('\n');
      let sentCount = 0;
      let failed = false;

      for (const line of lines) {
        if (!sendTextPayload(`${line}\n`)) {
          failed = true;
          break;
        }
        handleUserLineSent(line);
        sentCount += 1;
      }

      runtime.captureElement.value = '';
      scheduleEntryResize();
      updateEntryControls();

      try {
        runtime.captureElement.setSelectionRange(0, 0);
      } catch (error) {
        // Ignore selection errors for unsupported environments
      }

      try {
        runtime.captureElement.focus({ preventScroll: true });
      } catch (error) {
        runtime.captureElement.focus();
      }

      if (sentCount > 0) {
        const message =
          sentCount === 1 ? 'Sent 1 line from the pasted text.' : `Sent ${sentCount} lines from the pasted text.`;
        setEntryStatus(
          failed ? `${message} The bridge stopped accepting further lines.` : message,
          failed ? 'error' : 'default'
        );
      }
    });

    runtime.captureElement.addEventListener('beforeinput', (event) => {
      if (!runtime.mobilePlatform) {
        return;
      }
      const inputEvent = event as InputEvent;
      if (typeof inputEvent.inputType !== 'string') {
        return;
      }
      if (inputEvent.isComposing) {
        return;
      }
      if (inputEvent.inputType !== 'insertLineBreak') {
        return;
      }

      event.preventDefault();
      const flushAll = hasMultipleBufferedLines();
      flushNextBufferedLine(true, flushAll);
    });

    runtime.entryForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const flushAll = hasMultipleBufferedLines();
      flushNextBufferedLine(false, flushAll);
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

  runtime.disposeResources = () => {
    if (runtime.terminal) {
      runtime.terminal.dispose();
      runtime.terminal = null;
    }
    if (runtime.fitAddon) {
      runtime.fitAddon.dispose();
      runtime.fitAddon = null;
    }
    runtime.outputElement.classList.remove('terminal-chat__output--xterm');
    runtime.shellElement.classList.remove('terminal-chat--xterm-ready');
    runtime.outputElement.replaceChildren();
    detachThemeListener();
    applyLightPaletteOverride(false);
  };

  return runtime;
};

export const renderTerminal = (
  store: ChatStore,
  container: HTMLElement,
  options?: RenderTerminalOptions
): TerminalRuntime => {
  const controlsHost = options?.controlsHost ?? null;
  const themeHost = options?.themeHost ?? null;

  let runtime = runtimeMap.get(container);
  if (!runtime || runtime.controlsHost !== controlsHost || runtime.themeHost !== themeHost) {
    runtime?.disposeResources?.();
    runtime?.requestDisconnect('Rebuilding terminal controls');
    runtime = createRuntime(store, container, { controlsHost, themeHost });
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
