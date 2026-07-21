// src/routes/admin/backup.js
import express from 'express';
import { exec, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { promisify } from 'util';
import fs from 'fs';
import pg from 'pg';
import { DB_NAME, DB_USER, DB_HOST, DB_PASSWORD, DB_PORT, NODE_ENV } from '../../configs/config.js';
import { uploadBackupToS3, listS3Backups, deleteS3Backup, downloadS3Backup } from '../../utils/s3-backup.js';
import { isS3BackupEnabled } from '../../configs/config.js';

const { Client } = pg;
const execAsync = promisify(exec);
const router = express.Router();

class RestoredDatabaseStructureError extends Error {}

const REQUIRED_RESTORED_SCHEMAS = ['greentarget', 'jellypolly', 'public'];

const MINIMUM_RESTORED_TABLE_COUNTS = {
  public: 90,
  greentarget: 30,
  jellypolly: 34,
};

const REQUIRED_RESTORED_TABLES = [
  'public.account_codes',
  'public.account_opening_balances',
  'public.active_sessions',
  'public.adjustment_documents',
  'public.bank_ins',
  'public.customers',
  'public.employee_payrolls',
  'public.invoices',
  'public.journal_entries',
  'public.journal_entry_lines',
  'public.materials',
  'public.monthly_payrolls',
  'public.order_details',
  'public.payments',
  'public.production_entries',
  'public.products',
  'public.receipt_allocations',
  'public.receipts',
  'public.self_billed_invoices',
  'public.staffs',
  'public.stock_opening_balances',
  'public.supplier_payments',
  'greentarget.customers',
  'greentarget.employee_payrolls',
  'greentarget.invoices',
  'greentarget.payments',
  'greentarget.payroll_employees',
  'greentarget.rentals',
  'jellypolly.employee_payrolls',
  'jellypolly.invoices',
  'jellypolly.order_details',
  'jellypolly.payments',
  'jellypolly.production_entries',
  'jellypolly.staffs',
];

const REQUIRED_RESTORED_COLUMNS = [
  'public.account_codes.code',
  'public.account_codes.fs_note',
  'public.account_opening_balances.account_code',
  'public.account_opening_balances.as_of_date',
  'public.account_opening_balances.amount',
  'public.active_sessions.session_id',
  'public.invoices.id',
  'public.invoices.journal_entry_id',
  'public.invoices.balance_due',
  'public.journal_entries.reference_no',
  'public.journal_entries.entry_type',
  'public.journal_entries.entry_date',
  'public.journal_entries.status',
  'public.journal_entries.display_reference',
  'public.journal_entries.legacy_entry_type',
  'public.journal_entries.posting_sequence',
  'public.journal_entries.source_type',
  'public.journal_entries.source_id',
  'public.journal_entry_lines.journal_entry_id',
  'public.journal_entry_lines.account_code',
  'public.journal_entry_lines.debit_amount',
  'public.journal_entry_lines.credit_amount',
  'public.journal_entry_lines.cheque_reference',
  'public.journal_entry_lines.display_order',
  'public.journal_entry_lines.display_reference',
  'public.receipts.status',
  'public.receipts.journal_entry_id',
  'public.receipt_allocations.receipt_id',
  'public.receipt_allocations.amount',
  'greentarget.invoices.invoice_id',
  'greentarget.payments.invoice_id',
  'jellypolly.invoices.id',
  'jellypolly.payments.invoice_id',
];

const RESTORE_PROCESS_TIMEOUT_MS = 15 * 60 * 1000;
const STALE_UPLOAD_MINIMUM_AGE_MS = RESTORE_PROCESS_TIMEOUT_MS + (60 * 1000);
const STALE_UPLOAD_CLEANUP_DELAY_MS = STALE_UPLOAD_MINIMUM_AGE_MS + (2 * 60 * 1000);

export default function backupRouter(pool) {
  const env = NODE_ENV || 'development';
  const isSqlReplacementEnabled = NODE_ENV === 'development'
    && (process.platform === 'win32' || process.platform === 'darwin');
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

  /**
   * @param {string} value
   * @returns {string}
   */
  const quoteIdentifier = (value) => {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
      throw new Error('Invalid PostgreSQL identifier');
    }
    return `"${value.replace(/"/g, '""')}"`;
  };

  /**
   * @param {string} label
   * @returns {string}
   */
  const createRestoreDatabasePrefix = (label) => {
    const safeBase = DB_NAME.replace(/[^a-zA-Z0-9_]/g, '_') || 'database';
    const suffix = `_${label}_`;
    const restoreIdLength = 22;
    return `${safeBase.slice(0, Math.max(1, 63 - suffix.length - restoreIdLength))}${suffix}`;
  };

  /**
   * @param {string} label
   * @param {string} restoreId
   * @returns {string}
   */
  const createRestoreDatabaseName = (label, restoreId) =>
    `${createRestoreDatabasePrefix(label)}${restoreId}`;

  /**
   * @param {string} label
   * @returns {RegExp}
   */
  const createRestoreNamePattern = (label) =>
    new RegExp(`^${createRestoreDatabasePrefix(label)}\\d{13}_[0-9a-f]{8}$`);

  /**
   * @param {string} database
   * @returns {pg.Client}
   */
  const createDatabaseClient = (database) => new Client({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database,
    application_name: 'database_restore_worker',
    connectionTimeoutMillis: 10000,
    ssl: env === 'production' ? { rejectUnauthorized: false } : false,
  });

  /**
   * @param {string} command
   * @param {string[]} args
   * @param {{ env?: NodeJS.ProcessEnv, input?: string, timeoutMs?: number }} [options]
   * @returns {Promise<void>}
   */
  const runProcess = (command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'ignore', 'pipe'],
      windowsHide: true,
      timeout: options.timeoutMs,
      killSignal: 'SIGTERM',
    });
    let stderr = '';
    let settled = false;

    child.stderr.on('data', (data) => {
      stderr = `${stderr}${data.toString()}`.slice(-20000);
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} failed with ${reason}${stderr ? `: ${stderr.trim()}` : ''}`));
    });

    if (options.input !== undefined) {
      child.stdin.on('error', (error) => {
        if (settled || error.code === 'EPIPE') return;
        settled = true;
        reject(error);
      });
      child.stdin.end(options.input);
    }
  });

  /**
   * @param {string} tool
   * @param {string[]} args
   * @param {string} [password]
   * @returns {Promise<void>}
   */
  const runPostgresTool = async (tool, args, password = DB_PASSWORD) => {
    if (shouldUseDockerExec()) {
      await runProcess('docker', [
        'exec',
        '--env',
        `PGPASSWORD=${password}`,
        getContainerName(),
        tool,
        ...args,
      ], { timeoutMs: RESTORE_PROCESS_TIMEOUT_MS });
      return;
    }

    await runProcess(tool, args, {
      env: { ...process.env, PGPASSWORD: password },
      timeoutMs: RESTORE_PROCESS_TIMEOUT_MS,
    });
  };

  /**
   * @param {string} filePath
   * @param {string} sqlContent
   * @returns {Promise<void>}
   */
  const writeUploadedSqlFile = async (filePath, sqlContent) => {
    if (shouldUseDockerExec()) {
      await runProcess('docker', [
        'exec',
        getContainerName(),
        'mkdir',
        '-p',
        `${backupDir}/${env}`,
      ], { timeoutMs: RESTORE_PROCESS_TIMEOUT_MS });
      await runProcess('docker', [
        'exec',
        '-i',
        getContainerName(),
        'sh',
        '-c',
        'cat > "$1"',
        'database-restore-upload',
        filePath,
      ], { input: sqlContent, timeoutMs: RESTORE_PROCESS_TIMEOUT_MS });
      return;
    }

    fs.mkdirSync(`${backupDir}/${env}`, { recursive: true });
    fs.writeFileSync(filePath, sqlContent, 'utf8');
  };

  /**
   * @param {string} filePath
   * @returns {Promise<void>}
   */
  const removeUploadedSqlFile = async (filePath) => {
    if (shouldUseDockerExec()) {
      await runProcess('docker', [
        'exec',
        getContainerName(),
        'rm',
        '-f',
        filePath,
      ]);
      return;
    }

    fs.rmSync(filePath, { force: true });
  };

  /**
   * Removes only timestamp-named plaintext uploads left by an interrupted
   * replacement process.
   * @returns {Promise<void>}
   */
  const cleanupStaleUploadedSqlFiles = async () => {
    const envBackupDir = `${backupDir}/${env}`;
    const staleUploadPattern = `temp_upload_${'[0-9]'.repeat(13)}.sql`;

    if (shouldUseDockerExec()) {
      try {
        await runProcess('docker', [
          'exec',
          getContainerName(),
          'test',
          '-d',
          envBackupDir,
        ]);
      } catch {
        return;
      }

      await runProcess('docker', [
        'exec',
        getContainerName(),
        'find',
        envBackupDir,
        '-maxdepth',
        '1',
        '-type',
        'f',
        '-name',
        staleUploadPattern,
        '-mmin',
        `+${Math.ceil(STALE_UPLOAD_MINIMUM_AGE_MS / (60 * 1000))}`,
        '-delete',
      ]);
      return;
    }

    if (!fs.existsSync(envBackupDir)) return;
    for (const entry of fs.readdirSync(envBackupDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/^temp_upload_\d{13}\.sql$/.test(entry.name)) continue;

      const stalePath = `${envBackupDir}/${entry.name}`;
      const ageMs = Date.now() - fs.statSync(stalePath).mtimeMs;
      if (ageMs >= STALE_UPLOAD_MINIMUM_AGE_MS) {
        fs.rmSync(stalePath, { force: true });
      }
    }
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
    startTime: null,
    message: null,
  };

  /**
   * @param {string} sqlContent
   * @returns {string}
   */
  const validateSqlReplacement = (sqlContent) => {
    if (!/^--\r?\n-- PostgreSQL database dump\r?$/m.test(sqlContent)
      || !/^-- PostgreSQL database dump complete\r?$/m.test(sqlContent)) {
      throw new Error('Only a complete PostgreSQL database dump can replace the database');
    }

    if (/\b(?:CREATE|DROP|ALTER)[ \t]+DATABASE\b/i.test(sqlContent)) {
      throw new Error('The SQL dump must not switch, create, drop, or rename databases');
    }

    const lines = sqlContent.split(/\r?\n/);
    let copyDataActive = false;
    let restrictionToken = null;
    let restrictionClosed = false;
    let restrictLineIndex = -1;
    let unrestrictLineIndex = -1;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const trimmedLine = line.trim();

      if (copyDataActive) {
        if (trimmedLine === '\\.') {
          copyDataActive = false;
          continue;
        }

        if (trimmedLine.startsWith('\\')
          && !trimmedLine.startsWith('\\N\t')
          && trimmedLine !== '\\N'
          && !trimmedLine.startsWith('\\\\')) {
          throw new Error('The SQL dump contains an unsupported psql command');
        }
        continue;
      }

      if (trimmedLine.length === 0 || trimmedLine.startsWith('--')) {
        continue;
      }

      const restrictMatch = trimmedLine.match(/^\\restrict[ \t]+([A-Za-z0-9]{16,128})$/);
      if (restrictMatch) {
        if (restrictionToken || restrictionClosed) {
          throw new Error('The SQL dump contains an invalid psql restriction block');
        }
        restrictionToken = restrictMatch[1];
        restrictLineIndex = lineIndex;
        continue;
      }

      const unrestrictMatch = trimmedLine.match(/^\\unrestrict[ \t]+([A-Za-z0-9]{16,128})$/);
      if (unrestrictMatch) {
        if (!restrictionToken
          || restrictionClosed
          || unrestrictMatch[1] !== restrictionToken) {
          throw new Error('The SQL dump contains an invalid psql restriction block');
        }
        restrictionClosed = true;
        unrestrictLineIndex = lineIndex;
        continue;
      }

      if (!restrictionToken || restrictionClosed) {
        throw new Error('The SQL dump must keep psql restricted for the full restore');
      }

      if (trimmedLine.startsWith('\\')) {
        throw new Error('The SQL dump contains an unsupported psql command');
      }

      if (/^COPY\b.*\bFROM[ \t]+stdin;$/i.test(trimmedLine)) {
        copyDataActive = true;
      }
    }

    if (copyDataActive || !restrictionToken || !restrictionClosed) {
      throw new Error('The SQL dump contains an incomplete psql restriction or COPY block');
    }

    const serverRestrictionToken = randomBytes(32).toString('hex');
    lines[restrictLineIndex] = lines[restrictLineIndex].replace(
      restrictionToken,
      serverRestrictionToken
    );
    lines[unrestrictLineIndex] = lines[unrestrictLineIndex].replace(
      restrictionToken,
      serverRestrictionToken
    );
    return lines.join(sqlContent.includes('\r\n') ? '\r\n' : '\n');
  };

  /**
   * @param {string} databaseName
   * @returns {Promise<void>}
   */
  const validateRestoredDatabase = async (databaseName) => {
    const client = createDatabaseClient(databaseName);
    try {
      await client.connect();
      const { rows: schemaRows } = await client.query(`
        SELECT namespace.nspname AS schema_name
          FROM pg_namespace namespace
         WHERE namespace.nspname <> 'information_schema'
           AND namespace.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
         ORDER BY namespace.nspname
      `);
      const restoredSchemas = schemaRows.map((row) => row.schema_name);
      if (JSON.stringify(restoredSchemas) !== JSON.stringify(REQUIRED_RESTORED_SCHEMAS)) {
        throw new RestoredDatabaseStructureError(
          `The restored database has incompatible schemas: ${restoredSchemas.join(', ')}`
        );
      }

      const { rows: tableCountRows } = await client.query(`
        SELECT tables.table_schema,
               COUNT(*)::integer AS table_count
          FROM information_schema.tables tables
         WHERE tables.table_type = 'BASE TABLE'
           AND tables.table_schema = ANY($1::text[])
         GROUP BY tables.table_schema
      `, [REQUIRED_RESTORED_SCHEMAS]);
      const restoredTableCounts = new Map(
        tableCountRows.map((row) => [row.table_schema, row.table_count])
      );
      for (const [schemaName, minimumCount] of Object.entries(MINIMUM_RESTORED_TABLE_COUNTS)) {
        if ((restoredTableCounts.get(schemaName) || 0) < minimumCount) {
          throw new RestoredDatabaseStructureError(
            `The restored ${schemaName} schema is incomplete`
          );
        }
      }

      const { rows: missingTableRows } = await client.query(`
        SELECT required.name
          FROM UNNEST($1::text[]) AS required(name)
         WHERE TO_REGCLASS(required.name) IS NULL
         ORDER BY required.name
      `, [REQUIRED_RESTORED_TABLES]);
      if (missingTableRows.length > 0) {
        throw new RestoredDatabaseStructureError(
          `The restored database is missing required tables: ${missingTableRows
            .map((row) => row.name)
            .join(', ')}`
        );
      }

      const { rows: columnRows } = await client.query(`
        SELECT CONCAT(
                 columns.table_schema,
                 '.',
                 columns.table_name,
                 '.',
                 columns.column_name
               ) AS name
          FROM information_schema.columns columns
         WHERE columns.table_schema = ANY($1::text[])
      `, [REQUIRED_RESTORED_SCHEMAS]);
      const restoredColumns = new Set(columnRows.map((row) => row.name));
      const missingColumns = REQUIRED_RESTORED_COLUMNS.filter(
        (columnName) => !restoredColumns.has(columnName)
      );
      if (missingColumns.length > 0) {
        throw new RestoredDatabaseStructureError(
          `The restored database is missing required columns: ${missingColumns.join(', ')}`
        );
      }

      const { rows: integrityRows } = await client.query(`
        SELECT
          TO_REGCLASS('public.account_codes_hierarchy') IS NOT NULL
            AND (
              SELECT class.relkind = 'v'
                FROM pg_class class
               WHERE class.oid = TO_REGCLASS('public.account_codes_hierarchy')
            ) AS has_account_hierarchy_view,
          (
            SELECT COUNT(*)::integer
              FROM pg_constraint constraint_record
              JOIN pg_namespace namespace
                ON namespace.oid = constraint_record.connamespace
             WHERE namespace.nspname = ANY($1::text[])
               AND NOT constraint_record.convalidated
          ) AS unvalidated_constraints,
          (
            SELECT COUNT(*)::integer
              FROM pg_index index_record
              JOIN pg_class class ON class.oid = index_record.indexrelid
              JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
             WHERE namespace.nspname = ANY($1::text[])
               AND (NOT index_record.indisvalid OR NOT index_record.indisready)
          ) AS invalid_indexes
      `, [REQUIRED_RESTORED_SCHEMAS]);
      const integrity = integrityRows[0];
      if (!integrity?.has_account_hierarchy_view
        || integrity.unvalidated_constraints !== 0
        || integrity.invalid_indexes !== 0) {
        throw new RestoredDatabaseStructureError(
          'The restored database has an incomplete view, constraint, or index structure'
        );
      }
    } finally {
      await client.end().catch(() => {});
    }
  };

  /**
   * Rejects privileged or externally connected objects before ownership is
   * transferred from the restricted loader to the application superuser.
   * Uploaded SQL remains a trusted-local development input; this gate prevents
   * common privilege-escalation and partial-dump hazards.
   * @param {string} databaseName
   * @returns {Promise<void>}
   */
  const hardenRestoredDatabase = async (databaseName) => {
    const client = createDatabaseClient(databaseName);
    try {
      await client.connect();
      const { rows: unsafeRows } = await client.query(`
        SELECT
          (
            SELECT COUNT(*)::integer
              FROM pg_proc routine
              JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
              JOIN pg_language language ON language.oid = routine.prolang
             WHERE namespace.nspname = ANY($1::text[])
               AND (
                 routine.prosecdef
                 OR routine.proleakproof
                 OR NOT language.lanpltrusted
               )
          ) AS unsafe_routines,
          (SELECT COUNT(*)::integer FROM pg_event_trigger) AS event_triggers,
          (
            SELECT COUNT(*)::integer
              FROM pg_rewrite rewrite
              JOIN pg_class class ON class.oid = rewrite.ev_class
              JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
             WHERE namespace.nspname = ANY($1::text[])
               AND rewrite.rulename <> '_RETURN'
          ) AS custom_rules,
          (SELECT COUNT(*)::integer FROM pg_default_acl) AS default_privileges,
          (
            SELECT COUNT(*)::integer
              FROM pg_class class
              JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
             WHERE namespace.nspname = ANY($1::text[])
               AND (class.relrowsecurity OR class.relforcerowsecurity)
          ) AS row_security_tables,
          (
            SELECT COUNT(*)::integer
              FROM pg_extension extension
             WHERE extension.extname <> 'plpgsql'
          ) AS unexpected_extensions
      `, [REQUIRED_RESTORED_SCHEMAS]);
      const unsafe = unsafeRows[0];
      if (!unsafe
        || unsafe.unsafe_routines !== 0
        || unsafe.event_triggers !== 0
        || unsafe.custom_rules !== 0
        || unsafe.default_privileges !== 0
        || unsafe.row_security_tables !== 0
        || unsafe.unexpected_extensions !== 0) {
        throw new RestoredDatabaseStructureError(
          'The SQL dump contains privileged or unsupported database objects'
        );
      }

      const { rows: specialRelationRows } = await client.query(`
        SELECT namespace.nspname AS schema_name,
               class.relname,
               class.relkind
          FROM pg_class class
          JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
         WHERE namespace.nspname = ANY($1::text[])
           AND class.relkind IN ('v', 'm', 'f')
         ORDER BY namespace.nspname, class.relname
      `, [REQUIRED_RESTORED_SCHEMAS]);
      if (specialRelationRows.length !== 1
        || specialRelationRows[0].schema_name !== 'public'
        || specialRelationRows[0].relname !== 'account_codes_hierarchy'
        || specialRelationRows[0].relkind !== 'v') {
        throw new RestoredDatabaseStructureError(
          'The SQL dump contains an unexpected view, materialized view, or foreign table'
        );
      }

      await client.query(`
        ALTER VIEW public.account_codes_hierarchy
        SET (security_invoker = true)
      `);
    } finally {
      await client.end().catch(() => {});
    }
  };

  /**
   * @param {pg.Client} adminClient
   * @param {string} databaseName
   * @returns {Promise<void>}
   */
  const terminateDatabaseConnections = async (adminClient, databaseName) => {
    await adminClient.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()`,
      [databaseName]
    );
  };

  /**
   * Repairs the catalog states left by a process interruption during the
   * development-only database rename sequence.
   * @returns {Promise<boolean>} Whether interrupted replacement state was found.
   */
  const recoverInterruptedDatabaseReplacement = async () => {
    if (!isSqlReplacementEnabled) return false;

    const previousPattern = createRestoreNamePattern('previous');
    const stagePattern = createRestoreNamePattern('restore');
    const rolePattern = createRestoreNamePattern('loader');
    const adminClient = createDatabaseClient('postgres');
    let recoveryNeeded = false;

    try {
      await adminClient.connect();
      await adminClient.query(
        'SELECT pg_advisory_lock(hashtextextended($1, 0))',
        [`database_sql_replacement:${DB_NAME}`]
      );
      try {
        await cleanupStaleUploadedSqlFiles();
      } catch (cleanupError) {
        console.warn('[Upload SQL] Failed to remove a stale plaintext upload:', cleanupError);
      }
      const { rows: databaseRows } = await adminClient.query(`
        SELECT datname, datallowconn
          FROM pg_database
         WHERE NOT datistemplate
      `);
      const { rows: roleRows } = await adminClient.query(`
        SELECT rolname
          FROM pg_roles
      `);

      let liveDatabase = databaseRows.find((row) => row.datname === DB_NAME) || null;
      const previousDatabases = databaseRows
        .map((row) => row.datname)
        .filter((name) => previousPattern.test(name))
        .sort()
        .reverse();
      const stageDatabases = databaseRows
        .map((row) => row.datname)
        .filter((name) => stagePattern.test(name))
        .sort()
        .reverse();
      const restoreRoles = roleRows
        .map((row) => row.rolname)
        .filter((name) => rolePattern.test(name));

      recoveryNeeded = !liveDatabase
        || !liveDatabase.datallowconn
        || previousDatabases.length > 0
        || stageDatabases.length > 0
        || restoreRoles.length > 0;

      if (previousDatabases.length > 1) {
        throw new Error('Multiple previous databases were found; automatic recovery is ambiguous');
      }

      if (!recoveryNeeded) {
        return false;
      }

      console.warn('[Upload SQL] Recovering an interrupted database replacement');
      pool.pool.maintenanceMode = true;
      restoreState = {
        status: 'RESTORING',
        phase: 'RECOVERY',
        startTime: Date.now(),
        message: null,
      };

      if (!liveDatabase) {
        const previousDatabase = previousDatabases.shift();
        if (!previousDatabase) {
          throw new Error('The live database is missing and no previous database is available');
        }

        await adminClient.query(
          `ALTER DATABASE ${quoteIdentifier(previousDatabase)} RENAME TO ${quoteIdentifier(DB_NAME)}`
        );
        await adminClient.query(
          `ALTER DATABASE ${quoteIdentifier(DB_NAME)} WITH ALLOW_CONNECTIONS true`
        );
        liveDatabase = { datname: DB_NAME, datallowconn: true };
      } else if (!liveDatabase.datallowconn) {
        await adminClient.query(
          `ALTER DATABASE ${quoteIdentifier(DB_NAME)} WITH ALLOW_CONNECTIONS true`
        );
        liveDatabase.datallowconn = true;
      }

      try {
        await validateRestoredDatabase(DB_NAME);
      } catch (validationError) {
        if (!(validationError instanceof RestoredDatabaseStructureError)) {
          throw validationError;
        }

        const previousDatabase = previousDatabases.shift();
        if (!previousDatabase) throw validationError;

        const rejectedDatabase = createRestoreDatabaseName(
          'restore',
          `${Date.now()}_${randomBytes(4).toString('hex')}`
        );
        await adminClient.query(
          `ALTER DATABASE ${quoteIdentifier(DB_NAME)} WITH ALLOW_CONNECTIONS false`
        );
        await terminateDatabaseConnections(adminClient, DB_NAME);
        await adminClient.query(
          `ALTER DATABASE ${quoteIdentifier(DB_NAME)} RENAME TO ${quoteIdentifier(rejectedDatabase)}`
        );
        await adminClient.query(
          `ALTER DATABASE ${quoteIdentifier(previousDatabase)} RENAME TO ${quoteIdentifier(DB_NAME)}`
        );
        await adminClient.query(
          `ALTER DATABASE ${quoteIdentifier(DB_NAME)} WITH ALLOW_CONNECTIONS true`
        );
        stageDatabases.push(rejectedDatabase);
        await validateRestoredDatabase(DB_NAME);
      }

      const cleanupWarnings = [];
      for (const databaseName of [...stageDatabases, ...previousDatabases]) {
        try {
          await adminClient.query(
            `ALTER DATABASE ${quoteIdentifier(databaseName)} WITH ALLOW_CONNECTIONS false`
          );
          await terminateDatabaseConnections(adminClient, databaseName);
          await adminClient.query(
            `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`
          );
        } catch (cleanupError) {
          cleanupWarnings.push(databaseName);
          console.warn(`Could not remove recovered database ${databaseName}:`, cleanupError);
        }
      }

      for (const roleName of restoreRoles) {
        await adminClient.query(`ALTER ROLE ${quoteIdentifier(roleName)} NOLOGIN`);
        await adminClient.query(
          `SELECT pg_terminate_backend(pid)
             FROM pg_stat_activity
            WHERE usename = $1
              AND pid <> pg_backend_pid()`,
          [roleName]
        );
        await adminClient.query(`DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`);
      }

      pool.pool.maintenanceMode = false;
      restoreState = {
        status: 'COMPLETED',
        phase: 'RECOVERED',
        startTime: null,
        message: cleanupWarnings.length > 0
          ? `Database recovered, but cleanup is still required for: ${cleanupWarnings.join(', ')}`
          : 'Database recovery completed after an interrupted replacement. Confirm the active data before continuing.',
      };
      console.warn('[Upload SQL] Interrupted database replacement recovered');
      return true;
    } catch (error) {
      if (recoveryNeeded) {
        pool.pool.maintenanceMode = true;
        restoreState = {
          status: 'FAILED',
          phase: 'RECOVERY_FAILED',
          startTime: null,
          message: 'An interrupted database replacement could not be recovered automatically. Maintenance mode remains active.',
        };
      }
      throw error;
    } finally {
      await adminClient.end().catch(() => {});
    }
  };

  /** @type {Promise<boolean> | null} */
  let replacementRecoveryPromise = null;

  /**
   * @returns {Promise<void>}
   */
  const ensureDatabaseReplacementRecovered = async () => {
    if (!isSqlReplacementEnabled) return;
    if (replacementRecoveryPromise) {
      await replacementRecoveryPromise;
      return;
    }
    if (restoreState.status === 'RESTORING') return;

    const recoveryPromise = recoverInterruptedDatabaseReplacement();
    replacementRecoveryPromise = recoveryPromise;
    try {
      await recoveryPromise;
    } finally {
      if (replacementRecoveryPromise === recoveryPromise) {
        replacementRecoveryPromise = null;
      }
    }
  };

  /**
   * @param {string} backupPath
   * @returns {Promise<boolean>}
   */
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

  /**
   * @param {string} sqlPath
   * @returns {Promise<boolean>}
   */
  async function restoreSqlFile(sqlPath) {
    if (!isSqlReplacementEnabled) {
      throw new Error('SQL database replacement is only available in development');
    }

    const dbHost = shouldUseDockerExec() ? 'localhost' : DB_HOST;
    const dbPort = shouldUseDockerExec() ? '5432' : DB_PORT;
    const restoreId = `${Date.now()}_${randomBytes(4).toString('hex')}`;
    const stageDatabase = createRestoreDatabaseName('restore', restoreId);
    const previousDatabase = createRestoreDatabaseName('previous', restoreId);
    const restoreRole = createRestoreDatabaseName('loader', restoreId);
    const restorePassword = randomBytes(32).toString('hex');
    const restoreRoleExpiry = new Date(Date.now() + (15 * 60 * 1000)).toISOString();
    let adminClient = null;
    let stageCreated = false;
    let restoreRoleCreated = false;
    let liveConnectionsDisabled = false;
    let previousDatabaseAvailable = false;
    let stagePromoted = false;
    let recoveryFailed = false;

    try {
      restoreState = {
        status: 'RESTORING',
        phase: 'INITIALIZATION',
        startTime: restoreState.startTime || Date.now(),
        message: null,
      };

      pool.pool.maintenanceMode = true;

      adminClient = createDatabaseClient('postgres');
      await adminClient.connect();
      await adminClient.query(
        'SELECT pg_advisory_lock(hashtextextended($1, 0))',
        [`database_sql_replacement:${DB_NAME}`]
      );
      const { rows: adminRoleRows } = await adminClient.query(
        'SELECT rolsuper FROM pg_roles WHERE rolname = $1',
        [DB_USER]
      );
      if (adminRoleRows.length !== 1 || !adminRoleRows[0].rolsuper) {
        throw new Error('SQL database replacement requires a superuser DB_USER in development');
      }
      await adminClient.query(
        `CREATE ROLE ${quoteIdentifier(restoreRole)}
           WITH LOGIN PASSWORD '${restorePassword}'
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
           NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1
           VALID UNTIL '${restoreRoleExpiry}'`
      );
      restoreRoleCreated = true;
      await adminClient.query(
        `CREATE DATABASE ${quoteIdentifier(stageDatabase)}
           WITH TEMPLATE template0 OWNER ${quoteIdentifier(restoreRole)}`
      );
      stageCreated = true;

      restoreState.phase = 'DATABASE_VALIDATION';
      await runPostgresTool('psql', [
        '--no-psqlrc',
        '--host', dbHost,
        '--port', String(dbPort),
        '--username', restoreRole,
        '--dbname', stageDatabase,
        '--set', 'ON_ERROR_STOP=1',
        '--single-transaction',
        '--file', sqlPath,
      ], restorePassword);
      await adminClient.query(`ALTER ROLE ${quoteIdentifier(restoreRole)} NOLOGIN`);
      await adminClient.query(
        `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
          WHERE usename = $1
            AND pid <> pg_backend_pid()`,
        [restoreRole]
      );
      await validateRestoredDatabase(stageDatabase);
      await hardenRestoredDatabase(stageDatabase);

      const ownershipClient = createDatabaseClient(stageDatabase);
      try {
        await ownershipClient.connect();
        await ownershipClient.query(
          `REASSIGN OWNED BY ${quoteIdentifier(restoreRole)} TO ${quoteIdentifier(DB_USER)}`
        );
        await ownershipClient.query(
          `DROP OWNED BY ${quoteIdentifier(restoreRole)}`
        );
      } finally {
        await ownershipClient.end().catch(() => {});
      }
      await adminClient.query(
        `ALTER DATABASE ${quoteIdentifier(stageDatabase)} OWNER TO ${quoteIdentifier(DB_USER)}`
      );
      await adminClient.query(`DROP ROLE ${quoteIdentifier(restoreRole)}`);
      restoreRoleCreated = false;

      restoreState.phase = 'DATABASE_REPLACE';
      await adminClient.query(
        `ALTER DATABASE ${quoteIdentifier(stageDatabase)} WITH ALLOW_CONNECTIONS false`
      );
      await terminateDatabaseConnections(adminClient, stageDatabase);
      await adminClient.query(
        `ALTER DATABASE ${quoteIdentifier(DB_NAME)} WITH ALLOW_CONNECTIONS false`
      );
      liveConnectionsDisabled = true;
      await terminateDatabaseConnections(adminClient, DB_NAME);
      await adminClient.query(
        `ALTER DATABASE ${quoteIdentifier(DB_NAME)} RENAME TO ${quoteIdentifier(previousDatabase)}`
      );
      previousDatabaseAvailable = true;
      await adminClient.query(
        `ALTER DATABASE ${quoteIdentifier(stageDatabase)} RENAME TO ${quoteIdentifier(DB_NAME)}`
      );
      stagePromoted = true;
      stageCreated = false;
      await adminClient.query(
        `ALTER DATABASE ${quoteIdentifier(DB_NAME)} WITH ALLOW_CONNECTIONS true`
      );
      liveConnectionsDisabled = false;
      await validateRestoredDatabase(DB_NAME);

      restoreState.phase = 'CLEANUP';
      let cleanupWarning = null;
      try {
        await adminClient.query(
          `DROP DATABASE ${quoteIdentifier(previousDatabase)} WITH (FORCE)`
        );
        previousDatabaseAvailable = false;
      } catch (error) {
        console.warn(`Replacement succeeded but old database ${previousDatabase} could not be removed:`, error);
        cleanupWarning = 'Database replaced, but the previous database could not be removed. Cleanup will be retried after the server restarts.';
      }

      pool.pool.maintenanceMode = false;
      restoreState = {
        status: 'COMPLETED',
        phase: 'COMPLETED',
        startTime: null,
        message: cleanupWarning,
      };

      return true;
    } catch (error) {
      console.error('Error in restoreSqlFile:', error);
      if (liveConnectionsDisabled || previousDatabaseAvailable || stagePromoted) {
        try {
          if (!adminClient) {
            throw new Error('The lock-owning database connection is unavailable for recovery');
          }

          if (stagePromoted) {
            await adminClient.query(
              `ALTER DATABASE ${quoteIdentifier(DB_NAME)} WITH ALLOW_CONNECTIONS false`
            );
            await terminateDatabaseConnections(adminClient, DB_NAME);
            await adminClient.query(
              `ALTER DATABASE ${quoteIdentifier(DB_NAME)} RENAME TO ${quoteIdentifier(stageDatabase)}`
            );
            stagePromoted = false;
            stageCreated = true;
          }

          if (previousDatabaseAvailable) {
            await adminClient.query(
              `ALTER DATABASE ${quoteIdentifier(previousDatabase)} RENAME TO ${quoteIdentifier(DB_NAME)}`
            );
            previousDatabaseAvailable = false;
          }

          await adminClient.query(
            `ALTER DATABASE ${quoteIdentifier(DB_NAME)} WITH ALLOW_CONNECTIONS true`
          );
          liveConnectionsDisabled = false;
          await validateRestoredDatabase(DB_NAME);
        } catch (recoveryError) {
          recoveryFailed = true;
          console.error('Failed to restore the original database after replacement error:', recoveryError);
        }
      }

      if (!recoveryFailed) {
        pool.pool.maintenanceMode = false;
      }
      restoreState = {
        status: 'FAILED',
        phase: 'FAILED',
        startTime: null,
        message: recoveryFailed
          ? 'Database replacement failed and automatic recovery also failed. Maintenance mode remains active.'
          : 'Database replacement failed. The existing database was preserved.',
      };

      throw error;
    } finally {
      if (stageCreated && !recoveryFailed) {
        try {
          if (!adminClient) {
            adminClient = createDatabaseClient('postgres');
            await adminClient.connect();
          }
          await adminClient.query(
            `DROP DATABASE IF EXISTS ${quoteIdentifier(stageDatabase)} WITH (FORCE)`
          );
        } catch (cleanupError) {
          console.warn(`Failed to remove staging database ${stageDatabase}:`, cleanupError);
        }
      }

      if (restoreRoleCreated && !recoveryFailed) {
        try {
          if (!adminClient) {
            adminClient = createDatabaseClient('postgres');
            await adminClient.connect();
          }
          await adminClient.query(`DROP ROLE IF EXISTS ${quoteIdentifier(restoreRole)}`);
          restoreRoleCreated = false;
        } catch (cleanupError) {
          console.warn(`Failed to remove temporary restore role ${restoreRole}:`, cleanupError);
        }
      }

      if (adminClient) {
        await adminClient.end().catch(() => {});
      }
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

      // Upload to S3 and delete local file after success.
      // When S3 is the backup store, /list reads from S3 — so await the upload
      // before responding, otherwise the frontend's immediate refresh runs
      // before the upload finishes and the new backup is missing until a manual
      // refresh. When S3 is disabled (dev), the local pg_dump file already
      // exists, so keep the upload fire-and-forget.
      if (isS3BackupEnabled()) {
        try {
          const uploaded = await uploadBackupToS3(backupPath, backupFilename, env);
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
        } catch (err) {
          console.warn(`[S3 Backup] Skipped or failed: ${err.message}`);
        }
      }

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

    restoreState = {
      status: 'RESTORING',
      phase: 'INITIALIZATION',
      startTime: Date.now(),
      message: null,
    };
    pool.pool.maintenanceMode = true;

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
      if (restoreState.status !== 'FAILED') {
        restoreState = {
          status: 'FAILED',
          phase: 'FAILED',
          startTime: null,
          message: 'Database restore failed before it could complete.',
        };
      }
    }
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

    if (restoreState.status === 'RESTORING') {
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
    restoreState = {
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
      if (restoreState.status !== 'FAILED') {
        pool.pool.maintenanceMode = false;
        restoreState = {
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
          restoreState = {
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
