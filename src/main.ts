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

type KeyboardInstance = {
  setOptions: (options: Record<string, unknown>) => void;
  destroy: () => void;
};

type KeyboardCtor = new (
  selector: string,
  options: { layout?: Record<string, string[]>; onKeyPress: (button: string) => void }
) => KeyboardInstance;

type KoreanLayoutCtor = new () => { get: () => Record<string, string[]> };

const joinScreen = document.querySelector<HTMLElement>('[data-join-screen]');
const terminalScreen = document.querySelector<HTMLElement>('[data-terminal-screen]');
const terminalContainer = document.querySelector<HTMLElement>('[data-terminal-container]');
const joinButton = document.querySelector<HTMLButtonElement>('[data-join-button]');
const exitButton = document.querySelector<HTMLButtonElement>('[data-exit-button]');
const keyboardToggleButton = document.querySelector<HTMLButtonElement>('[data-keyboard-toggle]');
const keyboardPanel = document.querySelector<HTMLElement>('[data-keyboard-panel]');

if (
  !joinScreen ||
  !terminalScreen ||
  !terminalContainer ||
  !joinButton ||
  !exitButton ||
  !keyboardToggleButton ||
  !keyboardPanel
) {
  throw new Error('Required DOM nodes are missing.');
}

let socket: WebSocket | null = null;
let terminal: XtermTerminal | null = null;
let fitAddon: FitAddon | null = null;
let keyboard: KeyboardInstance | null = null;
let resizeObserver: ResizeObserver | null = null;

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
const TARGET_PROTOCOL = runtimeConfig.bbsProtocol === 'telnet' ? 'telnet' : 'telnet';

const enterBytes = new TextEncoder().encode('\r');
const backspaceBytes = new TextEncoder().encode('\u007f');
const tabBytes = new TextEncoder().encode('\t');

const sendToSocket = (payload: string | Uint8Array) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(payload);
};

const sendKeyboardKey = (button: string) => {
  if (button === '{enter}') {
    sendToSocket(enterBytes);
    return;
  }

  if (button === '{bksp}') {
    sendToSocket(backspaceBytes);
    return;
  }

  if (button === '{space}') {
    sendToSocket(' ');
    return;
  }

  if (button === '{tab}') {
    sendToSocket(tabBytes);
    return;
  }

  if (button.startsWith('{') && button.endsWith('}')) {
    return;
  }

  sendToSocket(button);
};

const setupKeyboard = () => {
  const keyboardGlobal = getGlobal<Record<string, unknown>>('SimpleKeyboard');
  const Keyboard = (keyboardGlobal.default ?? keyboardGlobal) as KeyboardCtor;

  const layoutsGlobal = getGlobal<Record<string, unknown>>('SimpleKeyboardLayouts');
  const KoreanLayout = (layoutsGlobal.Korean ?? (layoutsGlobal.default as Record<string, unknown> | undefined)?.Korean) as KoreanLayoutCtor;
  const korean = new KoreanLayout();

  keyboard = new Keyboard('[data-keyboard]', {
    layout: korean.get(),
    onKeyPress: (button) => {
      sendKeyboardKey(button);
      terminal?.focus();
    }
  });
};

const openTerminalScreen = () => {
  joinScreen.hidden = true;
  terminalScreen.hidden = false;
};

const openJoinScreen = () => {
  terminalScreen.hidden = true;
  joinScreen.hidden = false;
  keyboardPanel.hidden = true;
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

  keyboard?.destroy();
  keyboard = null;

  terminalContainer.innerHTML = '';
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
  });

  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      terminal?.write(new Uint8Array(event.data));
      return;
    }

    terminal?.writeln(String(event.data));
  });

  socket.addEventListener('close', () => {
    terminal?.writeln('\r\nDisconnected. Press EXIT.');
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

  setupKeyboard();
};

joinButton.addEventListener('click', () => {
  openTerminalScreen();
  connectTerminal();
});

exitButton.addEventListener('click', () => {
  cleanupSession();
  openJoinScreen();
});

keyboardToggleButton.addEventListener('click', () => {
  keyboardPanel.hidden = !keyboardPanel.hidden;
  fitAddon?.fit();
  terminal?.focus();
});

window.addEventListener('beforeunload', cleanupSession);
