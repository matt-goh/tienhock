import fs from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

/** @param {string} source @param {string} key @param {string} value @returns {string} */
function setEnvValue(source, key, value) {
  /** @type {string} */
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  /** @type {RegExp} */
  const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=`);
  /** @type {boolean} */
  let found = false;
  /** @type {string[]} */
  const lines = source.split(/\r?\n/).flatMap((line) => {
    if (!pattern.test(line)) return [line];
    if (found) return [];
    found = true;
    return [`${key}=${value}`];
  });
  if (!found) {
    if (lines.at(-1) === '') lines.pop();
    lines.push(`${key}=${value}`, '');
  }
  return lines.join(newline);
}

/** @returns {void} */
function main() {
  /** @type {string[]} */
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--rotate')) {
    throw new Error('Usage: node dev/setup-dev-sync-token.mjs [--rotate]');
  }
  /** @type {boolean} */
  const rotate = args[0] === '--rotate';
  /** @type {string} */
  const envPath = fileURLToPath(new URL('../.env', import.meta.url));
  if (!fs.existsSync(envPath)) throw new Error('Create your local .env from .env.example first.');
  /** @type {string} */
  const existing = fs.readFileSync(envPath, 'utf8');
  /** @type {Record<string, string>} */
  const settings = parse(existing);
  /** @type {string} */
  const existingToken = settings.DEV_DB_SYNC_TOKEN || '';
  if (existingToken && !/^[a-f0-9]{64}$/i.test(existingToken) && !rotate) {
    throw new Error('The existing sync token is invalid. Run again with --rotate to replace it.');
  }
  /** @type {string} */
  const token = existingToken && !rotate ? existingToken : randomBytes(32).toString('hex');
  /** @type {string} */
  let updated = setEnvValue(existing, 'DEV_DB_SYNC_TOKEN', token);
  if (!settings.DEV_DB_SYNC_URL) {
    updated = setEnvValue(updated, 'DEV_DB_SYNC_URL', 'https://api.tienhock.com');
  }
  if (updated !== existing) fs.writeFileSync(envPath, updated, { mode: 0o600 });
  console.log(existingToken && !rotate
    ? 'Reusing the existing local sync credential.'
    : 'Saved a new local sync credential in .env.');
  console.log('Set this GitHub Actions secret, then deploy:');
  console.log(`DEV_DB_SYNC_TOKEN_SHA256=${createHash('sha256').update(token).digest('hex')}`);
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : 'Credential setup failed.');
  process.exitCode = 1;
}
