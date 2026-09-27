import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { NODE_ENV } from '../../configs/config.js';
import { createDatabaseArchive, tryAcquireBackupOperation } from '../../utils/backup-files.js';

/** @type {string} */
const EXPORT_ROOT = '/var/backups/postgres/dev-sync';
/** @type {number} */
const EXPORT_TTL_MS = 60 * 60 * 1000;
/** @type {number} */
const PREPARATION_TIMEOUT_MS = 15 * 60 * 1000;
/** @type {RegExp} */
const EXPORT_ID = /^\d{13}_[a-f0-9]{32}$/;

/**
 * @typedef {{id: string, status: 'preparing'|'ready'|'failed', createdAt: string,
 * expiresAt: string, size: number|null, sha256: string|null,
 * controller: AbortController, task: Promise<void>, downloads: number, deleting: boolean}} ExportJob
 */

/** @param {string} id @returns {string} */
function exportDirectory(id) {
  if (!EXPORT_ID.test(id)) throw new Error('Invalid export ID');
  /** @type {string} */
  const directory = path.resolve(EXPORT_ROOT, id);
  if (path.dirname(directory) !== EXPORT_ROOT) throw new Error('Invalid export directory');
  return directory;
}

/** Delete only generated job directories inside our dedicated root.
 * @param {string} id @returns {Promise<void>}
 */
async function removeExport(id) {
  /** @type {string} */
  const directory = exportDirectory(id);
  /** @type {import('node:fs').Stats|null} */
  const stat = await fs.promises.lstat(directory).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unexpected export directory');
  await fs.promises.rm(directory, { recursive: true, force: true });
}

/** @param {ExportJob} job @returns {Omit<ExportJob, 'controller'|'task'|'downloads'|'deleting'>} */
function metadata(job) {
  return { id: job.id, status: job.status, createdAt: job.createdAt,
    expiresAt: job.expiresAt, size: job.size, sha256: job.sha256 };
}

/** @param {string} action @param {string} id @returns {void} */
function audit(action, id) {
  console.info(JSON.stringify({ event: 'security', actor: 'dev-sync', action, target: id,
    time: new Date().toISOString() }));
}

/** Dedicated export-only authentication; never delegates to office/mobile authentication.
 * @param {{pool: {maintenanceMode?: boolean}}} pool
 * @returns {import('express').Router}
 */
