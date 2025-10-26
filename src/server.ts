import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { connect, Socket as NetSocket } from 'node:net';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = fileURLToPath(new URL('.', import.meta.url));
const staticRoots = [serverDirectory];
const TERMINAL_PATH = '/terminal';
const MAX_USERNAME_BYTES = 64;
type EnvLookupResult = { value: string | undefined; source: string | undefined };

const readEnvValue = (...keys: string[]): EnvLookupResult => {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw !== 'string') {
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed) {
      return { value: trimmed, source: key };
    }
  }
  return { value: undefined, source: undefined };
};

type BbsProtocol = 'telnet' | 'ssh';

type BbsSettings = {
  host: string;
  port: number;
  protocol: BbsProtocol;
  sshUser?: string;
  sshCommand?: string;
};

type TerminalBridge = {
  protocol: BbsProtocol;
  write: (data: Buffer) => void;
  dispose: () => void;
};

type TerminalClientContext = {
  socket: NetSocket;
  buffer: Buffer;
  closed: boolean;
  sentClose: boolean;
  bridge: TerminalBridge | null;
  settings: BbsSettings;
};

const readBbsSettings = (options: { silent?: boolean } = {}): BbsSettings | null => {
  const { silent = false } = options;
  const { value: host } = readEnvValue('CHATTER_BBS_HOST', 'CHATTER_TERMINAL_HOST');
  const { value: rawProtocol } = readEnvValue('CHATTER_BBS_PROTOCOL', 'CHATTER_TERMINAL_PROTOCOL');
  const protocolValue = (rawProtocol ?? 'ssh').toLowerCase();
  const protocol: BbsProtocol = protocolValue === 'telnet' ? 'telnet' : 'ssh';
  const defaultPort = protocol === 'ssh' ? 22 : 23;
  const { value: rawPort, source: portSource } = readEnvValue(
    'CHATTER_BBS_PORT',
    'CHATTER_TERMINAL_PORT'
  );

  if (!host) {
    return null;
  }

  let port = defaultPort;
  if (rawPort) {
    const parsed = Number.parseInt(rawPort, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
      if (!silent) {
        const label = portSource ?? 'CHATTER_BBS_PORT';
        console.warn(`Ignoring invalid ${label} value: ${rawPort}`);
      }
    } else {
      port = parsed;
    }
  }

  const { value: sshUser } = readEnvValue('CHATTER_BBS_SSH_USER', 'CHATTER_TERMINAL_SSH_USER');
  const { value: sshCommand } = readEnvValue(
    'CHATTER_BBS_SSH_COMMAND',
    'CHATTER_TERMINAL_SSH_COMMAND'
  );

  return {
    host,
    port,
    protocol,
    sshUser: sshUser || undefined,
    sshCommand: sshCommand || undefined
  };
};

const normaliseUsername = (value: string | null): { valid: boolean; username: string | null } => {
  if (value === null) {
    return { valid: true, username: null };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: true, username: null };
  }

  const normalised = trimmed.normalize('NFC');
  if (/[\u0000-\u001f\u007f]/u.test(normalised)) {
    return { valid: false, username: null };
  }

  const utf8Buffer = Buffer.from(normalised, 'utf8');
  if (utf8Buffer.length === 0 || utf8Buffer.length > MAX_USERNAME_BYTES) {
    return { valid: false, username: null };
  }

  return { valid: true, username: utf8Buffer.toString('utf8') };
};

const normaliseProtocolOverride = (
  value: string | null
): { present: boolean; valid: boolean; protocol: BbsProtocol | null } => {
  if (value === null) {
    return { present: false, valid: true, protocol: null };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { present: true, valid: false, protocol: null };
  }

  const lower = trimmed.toLowerCase();
  if (lower !== 'ssh' && lower !== 'telnet') {
    return { present: true, valid: false, protocol: null };
  }

  return { present: true, valid: true, protocol: lower as BbsProtocol };
};

