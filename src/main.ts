import { pickRandomNickname } from './data/nicknames.js';

type XtermTerminal = {
  open: (host: HTMLElement) => void;
  write: (data: string | Uint8Array) => void;
  writeln: (data: string) => void;
  focus: () => void;
  loadAddon: (addon: unknown) => void;
  onData: (listener: (data: string) => void) => { dispose: () => void };
  onResize: (listener: (size: { cols: number; rows: number }) => void) => { dispose: () => void };
  resize: (cols: number, rows: number) => void;
  dispose: () => void;
};

type XtermCtor = new (options?: Record<string, unknown>) => XtermTerminal;
type FitAddon = { fit: () => void; dispose: () => void };
type FitAddonCtor = new () => FitAddon;

const ANSI_ESCAPE_SEQUENCE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/gu;
const TYPE_N_TRIGGER = 'type n';
const NICKNAME_TRIGGER = 'enter id (nickname required)';
const CONFIRM_NICKNAME_TRIGGER = 'are you sure with a name';
const DUPLICATE_NICKNAME_TRIGGER = 'already in use';

const terminalScreen = document.querySelector<HTMLElement>('[data-terminal-screen]');
const terminalContainer = document.querySelector<HTMLElement>('[data-terminal-container]');

if (!terminalScreen || !terminalContainer) {
  throw new Error('Required DOM nodes are missing.');
}

let socket: WebSocket | null = null;
let terminal: XtermTerminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let socketTextDecoder = new TextDecoder();
let autoInputBuffer = '';
let typeNConfirmed = false;
let nicknameSubmitted = false;
let nicknameConfirmed = false;
let pendingNickname = '';
const attemptedNicknames = new Set<string>();
let duplicateNicknameDetected = false;

const normaliseTriggerText = (value: string): string =>
  value
    .replace(ANSI_ESCAPE_SEQUENCE_PATTERN, '')
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const getGlobal = <T>(name: string): T => {
  const value = (window as unknown as Record<string, unknown>)[name];
  if (!value) {
    throw new Error(`${name} is not loaded.`);
  }
  return value as T;
};

const runtimeConfig = window.__CHATTER_CONFIG__ ?? {};
const TARGET_HOST = runtimeConfig.bbsHost ?? runtimeConfig.bbsHostDefault ?? 'chatter.pw';
const TARGET_PORT = runtimeConfig.bbsPort ?? runtimeConfig.bbsPortDefault ?? '2323';
const TARGET_PROTOCOL = 'telnet';

const sendToSocket = (payload: string | Uint8Array) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(payload);
};

const choosePendingNickname = () => {
  const generatedNickname = pickRandomNickname(attemptedNicknames);
  pendingNickname =
    generatedNickname.length >= 8 ? generatedNickname : `${generatedNickname}-guest`;
  attemptedNicknames.add(pendingNickname.toLowerCase());
};

const maybeSendAutoInputs = (chunk: string) => {
  if (!chunk) {
    return;
  }

  autoInputBuffer += normaliseTriggerText(chunk);
  if (autoInputBuffer.length > 4096) {
    autoInputBuffer = autoInputBuffer.slice(-4096);
  }

  if (!typeNConfirmed && autoInputBuffer.includes(TYPE_N_TRIGGER)) {
    sendToSocket('Y\n');
    typeNConfirmed = true;
  }

  if (typeNConfirmed && !nicknameSubmitted && autoInputBuffer.includes(NICKNAME_TRIGGER)) {
    sendToSocket(`${pendingNickname}\n`);
    nicknameSubmitted = true;
  }

  if (nicknameSubmitted && !nicknameConfirmed && autoInputBuffer.includes(CONFIRM_NICKNAME_TRIGGER)) {
    sendToSocket('Y\n');
    nicknameConfirmed = true;
  }

  if (autoInputBuffer.includes(DUPLICATE_NICKNAME_TRIGGER)) {
    duplicateNicknameDetected = true;
  }
};

const cleanupSession = () => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    sendToSocket('/exit\n');
  }

  if (socket) {
    socket.close();
    socket = null;
  }

  resizeObserver?.disconnect();
  resizeObserver = null;

  fitAddon?.dispose();
  fitAddon = null;

  terminal?.dispose();
  terminal = null;

  terminalContainer.innerHTML = '';
  socketTextDecoder = new TextDecoder();
};

const connectTerminal = () => {
  terminalScreen.hidden = false;

  if (!TARGET_HOST.trim()) {
    terminalContainer.textContent = 'Unable to connect: CHATTER_BBS_HOST is not configured on this server.';
    return;
  }

  const Terminal = getGlobal<XtermCtor>('Terminal');
  const fitAddonGlobal = getGlobal<Record<string, unknown>>('FitAddon');
  const FitAddon = (fitAddonGlobal.FitAddon ?? fitAddonGlobal) as FitAddonCtor;

  terminal = new Terminal({
    cursorBlink: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 16,
    theme: {
      background: '#000000',
      foreground: '#d1d5db'
    }
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer);
  fitAddon.fit();

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = new URL(`${protocol}://${window.location.host}/terminal`);
  wsUrl.searchParams.set('protocol', TARGET_PROTOCOL);
  wsUrl.searchParams.set('host', TARGET_HOST);
  wsUrl.searchParams.set('port', TARGET_PORT);
  socket = new WebSocket(wsUrl);
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('open', () => {
    terminal?.writeln('Connected.');
    terminal?.focus();
    fitAddon?.fit();
    socketTextDecoder = new TextDecoder();
    autoInputBuffer = '';
    typeNConfirmed = false;
    nicknameSubmitted = false;
    nicknameConfirmed = false;
    duplicateNicknameDetected = false;
    choosePendingNickname();
  });

  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(event.data);
      terminal?.write(bytes);
      const decoded = socketTextDecoder.decode(bytes, { stream: true });
      maybeSendAutoInputs(decoded);
      return;
    }

    const text = String(event.data);
    terminal?.writeln(text);
    maybeSendAutoInputs(text);
  });

  socket.addEventListener('close', () => {
    terminal?.writeln('\r\nDisconnected.');
    const shouldRetry = duplicateNicknameDetected;
    duplicateNicknameDetected = false;
    socket = null;
    if (shouldRetry) {
      terminal?.writeln('Nickname already in use. Retrying with a new nickname...');
      window.setTimeout(() => {
        if (socket !== null) {
          return;
        }
        connectTerminal();
      }, 120);
    }
  });

  terminal.onData((data) => {
    sendToSocket(data);
  });

  terminal.onResize((size) => {
    sendToSocket(new TextEncoder().encode(`\u001b[8;${size.rows};${size.cols}t`));
  });

  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit();
  });
  resizeObserver.observe(terminalContainer);
};

connectTerminal();
window.addEventListener('beforeunload', cleanupSession);
