// Shared development replacement engine. Importing this module never starts the server.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { DB_NAME, DB_USER, DB_HOST, DB_PASSWORD, DB_PORT, NODE_ENV } from '../configs/config.js';

const { Client } = pg;

class RestoredDatabaseStructureError extends Error {}

const REQUIRED_RESTORED_SCHEMAS = ['greentarget', 'jellypolly', 'public'];

const MINIMUM_RESTORED_TABLE_COUNTS = {
  public: 90,
  greentarget: 30,
  jellypolly: 35,
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
  'jellypolly.debtor_opening_balances',
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
  'jellypolly.debtor_opening_balances.id',
  'jellypolly.debtor_opening_balances.customer_id',
  'jellypolly.debtor_opening_balances.as_of_date',
  'jellypolly.debtor_opening_balances.amount',
  'jellypolly.debtor_opening_balances.notes',
  'jellypolly.debtor_opening_balances.created_at',
  'jellypolly.debtor_opening_balances.updated_at',
  'jellypolly.debtor_opening_balances.created_by',
  'jellypolly.debtor_opening_balances.updated_by',
  'jellypolly.invoices.id',
  'jellypolly.payments.invoice_id',
];

const RESTORE_PROCESS_TIMEOUT_MS = 15 * 60 * 1000;
const STALE_UPLOAD_MINIMUM_AGE_MS = RESTORE_PROCESS_TIMEOUT_MS + (60 * 1000);
export const STALE_UPLOAD_CLEANUP_DELAY_MS = STALE_UPLOAD_MINIMUM_AGE_MS + (2 * 60 * 1000);

/**
 * @typedef {{status: string, phase: string|null, startTime: number|null, message?: string|null}} RestoreState
 * @typedef {{pool: {maintenanceMode?: boolean}}} MaintenancePool
 * @typedef {{state: RestoreState,
 * runProcess: (command: string, args: string[], options?: {env?: NodeJS.ProcessEnv, input?: string, timeoutMs?: number}) => Promise<void>,
 * runPostgresTool: (tool: string, args: string[], password?: string) => Promise<void>,
 * writeUploadedSqlFile: (filePath: string, sqlContent: string) => Promise<void>,
 * removeUploadedSqlFile: (filePath: string) => Promise<void>,
 * validateSqlReplacement: (sqlContent: string) => string,
 * validateRestoredDatabase: (databaseName: string) => Promise<void>,
 * restoreSqlFile: (sqlPath: string) => Promise<boolean>,
 * restoreArchiveFile: (archivePath: string) => Promise<boolean>,
 * recoverInterruptedDatabaseReplacement: () => Promise<boolean>,
 * ensureDatabaseReplacementRecovered: () => Promise<void>}} DevelopmentDatabaseReplacement
 */

/**
 * The HTTP route supplies its real pool; the standalone launcher only needs
 * the maintenance flag. Connections for restoration are always independent.
 * @param {MaintenancePool} pool
 * @param {{beforePromote?: () => Promise<void>}} [options]
 * @returns {DevelopmentDatabaseReplacement}
 */
