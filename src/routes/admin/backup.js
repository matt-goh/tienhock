// src/routes/admin/backup.js
import express from 'express';
import { spawn } from 'child_process';
import os from 'node:os';
import path from 'node:path';
import { requireSecurityAdmin, logSecurityAction } from '../../middleware/security.js';
import { backupCommand, backupFilePath, validBackupFilename, assertBackupFile, listLocalBackupFiles, createLocalBackup, isBackupOperationActive, tryAcquireBackupOperation } from '../../utils/backup-files.js';
import fs from 'fs';
import { DB_NAME, DB_USER, DB_HOST, DB_PORT, NODE_ENV } from '../../configs/config.js';
import { uploadBackupToS3, listS3Backups, deleteS3Backup, downloadS3Backup } from '../../utils/s3-backup.js';
import { isS3BackupEnabled } from '../../configs/config.js';
import { createDevelopmentDatabaseReplacement, STALE_UPLOAD_CLEANUP_DELAY_MS } from '../../utils/dev-database-replacement.js';

const router = express.Router();

export default function backupRouter(pool) {
  const env = NODE_ENV || 'development';
  const isSqlReplacementEnabled = NODE_ENV === 'development'
    && (process.platform === 'win32' || process.platform === 'darwin');
  const backupDir = '/var/backups/postgres';
  let creatingBackup = false;
  /** @type {import('../../utils/dev-database-replacement.js').DevelopmentDatabaseReplacement} */
  const replacement = createDevelopmentDatabaseReplacement(pool);
  const {
    runProcess, runPostgresTool, writeUploadedSqlFile, removeUploadedSqlFile,
    validateSqlReplacement, restoreSqlFile, recoverInterruptedDatabaseReplacement,
    ensureDatabaseReplacementRecovered,
  } = replacement;
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if ((req.method === 'GET' && req.path === '/restore/status')
      || (isSqlReplacementEnabled && req.method === 'POST' && req.path === '/upload-sql')) return next();
    return requireSecurityAdmin(req, res, next);
  });

  // Docker container names based on environment (use db container which has pg tools)
  const getContainerName = () => {
    if (env === 'development') return 'tienhock_dev_db';
    if (env === 'production') return 'tienhock_prod_db';
    return 'tienhock_dev_db';
  };

  // Check if we should use docker exec (only for Windows/Mac development)
  const shouldUseDockerExec = () => {
    // On Windows/Mac, we use docker exec to run commands in the DB container
    // On production Linux (Hetzner), we run commands directly (no Docker)
    return (process.platform === 'win32' || process.platform === 'darwin');
  };

  const listLocalBackups = () => listLocalBackupFiles(env);

  /** @param {string} filename @returns {Promise<string>} */
  const ensureLocalBackup = async (filename) => {
    const filePath = backupFilePath(env, filename);
    await backupCommand('test', ['!', '-L', filePath]);
    try { await assertBackupFile(env, filename); return filePath; } catch { /* Fetch a missing dump below. */ }
    if (!shouldUseDockerExec()) {
      const downloaded = await downloadS3Backup(filename, env, `${backupDir}/${env}`);
      if (!downloaded) throw new Error('Backup file not found');
      return downloaded;
    }
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-backup-'));
    try {
      const downloaded = await downloadS3Backup(filename, env, temporaryDirectory);
      if (!downloaded) throw new Error('Backup file not found');
      await backupCommand('mkdir', ['-p', '-m', '700', `${backupDir}/${env}`]);
      await runProcess('docker', ['cp', downloaded, `${getContainerName()}:${filePath}`]);
      await backupCommand('chmod', ['600', filePath]);
      return filePath;
    } finally {
      // Only the validated filename and freshly created, empty temporary directory.
      fs.rmSync(path.join(temporaryDirectory, filename), { force: true });
      fs.rmdirSync(temporaryDirectory);
    }
  };

  /**
   * @param {string} backupPath
   * @returns {Promise<boolean>}
   */
  async function restoreDatabase(backupPath) {
    const dbHost = shouldUseDockerExec() ? 'localhost' : DB_HOST;
    const dbPort = shouldUseDockerExec() ? '5432' : DB_PORT;

    try {
      replacement.state = {
        status: 'RESTORING',
        phase: 'INITIALIZATION',
        startTime: Date.now()
      };

      // Set maintenance mode
      pool.pool.maintenanceMode = true;

      replacement.state.phase = 'DATABASE_RESTORE';
      if (env === 'production') {
        // The root-owned helper restores as a separate, non-superuser owner.
        // It clears sessions and reapplies runtime grants in the same transaction.
        await backupCommand('sudo', ['-n', '/usr/local/sbin/restore-tienhock-backup', path.basename(backupPath)]);
      } else {
        await runPostgresTool('pg_restore', ['-h', dbHost, '-p', String(dbPort), '-U', DB_USER, '-d', DB_NAME,
          '--clean', '--if-exists', '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', backupPath]);
        // Never revive browser sessions embedded in an old database dump.
        await pool.query('DELETE FROM active_sessions');
      }

      // Complete restore
      pool.pool.maintenanceMode = false;
      replacement.state = {
        status: 'COMPLETED',
        phase: 'COMPLETED',
        startTime: null
      };

      return true;
    } catch (error) {
      console.error('Error in restoreDatabase:', error);
      replacement.state = {
        status: 'FAILED',
        phase: 'FAILED',
        startTime: null
      };

      // Ensure maintenance mode is disabled on failure
      pool.pool.maintenanceMode = false;

      throw error;
    }
  }

  router.post('/create', async (req, res) => {
    if (pool.pool.maintenanceMode || creatingBackup || isBackupOperationActive()) return res.status(409).json({ message: 'A backup operation is already in progress' });
    const name = req.body?.name;
    if (name !== undefined && name !== '' && (typeof name !== 'string' || name.length > 80)) return res.status(400).json({ message: 'Invalid backup name' });
    creatingBackup = true;
    try {
      const backup = await createLocalBackup(env, name ? name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'backup');
      if (isS3BackupEnabled()) await uploadBackupToS3(backup.filePath, backup.filename, env);
      else if (env === 'production') throw new Error('Off-server backup storage is not configured');
      logSecurityAction(req, 'backup_created', backup.filename);
      res.json({ message: 'Backup created successfully' });
    } catch (error) {
      console.error('Backup failed:', error);
      res.status(500).json({ message: 'Backup failed. Any completed local copy has been retained; check server logs.' });
    } finally { creatingBackup = false; }
  });

  router.post('/delete', async (req, res) => {
    const filename = req.body?.filename;
    if (!validBackupFilename(filename)) return res.status(400).json({ message: 'Invalid backup filename' });
    if (pool.pool.maintenanceMode || creatingBackup || isBackupOperationActive()) return res.status(409).json({ message: 'A backup operation is already in progress' });
    creatingBackup = true;
    try {
      const backups = isS3BackupEnabled() ? await listS3Backups(env) : await listLocalBackups();
      if (!backups.some((backup) => backup.filename !== filename)) return res.status(409).json({ message: 'The only available backup cannot be deleted' });
      await deleteS3Backup(filename, env);
      await backupCommand('rm', ['-f', '--', backupFilePath(env, filename)]);
      logSecurityAction(req, 'backup_deleted', filename);
      res.json({ message: 'Backup deleted successfully' });
    } catch (error) {
      console.error('Backup deletion failed:', error);
      res.status(500).json({ message: 'Backup deletion failed' });
    } finally { creatingBackup = false; }
  });

  router.get('/list', async (req, res) => {
    if (env === 'production' && !isS3BackupEnabled()) return res.status(503).json({ message: 'Off-server backup storage is not configured' });
    try {
      let rawBackups;

      if (isS3BackupEnabled()) {
        rawBackups = await listS3Backups(env);
      } else {
        // Dev: no S3 configured — list backups stored locally in the Docker container
        rawBackups = await listLocalBackups();
      }

      const backups = rawBackups.map(backup => ({
        filename: backup.filename,
        size: backup.size,
        created: backup.lastModified.toISOString(),
        environment: env
      }));

      backups.sort((a, b) => new Date(b.created) - new Date(a.created));

      res.json(backups);
    } catch (error) {
      console.error('Failed to list backups:', error);
      res.status(500).json({ error: 'Failed to list backups', details: error.message });
    }
  });

  router.get('/restore/status', (req, res) => {
    res.json({
      ...replacement.state,
      isRestoreTriggered: replacement.state.startTime !== null,
      serverTime: Date.now(),
      maintenanceMode: pool.pool.maintenanceMode
    });
  });

  router.get('/download/:filename', async (req, res) => {
    try {
      if (pool.pool.maintenanceMode) {
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Database restore in progress. Please try again in a few moments.'
        });
      }

      const { filename } = req.params;
      if (!filename) {
        return res.status(400).json({ error: 'Filename is required' });
      }

      if (!validBackupFilename(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      const envBackupDir = `${backupDir}/${env}`;
      const filePath = `${envBackupDir}/${filename}`;
      const containerName = getContainerName();

      await ensureLocalBackup(filename);
      logSecurityAction(req, 'backup_download', filename);

      // Convert .gz to .sql filename for download
      const sqlFilename = filename.replace('.gz', '.sql');

      // Set headers for file download
      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${sqlFilename}"`);

      console.log(`Streaming backup as SQL: ${filename}`);

      const pgRestoreArgs = [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--disable-triggers',
        '-f',
        '-',
        filePath
      ];

      const restoreProcess = shouldUseDockerExec()
        ? spawn('docker', [
          'exec',
          containerName,
          'pg_restore',
          ...pgRestoreArgs
        ], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        : spawn('pg_restore', pgRestoreArgs, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

      let processClosed = false;

      restoreProcess.stdout.pipe(res);

      restoreProcess.stderr.on('data', (data) => {
        console.error('pg_restore stderr:', data.toString());
      });

      restoreProcess.on('error', async (error) => {
        console.error('Failed to start pg_restore:', error);

        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed', details: error.message });
        } else {
          res.destroy(error);
        }
      });

      restoreProcess.on('close', async (code, signal) => {
        processClosed = true;
        console.log(`pg_restore process exited with code ${code}${signal ? ` and signal ${signal}` : ''}`);

        if (code !== 0 && !res.writableEnded) {
          const message = signal
            ? `SQL download was interrupted (${signal})`
            : `SQL download failed with exit code ${code}`;

          if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed', details: message });
          } else {
            res.destroy(new Error(message));
          }
        }
      });

      res.on('close', () => {
        if (!res.writableEnded && !processClosed && !restoreProcess.killed) {
          console.warn(`[Download] Client disconnected; stopping SQL stream for ${filename}`);
          restoreProcess.kill('SIGTERM');
        }
      });

    } catch (error) {
      console.error('Download failed:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed', details: error.message });
      }
    }
  });

  router.post('/restore', async (req, res) => {
    const filename = req.body?.filename;
    if (!validBackupFilename(filename)) {
      return res.status(400).json({ message: 'Invalid backup filename' });
    }

    if (replacement.state.status === 'RESTORING' || creatingBackup || isBackupOperationActive()) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'A restore operation is already in progress'
      });
    }

    if (env === 'production') {
      try {
        await backupCommand('sudo', ['-n', '/usr/local/sbin/restore-tienhock-backup', '--check']);
      } catch {
        return res.status(503).json({ message: 'The server restore helper is not ready. Please contact the server administrator.' });
      }
      // Recheck after the asynchronous preflight so concurrent requests cannot overlap.
      if (replacement.state.status === 'RESTORING' || creatingBackup || isBackupOperationActive()) {
        return res.status(409).json({ message: 'A backup operation is already in progress' });
      }
    }

    /** @type {(() => void)|null} */
    const release = tryAcquireBackupOperation();
    if (!release) return res.status(409).json({ message: 'A backup operation is already in progress' });

    replacement.state = {
      status: 'RESTORING',
      phase: 'INITIALIZATION',
      startTime: Date.now(),
      message: null,
    };
    pool.pool.maintenanceMode = true;

    try {
      logSecurityAction(req, 'backup_restore_started', filename);
      res.json({
        message: 'Restore initiated',
        status: 'RESTORING'
      });

      const backupPath = await ensureLocalBackup(filename);
      await restoreDatabase(backupPath);
      logSecurityAction(req, 'backup_restored', filename);
      // Retain the source dump for recovery and subsequent downloads.

    } catch (error) {
      console.error('Restore failed:', error);
      pool.pool.maintenanceMode = false;
      if (replacement.state.status !== 'FAILED') {
        replacement.state = {
          status: 'FAILED',
          phase: 'FAILED',
          startTime: null,
          message: 'Database restore failed before it could complete.',
        };
      }
    } finally { release(); }
  });

  router.post('/upload-sql', async (req, res) => {
    if (!isSqlReplacementEnabled) {
      return res.status(403).json({
        error: 'Development-only operation',
        message: 'Replacing a database from an uploaded SQL file is only available in development.',
      });
    }

    if (req.apiKey) {
      return res.status(403).json({
        error: 'Interactive session required',
        message: 'Database replacement cannot be started with API-key authentication.',
      });
    }

    try {
      await ensureDatabaseReplacementRecovered();
    } catch (error) {
      console.error('[Upload SQL] Cannot start replacement because recovery failed:', error);
      return res.status(503).json({
        error: 'Database recovery required',
        message: 'A previous database replacement could not be recovered automatically.',
      });
    }

    if (replacement.state.status === 'RESTORING') {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'A restore operation is already in progress'
      });
    }

    const { sqlContent } = req.body;
    if (typeof sqlContent !== 'string' || sqlContent.trim().length === 0) {
      return res.status(400).json({ error: 'SQL content is required' });
    }

    let replacementSqlContent;
    try {
      replacementSqlContent = validateSqlReplacement(sqlContent);
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid SQL backup',
        message: error.message,
      });
    }

    const tempFilename = `temp_upload_${Date.now()}.sql`;
    const envBackupDir = `${backupDir}/${env}`;
    const tempPath = `${envBackupDir}/${tempFilename}`;
    replacement.state = {
      status: 'RESTORING',
      phase: 'INITIALIZATION',
      startTime: Date.now(),
      message: null,
    };
    pool.pool.maintenanceMode = true;

    try {
      res.status(202).json({
        message: 'Database replacement initiated',
        status: 'RESTORING',
      });
      await writeUploadedSqlFile(tempPath, replacementSqlContent);
      await restoreSqlFile(tempPath);
    } catch (error) {
      console.error('SQL database replacement failed:', error);
      if (replacement.state.status !== 'FAILED') {
        pool.pool.maintenanceMode = false;
        replacement.state = {
          status: 'FAILED',
          phase: 'FAILED',
          startTime: null,
          message: 'Database replacement failed before the existing database was changed.',
        };
      }
    } finally {
      try {
        await removeUploadedSqlFile(tempPath);
        console.log(`[Upload SQL] Cleaned up temp file: ${tempFilename}`);
      } catch (error) {
        console.warn(`[Upload SQL] Failed to clean up ${tempFilename}:`, error);
      }
    }
  });

  if (isSqlReplacementEnabled) {
    void ensureDatabaseReplacementRecovered()
      .catch((error) => {
        console.error('[Upload SQL] Startup replacement recovery check failed:', error);
        if (pool.pool.maintenanceMode) {
          replacement.state = {
            status: 'FAILED',
            phase: 'RECOVERY_FAILED',
            startTime: null,
            message: 'Database replacement recovery could not verify the development database. Maintenance mode remains active.',
          };
        }
      });

    const staleUploadCleanupTimer = setTimeout(() => {
      void recoverInterruptedDatabaseReplacement().catch((error) => {
        console.warn('[Upload SQL] Deferred stale-upload cleanup failed:', error);
      });
    }, STALE_UPLOAD_CLEANUP_DELAY_MS);
    staleUploadCleanupTimer.unref?.();
  }

  return router;
}
