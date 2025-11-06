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
  
  // Copy xterm.js library files BEFORE TypeScript compilation
  await mkdir(join(dist, 'lib'), { recursive: true });
  
  const xtermJsSource = join(root, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.js');
  const xtermJsDest = join(dist, 'lib', 'xterm.js');
  try {
    await cp(xtermJsSource, xtermJsDest);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.warn('xterm.js not found; skipping copy.');
    } else {
      throw error;
    }
  }

  const fitAddonSource = join(root, 'node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.js');
  const fitAddonDest = join(dist, 'lib', 'addon-fit.js');
  try {
    await cp(fitAddonSource, fitAddonDest);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.warn('addon-fit.js not found; skipping copy.');
    } else {
      throw error;
    }
  }

  // Now compile TypeScript
  await run('tsc', ['-p', 'tsconfig.build.json'], { cwd: root });
  
  await mkdir(dist, { recursive: true });
  await cp(publicDir, dist, { recursive: true });

  // Copy xterm.js CSS
  const xtermCssSource = join(root, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css');
  const xtermCssDest = join(dist, 'xterm.css');
  try {
    await cp(xtermCssSource, xtermCssDest);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.warn('xterm.css not found; skipping copy.');
    } else {
      throw error;
    }
  }

  const serverSource = join(dist, 'src', 'server.js');
  const serverDestination = join(dist, 'server.js');

  try {
    await cp(serverSource, serverDestination);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.warn('Server entrypoint not found; skipping copy.');
    } else {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
