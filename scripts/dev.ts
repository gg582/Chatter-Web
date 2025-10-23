import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');

async function syncPublic() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await cp(join(process.cwd(), 'public'), dist, { recursive: true });
}

await syncPublic();

const builder = await Bun.build({
  entrypoints: ['src/main.ts'],
  outdir: dist,
  target: 'browser',
  sourcemap: 'inline',
  watch: true,
  minify: false,
  onRebuild(result) {
    if (result.success) {
      console.log('[build] updated bundle');
    } else {
      console.error('[build] failed:', result.logs.map((log) => log.message).join('\n'));
    }
  }
});

if (!builder.success) {
  console.error('Initial build failed');
  process.exit(1);
}

const server = Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = Bun.file(join(dist, pathname));
    if (!(await file.exists())) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(file, {
      headers: {
        'Content-Type': file.type || 'text/plain'
      }
    });
  }
});

console.log(`Dev server running at http://localhost:${server.port}`);

process.stdin.resume();