export function createDevelopmentDatabaseReplacement(pool, options = {}) {
  const env = NODE_ENV || 'development';
  const isSqlReplacementEnabled = NODE_ENV === 'development'
    && (process.platform === 'win32' || process.platform === 'darwin');
  const backupDir = '/var/backups/postgres';
  /** @returns {string} */
  const getContainerName = () => env === 'production' ? 'tienhock_prod_db' : 'tienhock_dev_db';
  /** @returns {boolean} */
  const shouldUseDockerExec = () => process.platform === 'win32' || process.platform === 'darwin';
  /** @type {number|null} */
  let restoreDeadline = null;

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
    statement_timeout: 60000,
    lock_timeout: 10000,
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
    let settled = false;

    // PostgreSQL COPY errors may include business data. Drain, but never log it.
    child.stderr.resume();

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
      reject(new Error(`${command} failed with ${reason}`));
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
    /** @type {number} */
    const timeoutMs = restoreDeadline === null ? RESTORE_PROCESS_TIMEOUT_MS : restoreDeadline - Date.now();
    if (timeoutMs <= 0) throw new Error('Database replacement timed out');
    if (shouldUseDockerExec()) {
      await runProcess('docker', [
        'exec',
        '--env',
        'PGPASSWORD',
        getContainerName(),
        tool,
        ...args,
      ], { env: { ...process.env, PGPASSWORD: password }, timeoutMs });
      return;
    }

    await runProcess(tool, args, {
      env: { ...process.env, PGPASSWORD: password },
      timeoutMs,
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

  // Track restore state globally
  /** @type {RestoreState} */
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
            )
            AND TO_REGCLASS('greentarget.account_codes_hierarchy') IS NOT NULL
            AND (
              SELECT class.relkind = 'v'
                FROM pg_class class
               WHERE class.oid = TO_REGCLASS('greentarget.account_codes_hierarchy')
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
      const expectedViews = [
        'greentarget.account_codes_hierarchy',
        'public.account_codes_hierarchy',
      ];
      if (specialRelationRows.length !== expectedViews.length
        || !specialRelationRows.every((row, index) =>
          row.relkind === 'v'
          && `${row.schema_name}.${row.relname}` === expectedViews[index])) {
        throw new RestoredDatabaseStructureError(
          'The SQL dump contains an unexpected view, materialized view, or foreign table'
        );
      }

      await client.query(`
        ALTER VIEW public.account_codes_hierarchy
        SET (security_invoker = true)
      `);
      await client.query(`
        ALTER VIEW greentarget.account_codes_hierarchy
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
   * @param {string} filePath
   * @param {'sql'|'archive'} format
   * @returns {Promise<boolean>}
   */
  async function restoreDatabaseFile(filePath, format) {
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
      restoreDeadline = Date.now() + RESTORE_PROCESS_TIMEOUT_MS;
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
      if (format === 'archive') {
        await runPostgresTool('pg_restore', [
          '--host', dbHost, '--port', String(dbPort), '--username', restoreRole,
          '--dbname', stageDatabase, '--clean', '--if-exists', '--no-owner',
          '--no-privileges', '--single-transaction', '--exit-on-error', filePath,
        ], restorePassword);
      } else {
        await runPostgresTool('psql', [
          '--no-psqlrc',
          '--host', dbHost,
          '--port', String(dbPort),
          '--username', restoreRole,
          '--dbname', stageDatabase,
          '--set', 'ON_ERROR_STOP=1',
          '--single-transaction',
          '--file', filePath,
        ], restorePassword);
      }
      // Clear sessions as the restricted loader, before using the admin connection
      // on the restored objects. Triggers in a trusted older dump stay unprivileged.
      await runPostgresTool('psql', [
        '--no-psqlrc', '--host', dbHost, '--port', String(dbPort), '--username', restoreRole,
        '--dbname', stageDatabase, '--set', 'ON_ERROR_STOP=1',
        '--command', 'DELETE FROM public.active_sessions',
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

      await options.beforePromote?.();
      if (Date.now() >= restoreDeadline) throw new Error('Database replacement timed out before promotion');
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
      restoreDeadline = null;
      console.error('Error in database replacement:', error);
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
      restoreDeadline = null;
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

  /** @param {string} sqlPath @returns {Promise<boolean>} */
  const restoreSqlFile = (sqlPath) => restoreDatabaseFile(sqlPath, 'sql');
  /** @param {string} archivePath @returns {Promise<boolean>} */
  const restoreArchiveFile = (archivePath) => restoreDatabaseFile(archivePath, 'archive');

  return {
    /** @returns {RestoreState} */
    get state() { return restoreState; },
    /** @param {RestoreState} value */
    set state(value) { restoreState = value; },
    runProcess, runPostgresTool, writeUploadedSqlFile, removeUploadedSqlFile,
    validateSqlReplacement, validateRestoredDatabase, restoreSqlFile, restoreArchiveFile,
    recoverInterruptedDatabaseReplacement, ensureDatabaseReplacementRecovered,
  };
}
