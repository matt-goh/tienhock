// src/routes/admin/backup.js
import express from 'express';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { DB_NAME, DB_USER, DB_HOST, DB_PASSWORD, DB_PORT, NODE_ENV } from '../../configs/config.js';
import { uploadBackupToS3, listS3Backups, deleteS3Backup, downloadS3Backup } from '../../utils/s3-backup.js';
import { isS3BackupEnabled } from '../../configs/config.js';

const execAsync = promisify(exec);
const router = express.Router();

export default function backupRouter(pool) {
  const env = NODE_ENV || 'development';
  const backupDir = '/var/backups/postgres';

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

  // Execute a command - either directly or via docker exec
  const executeCommand = async (command, options = {}) => {
    if (shouldUseDockerExec()) {
      // Running on Windows/Mac dev, use docker exec
      const containerName = getContainerName();
      const dockerCommand = `docker exec ${containerName} bash -c "${command.replace(/"/g, '\\"')}"`;
      return execAsync(dockerCommand, options);
    } else {
      // Running on Linux (production Hetzner or Docker container), execute directly
      return execAsync(command, options);
    }
  };

  // List backup files stored locally inside the Docker container (dev fallback)
  const listLocalBackups = async () => {
    const envBackupDir = `${backupDir}/${env}`;
    try {
      const command = `find "${envBackupDir}" -maxdepth 1 -name "*.gz" -exec stat -c "%n %s %Y" {} \\; 2>/dev/null || echo ""`;
      const { stdout } = await executeCommand(command);
      const lines = stdout.trim().split('\n').filter(l => l.trim());
      return lines.map(line => {
        const parts = line.trim().split(' ');
        if (parts.length < 3) return null;
        const mtime = parseInt(parts[parts.length - 1], 10);
        const size = parseInt(parts[parts.length - 2], 10);
        const fullPath = parts.slice(0, parts.length - 2).join(' ');
        const filename = fullPath.split('/').pop();
        if (!filename || isNaN(size) || isNaN(mtime)) return null;
        return { filename, size, lastModified: new Date(mtime * 1000) };
      }).filter(Boolean);
    } catch {
      return [];
    }
  };

  // Track restore state globally
  let restoreState = {
    status: 'IDLE',
    phase: null,
    startTime: null
  };

  async function restoreDatabase(backupPath) {
    let cachedSessions = [];
    const dbHost = shouldUseDockerExec() ? 'localhost' : DB_HOST;
    const dbPort = shouldUseDockerExec() ? '5432' : DB_PORT;

    try {
      restoreState = {
        status: 'RESTORING',
        phase: 'INITIALIZATION',
        startTime: Date.now()
      };

      // Set maintenance mode
      pool.pool.maintenanceMode = true;

      // Phase 1: Cache active sessions
      try {
        const { rows } = await pool.query(`
          SELECT
            created_at,
            last_active,
            session_id,
            staff_id,
            status
          FROM active_sessions
          WHERE status = 'active'
          AND last_active > NOW() - INTERVAL '7 days'
        `);
        cachedSessions = rows;
      } catch (error) {
        console.warn('Failed to cache sessions:', error);
        // Continue with restore even if session caching fails
      }

      // Phase 2: Database restore
      restoreState.phase = 'DATABASE_RESTORE';

      const restoreCommand = `PGPASSWORD=${DB_PASSWORD} pg_restore -h ${dbHost} -p ${dbPort} -U ${DB_USER} -d ${DB_NAME} --clean --if-exists -v "${backupPath}"`;

      await executeCommand(restoreCommand);

      // Phase 3: Session restoration
      if (cachedSessions.length > 0) {
        restoreState.phase = 'SESSION_RESTORE';
        try {
          // Ensure active_sessions table exists
          await pool.query(`
            CREATE TABLE IF NOT EXISTS active_sessions (
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              session_id VARCHAR(255) PRIMARY KEY,
              staff_id VARCHAR(255),
              status VARCHAR(50) DEFAULT 'active'
            )
          `);

          // Reinsert sessions in batches
          const batchSize = 50;
          for (let i = 0; i < cachedSessions.length; i += batchSize) {
            const batch = cachedSessions.slice(i, i + batchSize);
            const values = batch.map(session => `(
              '${session.created_at.toISOString()}',
              NOW(),
              '${session.session_id}',
              ${session.staff_id ? `'${session.staff_id}'` : 'NULL'},
              'active'
            )`).join(',');

            await pool.query(`
              INSERT INTO active_sessions (
                created_at,
                last_active,
                session_id,
                staff_id,
                status
              )
              VALUES ${values}
              ON CONFLICT (session_id)
              DO UPDATE SET
                last_active = EXCLUDED.last_active,
                status = EXCLUDED.status
            `);
          }
        } catch (error) {
          console.error('Failed to restore sessions:', error);
          // Continue even if session restore fails
        }
      }

      // Complete restore
      pool.pool.maintenanceMode = false;
      restoreState = {
        status: 'COMPLETED',
        phase: 'COMPLETED',
        startTime: null
      };

      return true;
    } catch (error) {
      console.error('Error in restoreDatabase:', error);
      restoreState = {
        status: 'FAILED',
        phase: 'FAILED',
        startTime: null
      };

      // Ensure maintenance mode is disabled on failure
      pool.pool.maintenanceMode = false;

      throw error;
    }
  }

  async function restoreSqlFile(sqlPath) {
    let cachedSessions = [];
    const dbHost = shouldUseDockerExec() ? 'localhost' : DB_HOST;
    const dbPort = shouldUseDockerExec() ? '5432' : DB_PORT;

    try {
      restoreState = {
        status: 'RESTORING',
        phase: 'INITIALIZATION',
        startTime: Date.now()
      };

      // Set maintenance mode
      pool.pool.maintenanceMode = true;

      // Phase 1: Cache active sessions
      try {
        const { rows } = await pool.query(`
          SELECT
            created_at,
            last_active,
            session_id,
            staff_id,
            status
          FROM active_sessions
          WHERE status = 'active'
          AND last_active > NOW() - INTERVAL '7 days'
        `);
        cachedSessions = rows;
      } catch (error) {
        console.warn('Failed to cache sessions:', error);
      }

      // Phase 2: Execute SQL file
      restoreState.phase = 'DATABASE_RESTORE';

      const psqlCommand = `PGPASSWORD=${DB_PASSWORD} psql -h ${dbHost} -p ${dbPort} -U ${DB_USER} -d ${DB_NAME} -f "${sqlPath}"`;

      await executeCommand(psqlCommand, { maxBuffer: 100 * 1024 * 1024 });

      // Phase 3: Session restoration
      if (cachedSessions.length > 0) {
        restoreState.phase = 'SESSION_RESTORE';
        try {
          // Ensure active_sessions table exists
          await pool.query(`
            CREATE TABLE IF NOT EXISTS active_sessions (
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              session_id VARCHAR(255) PRIMARY KEY,
              staff_id VARCHAR(255),
              status VARCHAR(50) DEFAULT 'active'
            )
          `);

          // Reinsert sessions in batches
          const batchSize = 50;
          for (let i = 0; i < cachedSessions.length; i += batchSize) {
            const batch = cachedSessions.slice(i, i + batchSize);
            const values = batch.map(session => `(
              '${session.created_at.toISOString()}',
              NOW(),
              '${session.session_id}',
              ${session.staff_id ? `'${session.staff_id}'` : 'NULL'},
              'active'
            )`).join(',');

            await pool.query(`
              INSERT INTO active_sessions (
                created_at,
                last_active,
                session_id,
                staff_id,
                status
              )
              VALUES ${values}
              ON CONFLICT (session_id)
              DO UPDATE SET
                last_active = EXCLUDED.last_active,
                status = EXCLUDED.status
            `);
          }
        } catch (error) {
          console.error('Failed to restore sessions:', error);
        }
      }

      // Complete restore
      pool.pool.maintenanceMode = false;
      restoreState = {
        status: 'COMPLETED',
        phase: 'COMPLETED',
        startTime: null
      };

      return true;
    } catch (error) {
      console.error('Error in restoreSqlFile:', error);
      restoreState = {
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
    try {
      if (pool.pool.maintenanceMode) {
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Database restore in progress. Please try again in a few moments.'
        });
      }

      const { name } = req.body;
      let customName = '';

      if (name) {
        // Sanitize the custom name by removing special characters and spaces
        customName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      }

      const dbHost = shouldUseDockerExec() ? 'localhost' : DB_HOST;
      const dbPort = shouldUseDockerExec() ? '5432' : DB_PORT;
      const envBackupDir = `${backupDir}/${env}`;

      // Generate timestamp
      const now = new Date();
      const timestamp = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + '_' +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');

      // Create backup filename
      const backupFilename = customName
        ? `${customName}_${timestamp}.gz`
        : `backup_${DB_NAME}_${timestamp}.gz`;

      const backupPath = `${envBackupDir}/${backupFilename}`;

      // Ensure backup directory exists and run pg_dump
      const command = `mkdir -p "${envBackupDir}" && PGPASSWORD=${DB_PASSWORD} pg_dump -h ${dbHost} -p ${dbPort} -U ${DB_USER} -d ${DB_NAME} -F c -b -v -f "${backupPath}" && echo "[${env}] Backup completed: ${backupFilename}" >> "${envBackupDir}/backup.log"`;

      const { stdout, stderr } = await executeCommand(command);
      if (stderr) console.error('Backup stderr:', stderr);

      // Upload to S3 and delete local file after success
      uploadBackupToS3(backupPath, backupFilename, env)
        .then(async (uploaded) => {
          if (uploaded) {
            console.log(`[S3 Backup] Synced: ${backupFilename}`);
            // Delete local file after successful S3 upload
            try {
              await executeCommand(`rm -f "${backupPath}"`);
              console.log(`[Backup] Deleted local file: ${backupFilename}`);
            } catch (err) {
              console.warn(`[Backup] Failed to delete local file: ${err.message}`);
            }
          }
        })
        .catch(err => console.warn(`[S3 Backup] Skipped or failed: ${err.message}`));

      res.json({ message: 'Backup created successfully' });
    } catch (error) {
      console.error('Backup failed:', error);
      res.status(500).json({ error: 'Backup failed', details: error.message });
    }
  });

  router.post('/delete', async (req, res) => {
    try {
      if (pool.pool.maintenanceMode) {
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Database restore in progress. Please try again in a few moments.'
        });
      }

      const { filename } = req.body;
      if (!filename) {
        return res.status(400).json({ error: 'Filename is required' });
      }

      const envBackupDir = `${backupDir}/${env}`;
      const filePath = `${envBackupDir}/${filename}`;

      // Delete the local backup file
      const deleteCommand = `rm -f "${filePath}"`;
      await executeCommand(deleteCommand);

      // Delete from S3
      await deleteS3Backup(filename, env);

      // Log deletion
      const logCommand = `echo "[${env}] Backup deleted: ${filename} at $(date -Iseconds)" >> "${envBackupDir}/backup.log"`;
      await executeCommand(logCommand);

      res.json({ message: 'Backup deleted successfully' });
    } catch (error) {
      console.error('Delete failed:', error);
      res.status(500).json({ error: 'Delete failed', details: error.message });
    }
  });

  router.get('/list', async (req, res) => {
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
    // Check for timeout (15 minutes)
    if (restoreState.startTime && Date.now() - restoreState.startTime > 900000) {
      restoreState = {
        status: 'FAILED',
        phase: 'TIMEOUT',
        startTime: null
      };
      pool.pool.maintenanceMode = false;
    }

    res.json({
      ...restoreState,
      isRestoreTriggered: restoreState.startTime !== null,
      serverTime: Date.now(),
      maintenanceMode: pool.pool.maintenanceMode
    });
  });

  router.get('/download/:filename', async (req, res) => {
    let downloadedBackupPath = null;
    let cleanupStarted = false;

    const cleanupDownloadedBackup = async () => {
      if (!downloadedBackupPath || cleanupStarted) return;
      cleanupStarted = true;

      try {
        await executeCommand(`rm -f "${downloadedBackupPath}"`);
        console.log(`[Download] Cleaned up downloaded backup file: ${downloadedBackupPath}`);
      } catch (fileCleanupError) {
        console.warn(`[Download] Failed to cleanup backup file: ${fileCleanupError.message}`);
      }
    };

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

      if (filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      const envBackupDir = `${backupDir}/${env}`;
      const filePath = `${envBackupDir}/${filename}`;
      const containerName = getContainerName();

      // Check if file exists locally, if not download from S3
      let fileExists = false;
      try {
        await executeCommand(`test -f "${filePath}"`);
        fileExists = true;
        console.log(`[Download] Using local file: ${filePath}`);
      } catch {
        console.log(`[Download] File not found locally, downloading from S3...`);
      }

      if (!fileExists) {
        // Download from S3 - need to handle dev vs prod differently
        if (shouldUseDockerExec()) {
          // Dev: Download to host, then copy into Docker container
          const tempHostPath = `./${filename}`;
          const downloadedPath = await downloadS3Backup(filename, env, '.');
          if (!downloadedPath) {
            return res.status(404).json({ error: 'Backup file not found in S3' });
          }

          // Ensure directory exists in container and copy file into Docker
          await executeCommand(`mkdir -p "${envBackupDir}"`);
          await execAsync(`docker cp "${tempHostPath}" ${containerName}:${filePath}`);

          // Clean up temp file on host
          try {
            fs.unlinkSync(tempHostPath);
          } catch (cleanupErr) {
            console.warn(`[Download] Failed to cleanup temp host file: ${cleanupErr.message}`);
          }

          console.log(`[Download] Downloaded from S3 and copied to Docker: ${filePath}`);
          downloadedBackupPath = filePath;
        } else {
          // Production: Download directly to local filesystem
          const downloadedPath = await downloadS3Backup(filename, env, envBackupDir);
          if (!downloadedPath) {
            return res.status(404).json({ error: 'Backup file not found in S3' });
          }
          console.log(`[Download] Downloaded from S3: ${downloadedPath}`);
          downloadedBackupPath = downloadedPath;
        }
      }

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
          stdio: ['ignore', 'pipe', 'pipe']
        })
        : spawn('pg_restore', pgRestoreArgs, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

      let processClosed = false;

      restoreProcess.stdout.pipe(res);

      restoreProcess.stderr.on('data', (data) => {
        console.error('pg_restore stderr:', data.toString());
      });

      restoreProcess.on('error', async (error) => {
        console.error('Failed to start pg_restore:', error);
        await cleanupDownloadedBackup();

        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed', details: error.message });
        } else {
          res.destroy(error);
        }
      });

      restoreProcess.on('close', async (code, signal) => {
        processClosed = true;
        console.log(`pg_restore process exited with code ${code}${signal ? ` and signal ${signal}` : ''}`);
        await cleanupDownloadedBackup();

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
      await cleanupDownloadedBackup();
      console.error('Download failed:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed', details: error.message });
      }
    }
  });

  router.post('/restore', async (req, res) => {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    if (restoreState.status === 'RESTORING') {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'A restore operation is already in progress'
      });
    }

    try {
      res.json({
        message: 'Restore initiated',
        status: 'RESTORING'
      });

      const envBackupDir = `${backupDir}/${env}`;
      let backupPath = `${envBackupDir}/${filename}`;

      // Check if file exists locally, if not download from S3
      try {
        await executeCommand(`test -f "${backupPath}"`);
        console.log(`[Restore] Using local file: ${backupPath}`);
      } catch {
        console.log(`[Restore] File not found locally, downloading from S3...`);
        const downloadedPath = await downloadS3Backup(filename, env, envBackupDir);
        if (!downloadedPath) {
          throw new Error('Failed to download backup from S3');
        }
        backupPath = downloadedPath;
      }

      await restoreDatabase(backupPath);

      // Clean up downloaded file after restore
      try {
        await executeCommand(`rm -f "${backupPath}"`);
        console.log(`[Restore] Cleaned up local file: ${filename}`);
      } catch (err) {
        console.warn(`[Restore] Failed to cleanup local file: ${err.message}`);
      }

    } catch (error) {
      console.error('Restore failed:', error);
      pool.pool.maintenanceMode = false;
    }
  });

  router.post('/upload-sql', async (req, res) => {
    if (restoreState.status === 'RESTORING') {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'A restore operation is already in progress'
      });
    }

    const { sqlContent } = req.body;
    if (!sqlContent) {
      return res.status(400).json({ error: 'SQL content is required' });
    }

    try {
      res.json({ message: 'SQL import initiated', status: 'RESTORING' });

      const cleanedSql = sqlContent
        .split('\n')
        .filter(line => !line.startsWith('\\restrict') && !line.startsWith('\\unrestrict'))
        .join('\n');

      const tempFilename = `temp_upload_${Date.now()}.sql`;
      const envBackupDir = `${backupDir}/${env}`;
      const tempPath = `${envBackupDir}/${tempFilename}`;

      if (shouldUseDockerExec()) {
        // Dev (Windows/Mac): write into Docker container via stdin
        await executeCommand(`mkdir -p "${envBackupDir}"`);
        const containerName = getContainerName();
        await new Promise((resolve, reject) => {
          const proc = exec(
            `docker exec -i ${containerName} bash -c "cat > ${tempPath}"`,
            { maxBuffer: 100 * 1024 * 1024 },
            (error) => error ? reject(error) : resolve()
          );
          proc.stdin.write(cleanedSql);
          proc.stdin.end();
        });
      } else {
        // Prod (Linux): write directly to the local filesystem
        fs.mkdirSync(envBackupDir, { recursive: true });
        fs.writeFileSync(tempPath, cleanedSql, 'utf8');
      }

      await restoreSqlFile(tempPath);

      try {
        await executeCommand(`rm -f "${tempPath}"`);
        console.log(`[Upload SQL] Cleaned up temp file: ${tempFilename}`);
      } catch (err) {
        console.warn(`[Upload SQL] Failed to cleanup temp file: ${err.message}`);
      }

    } catch (error) {
      console.error('SQL upload failed:', error);
      pool.pool.maintenanceMode = false;
      restoreState = { status: 'FAILED', phase: 'FAILED', startTime: null };
    }
  });

  return router;
}
