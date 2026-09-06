// src/utils/s3-backup.js
// S3 backup utilities for syncing PostgreSQL backups to AWS S3

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { backupsUseDocker, backupDirectory, backupFilePath, backupCommand, validBackupFilename, assertBackupFile, listLocalBackupFiles, createLocalBackup } from './backup-files.js';
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

const getRequiredS3Client = () => {
  const client = getS3Client();
  if (!client) {
    const error = new Error('S3 storage is not configured');
    error.status = 503;
    throw error;
  }
  return client;
};

/**
 * Check whether generic S3 object storage can be used.
 * @returns {boolean}
 */
export function isS3ObjectStorageEnabled() {
  return isS3BackupEnabled();
}

/**
 * Upload an in-memory object to S3.
 * @param {string} s3Key - Object key inside the configured bucket
 * @param {Buffer|Uint8Array|string} body - Object body
 * @param {{ contentType?: string, metadata?: Record<string, string> }} options
 * @returns {Promise<{ bucket: string, key: string }>}
 */
export async function uploadObjectToS3(s3Key, body, options = {}) {
  const client = getRequiredS3Client();
  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
    Body: body,
    ContentType: options.contentType || 'application/octet-stream',
    Metadata: options.metadata || {},
  }));

  return {
    bucket: S3_BUCKET_NAME,
    key: s3Key,
  };
}

/**
 * Get an object stream and metadata from S3.
 * @param {string} s3Key - Object key inside the configured bucket
 * @returns {Promise<import('@aws-sdk/client-s3').GetObjectCommandOutput>}
 */
export async function getObjectFromS3(s3Key) {
  const client = getRequiredS3Client();
  return client.send(new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
  }));
}

/**
 * Delete a generic object from S3.
 * @param {string} s3Key - Object key inside the configured bucket
 * @returns {Promise<boolean>}
 */
export async function deleteObjectFromS3(s3Key) {
  const client = getRequiredS3Client();
  await client.send(new DeleteObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
  }));
  return true;
}

/** @typedef {{key: string, filename: string, size: number, lastModified: Date}} BackupObject */
/** @param {string} env @returns {Promise<BackupObject[]>} */
export async function listS3Backups(env) {
  backupDirectory(env);
  if (!isS3BackupEnabled()) return [];
  const client = getRequiredS3Client();
  /** @type {BackupObject[]} */
  const backups = [];
  /** @type {string|undefined} */
  let token;
  do {
    const response = await client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET_NAME, Prefix: `${env}/`, ContinuationToken: token }));
    for (const object of response.Contents || []) {
      const key = object.Key || '';
      const relative = key.slice(env.length + 1);
      const filename = relative.startsWith('backups/') ? relative.slice(8) : relative;
      // Accept only new backups and legacy root-level dumps, never purchase attachments.
      if (validBackupFilename(filename) && object.LastModified) backups.push({
        key, filename, size: object.Size || 0, lastModified: object.LastModified,
      });
    }
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
    if (response.IsTruncated && !token) throw new Error('S3 returned incomplete pagination');
  } while (token);
  return backups.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

/** @param {string} localFilePath @param {string} filename @param {string} env @returns {Promise<boolean>} */
export async function uploadBackupToS3(localFilePath, filename, env) {
  if (localFilePath !== backupFilePath(env, filename)) throw new Error('Invalid backup path');
  if (!isS3BackupEnabled()) return false;
  await assertBackupFile(env, filename);
  const size = Number((await backupCommand('stat', ['-c', '%s', localFilePath])).stdout);
  const body = backupsUseDocker ? (await backupCommand('cat', [localFilePath], true)).stdout : fs.createReadStream(localFilePath);
  try { await getRequiredS3Client().send(new PutObjectCommand({
    Bucket: S3_BUCKET_NAME, Key: `${env}/backups/${filename}`, Body: body, ContentLength: size,
    ContentType: 'application/octet-stream', ChecksumAlgorithm: 'SHA256',
    Metadata: { 'backup-env': env, 'backup-date': new Date().toISOString() },
  })); } finally { if (!backupsUseDocker) body.destroy(); }
  return true;
}

/** @param {string} filename @param {string} env @returns {Promise<boolean>} */
export async function deleteS3Backup(filename, env) {
  backupFilePath(env, filename);
  if (!isS3BackupEnabled()) return false;
  for (const backup of (await listS3Backups(env)).filter((entry) => entry.filename === filename)) {
    await getRequiredS3Client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME, Key: backup.key }));
  }
  return true;
}

/** @param {string} filename @param {string} env @param {string} localDir @returns {Promise<string|null>} */
export async function downloadS3Backup(filename, env, localDir) {
  backupFilePath(env, filename);
  if (!isS3BackupEnabled()) return null;
  const backup = (await listS3Backups(env)).find((entry) => entry.filename === filename);
  if (!backup) return null;
  const response = await getRequiredS3Client().send(new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: backup.key, ChecksumMode: 'ENABLED' }));
  if (!response.Body) throw new Error('Empty backup response');
  fs.mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const localPath = path.resolve(localDir, filename);
  const temporaryPath = `${localPath}.${randomBytes(8).toString('hex')}.partial`;
  try {
    await pipeline(response.Body, fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }));
    fs.renameSync(temporaryPath, localPath);
    return localPath;
  } finally { fs.rmSync(temporaryPath, { force: true }); }
}

/** @param {string} env @param {number} [retentionDays] @returns {Promise<number>} */
export async function deleteOldS3Backups(env, retentionDays = 1095) {
  if (!Number.isInteger(retentionDays) || retentionDays < 180) throw new Error('Invalid backup retention period');
  const cutoff = Date.now() - retentionDays * 86400000;
  let deleted = 0;
  for (const backup of await listS3Backups(env)) {
    if (backup.lastModified.getTime() < cutoff) {
      await getRequiredS3Client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME, Key: backup.key }));
      deleted += 1;
    }
  }
  return deleted;
}

/** @param {string} localBackupDir @param {string} env @returns {Promise<number>} */
export async function syncLocalToS3(localBackupDir, env) {
  if (localBackupDir !== backupDirectory(env)) throw new Error('Invalid backup directory');
  if (!isS3BackupEnabled()) return 0;
  const remoteNames = new Set((await listS3Backups(env)).map((entry) => entry.filename));
  let count = 0;
  for (const backup of await listLocalBackupFiles(env)) {
    if (!remoteNames.has(backup.filename)) {
      await uploadBackupToS3(backupFilePath(env, backup.filename), backup.filename, env);
      count += 1;
    }
  }
  return count;
}

/** A fresh daily dump; failures propagate to the scheduler and failed uploads keep the local copy.
 * @returns {Promise<boolean>}
 */
export async function createAutoBackup() {
  const env = NODE_ENV || 'development';
  const backup = await createLocalBackup(env, 'auto_daily');
  if (env === 'production' && !isS3BackupEnabled()) throw new Error('Off-server backup storage is not configured');
  await uploadBackupToS3(backup.filePath, backup.filename, env);
  // Retain local recovery copies for 180 days, and only prune after a successful backup.
  for (const old of await listLocalBackupFiles(env)) {
    if (old.lastModified.getTime() < Date.now() - 180 * 86400000) {
      await backupCommand('rm', ['-f', '--', backupFilePath(env, old.filename)]);
    }
  }
  return true;
}
