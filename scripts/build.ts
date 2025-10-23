import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(process.cwd(), 'public'), dist, { recursive: true });

const result = await Bun.build({
  entrypoints: ['src/main.ts'],
  outdir: dist,
  target: 'browser',
  minify: true,
  sourcemap: 'external'
});

if (!result.success) {
  console.error('Build failed:', result.logs.map((log) => log.message).join('\n'));
  process.exit(1);
}

console.log('Build finished. Output written to', dist);
