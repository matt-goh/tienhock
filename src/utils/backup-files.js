import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { DB_NAME, DB_USER, DB_HOST, DB_PASSWORD, DB_PORT, NODE_ENV } from '../configs/config.js';

const execFileAsync = promisify(execFile);
export const backupsUseDocker = process.platform === 'win32' || process.platform === 'darwin';
export const backupContainer = NODE_ENV === 'production' ? 'tienhock_prod_db' : 'tienhock_dev_db';

/** @type {boolean} */
let backupOperationActive = false;

/** Shared by exports, regular dumps and the restore route in the single PM2 process.
 * @returns {boolean}
 */
export const isBackupOperationActive = () => backupOperationActive;

/** @returns {(() => void)|null} */
export function tryAcquireBackupOperation() {
  if (backupOperationActive) return null;
  backupOperationActive = true;
  /** @type {boolean} */
  let released = false;
  return () => {
    if (!released) backupOperationActive = false;
    released = true;
  };
}

/** @param {unknown} filename @returns {boolean} */
export const validBackupFilename = (filename) => typeof filename === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.gz$/.test(filename) && !filename.includes('..');

/** @param {string} env @returns {string} */
export function backupDirectory(env) {
  if (!['development', 'production', 'test'].includes(env)) throw new Error('Invalid backup environment');
  return `/var/backups/postgres/${env}`;
}

/** @param {string} env @param {string} filename @returns {string} */
export function backupFilePath(env, filename) {
  if (!validBackupFilename(filename)) throw new Error('Invalid backup filename');
  return `${backupDirectory(env)}/${filename}`;
}

/** No command string or shell is used; credentials are inherited through the environment.
 * @param {string} command @param {string[]} args @param {boolean} [binary]
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<{stdout: string|Buffer, stderr: string|Buffer}>}
 */
export async function backupCommand(command, args, binary = false, options = {}) {
  /** @type {Promise<{stdout: string|Buffer, stderr: string|Buffer}> & {child: import('node:child_process').ChildProcess}} */
  const execution = execFileAsync(backupsUseDocker ? 'docker' : command,
    backupsUseDocker ? ['exec', '--env', 'PGPASSWORD', backupContainer, command, ...args] : args,
    { env: { ...process.env, PGPASSWORD: DB_PASSWORD }, encoding: binary ? 'buffer' : 'utf8',
      windowsHide: true, timeout: 15 * 60 * 1000, signal: options.signal,
      maxBuffer: binary ? 50 * 1024 * 1024 : 2 * 1024 * 1024 });
  /** @type {Promise<void>} */
  const closed = new Promise((resolve) => execution.child.once('close', () => resolve()));
  try { return await execution; } catch (error) {
    // AbortSignal rejects before close. Keep the operation lock until pg_dump exits.
    /** @type {NodeJS.Timeout} */
    const forceKill = setTimeout(() => execution.child.kill('SIGKILL'), 10000);
    forceKill.unref();
    await closed;
    clearTimeout(forceKill);
    // execFile errors can contain captured dump bytes. Never log or return them.
    throw new Error(`${command} failed (${error.code || error.signal || 'process error'})`);
  }
}

/** @param {string} env @param {string} filename @returns {Promise<void>} */
export async function assertBackupFile(env, filename) {
  const filePath = backupFilePath(env, filename);
  await backupCommand('test', ['-f', filePath]);
  await backupCommand('test', ['!', '-L', filePath]);
}

/** @param {string} env @returns {Promise<{filename: string, size: number, lastModified: Date}[]>} */
export async function listLocalBackupFiles(env) {
  const directory = backupDirectory(env);
  await backupCommand('mkdir', ['-p', '-m', '700', directory]);
  const result = await backupCommand('find', [directory, '-maxdepth', '1', '-type', 'f', '-name', '*.gz', '-printf', '%f\t%s\t%T@\n']);
  return String(result.stdout).trim().split('\n').flatMap((line) => {
    const [filename, size, modified] = line.split('\t');
    return validBackupFilename(filename) && Number.isFinite(Number(size)) && Number.isFinite(Number(modified))
      ? [{ filename, size: Number(size), lastModified: new Date(Number(modified) * 1000) }] : [];
  });
}

/** @param {string} env @param {string} [name]
 * @param {{waitForOperation?: boolean}} [options]
 * @returns {Promise<{filename: string, filePath: string}>}
 */
export async function createLocalBackup(env, name = 'backup', options = {}) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(name)) throw new Error('Invalid backup name');
  const filename = `${name}_${Date.now()}_${randomBytes(4).toString('hex')}.gz`;
  const filePath = backupFilePath(env, filename);
  /** @type {(() => void)|null} */
  let release = tryAcquireBackupOperation();
  // A dev snapshot must not cause the scheduled daily backup to be skipped.
  /** @type {number} */
  const waitDeadline = Date.now() + 16 * 60 * 1000;
  while (!release && options.waitForOperation && Date.now() < waitDeadline) {
    await delay(1000);
    release = tryAcquireBackupOperation();
  }
  if (!release) throw new Error('A backup or restore operation is already in progress');
  try {
    await backupCommand('mkdir', ['-p', '-m', '700', backupDirectory(env)]);
    await backupCommand('chmod', ['700', backupDirectory(env)]);
    await createDatabaseArchive(filePath);
    return { filename, filePath };
  } finally { release(); }
}

/** Creates a full archive at an internally chosen path. Caller owns the operation lock.
 * Never pass a request-supplied path. The parent directory must already be private.
 * @param {string} filePath @param {AbortSignal} [signal] @returns {Promise<void>}
 */
export async function createDatabaseArchive(filePath, signal) {
  // Incomplete dumps have a different extension and cannot be listed or synced.
  /** @type {string} */
  const partialPath = `${filePath}.partial`;
  try {
    await backupCommand('pg_dump', ['-h', backupsUseDocker ? 'localhost' : DB_HOST, '-p', String(backupsUseDocker ? 5432 : DB_PORT),
      '-U', DB_USER, '-d', DB_NAME, '-F', 'c', '-b', '--exclude-table-data=public.active_sessions', '-f', partialPath], false, { signal });
    await backupCommand('chmod', ['600', partialPath], false, { signal });
    await backupCommand('pg_restore', ['--list', partialPath], false, { signal });
    await backupCommand('mv', ['--', partialPath, filePath], false, { signal });
  } catch (error) {
    await backupCommand('rm', ['-f', '--', partialPath]).catch(() => {});
    throw error;
  }
}
