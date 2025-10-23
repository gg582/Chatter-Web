declare module 'node:assert/strict' {
  const assert: any;
  export default assert;
}

declare module 'node:test' {
  export type TestFn = () => void | Promise<void>;
  export function describe(name: string, fn: TestFn): void;
  export function it(name: string, fn: TestFn): void;
}

declare module 'node:http' {
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
  }

  export interface ServerResponse {
    statusCode: number;
    headersSent: boolean;
    setHeader(name: string, value: string | number): void;
    end(chunk?: any): void;
  }

  export type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

  export interface Server {
    listen(port: number, hostname: string, listener?: () => void): void;
  }

  export function createServer(listener: RequestListener): Server;
}

declare module 'node:fs' {
  export interface ReadStream {
    on(event: string, listener: (...args: any[]) => void): this;
    pipe(destination: any): any;
  }

  export function createReadStream(path: string): ReadStream;
}

declare module 'node:fs/promises' {
  export interface Stats {
    size: number;
    isDirectory(): boolean;
  }

  export function stat(path: string): Promise<Stats>;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function extname(path: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: URL): string;
}

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exitCode?: number;
};