export default function devSyncRouter(pool) {
  /** @type {import('express').Router} */
  const router = express.Router();
  /** @type {string} */
  const digest = process.env.DEV_DB_SYNC_TOKEN_SHA256 || '';
  /** @type {boolean} */
  const enabled = NODE_ENV === 'production' && process.platform === 'linux'
    && /^[a-f0-9]{64}$/i.test(digest);
  /** @type {Map<string, ExportJob>} */
  const jobs = new Map();
  /** @type {boolean} */
  let sweeping = false;
  /** @type {number} */
  let nextCreationAt = 0;

  /** @returns {Promise<void>} */
  async function cleanup() {
    if (sweeping) return;
    sweeping = true;
    try {
      await fs.promises.mkdir(EXPORT_ROOT, { recursive: true, mode: 0o700 });
      /** @type {import('node:fs').Stats} */
      const rootStat = await fs.promises.lstat(EXPORT_ROOT);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Invalid export root');
      await fs.promises.chmod(EXPORT_ROOT, 0o700);
      for (const entry of await fs.promises.readdir(EXPORT_ROOT, { withFileTypes: true })) {
        if (!EXPORT_ID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
        /** @type {ExportJob|undefined} */
        const job = jobs.get(entry.name);
        if (job && (job.status === 'preparing' || job.downloads > 0 || job.deleting)) continue;
        /** @type {number} */
        const createdAt = Number(entry.name.split('_')[0]);
        if (Date.now() - createdAt < EXPORT_TTL_MS) continue;
        if (job) job.deleting = true;
        try {
          await removeExport(entry.name);
          jobs.delete(entry.name);
        } finally { if (job) job.deleting = false; }
      }
      // Failed jobs can already have had their directories removed.
      for (const [id, job] of jobs) {
        if (Date.parse(job.expiresAt) <= Date.now() && job.status !== 'preparing' && !job.downloads && !job.deleting) {
          jobs.delete(id);
        }
      }
    } finally { sweeping = false; }
  }

  /** @type {Promise<boolean>} */
  const ready = enabled ? cleanup().then(() => true).catch(() => {
    console.error('[Dev sync] Export storage could not be initialized');
    return false;
  }) : Promise.resolve(false);
  if (enabled) {
    /** @type {NodeJS.Timeout} */
    const timer = setInterval(() => {
      void cleanup().catch(() => console.error('[Dev sync] Temporary export cleanup failed'));
    }, 60 * 1000);
    timer.unref();
  }

  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!enabled) return res.sendStatus(404);
    /** @type {number} */
    let headerCount = 0;
    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      if (req.rawHeaders[index].toLowerCase() === 'authorization') headerCount += 1;
    }
    /** @type {RegExpMatchArray|null} */
    const match = (req.get('authorization') || '').match(/^Bearer ([a-f0-9]{64})$/i);
    if (headerCount !== 1 || !match
      || !timingSafeEqual(createHash('sha256').update(match[1]).digest(), Buffer.from(digest, 'hex'))) {
      return res.sendStatus(401);
    }
    if (!await ready) return res.status(503).json({ message: 'Export storage is unavailable' });
    return next();
  });

  /** @param {ExportJob} job @param {() => void} release @returns {Promise<void>} */
  async function prepare(job, release) {
    /** @type {NodeJS.Timeout} */
    const timeout = setTimeout(() => job.controller.abort(), PREPARATION_TIMEOUT_MS);
    /** @type {string} */
    const filePath = path.join(exportDirectory(job.id), 'snapshot.dump');
    try {
      await fs.promises.mkdir(exportDirectory(job.id), { mode: 0o700 });
      await createDatabaseArchive(filePath, job.controller.signal);
      /** @type {import('node:crypto').Hash} */
      const hash = createHash('sha256');
      await pipeline(fs.createReadStream(filePath), hash, { signal: job.controller.signal });
      job.size = (await fs.promises.stat(filePath)).size;
      job.sha256 = hash.digest('hex');
      job.controller.signal.throwIfAborted();
      job.status = 'ready';
      audit('dev_export_ready', job.id);
    } catch {
      job.status = 'failed';
      await removeExport(job.id).catch(() => console.error('[Dev sync] Failed export cleanup deferred'));
      audit('dev_export_failed', job.id);
    } finally {
      clearTimeout(timeout);
      release();
    }
  }

  router.post('/exports', (req, res) => {
    if (pool.pool.maintenanceMode) return res.status(409).json({ message: 'Database restore is in progress' });
    if (Date.now() < nextCreationAt || jobs.size >= 3) {
      res.set('Retry-After', '30');
      return res.status(429).json({ message: 'Please wait before requesting another export' });
    }
    /** @type {(() => void)|null} */
    const release = tryAcquireBackupOperation();
    if (!release) return res.status(409).json({ message: 'A backup or restore operation is in progress' });
    /** @type {number} */
    const now = Date.now();
    /** @type {ExportJob} */
    const job = { id: `${now}_${randomBytes(16).toString('hex')}`, status: 'preparing',
      createdAt: new Date(now).toISOString(), expiresAt: new Date(now + EXPORT_TTL_MS).toISOString(),
      size: null, sha256: null, controller: new AbortController(), task: Promise.resolve(), downloads: 0, deleting: false };
    jobs.set(job.id, job);
    nextCreationAt = now + 30000;
    job.task = prepare(job, release);
    audit('dev_export_started', job.id);
    return res.status(202).json(metadata(job));
  });

  router.param('id', (req, res, next, id) => {
    if (!EXPORT_ID.test(id) || !jobs.has(id)) return res.sendStatus(404);
    if (jobs.get(id)?.deleting) return res.status(409).json({ message: 'Export cleanup is in progress' });
    if (Date.parse(/** @type {ExportJob} */ (jobs.get(id)).expiresAt) <= Date.now()) return res.sendStatus(410);
    return next();
  });

  router.get('/exports/:id', (req, res) => res.json(metadata(/** @type {ExportJob} */ (jobs.get(req.params.id)))));

  router.get('/exports/:id/download', async (req, res) => {
    /** @type {ExportJob} */
    const job = /** @type {ExportJob} */ (jobs.get(req.params.id));
    if (job.status !== 'ready') return res.status(409).json({ message: 'Export is not ready' });
    if (job.downloads > 0) return res.status(409).json({ message: 'Export is already being downloaded' });
    job.downloads += 1;
    try {
      res.set({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(job.size),
        'Content-Disposition': 'attachment; filename="snapshot.dump"', 'X-Content-Type-Options': 'nosniff' });
      await pipeline(fs.createReadStream(path.join(exportDirectory(job.id), 'snapshot.dump')), res,
        { signal: AbortSignal.timeout(PREPARATION_TIMEOUT_MS) });
      audit('dev_export_downloaded', job.id);
    } catch {
      res.destroy();
      audit('dev_export_download_interrupted', job.id);
    } finally { job.downloads -= 1; }
  });

  router.delete('/exports/:id', async (req, res) => {
    /** @type {ExportJob} */
    const job = /** @type {ExportJob} */ (jobs.get(req.params.id));
    if (job.downloads > 0) return res.status(409).json({ message: 'Export is being downloaded' });
    job.deleting = true;
    job.controller.abort();
    await job.task;
    try {
      await removeExport(job.id);
      jobs.delete(job.id);
      audit('dev_export_removed', job.id);
      return res.sendStatus(204);
    } catch {
      return res.status(503).json({ message: 'Export cleanup will be retried automatically' });
    } finally { job.deleting = false; }
  });
  router.use((req, res) => res.sendStatus(404));
  return router;
}
