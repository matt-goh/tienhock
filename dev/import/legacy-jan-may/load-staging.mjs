import { createHash } from "crypto";
import { spawn } from "child_process";
import { createReadStream, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(path.join(scriptDirectory, "source-manifest.json"), "utf8")
);
const defaultCsvPath = path.join(
  scriptDirectory,
  "generated",
  "legacy_jan_may_staging.csv"
);

/**
 * @param {string[]} args
 * @returns {{ csvPath: string }}
 */
function parseArguments(args) {
  if (args.length === 0) return { csvPath: defaultCsvPath };
  if (args.length === 2 && args[0] === "--csv") {
    return { csvPath: path.resolve(args[1]) };
  }
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

const copyCommand = String.raw`\copy import_legacy_rows (
  stage_sequence, record_kind, source_file, source_kind, source_sha256,
  source_physical_line, source_row_index, injected_after_physical_line,
  legacy_account_code, account_code, account_description, entry_date,
  journal_ref, journal_group_key, line_display_reference, particulars,
  cheque_reference, debit_cents, credit_cents, running_balance_cents,
  provenance, repaired, repair_reason, special_case
) FROM STDIN WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')`;

const validationSql = String.raw`
DO $validation$
DECLARE
  v_total_rows bigint;
  v_opening_rows bigint;
  v_transaction_rows bigint;
  v_groups bigint;
  v_debit_cents numeric;
  v_credit_cents numeric;
  v_repaired_rows bigint;
  v_derived_rows bigint;
  v_min_sequence integer;
  v_max_sequence integer;
  v_missing_accounts text;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE record_kind = 'opening'),
         COUNT(*) FILTER (WHERE record_kind = 'transaction'),
         COUNT(DISTINCT journal_group_key)
           FILTER (WHERE record_kind = 'transaction'),
         COALESCE(SUM(debit_cents)
           FILTER (WHERE record_kind = 'transaction'), 0),
         COALESCE(SUM(credit_cents)
           FILTER (WHERE record_kind = 'transaction'), 0),
         COUNT(*) FILTER (WHERE repaired),
         COUNT(*) FILTER (WHERE source_kind = 'DERIVED'),
         MIN(stage_sequence),
         MAX(stage_sequence)
    INTO v_total_rows, v_opening_rows, v_transaction_rows, v_groups,
         v_debit_cents, v_credit_cents, v_repaired_rows, v_derived_rows,
         v_min_sequence, v_max_sequence
    FROM import_legacy_rows;

  IF (v_total_rows, v_opening_rows, v_transaction_rows, v_groups,
      v_debit_cents, v_credit_cents, v_repaired_rows, v_derived_rows,
      v_min_sequence, v_max_sequence)
     IS DISTINCT FROM
     (12635::bigint, 2567::bigint, 10068::bigint, 3863::bigint,
      1350351615::numeric, 1350351615::numeric, 4::bigint, 2::bigint,
      1::integer, 12635::integer) THEN
    RAISE EXCEPTION
      'Unexpected staging totals: total %, openings %, transactions %, groups %, DR %, CR %, repaired %, derived %, sequence %..%',
      v_total_rows, v_opening_rows, v_transaction_rows, v_groups,
      v_debit_cents, v_credit_cents, v_repaired_rows, v_derived_rows,
      v_min_sequence, v_max_sequence;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM import_legacy_rows
     WHERE source_sha256 NOT IN (
       '6230d4613768f3f1b51c6195852560446103e39b57b2deb8ac575d8c8ecaa918',
       '6ef5ee949cca9b7903cff5ede201bea5d6e6bc8d341c45e91ea060aeac905a81'
     )
  ) THEN
    RAISE EXCEPTION 'Staging contains an unapproved source hash';
  END IF;

  SELECT string_agg(missing.account_code, ', ' ORDER BY missing.account_code)
    INTO v_missing_accounts
    FROM (
      SELECT DISTINCT staged.account_code
        FROM import_legacy_rows staged
        LEFT JOIN account_codes accounts ON accounts.code = staged.account_code
       WHERE accounts.code IS NULL
         AND (staged.record_kind = 'transaction'
           OR staged.running_balance_cents <> 0)
    ) missing;

  IF v_missing_accounts IS NOT NULL THEN
    RAISE EXCEPTION 'Active/nonzero staging account_code values absent from account_codes: %',
      v_missing_accounts;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM import_legacy_rows
     WHERE record_kind = 'transaction'
     GROUP BY journal_group_key
    HAVING SUM(debit_cents) <> SUM(credit_cents)
  ) THEN
    RAISE EXCEPTION 'Staging contains an unbalanced journal group';
  END IF;
END
$validation$;
`;

const summarySql = String.raw`
SELECT record_kind,
       COUNT(*) AS rows,
       COUNT(DISTINCT journal_group_key) AS journal_groups,
       SUM(debit_cents) AS debit_cents,
       SUM(credit_cents) AS credit_cents
  FROM import_legacy_rows
 GROUP BY record_kind
 ORDER BY record_kind;

SELECT COUNT(DISTINCT staged.account_code) AS retained_zero_only_unmapped_accounts
  FROM import_legacy_rows staged
  LEFT JOIN account_codes accounts ON accounts.code = staged.account_code
 WHERE accounts.code IS NULL;
`;

/**
 * @param {string} csvPath
 * @returns {Promise<void>}
 */
function loadCsv(csvPath) {
  /** @type {string} */
  const databaseMode = process.env.LEGACY_IMPORT_DB_MODE || "docker";
  /** @type {string} */
  const container = process.env.LEGACY_IMPORT_DB_CONTAINER || "tienhock_dev_db";
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
    "TRUNCATE TABLE import_legacy_rows",
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
    const requiredEnvironmentVariables = [
      "DB_HOST",
      "DB_PORT",
      "DB_USER",
      "DB_NAME",
    ];
    const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
      (variableName) => !process.env[variableName]
    );
    if (missingEnvironmentVariables.length > 0) {
      throw new Error(
        `Direct PostgreSQL mode requires explicit ${missingEnvironmentVariables.join(
          ", "
        )}`
      );
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
    if (process.env.DB_PASSWORD) {
      childEnvironment.PGPASSWORD = process.env.DB_PASSWORD;
    }
  } else {
    throw new Error(
      `Unsupported LEGACY_IMPORT_DB_MODE ${JSON.stringify(databaseMode)}`
    );
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
        new Error(
          `Staging load (${databaseMode}) failed with ${reason}${
            stderr ? `: ${stderr.trim()}` : ""
          }`
        )
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
const actualHash = await hashFile(csvPath);
const expectedHash = manifest.expectedStagingSha256;
if (actualHash !== expectedHash) {
  throw new Error(
    `Staging SHA-256 mismatch: expected ${expectedHash}, received ${actualHash}`
  );
}

console.log(`Validated staging SHA-256 ${actualHash}`);
await loadCsv(csvPath);
console.log("Staging load committed successfully");
