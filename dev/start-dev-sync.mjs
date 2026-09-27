// Standalone launcher: never import server.js or register application routes/jobs.
import 'dotenv/config';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, NODE_ENV } from '../src/configs/config.js';
import { createDevelopmentDatabaseReplacement } from '../src/utils/dev-database-replacement.js';

/** @type {string} */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** @type {string} */
const RUNTIME = path.join(ROOT, 'out', 'dev-sync');
/** @type {string} */
const CONTAINER = 'tienhock_dev_db';
/** @type {string} */
const CONTAINER_DIRECTORY = '/var/backups/postgres/development';
/** @type {number} */
const PHASE_TIMEOUT_MS = 15 * 60 * 1000;
/** @type {number} */
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
/** @type {RegExp} */
const JOB_ID = /^\d{13}_[a-f0-9]{32}$/;
/** @type {RegExp} */
const LOCAL_DIRECTORY = /^download_\d{13}_[a-f0-9]{16}$/;
/** @type {(command: string, args: string[], options: import('node:child_process').ExecFileOptionsWithStringEncoding) => Promise<{stdout: string, stderr: string}>} */
const execFileAsync = promisify(execFile);
/** @type {AbortController} */
const shutdown = new AbortController();
/** @type {import('node:child_process').ChildProcess|null} */
let application = null;

/** @param {string[]} args @param {number} [timeout] @returns {Promise<string>} */
async function docker(args, timeout = 30000) {
  shutdown.signal.throwIfAborted();
  try {
    const { stdout } = await execFileAsync('docker', args, { cwd: ROOT, windowsHide: true,
      timeout, maxBuffer: 1024 * 1024, encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: DB_PASSWORD }, signal: shutdown.signal });
    return stdout.trim();
  } catch {
    throw new Error(`Docker ${args[0]} failed. Check Docker Desktop and the local database configuration.`);
  }
}

/** @param {number} port @param {string} host @returns {Promise<boolean>} */
function portInUse(port, host) {
  return new Promise((resolve) => {
    /** @type {import('node:net').Socket} */
    const socket = net.createConnection({ host, port });
    /** @param {boolean} occupied @returns {void} */
    const finish = (occupied) => { socket.destroy(); resolve(occupied); };
    socket.setTimeout(1000, () => finish(true));
    socket.once('connect', () => finish(true));
    socket.once('error', (error) => finish(!['ECONNREFUSED', 'EAFNOSUPPORT', 'ENETUNREACH'].includes(error.code || '')));
  });
}

/** @returns {Promise<void>} */
async function assertServersStopped() {
  shutdown.signal.throwIfAborted();
  /** @type {number} */
  const apiPort = Number(process.env.PORT || 5000);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('Invalid API port');
  for (const port of new Set([5000, apiPort, 3000])) {
    if ((await Promise.all(['127.0.0.1', '::1'].map((host) => portInUse(port, host)))).some(Boolean)) {
      throw new Error(`Port ${port} is already in use. Stop existing development servers before running dev-sync.bat.`);
    }
  }
}

/** An exclusive loopback listener is released by Windows even after a crash.
 * Keep it for the entire session so two launchers cannot refresh sequentially.
 * @returns {Promise<() => Promise<void>>}
 */
async function acquireLauncherLock() {
  await fs.promises.mkdir(RUNTIME, { recursive: true });
  /** @type {import('node:net').Server} */
  const lock = net.createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    lock.once('error', () => reject(new Error('Another sync launcher is running, or local port 15434 is in use')));
    lock.listen({ host: '127.0.0.1', port: 15434, exclusive: true }, resolve);
  });
  return () => new Promise((resolve, reject) => lock.close((error) => error ? reject(error) : resolve()));
}

/** @returns {pg.Client} */
function adminClient() {
  return new pg.Client({ host: DB_HOST, port: Number(DB_PORT), database: 'postgres', user: DB_USER,
    password: DB_PASSWORD, ssl: false, connectionTimeoutMillis: 5000,
    statement_timeout: 10000, application_name: 'dev_sync_preflight' });
}

