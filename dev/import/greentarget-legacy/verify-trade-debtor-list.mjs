#!/usr/bin/env node
/**
 * Focused verifier for the official Green Target legacy Trade Debtor List.
 * Read-only: it calls the same report service used by the API and changes no
 * database row.
 *
 * Usage:
 *   node dev/import/greentarget-legacy/verify-trade-debtor-list.mjs
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildGreenTargetLegacyDebtorList } from "../../../src/routes/greentarget/accounting/trade-debtor-list.js";
import { createDatabasePool } from "../../../src/routes/utils/db-pool.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const SOURCE_PDF = path.join(REPO, "GT_TRADE_DEBTORS.pdf");
const CHILD_FIXTURE = path.join(HERE, "cd_sd_subledger_evidence.csv");
const DEBTOR_MAP = path.join(HERE, "debtor-map.json");
const SOURCE_SHA256 =
  "fe0b5989e73d11aa7dcfe0b062b4fec0405beefc79b2ad1d18322d52a80a29d0";
const USER_AUDIT_SHA256 =
  "15a83afe4617366cdeeeb03befa6d81cc13f6e32bc9bc4aa8dfdc939a4cb4a0";
const SOURCE_ONLY = process.argv.includes("--source-only");
const POST_CUTOVER_CODES = new Set([
  "CD-ZEXIE",
  "CD-MIZAN",
  "CD-ALISWODI",
  "CD-ABE",
  "CD-KELVINYAP",
  "CD-MIMIEE",
]);
const MOVEMENT_ONLY_CHILDREN = new Set([
  "BONUSOON",
  "CD-EVENT",
  "CD-HONG",
  "CD-HQ",
  "CD-IKBN",
  "CD-MAPS",
  "CD-NEWTECH",
  "CD-VOR",
  "CD-WTW",
  "FOREGAL",
]);
const USER_CONFIRMED_JUNE_CLOSE_CENTS = new Map([
  ["CD-CASH", 1_513_400],
  ["CD-DURA", 90_000],
  ["CD-LIST", 1_381_000],
  ["CD-SITI", -1_000],
]);
const USER_CONFIRMED_JULY_CLOSE_CENTS = new Map([
  ["CD-CASH", 1_605_400],
  ["CD-DURA", 110_000],
  ["CD-LIST", 1_644_000],
  ["CD-SITI", -1_000],
]);
const USER_CONFIRMED_JULY_MOVEMENT_CENTS = new Map([
  ["CD-CASH", 92_000],
  ["CD-DURA", 20_000],
  ["CD-LIST", 263_000],
  ["CD-SITI", 0],
]);

const pool = createDatabasePool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "tienhock",
  password: process.env.DB_PASSWORD || "REMOVED_SECRET",
  port: Number(process.env.DB_PORT || 5434),
});

let checks = 0;

/** @param {boolean} condition @param {string} message */
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  checks += 1;
  console.log(`ok  ${message}`);
};

/** @param {number|string} value @returns {number} */
const cents = (value) => Math.round(Number(value) * 100);

/** @param {string} text @returns {Array<Record<string, string>>} */
const parseCsv = (text) => {
  /** @type {string[][]} */
  const records = [];
  /** @type {string[]} */
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  const [headers, ...rows] = records;
  return rows
    .filter((row) => row.some((value) => value !== ""))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""])
      )
    );
};

/** @param {string} filePath @returns {string} */
const sha256File = (filePath) =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

/** @param {number} childRows @returns {number} */
const expectedPdfPages = (childRows) => 1 + Math.max(1, Math.ceil(childRows / 44));

