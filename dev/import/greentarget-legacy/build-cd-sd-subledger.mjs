#!/usr/bin/env node
/**
 * Build the tracked Green Target CD_SD child-ledger evidence fixture and its
 * idempotent database migration.
 *
 * Normal mode merges the three reviewed transcription parts, validates every
 * source coordinate/code/amount, and writes both outputs:
 *
 *   node dev/import/greentarget-legacy/build-cd-sd-subledger.mjs
 *
 * Check mode needs only the tracked normalized fixture. It revalidates the
 * evidence, regenerates the expected SQL in memory, and byte-checks both files:
 *
 *   node dev/import/greentarget-legacy/build-cd-sd-subledger.mjs --check-only
 *
 * The migration is generated because 746 evidence rows are safer to prove and
 * reproduce mechanically than to maintain as hand-written SQL values.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const GENERATED = path.join(HERE, "generated");
const SOURCE_PDF = path.join(REPO, "GT_TRADE_DEBTORS.pdf");
const FIXTURE = path.join(HERE, "cd_sd_subledger_evidence.csv");
const MIGRATION = path.join(
  REPO,
  "dev",
  "migrations",
  "2026-07-30_greentarget_cd_sd_subledger.sql"
);

const CHECK_ONLY = process.argv.includes("--check-only");
const SOURCE_FILE = "GT_TRADE_DEBTORS.pdf";
const SOURCE_SHA256 =
  "fe0b5989e73d11aa7dcfe0b062b4fec0405beefc79b2ad1d18322d52a80a29d0";
const ACTOR = "GT_CD_SD_SUBLEDGER_20260730";
const SYNTHETIC_SNAPSHOT_CODE = "CD_SD (UNALLOCATED)";
const BLANK_DESCRIPTION_FALLBACK_CODE = "CD-LAJUMA";

const EXPECTED_VISIBLE = Object.freeze({
  rows: 746,
  juneClosingCents: 6_384_540n,
  juneMovementCents: -74_000n,
  mayMovementCents: -535_000n,
  mayClosingCents: 6_458_540n,
});

const EXPECTED_CONTROL = Object.freeze({
  juneClosingCents: 6_570_540n,
  juneMovementCents: -74_000n,
  mayMovementCents: -551_000n,
  mayClosingCents: 6_644_540n,
  residualClosingCents: 186_000n,
  residualJuneMovementCents: 0n,
  residualMayMovementCents: -16_000n,
});

const PARTS = Object.freeze([
  {
    file: "cd_sd_pages_02_07.csv",
    rows: 264,
    page: "source_page",
    row: "page_row",
    code: "account_code",
    description: "particular",
    closing: "closing_2026_06_30",
    june: "june_movement",
    may: "may_movement",
    expectedHeader:
      "source_page,page_row,display_code,account_code,particular,closing_2026_06_30,june_movement,may_movement",
  },
  {
    file: "cd_sd_pages_08_13.csv",
    rows: 264,
    page: "source_page",
    row: "page_row",
    code: "account_code",
    description: "particular",
    closing: "closing_2026_06_30",
    june: "june_movement",
    may: "may_movement",
    expectedHeader:
      "source_page,page_row,display_code,account_code,particular,closing_2026_06_30,june_movement,may_movement",
  },
  {
    file: "cd_sd_pages_14_18.csv",
    rows: 218,
    page: "page",
    row: "row_on_page",
    code: "account_code",
    description: "description",
    closing: "closing_balance",
    june: "jun_2026",
    may: "may_2026",
    expectedHeader:
      "page,row_on_page,display_code,description,closing_balance,jun_2026,may_2026,account_code",
  },
]);

const FIXTURE_HEADER = Object.freeze([
  "source_file",
  "source_sha256",
  "source_page",
  "source_row",
  "account_code",
  "source_particular",
  "account_description",
  "description_provenance",
  "closing_2026_06_30",
  "june_2026_movement",
  "may_2026_movement",
]);

const die = (message) => {
  throw new Error(`CD_SD build aborted: ${message}`);
};

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const sqlQuote = (value) =>
  value === null || value === undefined
    ? "NULL"
    : `'${String(value).replace(/'/g, "''")}'`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) die("unterminated quoted CSV field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) die("empty CSV input");

  rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  const header = rows.shift();
  return {
    header,
    rows: rows.map((cells) =>
      Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]))
    ),
  };
}

function csvCell(value) {
  const stringValue = String(value);
  return /[",\r\n]/.test(stringValue)
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
}

function parsePositiveInteger(value, label) {
  if (!/^\d+$/.test(String(value).trim())) {
    die(`${label} is not a positive integer: ${JSON.stringify(value)}`);
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    die(`${label} is outside the supported range: ${JSON.stringify(value)}`);
  }
  return parsed;
}

function parseMoneyCents(value, label) {
  const raw = String(value).trim();
  const match = raw.match(
    /^(-)?(?:(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?|\.(\d{1,2}))$/
  );
  if (!match) die(`${label} is not an exact two-decimal amount: ${JSON.stringify(value)}`);

  const negative = Boolean(match[1]);
  const whole = BigInt((match[2] || "0").replace(/,/g, ""));
  const fraction = (match[3] || match[4] || "").padEnd(2, "0");
  const cents = whole * 100n + BigInt(fraction || "0");
  return negative ? -cents : cents;
}

function formatCents(cents) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(
    absolute % 100n
  ).padStart(2, "0")}`;
}

function normalizeRow(raw, fields, label) {
  const sourcePage = parsePositiveInteger(raw[fields.page], `${label} source_page`);
  const sourceRow = parsePositiveInteger(raw[fields.row], `${label} source_row`);
  const accountCode = String(raw[fields.code] ?? "").trim();
  const sourceParticular = String(
    raw[fields.sourceParticular || fields.description] ?? ""
  ).trim();
  let accountDescription;
  let descriptionProvenance;

  if (fields.accountDescription) {
    accountDescription = String(raw[fields.accountDescription] ?? "").trim();
    descriptionProvenance = String(
      raw[fields.descriptionProvenance] ?? ""
    ).trim();
  } else if (sourceParticular) {
    accountDescription = sourceParticular;
    descriptionProvenance = "legacy_trade_debtors_particular";
  } else if (accountCode === BLANK_DESCRIPTION_FALLBACK_CODE) {
    // Both GT_TRADE_DEBTORS.pdf and GT_ACCOUNTCODE.pdf leave PARTICULAR blank.
    // account_codes.description is NOT NULL, so retain the blank evidence field
    // separately and use the canonical code itself as the non-invented label.
    accountDescription = accountCode;
    descriptionProvenance = "source_blank_code_fallback";
  } else {
    die(`${label} ${accountCode} has an unapproved blank source particular`);
  }

  if (!accountCode) die(`${label} has a blank canonical account code`);
  if (!accountDescription) die(`${label} ${accountCode} has a blank account description`);
  if (accountCode.length > 50) die(`${label} ${accountCode} exceeds varchar(50)`);
  if (accountDescription.length > 255) {
    die(`${label} ${accountCode} description exceeds varchar(255)`);
  }

  return {
    sourceFile: SOURCE_FILE,
    sourceSha256: SOURCE_SHA256,
    sourcePage,
    sourceRow,
    accountCode,
    sourceParticular,
    accountDescription,
    descriptionProvenance,
    juneClosingCents: parseMoneyCents(
      raw[fields.closing],
      `${label} ${accountCode} closing`
    ),
    juneMovementCents: parseMoneyCents(
      raw[fields.june],
      `${label} ${accountCode} June movement`
    ),
    mayMovementCents: parseMoneyCents(
      raw[fields.may],
      `${label} ${accountCode} May movement`
    ),
  };
}

function loadParts() {
  const rows = [];
  for (const part of PARTS) {
    const partPath = path.join(GENERATED, part.file);
    if (!fs.existsSync(partPath)) die(`missing transcription part ${partPath}`);
    const parsed = parseCsv(fs.readFileSync(partPath, "utf8"));
    if (parsed.header.join(",") !== part.expectedHeader) {
      die(`${part.file} header drifted: ${parsed.header.join(",")}`);
    }
    if (parsed.rows.length !== part.rows) {
      die(`${part.file} has ${parsed.rows.length} rows; expected ${part.rows}`);
    }
    parsed.rows.forEach((raw, index) => {
      rows.push(normalizeRow(raw, part, `${part.file}:${index + 2}`));
    });
  }
  return rows;
}

function loadFixture() {
  if (!fs.existsSync(FIXTURE)) die(`tracked fixture is missing: ${FIXTURE}`);
  const parsed = parseCsv(fs.readFileSync(FIXTURE, "utf8"));
  if (parsed.header.join(",") !== FIXTURE_HEADER.join(",")) {
    die(`tracked fixture header drifted: ${parsed.header.join(",")}`);
  }

  return parsed.rows.map((raw, index) => {
    const label = `${path.basename(FIXTURE)}:${index + 2}`;
    if (raw.source_file !== SOURCE_FILE || raw.source_sha256 !== SOURCE_SHA256) {
      die(`${label} source identity does not match the hash-pinned PDF`);
    }
    return normalizeRow(
      raw,
      {
        page: "source_page",
        row: "source_row",
        code: "account_code",
        sourceParticular: "source_particular",
        accountDescription: "account_description",
        descriptionProvenance: "description_provenance",
        closing: "closing_2026_06_30",
        june: "june_2026_movement",
        may: "may_2026_movement",
      },
      label
    );
  });
}

function validateRows(rows) {
  rows.sort(
    (left, right) =>
      left.sourcePage - right.sourcePage || left.sourceRow - right.sourceRow
  );

  if (rows.length !== EXPECTED_VISIBLE.rows) {
    die(`normalized fixture has ${rows.length} rows; expected ${EXPECTED_VISIBLE.rows}`);
  }

  const coordinates = new Set();
  const exactCodes = new Set();
  const foldedCodes = new Set();
  const pageCounts = new Map();
  let juneClosingCents = 0n;
  let juneMovementCents = 0n;
  let mayMovementCents = 0n;

  for (const row of rows) {
    const coordinate = `${row.sourcePage}:${row.sourceRow}`;
    if (coordinates.has(coordinate)) die(`duplicate source coordinate ${coordinate}`);
    coordinates.add(coordinate);

    if (exactCodes.has(row.accountCode)) die(`duplicate account code ${row.accountCode}`);
    exactCodes.add(row.accountCode);
    const folded = row.accountCode.toUpperCase();
    if (foldedCodes.has(folded)) {
      die(`case-insensitive duplicate account code ${row.accountCode}`);
    }
    foldedCodes.add(folded);

    if (row.accountCode === "CD_SD" || row.accountCode === SYNTHETIC_SNAPSHOT_CODE) {
      die(`${row.accountCode} cannot be a visible child account`);
    }

    if (row.accountCode === BLANK_DESCRIPTION_FALLBACK_CODE) {
      if (
        row.sourceParticular !== "" ||
        row.accountDescription !== BLANK_DESCRIPTION_FALLBACK_CODE ||
        row.descriptionProvenance !== "source_blank_code_fallback"
      ) {
        die("CD-LAJUMA blank-description evidence/fallback drifted");
      }
    } else if (
      row.sourceParticular !== row.accountDescription ||
      row.descriptionProvenance !== "legacy_trade_debtors_particular"
    ) {
      die(`${row.accountCode} has unsupported description provenance`);
    }

    if (!pageCounts.has(row.sourcePage)) pageCounts.set(row.sourcePage, []);
    pageCounts.get(row.sourcePage).push(row.sourceRow);
    juneClosingCents += row.juneClosingCents;
    juneMovementCents += row.juneMovementCents;
    mayMovementCents += row.mayMovementCents;
  }

  for (let page = 2; page <= 18; page += 1) {
    const sourceRows = (pageCounts.get(page) || []).sort((a, b) => a - b);
    const expectedCount = page === 18 ? 42 : 44;
    if (sourceRows.length !== expectedCount) {
      die(`source page ${page} has ${sourceRows.length} rows; expected ${expectedCount}`);
    }
    for (let index = 0; index < expectedCount; index += 1) {
      if (sourceRows[index] !== index + 1) {
        die(`source page ${page} is missing or duplicates row ${index + 1}`);
      }
    }
  }
  if (pageCounts.size !== 17) die(`found ${pageCounts.size} source pages; expected 17`);

  const mayClosingCents = juneClosingCents - juneMovementCents;
  const actual = {
    juneClosingCents,
    juneMovementCents,
    mayMovementCents,
    mayClosingCents,
  };
  for (const [key, expected] of Object.entries(EXPECTED_VISIBLE)) {
    if (key === "rows") continue;
    if (actual[key] !== expected) {
      die(`${key} is ${formatCents(actual[key])}; expected ${formatCents(expected)}`);
    }
  }

  if (
    juneClosingCents + EXPECTED_CONTROL.residualClosingCents !==
      EXPECTED_CONTROL.juneClosingCents ||
    juneMovementCents + EXPECTED_CONTROL.residualJuneMovementCents !==
      EXPECTED_CONTROL.juneMovementCents ||
    mayMovementCents + EXPECTED_CONTROL.residualMayMovementCents !==
      EXPECTED_CONTROL.mayMovementCents ||
    mayClosingCents + EXPECTED_CONTROL.residualClosingCents !==
      EXPECTED_CONTROL.mayClosingCents
  ) {
    die("visible rows plus the explicit residual do not reconcile to the controls");
  }

  return rows;
}

function renderFixture(rows) {
  const lines = [FIXTURE_HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.sourceFile,
        row.sourceSha256,
        row.sourcePage,
        row.sourceRow,
        row.accountCode,
        row.sourceParticular,
        row.accountDescription,
        row.descriptionProvenance,
        formatCents(row.juneClosingCents),
        formatCents(row.juneMovementCents),
        formatCents(row.mayMovementCents),
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderMigration(rows, fixtureSha256) {
  const fixtureValues = rows
    .map(
      (row, index) =>
        `  (${row.sourcePage}, ${row.sourceRow}, ${sqlQuote(
          row.accountCode
        )}, ${sqlQuote(row.sourceParticular || null)}, ${sqlQuote(
          row.accountDescription
        )}, ${sqlQuote(row.descriptionProvenance)}, ${formatCents(
          row.juneClosingCents
        )}, ${formatCents(row.juneMovementCents)}, ${formatCents(
          row.mayMovementCents
        )}, ${2001 + index})`
    )
    .join(",\n");

  return `-- Green Target CD_SD child-ledger evidence and July cutover anchors.
--
-- GENERATED BY dev/import/greentarget-legacy/build-cd-sd-subledger.mjs.
-- Do not hand-edit the 746-row payload. Regenerate and run --check-only.
--
-- Source: ${SOURCE_FILE}
-- Source SHA-256: ${SOURCE_SHA256}
-- Normalized fixture: dev/import/greentarget-legacy/cd_sd_subledger_evidence.csv
-- Fixture SHA-256: ${fixtureSha256}
--
-- Evidence boundary:
--   * 746 visible rows total 63,845.40 at 2026-06-30, June movement
--     -740.00, and May movement -5,350.00.
--   * The printed CD_SD control totals are 65,705.40, -740.00, and
--     -5,510.00 respectively. The source does not identify a visible child for
--     the remaining 1,860.00 close / -160.00 May movement. That difference is
--     retained explicitly as CD_SD (UNALLOCATED) in the snapshot table only;
--     it is NOT invented as an account-code child.
--   * as_of_month is a month-start key: 2026-05-01 represents the 2026-05-31
--     close and 2026-06-01 represents the 2026-06-30 close.
--   * 2026-07-01 anchors start the new child ledger without rewriting any
--     pre-July anchor, journal, invoice, or payment.

\\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';

-- Base-schema and evidence-identity guards.
DO $guard$
BEGIN
  IF to_regclass('greentarget.account_codes') IS NULL
     OR to_regclass('greentarget.account_opening_balances') IS NULL
     OR to_regclass('greentarget.financial_statement_notes') IS NULL
     OR to_regclass('greentarget.ledger_types') IS NULL THEN
    RAISE EXCEPTION 'GT CD_SD guard: Green Target accounting foundation is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM greentarget.financial_statement_notes
     WHERE code = '22' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'GT CD_SD guard: active financial-statement note 22 is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM greentarget.ledger_types WHERE code = 'TD' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'GT CD_SD guard: active TD ledger type is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM greentarget.account_codes
     WHERE code = 'DEBTOR'
       AND ledger_type = 'TD'
       AND fs_note = '22'
       AND is_system = true
  ) THEN
    RAISE EXCEPTION 'GT CD_SD guard: DEBTOR is not the expected TD/22 system control';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM greentarget.account_codes
     WHERE code = 'CD_SD'
       AND parent_code = 'DEBTOR'
       AND ledger_type = 'TD'
       AND fs_note = '22'
  ) THEN
    RAISE EXCEPTION 'GT CD_SD guard: CD_SD is not the expected TD/22 DEBTOR child';
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.account_codes WHERE code = ${sqlQuote(
      SYNTHETIC_SNAPSHOT_CODE
    )}
  ) THEN
    RAISE EXCEPTION 'GT CD_SD guard: synthetic residual must not exist in account_codes';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS greentarget.debtor_subledger_snapshots (
  id               serial PRIMARY KEY,
  as_of_month      date NOT NULL,
  account_code     text NOT NULL,
  closing_balance  numeric(14,2) NOT NULL DEFAULT 0,
  movement         numeric(14,2) NOT NULL DEFAULT 0,
  source_file      text,
  source_sha256    text,
  source_page      integer,
  source_row       integer,
  provenance       text NOT NULL,
  notes            text,
  created_at       timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       varchar(50),
  updated_by       varchar(50),
  CONSTRAINT gt_debtor_subledger_snapshots_month_account_key
    UNIQUE (as_of_month, account_code),
  CONSTRAINT gt_debtor_subledger_snapshots_month_start_check
    CHECK (EXTRACT(DAY FROM as_of_month) = 1),
  CONSTRAINT gt_debtor_subledger_snapshots_source_page_check
    CHECK (source_page IS NULL OR source_page > 0),
  CONSTRAINT gt_debtor_subledger_snapshots_source_row_check
    CHECK (source_row IS NULL OR source_row > 0),
  CONSTRAINT gt_debtor_subledger_snapshots_source_hash_check
    CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$')
);

-- CREATE TABLE IF NOT EXISTS cannot repair a partially-created table. Add the
-- required uniqueness/check constraints on rerun if an earlier attempt stopped
-- after creating the relation but before completing it.
DO $snapshot_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'greentarget.debtor_subledger_snapshots'::regclass
       AND conname = 'gt_debtor_subledger_snapshots_month_account_key'
  ) THEN
    ALTER TABLE greentarget.debtor_subledger_snapshots
      ADD CONSTRAINT gt_debtor_subledger_snapshots_month_account_key
      UNIQUE (as_of_month, account_code);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'greentarget.debtor_subledger_snapshots'::regclass
       AND conname = 'gt_debtor_subledger_snapshots_month_start_check'
  ) THEN
    ALTER TABLE greentarget.debtor_subledger_snapshots
      ADD CONSTRAINT gt_debtor_subledger_snapshots_month_start_check
      CHECK (EXTRACT(DAY FROM as_of_month) = 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'greentarget.debtor_subledger_snapshots'::regclass
       AND conname = 'gt_debtor_subledger_snapshots_source_page_check'
  ) THEN
    ALTER TABLE greentarget.debtor_subledger_snapshots
      ADD CONSTRAINT gt_debtor_subledger_snapshots_source_page_check
      CHECK (source_page IS NULL OR source_page > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'greentarget.debtor_subledger_snapshots'::regclass
       AND conname = 'gt_debtor_subledger_snapshots_source_row_check'
  ) THEN
    ALTER TABLE greentarget.debtor_subledger_snapshots
      ADD CONSTRAINT gt_debtor_subledger_snapshots_source_row_check
      CHECK (source_row IS NULL OR source_row > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'greentarget.debtor_subledger_snapshots'::regclass
       AND conname = 'gt_debtor_subledger_snapshots_source_hash_check'
  ) THEN
    ALTER TABLE greentarget.debtor_subledger_snapshots
      ADD CONSTRAINT gt_debtor_subledger_snapshots_source_hash_check
      CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
END
$snapshot_constraints$;

DO $snapshot_shape$
DECLARE
  v_bad text;
BEGIN
  WITH expected(column_name, formatted_type, required) AS (
    VALUES ('as_of_month', 'date', true),
           ('account_code', 'text', true),
           ('closing_balance', 'numeric(14,2)', true),
           ('movement', 'numeric(14,2)', true),
           ('source_page', 'integer', false),
           ('source_row', 'integer', false)
  )
  SELECT string_agg(expected.column_name, ', ' ORDER BY expected.column_name)
    INTO v_bad
    FROM expected
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = 'greentarget.debtor_subledger_snapshots'::regclass
     AND attribute.attname = expected.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
   WHERE attribute.attname IS NULL
      OR format_type(attribute.atttypid, attribute.atttypmod) <> expected.formatted_type
      OR (expected.required AND NOT attribute.attnotnull)
      OR (NOT expected.required AND attribute.attnotnull);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'GT CD_SD snapshot table has incompatible column shape(s): %', v_bad;
  END IF;

  -- account_code is deliberately text with no account FK. This permits the
  -- clearly-labelled residual snapshot without inventing a chart identity.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'greentarget.debtor_subledger_snapshots'::regclass
       AND contype = 'f'
  ) THEN
    RAISE EXCEPTION 'GT CD_SD snapshot table must not have a foreign key';
  END IF;
END
$snapshot_shape$;

-- Preserve every pre-cutover opening anchor byte-for-byte for the tail gate.
CREATE TEMP TABLE gt_cd_sd_prejuly_anchor_baseline ON COMMIT DROP AS
SELECT *
  FROM greentarget.account_opening_balances
 WHERE as_of_date < DATE '2026-07-01';

CREATE TEMP TABLE gt_cd_sd_visible_fixture (
  source_page       integer NOT NULL,
  source_row        integer NOT NULL,
  account_code      varchar(50) PRIMARY KEY,
  source_particular text,
  description       varchar(255) NOT NULL,
  description_provenance text NOT NULL,
  june_closing      numeric(14,2) NOT NULL,
  june_movement     numeric(14,2) NOT NULL,
  may_movement      numeric(14,2) NOT NULL,
  sort_order        integer NOT NULL,
  UNIQUE (source_page, source_row),
  CHECK (BTRIM(account_code) <> ''),
  CHECK (BTRIM(description) <> ''),
  CHECK (
    (description_provenance = 'legacy_trade_debtors_particular'
     AND BTRIM(COALESCE(source_particular, '')) <> ''
     AND source_particular = description)
    OR
    (description_provenance = 'source_blank_code_fallback'
     AND account_code = 'CD-LAJUMA'
     AND source_particular IS NULL
     AND description = account_code)
  )
) ON COMMIT DROP;

INSERT INTO gt_cd_sd_visible_fixture
  (source_page, source_row, account_code, source_particular, description,
   description_provenance, june_closing, june_movement, may_movement,
   sort_order)
VALUES
${fixtureValues};

DO $fixture_gate$
DECLARE
  v_rows bigint;
  v_codes bigint;
  v_folded_codes bigint;
  v_locations bigint;
  v_close_cents bigint;
  v_june_cents bigint;
  v_may_cents bigint;
  v_may_close_cents bigint;
  v_bad text;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT account_code),
         COUNT(DISTINCT UPPER(account_code)),
         COUNT(DISTINCT (source_page, source_row)),
         SUM(ROUND(june_closing * 100))::bigint,
         SUM(ROUND(june_movement * 100))::bigint,
         SUM(ROUND(may_movement * 100))::bigint,
         SUM(ROUND((june_closing - june_movement) * 100))::bigint
    INTO v_rows, v_codes, v_folded_codes, v_locations,
         v_close_cents, v_june_cents, v_may_cents, v_may_close_cents
    FROM gt_cd_sd_visible_fixture;

  IF (v_rows, v_codes, v_folded_codes, v_locations)
       IS DISTINCT FROM (746::bigint, 746::bigint, 746::bigint, 746::bigint) THEN
    RAISE EXCEPTION 'GT CD_SD fixture cardinality/uniqueness failed: rows %, codes %, folded %, locations %',
      v_rows, v_codes, v_folded_codes, v_locations;
  END IF;

  IF (v_close_cents, v_june_cents, v_may_cents, v_may_close_cents)
       IS DISTINCT FROM (6384540::bigint, -74000::bigint,
                         -535000::bigint, 6458540::bigint) THEN
    RAISE EXCEPTION 'GT CD_SD visible totals failed: close %, June %, May %, May close % cents',
      v_close_cents, v_june_cents, v_may_cents, v_may_close_cents;
  END IF;

  WITH expected AS (
    SELECT page,
           CASE WHEN page = 18 THEN 42 ELSE 44 END AS expected_count
      FROM generate_series(2, 18) AS page
  ), actual AS (
    SELECT source_page AS page, COUNT(*) AS actual_count,
           MIN(source_row) AS minimum_row, MAX(source_row) AS maximum_row
      FROM gt_cd_sd_visible_fixture
     GROUP BY source_page
  )
  SELECT string_agg(
           FORMAT('page %s count %s range %s-%s', expected.page,
                  COALESCE(actual.actual_count, 0), actual.minimum_row,
                  actual.maximum_row), '; ' ORDER BY expected.page
         )
    INTO v_bad
    FROM expected
    LEFT JOIN actual USING (page)
   WHERE actual.actual_count IS DISTINCT FROM expected.expected_count
      OR actual.minimum_row IS DISTINCT FROM 1
      OR actual.maximum_row IS DISTINCT FROM expected.expected_count;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'GT CD_SD source-page coverage failed: %', v_bad;
  END IF;

  IF EXISTS (
    SELECT 1 FROM gt_cd_sd_visible_fixture
     WHERE account_code IN ('CD_SD', ${sqlQuote(SYNTHETIC_SNAPSHOT_CODE)})
  ) THEN
    RAISE EXCEPTION 'GT CD_SD control/residual leaked into the visible child payload';
  END IF;

  -- The current legacy chart has none of these 746 identities. On a rerun,
  -- already-loaded CD_SD children are valid; an identity attached elsewhere is
  -- an account-code collision and must be reviewed rather than silently moved.
  SELECT string_agg(fixture.account_code, ', ' ORDER BY fixture.account_code)
    INTO v_bad
    FROM gt_cd_sd_visible_fixture fixture
    JOIN greentarget.account_codes account
      ON account.code = fixture.account_code
   WHERE account.parent_code IS DISTINCT FROM 'CD_SD';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'GT CD_SD account-code collision(s) outside CD_SD: %',
      left(v_bad, 400);
  END IF;
END
$fixture_gate$;

-- CD_SD remains a real ledger account but becomes a protected control parent.
UPDATE greentarget.account_codes
   SET is_system = true,
       is_active = true,
       notes = CASE
         WHEN COALESCE(notes, '') LIKE '%[GT-CDSD-20260730]%'
           THEN REPLACE(
             REPLACE(notes,
                     CHR(13) || CHR(10) || '[GT-CDSD-20260730]',
                     ' [GT-CDSD-20260730]'),
             CHR(10) || '[GT-CDSD-20260730]',
             ' [GT-CDSD-20260730]')
         ELSE CONCAT_WS(' ', NULLIF(notes, ''),
           '[GT-CDSD-20260730] System control for the evidenced CD_SD child subledger; direct unallocated legacy balance remains on this control.')
       END,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = ${sqlQuote(ACTOR)}
 WHERE code = 'CD_SD'
   AND (is_system IS DISTINCT FROM true
        OR is_active IS DISTINCT FROM true
        OR COALESCE(notes, '') NOT LIKE '%[GT-CDSD-20260730]%'
        OR POSITION(CHR(10) || '[GT-CDSD-20260730]' IN COALESCE(notes, '')) > 0);

-- The 746 visible identities are real active chart children. Canonical codes
-- include genuine embedded spaces; no normalization to underscores is allowed.
INSERT INTO greentarget.account_codes (
  code, description, ledger_type, parent_code, level, sort_order,
  is_active, is_system, notes, fs_note, created_by, updated_by
)
SELECT fixture.account_code,
       fixture.description,
       'TD',
       'CD_SD',
       3,
       fixture.sort_order,
       true,
       false,
       CASE
         WHEN fixture.description_provenance = 'source_blank_code_fallback'
           THEN FORMAT('Legacy CD_SD visible child: ${SOURCE_FILE} page %s row %s; source SHA-256 ${SOURCE_SHA256}. Both the trade-debtors schedule and account master leave PARTICULAR blank; the canonical code is used as the required non-null label.',
                       fixture.source_page, fixture.source_row)
         ELSE FORMAT('Legacy CD_SD visible child: ${SOURCE_FILE} page %s row %s; source SHA-256 ${SOURCE_SHA256}.',
                     fixture.source_page, fixture.source_row)
       END,
       '22',
       ${sqlQuote(ACTOR)},
       ${sqlQuote(ACTOR)}
  FROM gt_cd_sd_visible_fixture fixture
 ORDER BY fixture.sort_order
ON CONFLICT (code) DO UPDATE
   SET description = EXCLUDED.description,
       ledger_type = EXCLUDED.ledger_type,
       parent_code = EXCLUDED.parent_code,
       level = EXCLUDED.level,
       sort_order = EXCLUDED.sort_order,
       is_active = EXCLUDED.is_active,
       is_system = EXCLUDED.is_system,
       notes = EXCLUDED.notes,
       fs_note = EXCLUDED.fs_note,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = EXCLUDED.updated_by
 WHERE (greentarget.account_codes.description,
        greentarget.account_codes.ledger_type,
        greentarget.account_codes.parent_code,
        greentarget.account_codes.level,
        greentarget.account_codes.sort_order,
        greentarget.account_codes.is_active,
        greentarget.account_codes.is_system,
        greentarget.account_codes.notes,
        greentarget.account_codes.fs_note,
        greentarget.account_codes.updated_by)
   IS DISTINCT FROM
       (EXCLUDED.description, EXCLUDED.ledger_type, EXCLUDED.parent_code,
        EXCLUDED.level, EXCLUDED.sort_order, EXCLUDED.is_active,
        EXCLUDED.is_system, EXCLUDED.notes, EXCLUDED.fs_note,
        EXCLUDED.updated_by);

CREATE TEMP TABLE gt_cd_sd_desired_snapshots (
  as_of_month      date NOT NULL,
  account_code     text NOT NULL,
  closing_balance  numeric(14,2) NOT NULL,
  movement         numeric(14,2) NOT NULL,
  source_file      text,
  source_sha256    text,
  source_page      integer,
  source_row       integer,
  provenance       text NOT NULL,
  notes            text,
  PRIMARY KEY (as_of_month, account_code)
) ON COMMIT DROP;

INSERT INTO gt_cd_sd_desired_snapshots
  (as_of_month, account_code, closing_balance, movement, source_file,
   source_sha256, source_page, source_row, provenance, notes)
SELECT DATE '2026-05-01', account_code,
       june_closing - june_movement, may_movement,
       ${sqlQuote(SOURCE_FILE)}, ${sqlQuote(SOURCE_SHA256)},
       source_page, source_row, 'derived_visible_child_prior_close',
       'Month key 2026-05-01 represents the 2026-05-31 close; closing balance is derived as printed June close less printed June movement, while May movement is printed.'
  FROM gt_cd_sd_visible_fixture
UNION ALL
SELECT DATE '2026-06-01', account_code,
       june_closing, june_movement,
       ${sqlQuote(SOURCE_FILE)}, ${sqlQuote(SOURCE_SHA256)},
       source_page, source_row, 'legacy_visible_child_schedule',
       'Month key 2026-06-01 represents the 2026-06-30 close.'
  FROM gt_cd_sd_visible_fixture;

-- This is an explicit reconciliation record, not an account. Page 18 prints
-- the control totals but gives no child identity for the difference.
INSERT INTO gt_cd_sd_desired_snapshots
  (as_of_month, account_code, closing_balance, movement, source_file,
   source_sha256, source_page, source_row, provenance, notes)
VALUES
  (DATE '2026-05-01', ${sqlQuote(SYNTHETIC_SNAPSHOT_CODE)}, 1860.00, -160.00,
   ${sqlQuote(SOURCE_FILE)}, ${sqlQuote(SOURCE_SHA256)}, 18, NULL,
   'derived_unallocated_control_residual',
   'Printed May movement -5,510.00 less 746 visible rows -5,350.00 = -160.00; direct CD_SD residual close carried at 1,860.00.'),
  (DATE '2026-06-01', ${sqlQuote(SYNTHETIC_SNAPSHOT_CODE)}, 1860.00, 0.00,
   ${sqlQuote(SOURCE_FILE)}, ${sqlQuote(SOURCE_SHA256)}, 18, NULL,
   'derived_unallocated_control_residual',
   'Printed June close 65,705.40 less 746 visible rows 63,845.40 = 1,860.00; June movement residual is 0.00.');

DO $snapshot_payload_gate$
DECLARE
  v_rows bigint;
  v_may_close bigint;
  v_may_movement bigint;
  v_june_close bigint;
  v_june_movement bigint;
BEGIN
  SELECT COUNT(*) INTO v_rows FROM gt_cd_sd_desired_snapshots;
  IF v_rows <> 1494 THEN
    RAISE EXCEPTION 'GT CD_SD desired snapshots contain % rows, expected 1494', v_rows;
  END IF;

  SELECT SUM(ROUND(closing_balance * 100)) FILTER (
           WHERE as_of_month = DATE '2026-05-01')::bigint,
         SUM(ROUND(movement * 100)) FILTER (
           WHERE as_of_month = DATE '2026-05-01')::bigint,
         SUM(ROUND(closing_balance * 100)) FILTER (
           WHERE as_of_month = DATE '2026-06-01')::bigint,
         SUM(ROUND(movement * 100)) FILTER (
           WHERE as_of_month = DATE '2026-06-01')::bigint
    INTO v_may_close, v_may_movement, v_june_close, v_june_movement
    FROM gt_cd_sd_desired_snapshots;

  IF (v_may_close, v_may_movement, v_june_close, v_june_movement)
       IS DISTINCT FROM (6644540::bigint, -551000::bigint,
                         6570540::bigint, -74000::bigint) THEN
    RAISE EXCEPTION 'GT CD_SD control totals failed: May close %, May movement %, June close %, June movement % cents',
      v_may_close, v_may_movement, v_june_close, v_june_movement;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM gt_cd_sd_desired_snapshots may_snapshot
      JOIN gt_cd_sd_desired_snapshots june_snapshot
        ON june_snapshot.account_code = may_snapshot.account_code
       AND june_snapshot.as_of_month = DATE '2026-06-01'
     WHERE may_snapshot.as_of_month = DATE '2026-05-01'
       AND june_snapshot.closing_balance IS DISTINCT FROM
           may_snapshot.closing_balance + june_snapshot.movement
  ) THEN
    RAISE EXCEPTION 'GT CD_SD May close + June movement does not equal June close';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM gt_cd_sd_desired_snapshots
     WHERE as_of_month = DATE '2026-05-01'
       AND account_code = ${sqlQuote(SYNTHETIC_SNAPSHOT_CODE)}
       AND closing_balance = 1860.00
       AND movement = -160.00
       AND provenance = 'derived_unallocated_control_residual'
  ) OR NOT EXISTS (
    SELECT 1 FROM gt_cd_sd_desired_snapshots
     WHERE as_of_month = DATE '2026-06-01'
       AND account_code = ${sqlQuote(SYNTHETIC_SNAPSHOT_CODE)}
       AND closing_balance = 1860.00
       AND movement = 0.00
       AND provenance = 'derived_unallocated_control_residual'
  ) THEN
    RAISE EXCEPTION 'GT CD_SD explicit residual snapshot is missing or changed';
  END IF;
END
$snapshot_payload_gate$;

INSERT INTO greentarget.debtor_subledger_snapshots (
  as_of_month, account_code, closing_balance, movement, source_file,
  source_sha256, source_page, source_row, provenance, notes,
  created_by, updated_by
)
SELECT as_of_month, account_code, closing_balance, movement, source_file,
       source_sha256, source_page, source_row, provenance, notes,
       ${sqlQuote(ACTOR)}, ${sqlQuote(ACTOR)}
  FROM gt_cd_sd_desired_snapshots
ON CONFLICT ON CONSTRAINT gt_debtor_subledger_snapshots_month_account_key
DO UPDATE
   SET closing_balance = EXCLUDED.closing_balance,
       movement = EXCLUDED.movement,
       source_file = EXCLUDED.source_file,
       source_sha256 = EXCLUDED.source_sha256,
       source_page = EXCLUDED.source_page,
       source_row = EXCLUDED.source_row,
       provenance = EXCLUDED.provenance,
       notes = EXCLUDED.notes,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = EXCLUDED.updated_by
 WHERE (greentarget.debtor_subledger_snapshots.closing_balance,
        greentarget.debtor_subledger_snapshots.movement,
        greentarget.debtor_subledger_snapshots.source_file,
        greentarget.debtor_subledger_snapshots.source_sha256,
        greentarget.debtor_subledger_snapshots.source_page,
        greentarget.debtor_subledger_snapshots.source_row,
        greentarget.debtor_subledger_snapshots.provenance,
        greentarget.debtor_subledger_snapshots.notes,
        greentarget.debtor_subledger_snapshots.updated_by)
   IS DISTINCT FROM
       (EXCLUDED.closing_balance, EXCLUDED.movement, EXCLUDED.source_file,
        EXCLUDED.source_sha256, EXCLUDED.source_page, EXCLUDED.source_row,
        EXCLUDED.provenance, EXCLUDED.notes, EXCLUDED.updated_by);

CREATE TEMP TABLE gt_cd_sd_desired_anchors (
  account_code varchar(50) PRIMARY KEY,
  amount       numeric(15,2) NOT NULL,
  notes        text NOT NULL
) ON COMMIT DROP;

INSERT INTO gt_cd_sd_desired_anchors (account_code, amount, notes)
SELECT account_code, june_closing,
       FORMAT('GT CD_SD child cutover at 2026-07-01 from ${SOURCE_FILE} page %s row %s; source SHA-256 ${SOURCE_SHA256}.',
              source_page, source_row)
  FROM gt_cd_sd_visible_fixture
UNION ALL
SELECT 'CD_SD', 1860.00,
       'Direct unallocated CD_SD control residual at the 2026-07-01 child-ledger cutover; 65,705.40 printed control less 63,845.40 visible children.';

DO $anchor_payload_gate$
DECLARE
  v_rows bigint;
  v_total_cents bigint;
  v_child_cents bigint;
  v_missing text;
BEGIN
  SELECT COUNT(*), SUM(ROUND(amount * 100))::bigint,
         SUM(ROUND(amount * 100)) FILTER (WHERE account_code <> 'CD_SD')::bigint
    INTO v_rows, v_total_cents, v_child_cents
    FROM gt_cd_sd_desired_anchors;

  IF (v_rows, v_total_cents, v_child_cents)
       IS DISTINCT FROM (747::bigint, 6570540::bigint, 6384540::bigint) THEN
    RAISE EXCEPTION 'GT CD_SD anchor payload failed: rows %, total %, child % cents',
      v_rows, v_total_cents, v_child_cents;
  END IF;

  IF (SELECT ROUND(amount * 100)::bigint
        FROM gt_cd_sd_desired_anchors WHERE account_code = 'CD_SD') <> 186000 THEN
    RAISE EXCEPTION 'GT CD_SD direct residual anchor is not 1,860.00';
  END IF;

  SELECT string_agg(desired.account_code, ', ' ORDER BY desired.account_code)
    INTO v_missing
    FROM gt_cd_sd_desired_anchors desired
    LEFT JOIN greentarget.account_codes account
      ON account.code = desired.account_code
   WHERE account.code IS NULL OR account.is_active IS DISTINCT FROM true;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'GT CD_SD anchor account(s) missing/inactive: %', left(v_missing, 400);
  END IF;
END
$anchor_payload_gate$;

INSERT INTO greentarget.account_opening_balances (
  account_code, as_of_date, amount, notes, created_by
)
SELECT account_code, DATE '2026-07-01', amount, notes, ${sqlQuote(ACTOR)}
  FROM gt_cd_sd_desired_anchors
ON CONFLICT (account_code, as_of_date) DO UPDATE
   SET amount = EXCLUDED.amount,
       notes = EXCLUDED.notes,
       created_by = EXCLUDED.created_by,
       updated_at = CURRENT_TIMESTAMP
 WHERE (greentarget.account_opening_balances.amount,
        greentarget.account_opening_balances.notes,
        greentarget.account_opening_balances.created_by)
   IS DISTINCT FROM
       (EXCLUDED.amount, EXCLUDED.notes, EXCLUDED.created_by);

DO $verify$
DECLARE
  v_bad text;
  v_rows bigint;
  v_cents bigint;
BEGIN
  SELECT string_agg(fixture.account_code, ', ' ORDER BY fixture.account_code)
    INTO v_bad
    FROM gt_cd_sd_visible_fixture fixture
    LEFT JOIN greentarget.account_codes account
      ON account.code = fixture.account_code
   WHERE account.code IS NULL
      OR (account.description, account.ledger_type, account.parent_code,
          account.level, account.sort_order, account.is_active,
          account.is_system, account.fs_note)
         IS DISTINCT FROM
         (fixture.description, 'TD'::varchar, 'CD_SD'::varchar, 3,
          fixture.sort_order, true, false, '22'::varchar);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'GT CD_SD persisted child account(s) differ from evidence: %',
      left(v_bad, 400);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM greentarget.account_codes
     WHERE code = 'CD_SD' AND is_system = true AND is_active = true
  ) THEN
    RAISE EXCEPTION 'GT CD_SD control was not marked active/system';
  END IF;

  IF EXISTS (
    SELECT 1 FROM greentarget.account_codes WHERE code = ${sqlQuote(
      SYNTHETIC_SNAPSHOT_CODE
    )}
  ) THEN
    RAISE EXCEPTION 'GT CD_SD synthetic residual was created as an account';
  END IF;

  SELECT COUNT(*) INTO v_rows
    FROM gt_cd_sd_desired_snapshots desired
    JOIN greentarget.debtor_subledger_snapshots actual
      ON actual.as_of_month = desired.as_of_month
     AND actual.account_code = desired.account_code
   WHERE (actual.closing_balance, actual.movement, actual.source_file,
          actual.source_sha256, actual.source_page, actual.source_row,
          actual.provenance, actual.notes)
         IS NOT DISTINCT FROM
         (desired.closing_balance, desired.movement, desired.source_file,
          desired.source_sha256, desired.source_page, desired.source_row,
          desired.provenance, desired.notes);
  IF v_rows <> 1494 THEN
    RAISE EXCEPTION 'GT CD_SD persisted snapshots match % of 1494 desired rows', v_rows;
  END IF;

  SELECT COUNT(*), SUM(ROUND(actual.amount * 100))::bigint
    INTO v_rows, v_cents
    FROM gt_cd_sd_desired_anchors desired
    JOIN greentarget.account_opening_balances actual
      ON actual.account_code = desired.account_code
     AND actual.as_of_date = DATE '2026-07-01'
   WHERE (actual.amount, actual.notes, actual.created_by)
         IS NOT DISTINCT FROM
         (desired.amount, desired.notes, ${sqlQuote(ACTOR)}::varchar);
  IF (v_rows, v_cents) IS DISTINCT FROM (747::bigint, 6570540::bigint) THEN
    RAISE EXCEPTION 'GT CD_SD persisted anchors match % rows totalling % cents, expected 747 / 6570540',
      v_rows, v_cents;
  END IF;

  IF EXISTS (
    (SELECT * FROM gt_cd_sd_prejuly_anchor_baseline
     EXCEPT
     SELECT * FROM greentarget.account_opening_balances
      WHERE as_of_date < DATE '2026-07-01')
    UNION ALL
    (SELECT * FROM greentarget.account_opening_balances
      WHERE as_of_date < DATE '2026-07-01'
     EXCEPT
     SELECT * FROM gt_cd_sd_prejuly_anchor_baseline)
  ) THEN
    RAISE EXCEPTION 'GT CD_SD migration changed a pre-July opening anchor';
  END IF;

  RAISE NOTICE 'GT CD_SD OK: 746 canonical children; 1,494 May/June snapshot rows; July anchors 747 rows / 65,705.40; pre-July anchors unchanged.';
END
$verify$;

COMMIT;
`;
}

function verifySourcePdf() {
  if (!fs.existsSync(SOURCE_PDF)) {
    if (!CHECK_ONLY) die(`hash-pinned source PDF is missing: ${SOURCE_PDF}`);
    return;
  }
  const actual = sha256(fs.readFileSync(SOURCE_PDF));
  if (actual !== SOURCE_SHA256) {
    die(`source PDF SHA-256 is ${actual}; expected ${SOURCE_SHA256}`);
  }
}

function main() {
  verifySourcePdf();
  const rows = validateRows(CHECK_ONLY ? loadFixture() : loadParts());
  const fixtureText = renderFixture(rows);
  const fixtureSha256 = sha256(fixtureText);
  const migrationText = renderMigration(rows, fixtureSha256);

  if (CHECK_ONLY) {
    const fixtureMatches =
      fs.existsSync(FIXTURE) && fs.readFileSync(FIXTURE, "utf8") === fixtureText;
    const migrationMatches =
      fs.existsSync(MIGRATION) &&
      fs.readFileSync(MIGRATION, "utf8") === migrationText;
    console.log(`fixture rows: ${rows.length}`);
    console.log(`fixture SHA-256: ${fixtureSha256}`);
    console.log(`fixture on disk matches derivation: ${fixtureMatches}`);
    console.log(`migration on disk matches derivation: ${migrationMatches}`);
    process.exit(fixtureMatches && migrationMatches ? 0 : 1);
  }

  fs.writeFileSync(FIXTURE, fixtureText, "utf8");
  fs.writeFileSync(MIGRATION, migrationText, "utf8");
  console.log(`wrote ${path.relative(REPO, FIXTURE)} (${rows.length} rows)`);
  console.log(`fixture SHA-256: ${fixtureSha256}`);
  console.log(`wrote ${path.relative(REPO, MIGRATION)}`);
  console.log(
    "visible totals: closing 63845.40; June -740.00; May -5350.00"
  );
  console.log(
    "control totals: closing 65705.40; June -740.00; May -5510.00"
  );
}

main();
