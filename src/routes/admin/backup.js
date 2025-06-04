// src/routes/admin/backup.js
import express from 'express';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { DB_NAME, DB_USER, DB_HOST, DB_PASSWORD, DB_PORT, NODE_ENV } from '../../configs/config.js';

const execAsync = promisify(exec);
const router = express.Router();

export default function backupRouter(pool) {
  const env = NODE_ENV || 'development';
  const backupDir = '/var/backups/postgres';

  // Track restore state globally
  let restoreState = {
    status: 'IDLE',
    phase: null,
    startTime: null
  };

  async function restoreDatabase(backupPath) {
    let cachedSessions = [];
    
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
      
      const restoreCommand = `PGPASSWORD=${DB_PASSWORD} pg_restore \
        -h ${DB_HOST} \
        -p ${DB_PORT} \
        -U ${DB_USER} \
        -d ${DB_NAME} \
        --clean \
        --if-exists \
        -c \
        -v \
        "${backupPath}"`;
  
      await execAsync(restoreCommand);
  
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
      let customNameEnv = '';
      
      if (name) {
        // Sanitize the custom name by removing special characters and spaces
        const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
        customNameEnv = `CUSTOM_NAME=${sanitizedName}`;
      }

      const command = `DB_USER=${DB_USER} DB_HOST=${DB_HOST} DB_NAME=${DB_NAME} DB_PASSWORD=${DB_PASSWORD} DB_PORT=${DB_PORT} NODE_ENV=${env} MANUAL_BACKUP=true ${customNameEnv} bash /backup.sh`;
      
      const { stdout, stderr } = await execAsync(command);
      if (stderr) console.error('Backup stderr:', stderr);
      res.json({ message: 'Backup initiated successfully' });
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
  
      const envBackupDir = path.join(backupDir, env);
      const filePath = path.join(envBackupDir, filename);
  
      // Verify file exists and is within backup directory
      if (!filePath.startsWith(envBackupDir)) {
        return res.status(400).json({ error: 'Invalid backup file path' });
      }
  
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: 'Backup file not found' });
      }
  
      // Delete the backup file
      await fs.unlink(filePath);
      
      // Log deletion
      const logMessage = `[${env}] Backup deleted: ${filename} at ${new Date().toISOString()}\n`;
      await fs.appendFile(path.join(envBackupDir, 'backup.log'), logMessage);
  
      res.json({ message: 'Backup deleted successfully' });
    } catch (error) {
      console.error('Delete failed:', error);
      res.status(500).json({ error: 'Delete failed', details: error.message });
    }
  });

  router.get('/list', async (req, res) => {
    try {
      const envBackupDir = path.join(backupDir, env);

      await fs.mkdir(envBackupDir, { recursive: true });
      const files = await fs.readdir(envBackupDir);
      
      const backups = await Promise.all(
        files
          .filter(file => file.endsWith('.gz'))
          .map(async file => {
            const stats = await fs.stat(path.join(envBackupDir, file));
            return {
              filename: file,
              size: stats.size,
              created: stats.mtime,
              environment: env
            };
          })
      );
      
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

    const envBackupDir = path.join(backupDir, env);
    const filePath = path.join(envBackupDir, filename);

    // Verify file exists and is within backup directory
    if (!filePath.startsWith(envBackupDir)) {
      return res.status(400).json({ error: 'Invalid backup file path' });
    }

    try {
      await fs.access(filePath);
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
    
    try {
      console.log(`Creating temporary database: ${tempDbName}`);
      
      // Step 1: Create temporary database
      await execAsync(`PGPASSWORD="${DB_PASSWORD}" createdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${tempDbName}"`);
      
      console.log(`Restoring backup to temporary database: ${tempDbName}`);
      
      // Step 2: Restore backup to temporary database
      await execAsync(`PGPASSWORD="${DB_PASSWORD}" pg_restore -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${tempDbName}" --no-owner --no-privileges --clean --if-exists -v "${filePath}"`);
      
      console.log(`Dumping temporary database with INSERT statements`);
      
      // Step 3: Dump temporary database as SQL with INSERT statements
      const pgDumpArgs = [
        '-h', DB_HOST,
        '-p', DB_PORT,
        '-U', DB_USER,
        '-d', tempDbName,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--inserts',  // Use INSERT with column names
        '--disable-triggers', // Disable triggers during insert
        '--verbose'
      ];

      const pgDump = spawn('pg_dump', pgDumpArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PGPASSWORD: DB_PASSWORD
        }
      });
      
      // Pipe stdout to response
      pgDump.stdout.pipe(res);
      
      let stderrOutput = '';
      pgDump.stderr.on('data', (data) => {
        stderrOutput += data.toString();
        console.error('pg_dump stderr:', data.toString());
      });
      
      pgDump.on('error', (error) => {
        console.error('pg_dump spawn error:', error);
        cleanupTempDb(tempDbName);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to start pg_dump process' });
        }
      });
      
      pgDump.on('close', async (code) => {
        console.log(`pg_dump process exited with code ${code}`);
        
        // Clean up temporary database
        await cleanupTempDb(tempDbName);
        
        if (code !== 0 && !res.headersSent) {
          console.error(`pg_dump failed with code ${code}`);
          console.error('pg_dump stderr:', stderrOutput);
          res.status(500).json({ 
            error: 'Failed to generate SQL dump with INSERT statements',
            details: stderrOutput 
          });
        }
      });
      
      // Handle client disconnect
      req.on('close', async () => {
        if (!pgDump.killed) {
          pgDump.kill();
        }
        await cleanupTempDb(tempDbName);
      });
      
    } catch (error) {
      console.error('Error during backup conversion:', error);
      await cleanupTempDb(tempDbName);
      throw error;
    }

  } catch (error) {
    console.error('Download failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed', details: error.message });
    }
  }

  // Helper function to clean up temporary database
  async function cleanupTempDb(dbName) {
    try {
      console.log(`Cleaning up temporary database: ${dbName}`);
      await execAsync(`PGPASSWORD="${DB_PASSWORD}" dropdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${dbName}"`);
      console.log(`Successfully dropped temporary database: ${dbName}`);
    } catch (cleanupError) {
      console.error(`Failed to cleanup temporary database ${dbName}:`, cleanupError);
      // Don't throw here - just log the error
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

      const backupPath = path.join(backupDir, env, filename);
      await restoreDatabase(backupPath);

    } catch (error) {
      console.error('Restore failed:', error);
      pool.pool.maintenanceMode = false;
    }
  });

  return router;
}