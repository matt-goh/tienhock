#!/usr/bin/env node
/**
 * Green Target Phase G4 - hash-validated staging load.
 *
 * Loads generated/greentarget_import_staging.csv into
 * greentarget.import_legacy_rows inside ONE transaction, and refuses to commit
 * unless the loaded population is exactly the approved one.
 *
 * The CSV is the G0 staging (3,469 transcribed rows, verbatim) plus the 1,434
 * user-approved DERIVED CD_SD rows - see build-import-staging.mjs for why they
 * exist and why the derivation is forced rather than chosen.
 *
 * Prerequisites, in order:
 *   1. dev/migrations/2026-07-26_greentarget_accounting_foundation.sql   (G2)
 *   2. dev/migrations/2026-07-26_greentarget_chart_of_accounts.sql       (G3)
 *   3. dev/migrations/2026-07-27_greentarget_import_date_encoding.sql    (G4)
 *   4. node dev/import/greentarget-legacy/build-import-staging.mjs       (G4)
 *
 * Usage
 *   node dev/import/greentarget-legacy/load-staging.mjs
 *   node dev/import/greentarget-legacy/load-staging.mjs --csv PATH
 *
 * Environment (defaults target the dev container from CLAUDE.md rule 12):
 *   GT_IMPORT_DB_MODE=docker|direct   GT_IMPORT_DB_CONTAINER   DB_NAME
 *   DB_USER   DB_HOST   DB_PORT   DB_PASSWORD   PSQL_BIN
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV = path.join(HERE, "generated", "greentarget_import_staging.csv");
const REPORT = path.join(HERE, "generated", "import-derivation-report.json");

/**
 * @param {string[]} args
 * @returns {{ csvPath: string }}
 */
