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

const joinScreen = document.querySelector<HTMLElement>('[data-join-screen]');
const terminalScreen = document.querySelector<HTMLElement>('[data-terminal-screen]');
const terminalContainer = document.querySelector<HTMLElement>('[data-terminal-container]');
const joinButton = document.querySelector<HTMLButtonElement>('[data-join-button]');
const rejoinButton = document.querySelector<HTMLButtonElement>('[data-rejoin-button]');
const exitButton = document.querySelector<HTMLButtonElement>('[data-exit-button]');

if (
  !joinScreen ||
  !terminalScreen ||
  !terminalContainer ||
  !joinButton ||
  !rejoinButton ||
  !exitButton
) {
  throw new Error('Required DOM nodes are missing.');
}

let socket: WebSocket | null = null;
let terminal: XtermTerminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let retroCommandSent = false;
let joinMessageBuffer = '';
let socketTextDecoder = new TextDecoder();
const JOIN_MESSAGE_TRIGGER = 'has joined the chat';

const maybeTriggerRetroOff = (chunk: string) => {
  if (retroCommandSent || !chunk) {
    return;
  }

  joinMessageBuffer += chunk.toLowerCase();
  if (joinMessageBuffer.length > 2048) {
    joinMessageBuffer = joinMessageBuffer.slice(-2048);
  }

  if (joinMessageBuffer.includes(JOIN_MESSAGE_TRIGGER)) {
    sendToSocket('/retro off\n');
    retroCommandSent = true;
  }
};

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

const openTerminalScreen = () => {
  joinScreen.hidden = true;
  terminalScreen.hidden = false;
};

const openJoinScreen = () => {
  terminalScreen.hidden = true;
  joinScreen.hidden = false;
};

const cleanupSession = () => {
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
  retroCommandSent = false;
  joinMessageBuffer = '';
  socketTextDecoder = new TextDecoder();
};

const connectTerminal = () => {
  if (!TARGET_HOST.trim()) {
    terminalContainer.textContent =
      'Unable to connect: CHATTER_BBS_HOST is not configured on this server.';
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
    retroCommandSent = false;
    joinMessageBuffer = '';
    socketTextDecoder = new TextDecoder();
  });

  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(event.data);
      terminal?.write(bytes);
      const decoded = socketTextDecoder.decode(bytes, { stream: true });
      maybeTriggerRetroOff(decoded);
      return;
    }

    const text = String(event.data);
    terminal?.writeln(text);
    maybeTriggerRetroOff(text);
  });

  socket.addEventListener('close', () => {
    terminal?.writeln('\r\nDisconnected. Use Rejoin or Exit.');
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

joinButton.addEventListener('click', () => {
  openTerminalScreen();
  connectTerminal();
});

rejoinButton.addEventListener('click', () => {
  cleanupSession();
  openTerminalScreen();
  connectTerminal();
});

exitButton.addEventListener('click', () => {
  cleanupSession();
  openJoinScreen();
});

window.addEventListener('beforeunload', cleanupSession);
