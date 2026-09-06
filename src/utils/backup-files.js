import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { DB_NAME, DB_USER, DB_HOST, DB_PASSWORD, DB_PORT, NODE_ENV } from '../configs/config.js';

const execFileAsync = promisify(execFile);
export const backupsUseDocker = process.platform === 'win32' || process.platform === 'darwin';
export const backupContainer = NODE_ENV === 'production' ? 'tienhock_prod_db' : 'tienhock_dev_db';

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
 * @returns {Promise<{stdout: string|Buffer, stderr: string|Buffer}>}
 */
export async function backupCommand(command, args, binary = false) {
  try { return await execFileAsync(backupsUseDocker ? 'docker' : command,
    backupsUseDocker ? ['exec', '--env', 'PGPASSWORD', backupContainer, command, ...args] : args,
    { env: { ...process.env, PGPASSWORD: DB_PASSWORD }, encoding: binary ? 'buffer' : 'utf8',
      windowsHide: true, timeout: 15 * 60 * 1000, maxBuffer: binary ? 50 * 1024 * 1024 : 2 * 1024 * 1024 });
  } catch (error) {
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

/** @param {string} env @param {string} [name] @returns {Promise<{filename: string, filePath: string}>} */
export async function createLocalBackup(env, name = 'backup') {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(name)) throw new Error('Invalid backup name');
  const filename = `${name}_${Date.now()}_${randomBytes(4).toString('hex')}.gz`;
  const filePath = backupFilePath(env, filename);
  // Incomplete dumps have a different extension and cannot be listed or synced.
  const partialPath = `${filePath}.partial`;
  await backupCommand('mkdir', ['-p', '-m', '700', backupDirectory(env)]);
  await backupCommand('chmod', ['700', backupDirectory(env)]);
  try {
    await backupCommand('pg_dump', ['-h', backupsUseDocker ? 'localhost' : DB_HOST, '-p', String(backupsUseDocker ? 5432 : DB_PORT),
      '-U', DB_USER, '-d', DB_NAME, '-F', 'c', '-b', '--exclude-table-data=public.active_sessions', '-f', partialPath]);
    await backupCommand('chmod', ['600', partialPath]);
    await backupCommand('pg_restore', ['--list', partialPath]);
    await backupCommand('mv', ['--', partialPath, filePath]);
    return { filename, filePath };
  } catch (error) {
    await backupCommand('rm', ['-f', '--', partialPath]).catch(() => {});
    throw error;
  }
}
