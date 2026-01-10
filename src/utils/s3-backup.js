// src/utils/s3-backup.js
// S3 backup utilities for syncing PostgreSQL backups to AWS S3

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  S3_BUCKET_NAME,
  isS3BackupEnabled,
  DB_NAME,
  DB_USER,
  DB_HOST,
  DB_PASSWORD,
  DB_PORT,
  NODE_ENV
} from '../configs/config.js';

const execAsync = promisify(exec);

// Initialize S3 client (lazy - only when needed)
let s3Client = null;

const getS3Client = () => {
  if (!s3Client && isS3BackupEnabled()) {
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
};

// Check if we should use docker exec (only for Windows/Mac development)
const shouldUseDockerExec = () => {
  // On Windows/Mac, we use docker exec to run commands in the DB container
  // On production Linux (Hetzner), we run commands directly (no Docker)
  return (process.platform === 'win32' || process.platform === 'darwin');
};

// Get Docker container name based on environment
const getContainerName = () => {
  const env = NODE_ENV || 'development';
  if (env === 'development') return 'tienhock_dev_db';
  if (env === 'production') return 'tienhock_prod_db';
  return 'tienhock_dev_db';
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

/**
 * Upload a backup file to S3
 * @param {string} localFilePath - Full path to the local backup file
 * @param {string} filename - Filename for S3 key
 * @param {string} env - Environment (development/production)
 * @returns {Promise<boolean>} - True if upload succeeded, false if skipped
 */
export async function uploadBackupToS3(localFilePath, filename, env) {
  if (!isS3BackupEnabled()) {
    // Silently skip - don't log to avoid noise when S3 is intentionally disabled
    return false;
  }

  try {
    const client = getS3Client();
    if (!client) {
      console.warn('[S3 Backup] S3 client not initialized');
      return false;
    }
    const s3Key = `${env}/${filename}`;

    // Read file from Docker container or local filesystem
    let fileBuffer;

    if (shouldUseDockerExec()) {
      // Running on Windows/Mac host, read via docker exec and pipe
      const { stdout } = await execAsync(
        `docker exec ${getContainerName()} cat "${localFilePath}"`,
        { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 } // 50MB buffer
      );
      fileBuffer = stdout;
    } else {
      // Running on Linux (production Hetzner), read directly from filesystem
      fileBuffer = fs.readFileSync(localFilePath);
    }

    await client.send(new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'application/gzip',
      Metadata: {
        'backup-env': env,
        'backup-date': new Date().toISOString(),
      },
    }));

    console.log(`[S3 Backup] Uploaded: ${s3Key}`);
    return true;
  } catch (error) {
    console.warn(`[S3 Backup] Upload failed: ${error.message}`);
    return false;
  }
}

/**
 * List all backups in S3 for an environment
 * @param {string} env - Environment (development/production)
 * @returns {Promise<Array>} - Array of backup objects
 */
export async function listS3Backups(env) {
  if (!isS3BackupEnabled()) {
    return [];
  }

  try {
    const client = getS3Client();
    const response = await client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET_NAME,
      Prefix: `${env}/`,
    }));

    return (response.Contents || []).map(obj => ({
      key: obj.Key,
      filename: path.basename(obj.Key),
      size: obj.Size,
      lastModified: obj.LastModified,
    }));
  } catch (error) {
    console.warn(`[S3 Backup] Failed to list backups: ${error.message}`);
    return [];
  }
}

/**
 * Delete old S3 backups beyond retention period
 * @param {string} env - Environment (development/production)
 * @param {number} retentionDays - Number of days to retain backups (default: 1095 = 3 years)
 * @returns {Promise<number>} - Number of backups deleted
 */
