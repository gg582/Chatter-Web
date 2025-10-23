import { cp, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function main() {
  const dist = join(root, 'dist');
  const publicDir = join(root, 'public');

  await rm(dist, { recursive: true, force: true });
  await run('tsc', ['-p', 'tsconfig.build.json'], { cwd: root });
  await mkdir(dist, { recursive: true });
  await cp(publicDir, dist, { recursive: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
