declare module 'node:assert/strict' {
  import assert from 'assert';
  export default assert;
}

declare module 'node:test' {
  export type TestFn = () => void | Promise<void>;
  export function describe(name: string, fn: TestFn): void;
  export function it(name: string, fn: TestFn): void;
}
