// src/routes/admin/backup.js
import express from 'express';
import { exec } from 'child_process';
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
    console.log('Starting database restore process...');
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
        console.log('Caching active sessions...');
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
        console.log(`Cached ${cachedSessions.length} active sessions`);
      } catch (error) {
        console.warn('Failed to cache sessions:', error);
        // Continue with restore even if session caching fails
      }
  
      // Phase 2: Database restore
      restoreState.phase = 'DATABASE_RESTORE';
      console.log('Starting database restore...');
      
      const restoreCommand = `PGPASSWORD=${DB_PASSWORD} pg_restore \
        -h ${DB_HOST} \
        -p ${DB_PORT} \
        -U ${DB_USER} \
        -d ${DB_NAME} \
        -c \
        -v \
        "${backupPath}"`;
  
      const { stdout, stderr } = await execAsync(restoreCommand);
      console.log('Restore stdout:', stdout);
      if (stderr) console.log('Restore stderr:', stderr);
  
      // Phase 3: Session restoration
      if (cachedSessions.length > 0) {
        restoreState.phase = 'SESSION_RESTORE';
        console.log('Restoring cached sessions...');
  
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
          console.log(`Successfully restored ${cachedSessions.length} sessions`);
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

      const command = `DB_USER=${DB_USER} DB_HOST=${DB_HOST} DB_NAME=${DB_NAME} DB_PASSWORD=${DB_PASSWORD} DB_PORT=${DB_PORT} NODE_ENV=${env} MANUAL_BACKUP=true bash /backup.sh`;
      const { stdout, stderr } = await execAsync(command);
      console.log('Backup stdout:', stdout);
      if (stderr) console.error('Backup stderr:', stderr);
      res.json({ message: 'Backup initiated successfully' });
    } catch (error) {
      console.error('Backup failed:', error);
      res.status(500).json({ error: 'Backup failed', details: error.message });
    }
  });

  router.get('/list', async (req, res) => {
    try {
      const envBackupDir = path.join(backupDir, env);
      console.log('Looking for backups in:', envBackupDir);

      await fs.mkdir(envBackupDir, { recursive: true });
      const files = await fs.readdir(envBackupDir);
      console.log('Found files:', files);
      
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