const normaliseHostOverride = (
  value: string | null
): { present: boolean; valid: boolean; host: string | null } => {
  if (value === null) {
    return { present: false, valid: true, host: null };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { present: true, valid: false, host: null };
  }

  if (/\s/.test(trimmed) || trimmed.length > 255) {
    return { present: true, valid: false, host: null };
  }

  return { present: true, valid: true, host: trimmed };
};

const normalisePortOverride = (
  value: string | null
): { present: boolean; valid: boolean; port: number | null } => {
  if (value === null) {
    return { present: false, valid: true, port: null };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { present: true, valid: false, port: null };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65_535) {
    return { present: true, valid: false, port: null };
  }

  return { present: true, valid: true, port: parsed };
};

const resolveRuntimeConfig = () => {
  const config: Record<string, string> = {};
  const settings = readBbsSettings({ silent: true });
  const { value: protocolEnv } = readEnvValue('CHATTER_BBS_PROTOCOL', 'CHATTER_TERMINAL_PROTOCOL');
  const normalisedProtocolValue = (protocolEnv ?? 'ssh').toLowerCase();

  if (settings) {
    config.bbsProtocol = settings.protocol;
    config.bbsHost = settings.host;
    config.bbsPort = String(settings.port);
    if (settings.sshUser) {
      config.bbsSshUser = settings.sshUser;
    }
  } else {
    const normalisedProtocol: BbsProtocol =
      normalisedProtocolValue === 'telnet' ? 'telnet' : 'ssh';
    config.bbsProtocol = normalisedProtocol;
    const { value: rawPort } = readEnvValue('CHATTER_BBS_PORT', 'CHATTER_TERMINAL_PORT');
    if (rawPort) {
      config.bbsPort = rawPort;
    } else {
      config.bbsPort = normalisedProtocol === 'ssh' ? '22' : '23';
    }
    const { value: sshUser } = readEnvValue(
      'CHATTER_BBS_SSH_USER',
      'CHATTER_TERMINAL_SSH_USER'
    );
    if (sshUser) {
      config.bbsSshUser = sshUser;
    }
  }

  const { value: hostPlaceholder } = readEnvValue(
    'CHATTER_BBS_HOST_PLACEHOLDER',
    'CHATTER_TERMINAL_HOST_PLACEHOLDER'
  );
  const { value: hostDefault } = readEnvValue(
    'CHATTER_BBS_HOST_DEFAULT',
    'CHATTER_TERMINAL_HOST_DEFAULT'
  );
  const { value: portDefault } = readEnvValue(
    'CHATTER_BBS_PORT_DEFAULT',
    'CHATTER_TERMINAL_PORT_DEFAULT'
  );
  if (hostPlaceholder) {
    config.bbsHostPlaceholder = hostPlaceholder;
  }

  if (hostDefault) {
    config.bbsHostDefault = hostDefault;
  }

  if (portDefault) {
    config.bbsPortDefault = portDefault;
  }

  const { value: relayDnsPeer } = readEnvValue('CHATTER_BBS_RELAYDNS_PEER');

  const ensureUrlScheme = (value: string) => {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
      return value;
    }
    return `http://${value}`;
  };

  if (relayDnsPeer) {
    config.terminalBridgeMode = 'relaydns';
    config.terminalRelayDnsPeer = relayDnsPeer;
    const { value: relayBaseOverride } = readEnvValue('CHATTER_BBS_RELAYDNS_BASE_URL');
    const baseCandidate = (relayBaseOverride && relayBaseOverride.trim()) || 'http://173.249.203.13:8080';
    try {
      const baseUrl = new URL(ensureUrlScheme(baseCandidate));
      const basePath = baseUrl.pathname.replace(/\/+$/, '');
      baseUrl.pathname = `${basePath}/peer/${encodeURIComponent(relayDnsPeer)}/ws`;
      baseUrl.search = '';
      baseUrl.hash = '';
      const protocol = baseUrl.protocol.toLowerCase();
      baseUrl.protocol = protocol === 'https:' || protocol === 'wss:' ? 'wss:' : 'ws:';
      config.terminalSocketUrl = baseUrl.toString();
    } catch (error) {
      console.warn('Invalid RelayDNS base URL provided. Falling back to default.', error);
      try {
        const fallbackUrl = new URL('ws://173.249.203.13:8080/');
        fallbackUrl.pathname = `/peer/${encodeURIComponent(relayDnsPeer)}/ws`;
        config.terminalSocketUrl = fallbackUrl.toString();
      } catch (fallbackError) {
        console.warn('Failed to construct RelayDNS socket URL', fallbackError);
      }
    }
  } else {
    config.terminalBridgeMode = 'local';
  }

  return config;
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sanitisePath(urlPath: string): string {
  const [pathWithoutQuery] = urlPath.split('?');
  const decoded = decodeURIComponent(pathWithoutQuery);
  const segments = decoded.split('/').filter((segment) => segment && segment !== '.');
  const safeSegments: string[] = [];

  for (const segment of segments) {
    if (segment === '..') {
      safeSegments.pop();
    } else {
      safeSegments.push(segment);
    }
  }

  return safeSegments.join('/');
}