export async function deleteOldS3Backups(env, retentionDays = 1095) {
  if (!isS3BackupEnabled()) {
    return 0;
  }

  try {
    const client = getS3Client();
    const backups = await listS3Backups(env);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;

    for (const backup of backups) {
      if (backup.lastModified < cutoffDate) {
        await client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: backup.key,
        }));
        console.log(`[S3 Backup] Deleted old backup: ${backup.key}`);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[S3 Backup] Cleaned up ${deletedCount} old backups`);
    }

    return deletedCount;
  } catch (error) {
    console.warn(`[S3 Backup] Failed to delete old backups: ${error.message}`);
    return 0;
  }
}

/**
 * Sync all local backups to S3 (uploads missing files)
 * @param {string} localBackupDir - Local backup directory path
 * @param {string} env - Environment (development/production)
 * @returns {Promise<number>} - Number of backups synced
 */
export async function syncLocalToS3(localBackupDir, env) {
  if (!isS3BackupEnabled()) {
    // Silently skip - don't log to avoid noise when S3 is intentionally disabled
    return 0;
  }

  try {
    // Get list of local backups
    const listCommand = `find "${localBackupDir}" -maxdepth 1 -name "*.gz" -printf "%f\\n" 2>/dev/null || true`;
    const { stdout } = await executeCommand(listCommand);
    const localFiles = stdout.trim().split('\n').filter(f => f.trim());

    if (localFiles.length === 0) {
      console.log('[S3 Backup] No local backups to sync');
      return 0;
    }

    // Get list of S3 backups
    const s3Backups = await listS3Backups(env);
    const s3Filenames = new Set(s3Backups.map(b => b.filename));

    // Upload missing files
    let syncedCount = 0;
    for (const filename of localFiles) {
      if (!s3Filenames.has(filename)) {
        const localPath = `${localBackupDir}/${filename}`;
        const uploaded = await uploadBackupToS3(localPath, filename, env);
        if (uploaded) {
          syncedCount++;
        }
      }
    }

    if (syncedCount > 0) {
      console.log(`[S3 Backup] Synced ${syncedCount} backups to S3`);
    } else {
      console.log('[S3 Backup] All backups already synced');
    }

    return syncedCount;
  } catch (error) {
    console.warn(`[S3 Backup] Sync failed: ${error.message}`);
    return 0;
  }
}

/**
 * Create an automatic backup (weekly)
 * This replaces the monthly logic from backup.sh
 * @returns {Promise<boolean>} - True if backup succeeded
 */
export async function createAutoBackup() {
  const env = NODE_ENV || 'development';
  const backupDir = `/var/backups/postgres/${env}`;
  const dbHost = shouldUseDockerExec() ? 'localhost' : DB_HOST;
  const dbPort = shouldUseDockerExec() ? '5432' : DB_PORT;

  try {
    // Generate timestamp
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') + '_' +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');

    const backupFilename = `auto_weekly_${DB_NAME}_${timestamp}.gz`;
    const backupPath = `${backupDir}/${backupFilename}`;

    console.log(`[Auto Backup] Creating weekly backup: ${backupFilename}`);

    // Ensure backup directory exists and run pg_dump
    const command = `mkdir -p "${backupDir}" && PGPASSWORD=${DB_PASSWORD} pg_dump -h ${dbHost} -p ${dbPort} -U ${DB_USER} -d ${DB_NAME} -F c -b -v -f "${backupPath}" && echo "[${env}] Auto weekly backup completed: ${backupFilename}" >> "${backupDir}/backup.log"`;

    await executeCommand(command);

    console.log(`[Auto Backup] Backup created successfully: ${backupFilename}`);

    // Upload to S3 if configured
    await uploadBackupToS3(backupPath, backupFilename, env);

    // Delete local backups older than 180 days (same as backup.sh)
    const cleanupCommand = `find "${backupDir}" -name "*.gz" -mtime +180 -delete 2>/dev/null || true`;
    await executeCommand(cleanupCommand);

    return true;
  } catch (error) {
    console.error(`[Auto Backup] Failed: ${error.message}`);
    return false;
  }
}
