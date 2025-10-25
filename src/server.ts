import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = fileURLToPath(new URL('.', import.meta.url));
const staticRoots = [serverDirectory];

const fallbackGatewayHost = 'bbs.chatter.example';
const fallbackGatewayPort = '443';
const fallbackGatewayPath = '/pty';

const defaultSchemeForPort = (port: string | undefined) => {
  if (!port || port === fallbackGatewayPort) {
    return 'wss';
  }
  return 'ws';
};

const normalisePath = (path: string | undefined) => {
  if (!path) {
    return fallbackGatewayPath;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return fallbackGatewayPath;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const buildGatewayUrl = (host: string | undefined, port: string | undefined, path: string | undefined) => {
  if (!host) {
    return '';
  }
  const trimmedHost = host.trim();
  if (!trimmedHost) {
    return '';
  }
  const trimmedPort = port?.trim() ?? '';
  const scheme = process.env.CHATTER_TERMINAL_SCHEME?.trim() || defaultSchemeForPort(trimmedPort || undefined);
  const showPort = trimmedPort && !(scheme === 'wss' && trimmedPort === fallbackGatewayPort);
  const portSegment = showPort ? `:${trimmedPort}` : '';
  const safePath = normalisePath(path);
  return `${scheme}://${trimmedHost}${portSegment}${safePath}`;
};

const resolveRuntimeConfig = () => {
  const host = process.env.CHATTER_TERMINAL_HOST?.trim();
  const port = process.env.CHATTER_TERMINAL_PORT?.trim();
  const path = process.env.CHATTER_TERMINAL_PATH?.trim();
  const explicitGateway = process.env.CHATTER_TERMINAL_GATEWAY?.trim();

  let gateway = explicitGateway;
  if (!gateway) {
    gateway = buildGatewayUrl(host, port, path);
  }
  if (!gateway) {
    gateway = buildGatewayUrl(fallbackGatewayHost, fallbackGatewayPort, fallbackGatewayPath);
  }

  const config: Record<string, string> = { terminalGateway: gateway };
  if (host) {
    config.terminalHost = host;
  }
  if (port) {
    config.terminalPort = port;
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

async function handleRequest(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
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
    const serialised = JSON.stringify(config).replace(/</g, '\\u003C');
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

const port = Number.parseInt(process.env.PORT ?? '8081', 10);
const host = process.env.HOST ?? '0.0.0.0';

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

server.listen(port, host, () => {
  console.log(`Chatter frontend available at http://${host}:${port}`);
});

export { server };
