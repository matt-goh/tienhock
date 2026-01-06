// src/routes/admin/backup.js
import express from 'express';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { DB_NAME, DB_USER, DB_HOST, DB_PASSWORD, DB_PORT, NODE_ENV } from '../../configs/config.js';
import { uploadBackupToS3 } from '../../utils/s3-backup.js';

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

  // When running inside docker container, use localhost since we're in the db container
  const getDbHost = () => 'localhost';

  // Check if running in Docker or on host
  const isRunningInDocker = () => {
    // On Windows/Mac development, we run on host and use docker exec
    // On production Linux server, we might run directly in container
    return process.platform !== 'win32' && process.platform !== 'darwin';
  };

  // Execute a command - either directly or via docker exec
  const executeCommand = async (command, options = {}) => {
    if (isRunningInDocker()) {
      // Running inside Docker, execute directly
      return execAsync(command, options);
    } else {
      // Running on host (Windows/Mac), use docker exec
      const containerName = getContainerName();
      const dockerCommand = `docker exec ${containerName} bash -c "${command.replace(/"/g, '\\"')}"`;
      return execAsync(dockerCommand, options);
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
    const dbHost = isRunningInDocker() ? DB_HOST : getDbHost();
    const dbPort = isRunningInDocker() ? DB_PORT : '5432';

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

      const restoreCommand = `PGPASSWORD=${DB_PASSWORD} pg_restore -h ${dbHost} -p ${dbPort} -U ${DB_USER} -d ${DB_NAME} --clean --if-exists -c -v "${backupPath}"`;

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

      const dbHost = isRunningInDocker() ? DB_HOST : getDbHost();
      const dbPort = isRunningInDocker() ? DB_PORT : '5432';
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

      // Upload to S3 (fire-and-forget, doesn't block response)
      uploadBackupToS3(backupPath, backupFilename, env)
        .then(() => console.log(`[S3 Backup] Synced: ${backupFilename}`))
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

      // Delete the backup file via docker exec
      const deleteCommand = `rm -f "${filePath}"`;
      await executeCommand(deleteCommand);

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
      const envBackupDir = `${backupDir}/${env}`;

      // Ensure directory exists
      await executeCommand(`mkdir -p "${envBackupDir}"`);

      // List files with their stats using a single command
      const listCommand = `find "${envBackupDir}" -maxdepth 1 -name "*.gz" -printf "%f\\t%s\\t%T@\\n" 2>/dev/null || true`;
      const { stdout } = await executeCommand(listCommand);

      const backups = stdout
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [filename, size, mtime] = line.split('\t');
          return {
            filename,
            size: parseInt(size, 10),
            created: new Date(parseFloat(mtime) * 1000).toISOString(),
            environment: env
          };
        });

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

      const envBackupDir = `${backupDir}/${env}`;
      const filePath = `${envBackupDir}/${filename}`;
      const containerName = getContainerName();

      // Check if file exists
      try {
        await executeCommand(`test -f "${filePath}"`);
      } catch {
        return res.status(404).json({ error: 'Backup file not found' });
      }

      // Convert .gz to .sql filename for download
      const sqlFilename = filename.replace('.gz', '.sql');

      // Set headers for file download
      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${sqlFilename}"`);

      // Create a temporary database name
      const tempDbName = `temp_restore_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const dbHost = isRunningInDocker() ? DB_HOST : getDbHost();
      const dbPort = isRunningInDocker() ? DB_PORT : '5432';

      try {
        console.log(`Creating temporary database: ${tempDbName}`);

        // Step 1: Create temporary database
        await executeCommand(`PGPASSWORD=${DB_PASSWORD} createdb -h ${dbHost} -p ${dbPort} -U ${DB_USER} "${tempDbName}"`);

        console.log(`Restoring backup to temporary database: ${tempDbName}`);

        // Step 2: Restore backup to temporary database
        await executeCommand(`PGPASSWORD=${DB_PASSWORD} pg_restore -h ${dbHost} -p ${dbPort} -U ${DB_USER} -d "${tempDbName}" --no-owner --no-privileges --clean --if-exists -v "${filePath}"`);

        console.log(`Dumping temporary database with INSERT statements`);

        // Step 3: Stream pg_dump output from container to response
        if (isRunningInDocker()) {
          // Running in Docker, spawn pg_dump directly
          const pgDumpArgs = [
            '-h', dbHost,
            '-p', dbPort,
            '-U', DB_USER,
            '-d', tempDbName,
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-privileges',
            '--inserts',
            '--disable-triggers',
            '--verbose'
          ];

          const pgDump = spawn('pg_dump', pgDumpArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PGPASSWORD: DB_PASSWORD }
          });

          pgDump.stdout.pipe(res);

          pgDump.stderr.on('data', (data) => {
            console.error('pg_dump stderr:', data.toString());
          });

          pgDump.on('close', async (code) => {
            console.log(`pg_dump process exited with code ${code}`);
            await cleanupTempDb(tempDbName, dbHost, dbPort);
          });

          req.on('close', async () => {
            if (!pgDump.killed) pgDump.kill();
            await cleanupTempDb(tempDbName, dbHost, dbPort);
          });
        } else {
          // Running on host, use docker exec with streaming
          const dockerArgs = [
            'exec', containerName,
            'bash', '-c',
            `PGPASSWORD=${DB_PASSWORD} pg_dump -h ${dbHost} -p ${dbPort} -U ${DB_USER} -d "${tempDbName}" --clean --if-exists --no-owner --no-privileges --inserts --disable-triggers`
          ];

          const dockerProcess = spawn('docker', dockerArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
          });

          dockerProcess.stdout.pipe(res);

          dockerProcess.stderr.on('data', (data) => {
            console.error('docker exec stderr:', data.toString());
          });

          dockerProcess.on('close', async (code) => {
            console.log(`docker exec process exited with code ${code}`);
            await cleanupTempDb(tempDbName, dbHost, dbPort);
          });

          req.on('close', async () => {
            if (!dockerProcess.killed) dockerProcess.kill();
            await cleanupTempDb(tempDbName, dbHost, dbPort);
          });
        }

      } catch (error) {
        console.error('Error during backup conversion:', error);
        await cleanupTempDb(tempDbName, isRunningInDocker() ? DB_HOST : getDbHost(), isRunningInDocker() ? DB_PORT : '5432');
        throw error;
      }

    } catch (error) {
      console.error('Download failed:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed', details: error.message });
      }
    }

    // Helper function to clean up temporary database
    async function cleanupTempDb(dbName, dbHost, dbPort) {
      try {
        console.log(`Cleaning up temporary database: ${dbName}`);
        await executeCommand(`PGPASSWORD=${DB_PASSWORD} dropdb -h ${dbHost} -p ${dbPort} -U ${DB_USER} "${dbName}"`);
        console.log(`Successfully dropped temporary database: ${dbName}`);
      } catch (cleanupError) {
        console.error(`Failed to cleanup temporary database ${dbName}:`, cleanupError);
      }
    }
  });

  router.post('/restore', async (req, res) => {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    if (restoreState.isRestoring) {
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

      const backupPath = `${backupDir}/${env}/${filename}`;
      await restoreDatabase(backupPath);

    } catch (error) {
      console.error('Restore failed:', error);
      pool.pool.maintenanceMode = false;
    }
  });

  return router;
}