async function main() {
  assert(fs.existsSync(SOURCE_PDF), "source PDF is present");
  assert(sha256File(SOURCE_PDF) === SOURCE_SHA256, "source PDF hash is pinned");

  const fixture = parseCsv(fs.readFileSync(CHILD_FIXTURE, "utf8"));
  const debtorMap = JSON.parse(fs.readFileSync(DEBTOR_MAP, "utf8"));
  assert(fixture.length === 746, "child fixture contains 746 visible identities");
  assert(debtorMap.debtors.length === 28, "direct fixture contains 28 identities");
  const childPageCounts = new Map();
  for (const row of fixture) {
    const page = Number(row.source_page);
    childPageCounts.set(page, (childPageCounts.get(page) || 0) + 1);
  }
  assert(
    childPageCounts.size === 17 &&
      [...childPageCounts.entries()].every(
        ([page, count]) => count === (page === 18 ? 42 : 44)
      ),
    "source child pagination is 44 rows on pages 2-17 and 42 on page 18"
  );
  assert(expectedPdfPages(fixture.length) === 18, "source show-all layout is 18 pages");
  if (SOURCE_ONLY) {
    console.log(`PASS: ${checks} source-only Trade Debtor List checks passed.`);
    return;
  }

  const [full, hidden, july] = await Promise.all([
    buildGreenTargetLegacyDebtorList(pool, {
      year: 2026,
      month: 6,
      hideZero: false,
    }),
    buildGreenTargetLegacyDebtorList(pool, {
      year: 2026,
      month: 6,
      hideZero: true,
    }),
    buildGreenTargetLegacyDebtorList(pool, {
      year: 2026,
      month: 7,
      hideZero: false,
    }),
  ]);

  assert(full.direct.rows.length === 28, "June page 1 contains 28 direct debtors");
  assert(full.cd_sd.rows.length === 746, "June child section contains 746 identities");
  assert(
    full.direct.rows.map((row) => row.account_no).join("|") ===
      debtorMap.debtors.map((row) => row.legacy_code).join("|"),
    "June direct-debtor order matches the source map"
  );
  const directMismatchIndex = debtorMap.debtors.findIndex((expected, index) => {
    const actual = full.direct.rows[index];
    return !(
      actual &&
      actual.account_no === expected.legacy_code &&
      actual.particular === expected.legacy_description &&
      cents(actual.closing_balance) === cents(expected.closing_2026_06_30)
    );
  });
  assert(
    directMismatchIndex === -1,
    `all 28 direct identities/descriptions/closes match the source${
      directMismatchIndex === -1
        ? ""
        : ` (first mismatch row ${directMismatchIndex + 1})`
    }`
  );

  const childMismatchIndex = fixture.findIndex((expected, index) => {
    const actual = full.cd_sd.rows[index];
    const expectedClosingCents =
      USER_CONFIRMED_JUNE_CLOSE_CENTS.get(expected.account_code) ??
      cents(expected.closing_2026_06_30);
    return !(
      actual &&
      actual.account_no === expected.account_code &&
      actual.particular === expected.account_description &&
      actual.source_page === Number(expected.source_page) &&
      actual.source_row === Number(expected.source_row) &&
      cents(actual.closing_balance) === expectedClosingCents &&
      cents(actual.current_month) === cents(expected.june_2026_movement) &&
      cents(actual.previous_month) === cents(expected.may_2026_movement)
    );
  });
  assert(
    childMismatchIndex === -1,
    `all 746 child identities/order/movements match the source, with the user-confirmed close overlay (${USER_AUDIT_SHA256})${
      childMismatchIndex === -1 ? "" : ` (first mismatch row ${childMismatchIndex + 1})`
    }`
  );

  const directTotals = full.direct.control_totals;
  assert(cents(directTotals.closing_balance) === 15_678_222, "direct close is RM156,782.22");
  assert(cents(directTotals.current_month) === 60_145, "direct June movement is RM601.45");
  assert(cents(directTotals.previous_month) === -663_060, "direct May movement is -RM6,630.60");

  const visibleTotals = full.cd_sd.visible_totals;
  assert(cents(visibleTotals.closing_balance) === 6_570_540, "visible child close is RM65,705.40");
  assert(cents(visibleTotals.current_month) === -74_000, "visible child June movement is -RM740.00");
  assert(cents(visibleTotals.previous_month) === -535_000, "visible child May movement is -RM5,350.00");

  const controlTotals = full.cd_sd.control_totals;
  assert(cents(controlTotals.closing_balance) === 6_570_540, "CD_SD control close is RM65,705.40");
  assert(cents(controlTotals.current_month) === -74_000, "CD_SD control June movement is -RM740.00");
  assert(cents(controlTotals.previous_month) === -551_000, "CD_SD control May movement is -RM5,510.00");

  const residual = full.cd_sd.reconciliation_residual;
  assert(cents(residual.closing_balance) === 0, "residual close is RM0.00");
  assert(cents(residual.current_month) === 0, "residual June movement is RM0.00");
  assert(cents(residual.previous_month) === -16_000, "residual May movement is -RM160.00");
  assert(
    !full.cd_sd.rows.some((row) => row.account_no === "CD_SD (UNALLOCATED)"),
    "residual is not presented as a customer row"
  );
  assert(
    !full.cd_sd.rows.some((row) => POST_CUTOVER_CODES.has(row.account_no)),
    "six July-created identities do not leak into June"
  );

  assert(july.cd_sd.rows.length === 752, "July contains 746 legacy plus six new sundry identities");
  assert(
    [...POST_CUTOVER_CODES].every((code) =>
      july.cd_sd.rows.some((row) => row.account_no === code)
    ),
    "all six post-cutover identities enter the July membership"
  );
  assert(
    !july.cd_sd.rows.some(
      (row) =>
        row.account_no === "CD_SD" ||
        row.account_no === "CD_SD (UNALLOCATED)"
    ),
    "July child rows exclude both control and reconciliation identities"
  );
  for (const [accountCode, expectedCloseCents] of USER_CONFIRMED_JULY_CLOSE_CENTS) {
    const row = july.cd_sd.rows.find((candidate) => candidate.account_no === accountCode);
    assert(
      row &&
        cents(row.closing_balance) === expectedCloseCents &&
        cents(row.current_month) ===
          USER_CONFIRMED_JULY_MOVEMENT_CENTS.get(accountCode),
      `${accountCode} July close matches the user-confirmed audit while movement stays unchanged`
    );
  }
  assert(
    cents(july.cd_sd.visible_totals.closing_balance) === 8_373_040,
    "July visible child close is RM83,730.40"
  );
  assert(
    cents(july.cd_sd.reconciliation_residual.closing_balance) === 0,
    "July closing reconciliation residual is RM0.00"
  );
  assert(
    cents(july.cd_sd.reconciliation_residual.current_month) === 0,
    "all July CD_SD control movement is assigned to a sundry identity"
  );

  assert(hidden.direct.rows.length === 14, "hide-zero retains 14 direct rows");
  assert(hidden.cd_sd.rows.length === 83, "hide-zero retains 83 child rows");
  assert(
    hidden.direct.rows.some((row) => row.account_no === "PAUMIN") &&
      hidden.direct.rows.some((row) => row.account_no === "SUN TARGET"),
    "zero-close direct debtors with movement remain visible"
  );
  assert(
    [...MOVEMENT_ONLY_CHILDREN].every((code) =>
      hidden.cd_sd.rows.some((row) => row.account_no === code)
    ),
    "all ten zero-close child debtors with movement remain visible"
  );
  assert(expectedPdfPages(full.cd_sd.rows.length) === 18, "show-all PDF is 18 pages");
  assert(expectedPdfPages(hidden.cd_sd.rows.length) === 3, "hide-zero PDF is 3 pages");

  console.log(`PASS: ${checks} focused Trade Debtor List checks passed.`);
}

try {
  await main();
} finally {
  await pool.end();
}
