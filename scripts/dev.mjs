import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const viteBin = path.join(
  path.dirname(require.resolve('vite/package.json')),
  'bin',
  'vite.js',
);

const apiPort = process.env.PORT ?? '4174';
const vitePort = process.env.VITE_PORT ?? '5173';
const healthUrl = `http://127.0.0.1:${apiPort}/api/health`;

const children = [];
let shuttingDown = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isApiReady() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isApiReady()) return true;
    await sleep(150);
  }
  return false;
}

function track(child, name) {
  children.push({ child, name });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (name === 'vite') {
      shutdown(code && code > 0 ? code : 0);
      return;
    }
    if (code === 0 || signal === 'SIGTERM') return;
    console.warn(
      `[${name}] terminó con código ${code ?? signal}. La interfaz seguirá disponible en modo local.`,
    );
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500).unref();
}

let startedApi = false;

const apiWasRunning = await isApiReady();
if (apiWasRunning) {
  console.log(`Reutilizando la API SQLite existente en http://127.0.0.1:${apiPort}`);
} else {
  const api = spawn(process.execPath, [path.join(root, 'server', 'index.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: apiPort },
    stdio: 'inherit',
  });
  track(api, 'sqlite');
  startedApi = true;

  if (!(await waitForApi())) {
    console.error('La API SQLite no respondió a tiempo.');
    shutdown(1);
    process.exit(1);
  }
}

const vite = spawn(
  process.execPath,
  [viteBin, '--port', vitePort, '--host', '127.0.0.1'],
  {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  },
);
track(vite, 'vite');

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (startedApi) {
  console.log(`\nFinanzasPro con SQLite: interfaz en http://127.0.0.1:${vitePort}`);
}
