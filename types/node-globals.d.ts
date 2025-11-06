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
    on(event: 'upgrade', listener: (req: IncomingMessage, socket: any, head: Buffer) => void): void;
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
  export function resolve(...parts: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: URL): string;
}

declare module 'node:crypto' {
  export function createHash(algorithm: string): any;
}

declare module 'node:net' {
  export interface Socket {
    on(event: string, listener: (...args: any[]) => void): this;
    write(data: any): void;
    end(): void;
    destroy(): void;
    setNoDelay(noDelay: boolean): void;
  }
  export function connect(options: any, callback?: () => void): Socket;
  export function isIP(input: string): number;
  export { Socket as Socket };
}

declare module 'node:child_process' {
  export interface ChildProcessWithoutNullStreams {
    stdin: any;
    stdout: any;
    stderr: any;
    on(event: string, listener: (...args: any[]) => void): this;
    kill(signal?: string): void;
  }
  export function spawn(command: string, args?: string[], options?: any): ChildProcessWithoutNullStreams;
}

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exitCode?: number;
};

declare const Buffer: {
  from(data: any, encoding?: string): Buffer;
  alloc(size: number): Buffer;
  isBuffer(obj: any): obj is Buffer;
  byteLength(string: string, encoding?: string): number;
  concat(list: Buffer[]): Buffer;
};

interface Buffer {
  length: number;
  [index: number]: number;
  toString(encoding?: string): string;
  copy(target: Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
  writeUInt16BE(value: number, offset: number): number;
  writeUInt32BE(value: number, offset: number): number;
  readUInt16BE(offset: number): number;
  readUInt32BE(offset: number): number;
  subarray(start?: number, end?: number): Buffer;
}