async function tryResolve(root: string, safePath: string) {
  let candidate = join(root, safePath);

  try {
    let fileStat = await stat(candidate);
    if (fileStat.isDirectory()) {
      candidate = join(candidate, 'index.html');
      fileStat = await stat(candidate);
    }

    return { path: candidate, stats: fileStat };
  } catch (error) {
    if (!safePath) {
      try {
        const fallback = join(root, 'index.html');
        const stats = await stat(fallback);
        return { path: fallback, stats };
      } catch (fallbackError) {
        if (
          fallbackError &&
          typeof fallbackError === 'object' &&
          'code' in fallbackError &&
          (fallbackError as { code?: string }).code !== 'ENOENT'
        ) {
          throw fallbackError;
        }
      }
    } else if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code !== 'ENOENT'
    ) {
      throw error;
    }

    return null;
  }
}

async function resolveFile(urlPath: string) {
  const safePath = sanitisePath(urlPath);

  for (const root of staticRoots) {
    const resolved = await tryResolve(root, safePath);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

const createFrame = (payload: Buffer, opcode: number) => {
  const length = payload.length;

  if (length < 126) {
    const frame = Buffer.alloc(2 + length);
    frame[0] = 0x80 | (opcode & 0x0f);
    frame[1] = length;
    payload.copy(frame, 2);
    return frame;
  }

  if (length < 65_536) {
    const frame = Buffer.alloc(4 + length);
    frame[0] = 0x80 | (opcode & 0x0f);
    frame[1] = 126;
    frame.writeUInt16BE(length, 2);
    payload.copy(frame, 4);
    return frame;
  }

  const frame = Buffer.alloc(10 + length);
  frame[0] = 0x80 | (opcode & 0x0f);
  frame[1] = 127;
  frame.writeUInt32BE(0, 2);
  frame.writeUInt32BE(length, 6);
  payload.copy(frame, 10);
  return frame;
};

const sendBinaryFrame = (context: TerminalClientContext, data: Buffer | ArrayBuffer) => {
  if (context.closed) {
    return;
  }
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  context.socket.write(createFrame(payload, 0x2));
};

const sendTextFrame = (context: TerminalClientContext, message: string) => {
  if (context.closed) {
    return;
  }
  const payload = Buffer.from(message, 'utf8');
  context.socket.write(createFrame(payload, 0x1));
};

const sendPongFrame = (context: TerminalClientContext, payload: Buffer) => {
  if (context.closed) {
    return;
  }
  context.socket.write(createFrame(payload, 0x0a));
};

const createCloseFrame = (code: number, reason: string) => {
  const reasonBuffer = Buffer.from(reason, 'utf8');
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  return createFrame(payload, 0x08);
};

const disposeBridge = (context: TerminalClientContext) => {
  if (context.bridge) {
    try {
      context.bridge.dispose();
    } catch (error) {
      console.error('Error while disposing terminal bridge', error);
    }
    context.bridge = null;
  }
};

const terminate = (context: TerminalClientContext, code: number, reason: string) => {
  if (!context.sentClose) {
    context.socket.write(createCloseFrame(code, reason));
    context.sentClose = true;
  }
  if (!context.closed) {
    context.closed = true;
    disposeBridge(context);
    context.socket.end();
  }
};

const closeSilently = (context: TerminalClientContext) => {
  if (context.closed) {
    return;
  }
  context.closed = true;
  disposeBridge(context);
};

const attachTelnetBridge = (context: TerminalClientContext) => {
  const { host, port } = context.settings;
  sendTextFrame(context, `Dialling TELNET ${host}:${port} …`);
  const remote = connect({ host, port });
  remote.setNoDelay(true);

  remote.on('connect', () => {
    sendTextFrame(context, `Connected to ${host}:${port}.`);
  });

  remote.on('data', (chunk) => {
    sendBinaryFrame(context, chunk);
  });

  remote.on('close', () => {
    if (!context.closed) {
      terminate(context, 1000, 'BBS connection closed');
    }
  });

  remote.on('error', (error) => {
    console.error('Telnet bridge error', error);
    if (!context.closed) {
      sendTextFrame(context, `Telnet error: ${(error as Error).message}`);
      terminate(context, 1011, 'Telnet error');
    }
  });

  context.bridge = {
    protocol: 'telnet',
    write: (data: Buffer) => {
      remote.write(data);
    },
    dispose: () => {
      remote.destroy();
    }
  };
};

const attachSshBridge = (context: TerminalClientContext) => {
  const { host, port, sshUser, sshCommand } = context.settings;

  if (!sshUser) {
    sendTextFrame(context, 'SSH requires a username. Provide one before connecting.');
    terminate(context, 1008, 'SSH username missing');
    return;
  }

  const target = `${sshUser}@${host}`;
  const args = ['-tt', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];

  if (port) {
    args.push('-p', String(port));
  }

  args.push(target);

  if (sshCommand) {
    args.push(sshCommand);
  }

  sendTextFrame(context, `Dialling SSH ${target}${port ? `:${port}` : ''} …`);

  let child: ChildProcessWithoutNullStreams;

  try {
    child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    console.error('Failed to spawn ssh', error);
    sendTextFrame(context, `Failed to launch ssh: ${(error as Error).message}`);
    terminate(context, 1011, 'SSH launch failed');
    return;
  }

  child.stdout.on('data', (chunk) => {
    sendBinaryFrame(context, chunk as Buffer);
  });

  child.stderr.on('data', (chunk) => {
    sendBinaryFrame(context, chunk as Buffer);
  });

  child.on('close', (code) => {
    if (!context.closed) {
      const reason = typeof code === 'number' ? `SSH exited (${code})` : 'SSH exited';
      terminate(context, 1000, reason);
    }
  });

  child.on('error', (error) => {
    console.error('SSH process error', error);
    if (!context.closed) {
      sendTextFrame(context, `SSH error: ${(error as Error).message}`);
      terminate(context, 1011, 'SSH error');
    }
  });

  context.bridge = {
    protocol: 'ssh',
    write: (data: Buffer) => {
      child.stdin.write(data);
    },
    dispose: () => {
      try {
        child.stdin.end();
      } catch (error) {
        console.error('Error closing SSH stdin', error);
      }
      child.kill('SIGTERM');
    }
  };
};

const attachBridge = (context: TerminalClientContext) => {
  if (context.settings.protocol === 'ssh') {
    attachSshBridge(context);
  } else {
    attachTelnetBridge(context);
  }
};

const processIncomingFrames = (context: TerminalClientContext) => {
  while (context.buffer.length >= 2 && !context.closed) {
    const first = context.buffer[0];
    const second = context.buffer[1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (!fin) {
      terminate(context, 1003, 'Fragmented frames are not supported');
      return;
    }

    if (length === 126) {
      if (context.buffer.length < offset + 2) {
        return;
      }
      length = context.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (context.buffer.length < offset + 8) {
        return;
      }
      const high = context.buffer.readUInt32BE(offset);
      const low = context.buffer.readUInt32BE(offset + 4);
      offset += 8;
      if (high !== 0) {
        terminate(context, 1009, 'Frame too large');
        return;
      }
      length = low;
    }

    if (!masked) {
      terminate(context, 1002, 'Client frames must be masked');
      return;
    }

    if (context.buffer.length < offset + 4 + length) {
      return;
    }

    const mask = context.buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.alloc(length);

    for (let index = 0; index < length; index += 1) {
      payload[index] = context.buffer[offset + index] ^ mask[index % 4];
    }

    offset += length;
    context.buffer = context.buffer.subarray(offset);

    switch (opcode) {
      case 0x1:
      case 0x2:
        if (context.bridge) {
          context.bridge.write(payload);
        }
        break;
      case 0x8: {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
        const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
        if (!context.sentClose) {
          context.socket.write(createCloseFrame(code, reason));
          context.sentClose = true;
        }
        closeSilently(context);
        context.socket.end();
        return;
      }
      case 0x9:
        sendPongFrame(context, payload);
        break;
      case 0xA:
        break;
      default:
        terminate(context, 1003, 'Unsupported opcode');
        return;
    }
  }
};

async function handleRequest(req: IncomingMessage, res: import('node:http').ServerResponse) {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Bad Request');
    return;
  }

  const method = req.method ?? 'GET';

  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end('Method Not Allowed');
    return;
  }

  const [urlPath] = req.url.split('?');

  if (urlPath === '/env.js') {
    const config = resolveRuntimeConfig();
    const serialised = JSON.stringify(config).replace(/</g, '\u003C');
    const script = `window.__CHATTER_CONFIG__ = Object.freeze(${serialised});\n`;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    if (method === 'HEAD') {
      res.end();
      return;
    }

    res.end(script);
    return;
  }

  try {
    const resolved = await resolveFile(req.url);

    if (!resolved) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not Found');
      return;
    }

    const { path, stats } = resolved;
    const extension = extname(path).toLowerCase();
    const contentType = MIME_TYPES[extension] ?? 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    if (extension === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    if (method === 'HEAD') {
      res.end();
      return;
    }

    const stream = createReadStream(path);
    stream.on('error', (error) => {
      console.error('Failed to stream', path, error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.end('Internal Server Error');
    });

    stream.pipe(res);
  } catch (error) {
    console.error('Unhandled error while serving request', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Internal Server Error');
  }
}

const respondUpgradeError = (socket: NetSocket, status: number, message: string) => {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`);
  socket.destroy();
};

const handleUpgrade = (req: IncomingMessage, socket: NetSocket, head: Buffer) => {
  const urlText = req.url ?? '/';
  let requestUrl: URL | null = null;

  try {
    requestUrl = new URL(urlText, 'http://localhost');
  } catch (error) {
    console.error('Failed to parse upgrade URL', error);
  }

  const pathname = requestUrl?.pathname ?? '/';

  if (pathname !== TERMINAL_PATH) {
    respondUpgradeError(socket, 404, 'Not Found');
    return;
  }

  const settings = readBbsSettings();
  const { value: fallbackProtocolEnv } = readEnvValue(
    'CHATTER_BBS_PROTOCOL',
    'CHATTER_TERMINAL_PROTOCOL'
  );
  const fallbackProtocol = (fallbackProtocolEnv ?? 'telnet').toLowerCase() === 'ssh' ? 'ssh' : 'telnet';
  const defaultPort = fallbackProtocol === 'ssh' ? 22 : 23;

  const sessionSettings: BbsSettings = settings
    ? { ...settings }
    : {
        host: '',
        port: defaultPort,
        protocol: fallbackProtocol,
        sshUser: readEnvValue('CHATTER_BBS_SSH_USER', 'CHATTER_TERMINAL_SSH_USER').value || undefined,
        sshCommand:
          readEnvValue('CHATTER_BBS_SSH_COMMAND', 'CHATTER_TERMINAL_SSH_COMMAND').value || undefined
      };

  let usernameOverride: string | null = null;
  let protocolOverride: BbsProtocol | null = null;
  let hostOverride: string | null = null;
  let portOverride: number | null = null;

  if (requestUrl) {
    const normalised = normaliseUsername(requestUrl.searchParams.get('username'));
    if (!normalised.valid) {
      respondUpgradeError(socket, 400, 'Invalid username');
      return;
    }
    usernameOverride = normalised.username;

    const protocolResult = normaliseProtocolOverride(requestUrl.searchParams.get('protocol'));
    if (!protocolResult.valid) {
      respondUpgradeError(socket, 400, 'Invalid protocol override');
      return;
    }
    if (protocolResult.present) {
      protocolOverride = protocolResult.protocol;
    }

    const hostResult = normaliseHostOverride(requestUrl.searchParams.get('host'));
    if (!hostResult.valid) {
      respondUpgradeError(socket, 400, 'Invalid host override');
      return;
    }
    if (hostResult.present) {
      hostOverride = hostResult.host;
    }

    const portResult = normalisePortOverride(requestUrl.searchParams.get('port'));
    if (!portResult.valid) {
      respondUpgradeError(socket, 400, 'Invalid port override');
      return;
    }
    if (portResult.present) {
      portOverride = portResult.port;
    }
  }

  if (protocolOverride) {
    sessionSettings.protocol = protocolOverride;
    if (portOverride === null) {
      sessionSettings.port = protocolOverride === 'ssh' ? 22 : 23;
    }
  }

  if (hostOverride) {
    sessionSettings.host = hostOverride;
  }

  if (portOverride !== null) {
    sessionSettings.port = portOverride;
  }

  if (usernameOverride) {
    sessionSettings.sshUser = usernameOverride;
  }

  if (!sessionSettings.host) {
    respondUpgradeError(socket, 503, 'BBS target not configured');
    return;
  }

  if (sessionSettings.protocol === 'ssh' && !sessionSettings.sshUser) {
    respondUpgradeError(socket, 400, 'SSH username required');
    return;
  }

  const upgradeHeader = req.headers?.['upgrade'];
  const keyHeader = req.headers?.['sec-websocket-key'];

  if (!upgradeHeader || typeof upgradeHeader !== 'string' || upgradeHeader.toLowerCase() !== 'websocket') {
    respondUpgradeError(socket, 400, 'Invalid Upgrade header');
    return;
  }

  if (!keyHeader || typeof keyHeader !== 'string') {
    respondUpgradeError(socket, 400, 'Missing Sec-WebSocket-Key header');
    return;
  }

  const acceptKey = createHash('sha1')
    .update(`${keyHeader}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n'
    ].join('\r\n')
  );

  socket.setNoDelay(true);

  const context: TerminalClientContext = {
    socket,
    buffer: head && head.length ? Buffer.from(head) : Buffer.alloc(0),
    closed: false,
    sentClose: false,
    bridge: null,
    settings: sessionSettings
  };

  socket.on('data', (chunk: Buffer) => {
    if (context.closed) {
      return;
    }
    context.buffer = Buffer.concat([context.buffer, chunk]);
    processIncomingFrames(context);
  });

  socket.on('close', () => {
    closeSilently(context);
  });

  socket.on('end', () => {
    closeSilently(context);
  });

  socket.on('error', (error) => {
    console.error('WebSocket connection error', error);
    closeSilently(context);
  });

  attachBridge(context);

  if (context.buffer.length) {
    processIncomingFrames(context);
  }
};

const port = Number.parseInt(process.env.PORT ?? '8081', 10);
const host = process.env.HOST ?? '0.0.0.0';

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

const upgradeableServer = server as unknown as {
  on(event: 'upgrade', listener: (req: IncomingMessage, socket: NetSocket, head: Buffer) => void): void;
};

upgradeableServer.on('upgrade', (req, socket, head) => {
  handleUpgrade(req, socket, head);
});

server.listen(port, host, () => {
  console.log(`Chatter frontend available at http://${host}:${port}`);
});

export { server };