function parseArguments(args) {
  if (args.length === 0) return { csvPath: DEFAULT_CSV };
  if (args.length === 2 && args[0] === "--csv") return { csvPath: path.resolve(args[1]) };
  throw new Error("Usage: node load-staging.mjs [--csv PATH]");
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", reject);
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

const copyCommand = String.raw`\copy greentarget.import_legacy_rows (
  stage_sequence, record_kind, source_file, source_kind, source_sha256,
  source_physical_line, source_row_index, injected_after_physical_line,
  legacy_account_code, account_code, account_description, entry_date,
  date_encoding, journal_ref, journal_group_key, line_display_reference,
  particulars, cheque_reference, debit_cents, credit_cents,
  running_balance_cents, provenance, repaired, repair_reason, special_case
) FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')`;

const validationSql = String.raw`
DO $validation$
DECLARE
  v_total bigint;
  v_opening bigint;
  v_transaction bigint;
  v_derived bigint;
  v_groups bigint;
  v_debit numeric;
  v_credit numeric;
  v_min_sequence integer;
  v_max_sequence integer;
  v_missing text;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE record_kind = 'opening'),
         COUNT(*) FILTER (WHERE record_kind = 'transaction'),
         COUNT(*) FILTER (WHERE source_kind = 'DERIVED'),
         COUNT(DISTINCT journal_group_key) FILTER (WHERE record_kind = 'transaction'),
         COALESCE(SUM(debit_cents)  FILTER (WHERE record_kind = 'transaction'), 0),
         COALESCE(SUM(credit_cents) FILTER (WHERE record_kind = 'transaction'), 0),
         MIN(stage_sequence),
         MAX(stage_sequence)
    INTO v_total, v_opening, v_transaction, v_derived, v_groups,
         v_debit, v_credit, v_min_sequence, v_max_sequence
    FROM greentarget.import_legacy_rows;

  IF (v_total, v_opening, v_transaction, v_derived, v_groups,
      v_debit, v_credit, v_min_sequence, v_max_sequence)
     IS DISTINCT FROM
     (4903::bigint, 502::bigint, 4401::bigint, 1434::bigint, 1705::bigint,
      94766514::numeric, 94766514::numeric, 1::integer, 11433::integer) THEN
    RAISE EXCEPTION
      'Unexpected staging population: total %, openings %, transactions %, derived %, groups %, DR %, CR %, sequence %..%',
      v_total, v_opening, v_transaction, v_derived, v_groups,
      v_debit, v_credit, v_min_sequence, v_max_sequence;
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE source_sha256 NOT IN (
       '71e32a0189c34fa75f404ca6a702662963c4bd508997da1359cc35e0a62e3f01',
       'fa735c756748e74601605ed479ead44f461ee468a53f99c070857f1c4bf9ab6b'
     )
  ) THEN
    RAISE EXCEPTION 'Staging contains a row from an unapproved source workbook';
  END IF;

  -- Every date must have a recorded recovery branch (handover section 3a).
  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows WHERE date_encoding IS NULL
  ) THEN
    RAISE EXCEPTION 'A staged row carries no date_encoding';
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE entry_date < DATE '2026-01-01' OR entry_date > DATE '2026-06-30'
  ) THEN
    RAISE EXCEPTION 'A staged entry_date falls outside 2026-01-01..2026-06-30';
  END IF;

  -- Derived rows must be unmistakable and confined to the approved account.
  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE source_kind = 'DERIVED'
       AND (account_code <> 'CD_SD'
         OR date_encoding <> 'derived'
         OR provenance <> 'derived_cash_debtors_leg'
         OR special_case <> 'cd_sd_unbanked_counter_cash'
         OR NOT repaired
         OR repair_reason IS NULL
         OR source_physical_line IS NOT NULL
         OR injected_after_physical_line IS NULL)
  ) THEN
    RAISE EXCEPTION 'A DERIVED staging row is not a fully-marked CD_SD cash leg';
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE source_kind <> 'DERIVED'
       AND (provenance <> 'source' OR repaired OR date_encoding = 'derived')
  ) THEN
    RAISE EXCEPTION 'A transcribed source row is marked derived or repaired';
  END IF;

  -- After derivation, EVERY journal group balances. This is the invariant the
  -- whole phase turns on.
  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE record_kind = 'transaction'
     GROUP BY journal_group_key
    HAVING SUM(debit_cents) <> SUM(credit_cents)
  ) THEN
    RAISE EXCEPTION 'Staging contains an unbalanced journal group';
  END IF;

  -- Green Target's opening set balances to EXACTLY zero - no named residue.
  IF (SELECT COALESCE(SUM(running_balance_cents), 0)
        FROM greentarget.import_legacy_rows
       WHERE record_kind = 'opening') <> 0 THEN
    RAISE EXCEPTION 'The staged opening set does not balance to exactly zero: % cents',
      (SELECT SUM(running_balance_cents) FROM greentarget.import_legacy_rows
        WHERE record_kind = 'opening');
  END IF;

  -- Every account a journal line or anchor will reference must already exist
  -- in the G3 chart. If one does not, the chart is wrong - do NOT add an
  -- account to make a journal fit.
  SELECT string_agg(missing.account_code, ', ' ORDER BY missing.account_code)
    INTO v_missing
    FROM (
      SELECT DISTINCT staged.account_code
        FROM greentarget.import_legacy_rows staged
        LEFT JOIN greentarget.account_codes accounts
          ON accounts.code = staged.account_code
       WHERE accounts.code IS NULL
          OR accounts.is_active IS DISTINCT FROM true
          OR accounts.fs_note IS NULL
    ) missing;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Staged account codes missing, inactive or unmapped in the G3 chart: %', v_missing;
  END IF;

  -- DEBTOR is a control parent; BTFS prints blank/blank. Neither may appear.
  IF EXISTS (
    SELECT 1 FROM greentarget.import_legacy_rows
     WHERE account_code IN ('DEBTOR', 'BTFS')
  ) THEN
    RAISE EXCEPTION 'DEBTOR or BTFS appears in staging';
  END IF;
END
$validation$;
`;

const summarySql = String.raw`
SELECT record_kind,
       source_kind,
       COUNT(*) AS rows,
       COUNT(DISTINCT journal_group_key) AS journal_groups,
       SUM(debit_cents) AS debit_cents,
       SUM(credit_cents) AS credit_cents
  FROM greentarget.import_legacy_rows
 GROUP BY record_kind, source_kind
 ORDER BY record_kind, source_kind;

SELECT date_encoding, COUNT(*) AS rows
  FROM greentarget.import_legacy_rows
 GROUP BY date_encoding
 ORDER BY date_encoding;
`;

/**
 * @param {string} csvPath
 * @returns {Promise<void>}
 */
function loadCsv(csvPath) {
  /** @type {string} */
  const databaseMode = process.env.GT_IMPORT_DB_MODE || "docker";
  /** @type {string} */
  const container = process.env.GT_IMPORT_DB_CONTAINER || "tienhock_dev_db";
  /** @type {string} */
  const database = process.env.DB_NAME || "tienhock";
  /** @type {string} */
  const databaseUser = process.env.DB_USER || "postgres";
  /** @type {string[]} */
  const psqlOperationArgs = [
    "--set",
    "ON_ERROR_STOP=1",
    "--single-transaction",
    "--command",
    "TRUNCATE TABLE greentarget.import_legacy_rows",
    "--command",
    copyCommand,
    "--command",
    validationSql,
    "--command",
    summarySql,
  ];

  /** @type {string} */
  let command;
  /** @type {string[]} */
  let commandArgs;
  /** @type {NodeJS.ProcessEnv} */
  let childEnvironment = process.env;

  if (databaseMode === "docker") {
    command = "docker";
    commandArgs = [
      "exec",
      "-i",
      container,
      "psql",
      "--no-psqlrc",
      "--username",
      databaseUser,
      "--dbname",
      database,
      ...psqlOperationArgs,
    ];
  } else if (databaseMode === "direct") {
    const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_NAME"];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`Direct PostgreSQL mode requires explicit ${missing.join(", ")}`);
    }
    command = process.env.PSQL_BIN || "psql";
    commandArgs = [
      "--no-psqlrc",
      "--host",
      process.env.DB_HOST,
      "--port",
      process.env.DB_PORT,
      "--username",
      process.env.DB_USER,
      "--dbname",
      process.env.DB_NAME,
      ...psqlOperationArgs,
    ];
    childEnvironment = { ...process.env };
    if (process.env.DB_PASSWORD) childEnvironment.PGPASSWORD = process.env.DB_PASSWORD;
  } else {
    throw new Error(`Unsupported GT_IMPORT_DB_MODE ${JSON.stringify(databaseMode)}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnvironment,
      windowsHide: true,
    });
    const input = createReadStream(csvPath);
    let stderr = "";

    child.stdout.pipe(process.stdout);
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr = `${stderr}${text}`.slice(-20000);
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(
        new Error(`Staging load (${databaseMode}) failed with ${reason}${stderr ? `: ${stderr.trim()}` : ""}`)
      );
    });
    input.on("error", (error) => {
      child.stdin.destroy(error);
      child.kill();
      reject(error);
    });
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") reject(error);
    });
    input.pipe(child.stdin);
  });
}

const { csvPath } = parseArguments(process.argv.slice(2));

const report = JSON.parse(readFileSync(REPORT, "utf8"));
const expectedHash = report.importStaging.sha256;
const actualHash = await hashFile(csvPath);
if (actualHash !== expectedHash) {
  throw new Error(
    `Import staging SHA-256 mismatch: expected ${expectedHash}, received ${actualHash}. ` +
      `Regenerate with build-import-staging.mjs; never hand-edit the staging CSV.`
  );
}

console.log(`Validated import staging SHA-256 ${actualHash}`);
await loadCsv(csvPath);
console.log("Staging load committed successfully");