/** @returns {Promise<void>} */
async function startAndVerifyDatabase() {
  if (process.platform !== 'win32' || NODE_ENV !== 'development'
    || !['localhost', '127.0.0.1', '::1'].includes(DB_HOST)
    || Number(DB_PORT) !== 5434 || DB_NAME !== 'tienhock' || DB_USER !== 'postgres' || !DB_PASSWORD) {
    throw new Error('Sync requires Windows development with local tienhock/postgres on port 5434 and DB_PASSWORD configured');
  }
  /** @type {string} */
  const contextEndpoint = JSON.parse(await docker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']));
  /** @type {string} */
  const endpoint = process.env.DOCKER_CONTEXT ? contextEndpoint : (process.env.DOCKER_HOST || contextEndpoint);
  if (!endpoint.startsWith('npipe://')) throw new Error('Sync requires the local Docker Desktop named-pipe connection');
  console.log('[Dev sync] Starting the local Docker database...');
  await docker(['compose', '-f', path.join(ROOT, 'dev', 'docker-compose.yml'), 'up', '-d', 'dev_db'], 120000);
  /** @type {number} */
  const deadline = Date.now() + 90000;
  /** @type {boolean} */
  let ready = false;
  while (Date.now() < deadline) {
    try {
      await docker(['exec', CONTAINER, 'pg_isready', '-q', '-U', 'postgres', '-d', 'postgres', '-t', '2'], 5000);
      ready = true;
      break;
    } catch { await delay(1000, undefined, { signal: shutdown.signal }); }
  }
  if (!ready) throw new Error('The Docker database did not become ready within 90 seconds');
  /** @type {Record<string, {HostPort: string}[]|null>} */
  const bindings = JSON.parse(await docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', CONTAINER]));
  if (!bindings['5432/tcp']?.some((binding) => binding.HostPort === '5434')) {
    throw new Error('The development container does not publish PostgreSQL on port 5434');
  }
  /** @type {string} */
  const containerIdentity = await docker(['exec', CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
    '-At', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT system_identifier::text FROM pg_control_system()']);
  /** @type {pg.Client} */
  const client = adminClient();
  try {
    await client.connect();
    const { rows } = await client.query('SELECT system_identifier::text AS id FROM pg_control_system()');
    if (!/^\d+$/.test(containerIdentity) || rows[0]?.id !== containerIdentity) {
      throw new Error('The configured database connection does not match tienhock_dev_db');
    }
  } finally { await client.end(); }
}

/** Check the resolved path before any recursive removal on Windows.
 * @param {string} directory @returns {Promise<void>}
 */
async function removeDownloadDirectory(directory) {
  /** @type {string} */
  const target = path.resolve(directory);
  if (path.dirname(target) !== RUNTIME || !LOCAL_DIRECTORY.test(path.basename(target))) {
    throw new Error('Invalid temporary download directory');
  }
  /** @type {import('node:fs').Stats|null} */
  const stat = await fs.promises.lstat(target).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unexpected temporary download directory');
  await fs.promises.rm(target, { recursive: true, force: true });
}

/** @returns {Promise<void>} */
async function cleanupOldDownloads() {
  for (const entry of await fs.promises.readdir(RUNTIME, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !LOCAL_DIRECTORY.test(entry.name)) continue;
    if (Date.now() - Number(entry.name.split('_')[1]) > 60 * 60 * 1000) {
      await removeDownloadDirectory(path.join(RUNTIME, entry.name));
    }
  }
  await docker(['exec', CONTAINER, 'mkdir', '-p', '-m', '700', CONTAINER_DIRECTORY]);
  await docker(['exec', CONTAINER, 'find', CONTAINER_DIRECTORY, '-maxdepth', '1', '-type', 'f',
    '-regextype', 'posix-extended', '-regex', '.*/dev_sync_[0-9]{13}_[a-f0-9]{16}\.dump', '-mmin', '+60', '-delete']);
}

/** @typedef {{id: string, status: 'preparing'|'ready'|'failed', createdAt: string, expiresAt: string, size: number|null, sha256: string|null}} ExportMetadata */

/** @param {unknown} value @returns {ExportMetadata} */
function parseMetadata(value) {
  /** @type {Partial<ExportMetadata>|null} */
  const job = /** @type {Partial<ExportMetadata>|null} */ (value);
  if (!job || typeof job.id !== 'string' || !JOB_ID.test(job.id)
    || !['preparing', 'ready', 'failed'].includes(job.status || '')
    || !Number.isFinite(Date.parse(job.createdAt || '')) || !Number.isFinite(Date.parse(job.expiresAt || ''))) {
    throw new Error('Production returned invalid export metadata');
  }
  if (job.status === 'ready' && (!Number.isSafeInteger(job.size) || Number(job.size) <= 0
    || Number(job.size) > MAX_ARCHIVE_BYTES || !/^[a-f0-9]{64}$/.test(job.sha256 || ''))) {
    throw new Error('Production returned invalid archive size or checksum');
  }
  return /** @type {ExportMetadata} */ (job);
}

/** @param {ReturnType<typeof createDevelopmentDatabaseReplacement>} replacement @returns {Promise<void>} */
async function refresh(replacement) {
  /** @type {string} */
  const token = process.env.DEV_DB_SYNC_TOKEN || '';
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('DEV_DB_SYNC_TOKEN is missing or invalid; follow docs/DEV_DATABASE_SYNC.md');
  /** @type {URL} */
  const origin = new URL(process.env.DEV_DB_SYNC_URL || 'https://api.tienhock.com');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('DEV_DB_SYNC_URL must be an HTTPS origin without credentials, path or query');
  }
  /** @type {string|null} */
  let jobId = null;
  /** @type {string} */
  const downloadId = `${Date.now()}_${randomBytes(8).toString('hex')}`;
  /** @type {string} */
  const directory = path.join(RUNTIME, `download_${downloadId}`);
  /** @type {string} */
  const archive = path.join(directory, 'snapshot.dump');
  /** @type {string} */
  const containerArchive = `${CONTAINER_DIRECTORY}/dev_sync_${downloadId}.dump`;

  /** @param {string} suffix @param {string} method @param {number} timeout @param {boolean} [cleaning] @returns {Promise<Response>} */
  const request = (suffix, method, timeout, cleaning = false) => fetch(new URL(`/api/dev-sync/exports${suffix}`, origin), {
    method, headers: { Authorization: `Bearer ${token}` }, redirect: 'error',
    signal: cleaning ? AbortSignal.timeout(timeout) : AbortSignal.any([shutdown.signal, AbortSignal.timeout(timeout)]),
  });
  try {
    console.log('[Dev sync] Requesting a fresh production snapshot...');
    /** @type {number} */
    const deadline = Date.now() + PHASE_TIMEOUT_MS;
    /** @type {ExportMetadata|null} */
    let job = null;
    while (Date.now() < deadline) {
      /** @type {Response} */
      const response = await request('', 'POST', Math.min(30000, deadline - Date.now()));
      if (response.status === 409 || response.status === 429) {
        await response.body?.cancel();
        console.log('[Dev sync] Production backup service is busy; waiting...');
        await delay(Math.min(30000, Math.max(1, deadline - Date.now())), undefined, { signal: shutdown.signal });
        continue;
      }
      if (response.status !== 202) {
        await response.body?.cancel();
        throw new Error(`Production export request failed (HTTP ${response.status})`);
      }
      job = parseMetadata(await response.json());
      jobId = job.id;
      break;
    }
    while (job?.status === 'preparing' && Date.now() < deadline) {
      await delay(Math.min(2000, Math.max(1, deadline - Date.now())), undefined, { signal: shutdown.signal });
      if (Date.now() >= deadline) break;
      /** @type {Response} */
      const response = await request(`/${jobId}`, 'GET', Math.min(30000, deadline - Date.now()));
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Production export status failed (HTTP ${response.status})`);
      }
      job = parseMetadata(await response.json());
      if (job.id !== jobId) throw new Error('Production export identity changed');
    }
    if (job?.status !== 'ready') throw new Error(job?.status === 'failed' ? 'Production snapshot preparation failed' : 'Production snapshot preparation timed out');
    if (Date.parse(job.expiresAt) <= Date.now()) throw new Error('Production snapshot has expired');
    console.log(`[Dev sync] Downloading snapshot created ${job.createdAt} (${job.size} bytes)...`);
    await fs.promises.mkdir(directory, { mode: 0o700 });
    /** @type {Response} */
    const download = await request(`/${jobId}/download`, 'GET', PHASE_TIMEOUT_MS);
    if (!download.ok || !download.body) {
      await download.body?.cancel();
      throw new Error(`Production download failed (HTTP ${download.status})`);
    }
    /** @type {number} */
    let received = 0;
    /** @type {import('node:crypto').Hash} */
    const hash = createHash('sha256');
    /** @type {Transform} */
    const verifier = new Transform({
      /** @param {Buffer} chunk @param {BufferEncoding} encoding @param {import('node:stream').TransformCallback} callback @returns {void} */
      transform(chunk, encoding, callback) {
        received += chunk.length;
        if (received > Number(job.size)) return callback(new Error('Downloaded archive exceeds the declared size'));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(/** @type {import('node:stream/web').ReadableStream} */ (download.body)),
      verifier, fs.createWriteStream(`${archive}.partial`, { flags: 'wx', mode: 0o600 }), { signal: shutdown.signal });
    if (received !== job.size || hash.digest('hex') !== job.sha256) throw new Error('Downloaded archive failed size/checksum verification');
    await fs.promises.rename(`${archive}.partial`, archive);
    await assertServersStopped();
    console.log('[Dev sync] Restoring and validating the snapshot in a staging database...');
    await docker(['cp', archive, `${CONTAINER}:${containerArchive}`], 60000);
    await docker(['exec', CONTAINER, 'chmod', '600', containerArchive]);
    await replacement.restoreArchiveFile(containerArchive);
    console.log(`[Dev sync] Database refreshed successfully from ${job.createdAt}.`);
    if (replacement.state.message) console.warn(`[Dev sync] ${replacement.state.message}`);
  } finally {
    if (jobId) {
      try {
        /** @type {Response} */
        const response = await request(`/${jobId}`, 'DELETE', 10000, true);
        await response.body?.cancel();
        if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error('Cleanup deferred');
      } catch { console.warn('[Dev sync] Production export cleanup deferred to its one-hour expiry.'); }
    }
    // Cleanup must still work after Ctrl+C; it only targets this run's validated filename.
    await execFileAsync('docker', ['exec', CONTAINER, 'rm', '-f', '--', containerArchive],
      { windowsHide: true, timeout: 10000, encoding: 'utf8' }).catch(() => console.warn('[Dev sync] Container download cleanup deferred.'));
    await removeDownloadDirectory(directory).catch(() => console.warn('[Dev sync] Local download cleanup deferred.'));
  }
}

/** @returns {Promise<number>} */
async function runApplication() {
  shutdown.signal.throwIfAborted();
  await assertServersStopped();
  console.log('\nFrontend: http://localhost:3000\nAPI: http://localhost:5000\nDatabase: localhost:5434\n');
  return new Promise((resolve, reject) => {
    application = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'concurrently', 'dist', 'bin', 'concurrently.js'),
      '--kill-others-on-fail', '--names', 'API,VITE', '--prefix-colors', 'blue,magenta', 'npm run server', 'npm start'],
    { cwd: ROOT, stdio: 'inherit', windowsHide: true, env: { ...process.env, NODE_ENV: 'development' } });
    application.once('error', reject);
    application.once('exit', (code) => { application = null; resolve(code ?? 1); });
  });
}

// During replacement, let the shared engine finish/recover before exiting. Never
// start the application after an interrupted refresh. Concurrently handles Ctrl+C
// for its process tree once the application has started.
process.on('SIGINT', () => { shutdown.abort(); });
process.on('SIGTERM', () => { shutdown.abort(); application?.kill('SIGTERM'); });

/** @returns {Promise<void>} */
async function main() {
  process.chdir(ROOT);
  /** @type {() => Promise<void>} */
  const release = await acquireLauncherLock();
  try {
    await assertServersStopped();
    await startAndVerifyDatabase();
    /** @type {{pool: {maintenanceMode: boolean}}} */
    const maintenance = { pool: { maintenanceMode: false } };
    /** @type {import('../src/utils/dev-database-replacement.js').DevelopmentDatabaseReplacement} */
    const replacement = createDevelopmentDatabaseReplacement(maintenance, { beforePromote: assertServersStopped });
    await replacement.ensureDatabaseReplacementRecovered();
    await cleanupOldDownloads().catch(() => console.warn('[Dev sync] Stale download cleanup could not complete; it will be retried next launch.'));
    try {
      await refresh(replacement);
    } catch (error) {
      shutdown.signal.throwIfAborted();
      if (maintenance.pool.maintenanceMode) throw new Error('Database recovery is required. Application startup has been stopped.');
      await replacement.ensureDatabaseReplacementRecovered();
      await replacement.validateRestoredDatabase(DB_NAME);
      console.warn(`\n[Dev sync] WARNING: refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.warn('[Dev sync] Continuing with the existing development database; it was NOT refreshed.\n');
    }
    process.exitCode = await runApplication();
  } finally { await release(); }
}

await main().catch((error) => {
  console.error(`[Dev sync] Startup stopped: ${shutdown.signal.aborted ? 'Interrupted' : error instanceof Error ? error.message : 'Unknown error'}`);
  process.exitCode = 1;
});
