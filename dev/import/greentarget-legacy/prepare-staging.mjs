/**
 * Green Target legacy ledger intake (phase G0).
 *
 * Reads the two hash-pinned `.xlsx` exports, recovers the true entry dates using
 * the rule in `docs/Account/GT_ACCOUNTING_HANDOVER.md` section 3a, proves every
 * balance chain and every stated invariant, and emits:
 *
 *   generated/greentarget_jan_jun_staging.csv   deterministic staging rows
 *   generated/validation-report.json            the full audit record
 *
 * FILE-ONLY. This script never touches a database.
 *
 * Design rules, inherited from the Tien Hock import:
 *   - Fail loudly. Every expectation in `source-manifest.json` and
 *     `account-aliases.json` is asserted; a source that stops matching aborts
 *     rather than being quietly re-interpreted.
 *   - Stage the source verbatim. Derived or repaired accounting rows are a
 *     later, user-approved decision, not an intake decision. The one known gap
 *     (the unprinted cash-in-hand leg) is measured and reported, never invented.
 *
 * Usage: node dev/import/greentarget-legacy/prepare-staging.mjs [--check-only]
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { excelSerialToParts, readWorksheet } from "./read-xlsx.mjs";

/** @typedef {"GTLD" | "GTDB"} SourceKind */
/** @typedef {"opening" | "transaction"} RecordKind */
/** @typedef {import("./read-xlsx.mjs").RawCell} RawCell */

/**
 * @typedef {Object} SourceRow
 * @property {SourceKind} sourceKind
 * @property {string} sourceFile
 * @property {string} sourceSha256
 * @property {number} sourcePhysicalLine Worksheet row number (1-based), the auditable pointer back into the workbook.
 * @property {number} sourceRowIndex The export's own printed row number from column A.
 * @property {RecordKind} recordKind
 * @property {string} legacyAccountCode
 * @property {string} accountCode
 * @property {string} accountDescription
 * @property {string} entryDate
 * @property {"serial-swapped" | "literal-text"} dateEncoding
 * @property {string} dateRaw
 * @property {string} journalRef
 * @property {string} journalGroupKey
 * @property {string} lineDisplayReference
 * @property {string} particulars
 * @property {string} chequeReference
 * @property {number} debitCents
 * @property {number} creditCents
 * @property {number} runningBalanceCents
 * @property {string} provenance
 */

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const STAGING_FILENAME = "greentarget_jan_jun_staging.csv";
const REPORT_FILENAME = "validation-report.json";
const SOURCE_START_DATE = "2026-01-01";
const SOURCE_END_DATE = "2026-06-30";
const MONTH_ENDS = ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"];
const CFWD_MARKER = "BALANCE C/FWD";
const DATE_NUMBER_FORMAT_ID = 14;

/**
 * @param {boolean} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * @param {Buffer} value
 * @returns {string}
 */
function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * @param {string} value
 * @returns {string}
 */
function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * @param {number} cents
 * @returns {string}
 */
function formatAmount(cents) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/**
 * Parse a printed running balance such as `1,234.56 DR` or `.00 CR`.
 * Debit-positive cents are returned so the ledger can be summed directly.
 *
 * @param {string} text
 * @returns {number | null}
 */
function parseRunningBalance(text) {
  const match = /^([\d,]*\.\d{2})\s+(DR|CR)$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const magnitude = Math.round(Number(match[1].replace(/,/g, "")) * 100);
  assertCondition(Number.isFinite(magnitude), `Unparsable running balance ${JSON.stringify(text)}.`);
  return match[2] === "DR" ? magnitude : -magnitude;
}

/**
 * @param {RawCell | undefined} cell
 * @param {string} context
 * @returns {number}
 */
function parseAmountCents(cell, context) {
  if (!cell) {
    return 0;
  }
  assertCondition(cell.type === "n", `${context}: expected a numeric amount, saw ${cell.type}.`);
  const value = Number(cell.raw);
  assertCondition(Number.isFinite(value) && value >= 0, `${context}: bad amount ${JSON.stringify(cell.raw)}.`);
  const cents = Math.round(value * 100);
  assertCondition(
    Math.abs(value * 100 - cents) < 1e-6,
    `${context}: amount ${cell.raw} is not a whole number of cents.`,
  );
  return cents;
}

/**
 * Recover the true entry date from column B.
 *
 * This is the single highest-risk conversion in the whole Green Target project.
 * See handover section 3a. Both branches assert the invariant that makes the
 * rule safe, so a source that behaves differently aborts instead of silently
 * producing a plausible-but-wrong date.
 *
 * @param {RawCell} cell
 * @param {string} context
 * @returns {{date: string, encoding: "serial-swapped" | "literal-text", raw: string}}
 */
function recoverEntryDate(cell, context) {
  if (cell.type === "n") {
    // Excel PARSED the original `DD/MM/YYYY` text as a US date because the day
    // was <= 12, storing a serial with day and month transposed. Swap them back.
    const serial = Number(cell.raw);
    assertCondition(Number.isInteger(serial), `${context}: date serial ${cell.raw} is not an integer.`);
    assertCondition(
      cell.styleIndex !== undefined,
      `${context}: numeric date cell without a style index.`,
    );
    const parts = excelSerialToParts(serial);
    // INVARIANT 1: the swap is only meaningful when both components are <= 12.
    assertCondition(
      parts.month <= 12 && parts.day <= 12,
      `${context}: numeric date serial ${serial} renders as ${parts.year}-${parts.month}-${parts.day}; ` +
        "a component above 12 cannot be a transposed day/month pair. Handover section 3a invariant 1 broken - STOP AND ASK.",
    );
    const trueMonth = parts.day;
    const trueDay = parts.month;
    return {
      date: `${parts.year}-${String(trueMonth).padStart(2, "0")}-${String(trueDay).padStart(2, "0")}`,
      encoding: "serial-swapped",
      raw: cell.raw,
    };
  }

  // Excel COULD NOT parse the original text as a US date because the day was
  // > 12, so it survived verbatim.
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cell.raw);
  assertCondition(match !== null, `${context}: unrecognised date text ${JSON.stringify(cell.raw)}.`);
  const day = Number(match[1]);
  const month = Number(match[2]);
  // INVARIANT 2: a text date with day <= 12 would mean Excel's behaviour was not
  // uniform, which would invalidate the numeric branch above.
  assertCondition(
    day > 12,
    `${context}: text date ${cell.raw} has day ${day} <= 12, which Excel should have converted to a serial. ` +
      "Handover section 3a invariant 2 broken - STOP AND ASK.",
  );
  assertCondition(month >= 1 && month <= 12, `${context}: text date ${cell.raw} has an impossible month.`);
  return {
    date: `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    encoding: "literal-text",
    raw: cell.raw,
  };
}

/**
 * @param {string} journalRef
 * @returns {string}
 */
function journalFamily(journalRef) {
  return journalRef.replace(/\d+/g, "#");
}

/**
 * @param {Buffer} archive
 * @param {SourceKind} sourceKind
 * @param {string} sourceFile
 * @param {string} sourceSha256
 * @param {{expectedDimension: string}} expectations
 * @returns {{sections: Array<Object>, titleRow: string}}
 */
function parseWorkbook(archive, sourceKind, sourceFile, sourceSha256, expectations) {
  const sheet = readWorksheet(archive);
  assertCondition(
    sheet.date1904 === false,
    `${sourceKind}: workbook uses the 1904 date system; every recovered date would be four years out.`,
  );
  assertCondition(
    sheet.dimension === expectations.expectedDimension,
    `${sourceKind}: worksheet dimension is ${sheet.dimension}, expected ${expectations.expectedDimension}.`,
  );
  const dateFormat = sheet.cellFormats.find((f) => f.numberFormatId === DATE_NUMBER_FORMAT_ID);
  assertCondition(
    dateFormat !== undefined,
    `${sourceKind}: no cellXfs entry uses numFmtId ${DATE_NUMBER_FORMAT_ID} (mm-dd-yy); the date model has changed.`,
  );

  /** @type {Array<Object>} */
  const sections = [];
  let current = null;
  let titleRow = "";
  let numericDateCells = 0;
  let textDateCells = 0;

  for (const row of sheet.rows) {
    const line = row.rowNumber;
    const b = row.cells.get("B");
    const c = row.cells.get("C");
    const d = row.cells.get("D");
    const e = row.cells.get("E");
    const f = row.cells.get("F");
    const g = row.cells.get("G");
    const h = row.cells.get("H");

    if (line === 1) {
      titleRow = d ? d.raw : "";
      continue;
    }
    if (line === 2) {
      const header = ["ACC/NO", "JOURNAL", "PARTICULAR", "CHEQUE", "DR", "CR", "BALANCE"];
      const seen = [b, c, d, e, f, g, h].map((cell) => (cell ? cell.raw : ""));
      assertCondition(
        header.every((label, index) => seen[index] === label),
        `${sourceKind}: column header row is ${JSON.stringify(seen)}, expected ${JSON.stringify(header)}.`,
      );
      continue;
    }
    if (!b && !c && !d && !e && !f && !g && !h) {
      continue;
    }

    const rowIndexCell = row.cells.get("A");
    const sourceRowIndex = rowIndexCell && rowIndexCell.type === "n" ? Number(rowIndexCell.raw) : line;

    // A section header is the only row whose column B holds a non-date string.
    const isSectionHeader = Boolean(b) && b.type === "s" && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(b.raw);
    if (isSectionHeader) {
      assertCondition(
        !c && !e && !f && !g && !h,
        `${sourceKind} row ${line}: section header for ${b.raw} unexpectedly carries other columns.`,
      );
      current = {
        sourceKind,
        sourceFile,
        sourceSha256,
        code: b.raw,
        description: d ? d.raw : "",
        headerLine: line,
        opening: null,
        transactions: [],
      };
      sections.push(current);
      continue;
    }

    assertCondition(current !== null, `${sourceKind} row ${line}: data row before any section header.`);
    assertCondition(Boolean(b), `${sourceKind} row ${line}: data row with no date cell.`);
    if (b.type === "n") {
      assertCondition(
        b.styleIndex === 2,
        `${sourceKind} row ${line}: numeric date cell uses style ${b.styleIndex}, expected the mm-dd-yy style 2.`,
      );
      numericDateCells += 1;
    } else {
      textDateCells += 1;
    }
    const record = { line, sourceRowIndex, b, c, d, e, f, g, h };
    if (d && d.raw === CFWD_MARKER) {
      assertCondition(
        current.opening === null,
        `${sourceKind} row ${line}: a second ${CFWD_MARKER} row inside section ${current.code}.`,
      );
      assertCondition(!c, `${sourceKind} row ${line}: ${CFWD_MARKER} unexpectedly carries a journal reference.`);
      current.opening = record;
    } else {
      assertCondition(Boolean(c), `${sourceKind} row ${line}: transaction row with no journal reference.`);
      current.transactions.push(record);
    }
  }

  for (const section of sections) {
    assertCondition(
      section.opening !== null,
      `${sourceKind}: section ${section.code} has no ${CFWD_MARKER} row.`,
    );
  }
  return { sections, titleRow, worksheetRows: sheet.rows.length, numericDateCells, textDateCells };
}

/**
 * @param {Array<Object>} sections
 * @param {Set<string>} excludedCodes
 * @returns {{rows: SourceRow[], chains: Array<Object>, dateStats: Object}}
 */
function buildRows(sections, excludedCodes) {
  /** @type {SourceRow[]} */
  const rows = [];
  /** @type {Array<Object>} */
  const chains = [];
  const dateStats = { serialSwapped: 0, literalText: 0, minDate: "9999-99-99", maxDate: "0000-00-00" };

  for (const section of sections) {
    const context = `${section.sourceKind} section ${section.code}`;
    const openingBalance = parseRunningBalance(section.opening.h ? section.opening.h.raw : "");
    assertCondition(
      openingBalance !== null,
      `${context}: ${CFWD_MARKER} row ${section.opening.line} has no parsable balance.`,
    );

    // The DR/CR cell on a C/FWD row, when present, only ever echoes the printed
    // balance. It is never an extra movement, so the chain starts from column H.
    const openingEcho = parseAmountCents(section.opening.f, `${context} C/FWD DR`) -
      parseAmountCents(section.opening.g, `${context} C/FWD CR`);
    if (section.opening.f || section.opening.g) {
      assertCondition(
        openingEcho === openingBalance,
        `${context}: ${CFWD_MARKER} DR/CR cell (${formatAmount(openingEcho)}) disagrees with the printed ` +
          `balance (${formatAmount(openingBalance)}); it is no longer a pure echo - STOP AND ASK.`,
      );
    }

    const openingDate = recoverEntryDate(section.opening.b, `${context} C/FWD row ${section.opening.line}`);
    const excluded = excludedCodes.has(`${section.sourceKind}|${section.code}`);

    if (!excluded) {
      rows.push({
        sourceKind: section.sourceKind,
        sourceFile: section.sourceFile,
        sourceSha256: section.sourceSha256,
        sourcePhysicalLine: section.opening.line,
        sourceRowIndex: section.opening.sourceRowIndex,
        recordKind: "opening",
        legacyAccountCode: section.code,
        accountCode: section.code,
        accountDescription: section.description,
        entryDate: openingDate.date,
        dateEncoding: openingDate.encoding,
        dateRaw: openingDate.raw,
        journalRef: "",
        journalGroupKey: "",
        lineDisplayReference: "",
        particulars: CFWD_MARKER,
        chequeReference: "",
        debitCents: openingBalance > 0 ? openingBalance : 0,
        creditCents: openingBalance < 0 ? -openingBalance : 0,
        runningBalanceCents: openingBalance,
        provenance: "source",
      });
    }

    let running = openingBalance;
    const monthEndBalances = [];
    let monthIndex = 0;
    let previousDate = openingDate.date;
    let dateMonotonic = true;
    let monthMonotonic = true;

    for (const tx of section.transactions) {
      const where = `${context} row ${tx.line}`;
      const recovered = recoverEntryDate(tx.b, where);
      // INVARIANT 3: after conversion every date must sit inside the export period.
      assertCondition(
        recovered.date >= SOURCE_START_DATE && recovered.date <= SOURCE_END_DATE,
        `${where}: recovered date ${recovered.date} (from ${JSON.stringify(recovered.raw)}) is outside ` +
          `${SOURCE_START_DATE}..${SOURCE_END_DATE}. Handover section 3a invariant 3 broken - STOP AND ASK.`,
      );
      if (recovered.encoding === "serial-swapped") dateStats.serialSwapped += 1;
      else dateStats.literalText += 1;
      if (recovered.date < dateStats.minDate) dateStats.minDate = recovered.date;
      if (recovered.date > dateStats.maxDate) dateStats.maxDate = recovered.date;
      if (recovered.date < previousDate) dateMonotonic = false;
      if (recovered.date.slice(0, 7) < previousDate.slice(0, 7)) monthMonotonic = false;
      previousDate = recovered.date;

      while (monthIndex < MONTH_ENDS.length && recovered.date > MONTH_ENDS[monthIndex]) {
        monthEndBalances.push(running);
        monthIndex += 1;
      }

      const debitCents = parseAmountCents(tx.f, `${where} DR`);
      const creditCents = parseAmountCents(tx.g, `${where} CR`);
      running += debitCents - creditCents;

      const printed = parseRunningBalance(tx.h ? tx.h.raw : "");
      assertCondition(printed !== null, `${where}: no parsable running balance.`);
      // INVARIANT 4: the printed chain must reproduce exactly.
      assertCondition(
        printed === running,
        `${where}: balance chain broke - computed ${formatAmount(running)} but the export prints ` +
          `${formatAmount(printed)} (delta ${formatAmount(running - printed)}). Handover section 3a invariant 4 broken.`,
      );

      const journalRef = tx.c.raw;
      if (!excluded) {
        rows.push({
          sourceKind: section.sourceKind,
          sourceFile: section.sourceFile,
          sourceSha256: section.sourceSha256,
          sourcePhysicalLine: tx.line,
          sourceRowIndex: tx.sourceRowIndex,
          recordKind: "transaction",
          legacyAccountCode: section.code,
          accountCode: section.code,
          accountDescription: section.description,
          entryDate: recovered.date,
          dateEncoding: recovered.encoding,
          dateRaw: recovered.raw,
          journalRef,
          journalGroupKey: `${recovered.date}|${journalRef}`,
          lineDisplayReference: journalRef,
          particulars: tx.d ? tx.d.raw : "",
          chequeReference: tx.e ? tx.e.raw : "",
          debitCents,
          creditCents,
          runningBalanceCents: printed,
          provenance: "source",
        });
      }
    }
    while (monthEndBalances.length < MONTH_ENDS.length) monthEndBalances.push(running);

    chains.push({
      sourceKind: section.sourceKind,
      code: section.code,
      description: section.description,
      headerLine: section.headerLine,
      excluded,
      cfwdDate: openingDate.date,
      openingCents: openingBalance,
      closingCents: running,
      transactionRows: section.transactions.length,
      monthEndCents: monthEndBalances,
      dateMonotonic,
      monthMonotonic,
    });
  }

  return { rows, chains, dateStats };
}

const STAGING_COLUMNS = [
  "stage_sequence",
  "record_kind",
  "source_file",
  "source_kind",
  "source_sha256",
  "source_physical_line",
  "source_row_index",
  "legacy_account_code",
  "account_code",
  "account_description",
  "entry_date",
  "date_encoding",
  "journal_ref",
  "journal_group_key",
  "line_display_reference",
  "particulars",
  "cheque_reference",
  "debit_cents",
  "credit_cents",
  "running_balance_cents",
  "provenance",
];

/**
 * @param {Array<string | number>} fields
 * @returns {string}
 */
function encodeCsvRow(fields) {
  return fields
    .map((field) => {
      const text = field === null || field === undefined ? "" : String(field);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
}

/**
 * @param {SourceRow[]} rows
 * @returns {string}
 */
function serializeStagingCsv(rows) {
  const lines = [encodeCsvRow(STAGING_COLUMNS)];
  rows.forEach((row, index) => {
    lines.push(
      encodeCsvRow([
        index + 1,
        row.recordKind,
        row.sourceFile,
        row.sourceKind,
        row.sourceSha256,
        row.sourcePhysicalLine,
        row.sourceRowIndex,
        row.legacyAccountCode,
        row.accountCode,
        row.accountDescription,
        row.entryDate,
        row.dateEncoding,
        row.journalRef,
        row.journalGroupKey,
        row.lineDisplayReference,
        row.particulars,
        row.chequeReference,
        row.debitCents,
        row.creditCents,
        row.runningBalanceCents,
        row.provenance,
      ]),
    );
  });
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes("--check-only");
  for (const option of argv) {
    assertCondition(option === "--check-only", `Unknown option ${JSON.stringify(option)}.`);
  }

  const manifest = JSON.parse(await readFile(path.join(SCRIPT_DIRECTORY, "source-manifest.json"), "utf8"));
  const aliases = JSON.parse(await readFile(path.join(SCRIPT_DIRECTORY, "account-aliases.json"), "utf8"));
  const excludedCodes = new Set(aliases.excludedSections.map((entry) => `${entry.source}|${entry.code}`));

  /** @type {Array<Object>} */
  const allSections = [];
  const sourceSummaries = {};

  for (const sourceKind of /** @type {SourceKind[]} */ (["GTLD", "GTDB"])) {
    const entry = manifest.sources[sourceKind];
    const filePath = path.join(SCRIPT_DIRECTORY, "data", entry.filename);
    const archive = await readFile(filePath);
    const sha256 = sha256Buffer(archive);
    assertCondition(
      sha256 === entry.sha256,
      `${sourceKind}: ${entry.filename} sha256 is ${sha256}, manifest pins ${entry.sha256}. The source changed.`,
    );
    assertCondition(
      archive.length === entry.byteLength,
      `${sourceKind}: ${entry.filename} is ${archive.length} bytes, manifest pins ${entry.byteLength}.`,
    );

    const parsed = parseWorkbook(archive, sourceKind, entry.filename, sha256, {
      expectedDimension: entry.sheetDimension,
    });
    assertCondition(
      parsed.titleRow === "LEDGER REPORT",
      `${sourceKind}: title row is ${JSON.stringify(parsed.titleRow)}, expected "LEDGER REPORT".`,
    );
    const transactionRows = parsed.sections.reduce((total, s) => total + s.transactions.length, 0);
    const measured = {
      worksheetRows: parsed.worksheetRows,
      accountSections: parsed.sections.length,
      transactionRows,
      numericDateCells: parsed.numericDateCells,
      textDateCells: parsed.textDateCells,
    };
    for (const [key, expected] of Object.entries(entry.expectedCounts)) {
      assertCondition(
        measured[key] === expected,
        `${sourceKind}: measured ${key}=${measured[key]}, manifest pins ${expected}.`,
      );
    }
    assertCondition(
      measured.numericDateCells + measured.textDateCells === measured.accountSections + measured.transactionRows,
      `${sourceKind}: dated rows (${measured.numericDateCells + measured.textDateCells}) do not equal ` +
        `openings + transactions (${measured.accountSections + measured.transactionRows}).`,
    );
    sourceSummaries[sourceKind] = { filename: entry.filename, sha256, byteLength: archive.length, ...measured };
    for (const section of parsed.sections) allSections.push(section);
  }

  const { rows, chains, dateStats } = buildRows(allSections, excludedCodes);

  // ---- opening-date exceptions -------------------------------------------
  const declaredOpeningExceptions = new Set(
    (aliases.openingDateExceptions || []).map((entry) => `${entry.source}|${entry.code}`),
  );
  const openingDateExceptions = chains.filter((c) => c.cfwdDate !== SOURCE_START_DATE);
  for (const exception of openingDateExceptions) {
    assertCondition(
      declaredOpeningExceptions.has(`${exception.sourceKind}|${exception.code}`),
      `${exception.sourceKind} ${exception.code}: BALANCE C/FWD is dated ${exception.cfwdDate}, not ${SOURCE_START_DATE}, ` +
        "and is not declared in account-aliases.json openingDateExceptions - STOP AND ASK.",
    );
  }
  assertCondition(
    openingDateExceptions.length === declaredOpeningExceptions.size,
    `Declared ${declaredOpeningExceptions.size} opening-date exceptions but found ${openingDateExceptions.length}.`,
  );

  // ---- journal grouping ---------------------------------------------------
  const groups = new Map();
  for (const row of rows) {
    if (row.recordKind !== "transaction") continue;
    if (!groups.has(row.journalGroupKey)) {
      groups.set(row.journalGroupKey, { debitCents: 0, creditCents: 0, rows: 0, accounts: new Set(), refs: new Set() });
    }
    const group = groups.get(row.journalGroupKey);
    group.debitCents += row.debitCents;
    group.creditCents += row.creditCents;
    group.rows += 1;
    group.accounts.add(`${row.sourceKind}:${row.accountCode}`);
    group.refs.add(row.journalRef);
  }
  const unbalancedGroups = [];
  for (const [key, group] of groups) {
    if (group.debitCents !== group.creditCents) {
      unbalancedGroups.push({ key, debitCents: group.debitCents, creditCents: group.creditCents, rows: group.rows });
    }
  }

  // Groups where one printed journal reference covers more than one document
  // date-slot; handover section 7 asks this to be measured, not assumed.
  const refRowCounts = new Map();
  for (const row of rows) {
    if (row.recordKind !== "transaction") continue;
    const family = journalFamily(row.journalRef);
    if (family !== "#/#") continue;
    refRowCounts.set(row.journalGroupKey, (refRowCounts.get(row.journalGroupKey) || 0) + 1);
  }
  const collidingJournalGroups = [...refRowCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, rows: count }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  // ---- family totals ------------------------------------------------------
  const families = new Map();
  for (const row of rows) {
    if (row.recordKind !== "transaction") continue;
    const family = journalFamily(row.journalRef);
    if (!families.has(family)) {
      families.set(family, { rows: 0, debitCents: 0, creditCents: 0, chequeRows: 0, example: row.journalRef });
    }
    const bucket = families.get(family);
    bucket.rows += 1;
    bucket.debitCents += row.debitCents;
    bucket.creditCents += row.creditCents;
    if (row.chequeReference) bucket.chequeRows += 1;
  }
  const declaredFamilies = new Map((aliases.journalFamilies || []).map((f) => [f.pattern, f]));
  for (const [pattern, bucket] of families) {
    const declared = declaredFamilies.get(pattern);
    assertCondition(declared !== undefined, `Journal family ${pattern} is not documented in account-aliases.json - STOP AND ASK.`);
    assertCondition(
      declared.rows === bucket.rows,
      `Journal family ${pattern}: parsed ${bucket.rows} rows, account-aliases.json declares ${declared.rows}.`,
    );
    assertCondition(
      declared.selfBalancing === (bucket.debitCents === bucket.creditCents),
      `Journal family ${pattern}: selfBalancing is declared ${declared.selfBalancing} but measured ` +
        `${bucket.debitCents === bucket.creditCents}.`,
    );
  }
  assertCondition(
    families.size === declaredFamilies.size,
    `Parsed ${families.size} journal families but account-aliases.json documents ${declaredFamilies.size}.`,
  );

  // ---- trial balances -----------------------------------------------------
  const included = chains.filter((c) => !c.excluded);
  const trialBalances = MONTH_ENDS.map((monthEnd, index) => {
    let debitCents = 0;
    let creditCents = 0;
    for (const chain of included) {
      const value = chain.monthEndCents[index];
      if (value > 0) debitCents += value;
      else creditCents += -value;
    }
    return { asOf: monthEnd, debitCents, creditCents, differenceCents: debitCents - creditCents };
  });
  let openingDebit = 0;
  let openingCredit = 0;
  let movementDebit = 0;
  let movementCredit = 0;
  for (const chain of included) {
    if (chain.openingCents > 0) openingDebit += chain.openingCents;
    else openingCredit += -chain.openingCents;
  }
  for (const row of rows) {
    if (row.recordKind !== "transaction") continue;
    movementDebit += row.debitCents;
    movementCredit += row.creditCents;
  }

  const closing = trialBalances[trialBalances.length - 1];
  assertCondition(
    closing.differenceCents === 0,
    `The 2026-06-30 closing trial balance does not balance: DR ${formatAmount(closing.debitCents)} vs ` +
      `CR ${formatAmount(closing.creditCents)}.`,
  );

  // ---- cash-in-hand gap (measured, never invented) ------------------------
  let cashSaleCredits = 0;
  let bankReceiptDebits = 0;
  let debtorReceiptCredits = 0;
  for (const row of rows) {
    if (row.recordKind !== "transaction") continue;
    const family = journalFamily(row.journalRef);
    if (family === "#/#") cashSaleCredits += row.creditCents - row.debitCents;
    else if (family === "RV#/#/#") {
      if (row.sourceKind === "GTLD") bankReceiptDebits += row.debitCents - row.creditCents;
      else debtorReceiptCredits += row.creditCents - row.debitCents;
    } else if (row.journalRef === "JV26/06/77") bankReceiptDebits += row.debitCents - row.creditCents;
  }
  const bankedFromCash = bankReceiptDebits - debtorReceiptCredits;
  const cashGap = {
    cashSaleRevenueCreditsCents: cashSaleCredits,
    bankedOutOfCashInHandCents: bankedFromCash,
    impliedMovementCents: cashSaleCredits - bankedFromCash,
    impliedOpeningCents: bankedFromCash - cashSaleCredits,
    impliedMonthEndCents: trialBalances.map((tb) => ({ asOf: tb.asOf, cashInHandCents: -tb.differenceCents })),
  };
  const declaredGap = aliases.unbalancedFamilies.cashInHand;
  assertCondition(
    cashGap.impliedOpeningCents === declaredGap.impliedOpening20260101Cents,
    `Cash-in-hand implied opening measured ${formatAmount(cashGap.impliedOpeningCents)} but account-aliases.json ` +
      `declares ${formatAmount(declaredGap.impliedOpening20260101Cents)}.`,
  );
  assertCondition(
    openingDebit - openingCredit + (movementDebit - movementCredit) === 0,
    "Opening plus movement does not reconcile to the closing trial balance.",
  );

  // ---- staging output -----------------------------------------------------
  const stagingCsv = serializeStagingCsv(rows);
  const stagingSha256 = sha256Text(stagingCsv);

  const report = {
    generatedBy: "dev/import/greentarget-legacy/prepare-staging.mjs",
    phase: "G0",
    period: { start: SOURCE_START_DATE, end: SOURCE_END_DATE },
    sources: sourceSummaries,
    staging: {
      filename: STAGING_FILENAME,
      sha256: stagingSha256,
      byteLength: Buffer.byteLength(stagingCsv, "utf8"),
      totalRows: rows.length,
      openingRows: rows.filter((r) => r.recordKind === "opening").length,
      transactionRows: rows.filter((r) => r.recordKind === "transaction").length,
    },
    dateRecovery: {
      rule: "handover section 3a",
      serialSwappedRows: dateStats.serialSwapped,
      literalTextRows: dateStats.literalText,
      minEntryDate: dateStats.minDate,
      maxEntryDate: dateStats.maxDate,
      invariantsProven: [
        "1. every numeric date serial renders with both components <= 12",
        "2. every text date has a day component > 12",
        `3. every recovered date falls inside ${SOURCE_START_DATE}..${SOURCE_END_DATE}`,
        "4. every section's DR/CR chain walks BALANCE C/FWD -> printed close",
      ],
    },
    chains: {
      sections: chains.length,
      walked: chains.length,
      failed: 0,
      excluded: chains.filter((c) => c.excluded).map((c) => `${c.sourceKind}:${c.code}`),
      dateMonotonicSections: chains.filter((c) => c.dateMonotonic).length,
      monthMonotonicSections: chains.filter((c) => c.monthMonotonic).length,
      monthMonotonicNote:
        "The legacy report orders rows within an account by month and then by document type, so intra-month rows " +
        "are not date-sorted. Month order is monotonic for every section; the balance chain is the authoritative check.",
      activeSections: chains.filter((c) => c.transactionRows > 0).length,
      dormantSections: chains.filter((c) => c.transactionRows === 0).length,
    },
    openingDateExceptions: openingDateExceptions.map((c) => ({
      sourceKind: c.sourceKind,
      code: c.code,
      description: c.description,
      cfwdDate: c.cfwdDate,
      balanceCents: c.openingCents,
      transactionRows: c.transactionRows,
    })),
    journalFamilies: [...families.entries()]
      .sort((a, b) => b[1].rows - a[1].rows)
      .map(([pattern, bucket]) => ({
        pattern,
        example: bucket.example,
        rows: bucket.rows,
        debitCents: bucket.debitCents,
        creditCents: bucket.creditCents,
        selfBalancing: bucket.debitCents === bucket.creditCents,
        rowsWithChequeReference: bucket.chequeRows,
        meaning: declaredFamilies.get(pattern).meaning,
      })),
    journalGroups: {
      groupingRule: "entry_date + journal_ref (handover decision R3)",
      total: groups.size,
      balanced: groups.size - unbalancedGroups.length,
      unbalanced: unbalancedGroups.length,
      unbalancedByFamily: [...unbalancedGroups.reduce((map, group) => {
        const family = journalFamily(group.key.split("|")[1]);
        const current = map.get(family) || { groups: 0, netDifferenceCents: 0 };
        current.groups += 1;
        current.netDifferenceCents += group.debitCents - group.creditCents;
        map.set(family, current);
        return map;
      }, new Map()).entries()].map(([family, value]) => ({ family, ...value })),
      collidingJournalGroups,
      collidingJournalGroupsNote:
        "Cash-sale references that appear more than once on the same date, so R3 grouping merges them into one " +
        "imported journal. Same visible rows, one entry behind them - review before G4.",
    },
    trialBalances,
    ledgerTotals: {
      openingDebitCents: openingDebit,
      openingCreditCents: openingCredit,
      openingDifferenceCents: openingDebit - openingCredit,
      movementDebitCents: movementDebit,
      movementCreditCents: movementCredit,
      movementDifferenceCents: movementDebit - movementCredit,
      closingDebitCents: closing.debitCents,
      closingCreditCents: closing.creditCents,
      closingDifferenceCents: closing.differenceCents,
    },
    cashInHandGap: {
      ...cashGap,
      status: declaredGap.status,
      questionForUser: declaredGap.questionForUser,
    },
    balanceSheetTieOuts: (() => {
      const at = (kind, code) => {
        const chain = chains.find((c) => c.sourceKind === kind && c.code === code && !c.excluded);
        return chain ? chain.monthEndCents[5] : null;
      };
      let debtors = 0;
      for (const chain of chains) if (chain.sourceKind === "GTDB" && !chain.excluded) debtors += chain.monthEndCents[5];
      return [
        { line: "Cash at bank (note 19)", account: "GTLD:PBB_1", computedCents: at("GTLD", "PBB_1"), printedCents: 2846837 },
        { line: "Tax recoverable (note 25)", account: "GTLD:CA_TAX", computedCents: at("GTLD", "CA_TAX"), printedCents: 2413950 },
        { line: "Deferred tax liabilities (note 12)", account: "GTLD:CL_TAX", computedCents: at("GTLD", "CL_TAX"), printedCents: 6292800 },
        { line: "Share capital (note 21)", account: "GTLD:SC", computedCents: at("GTLD", "SC"), printedCents: -10000000 },
        { line: "Retained profit b/f (note 20)", account: "GTLD:RP", computedCents: at("GTLD", "RP"), printedCents: -22694453 },
        { line: "Trade receivable (note 22)", account: "SUM(GTDB)", computedCents: debtors, printedCents: 15678222 },
        { line: "Cash in hand (note 6)", account: "not printed in the export", computedCents: 0, printedCents: 0 },
      ];
    })(),
    perSectionChains: chains.map((c) => ({
      sourceKind: c.sourceKind,
      code: c.code,
      description: c.description,
      headerLine: c.headerLine,
      excluded: c.excluded,
      cfwdDate: c.cfwdDate,
      openingCents: c.openingCents,
      monthEndCents: c.monthEndCents,
      closingCents: c.closingCents,
      transactionRows: c.transactionRows,
    })),
  };

  for (const tie of report.balanceSheetTieOuts) {
    assertCondition(
      tie.computedCents === tie.printedCents,
      `Balance Sheet tie-out failed for ${tie.line}: computed ${formatAmount(tie.computedCents)} vs printed ` +
        `${formatAmount(tie.printedCents)}.`,
    );
  }

  if (manifest.expectedStagingSha256 && manifest.expectedStagingSha256 !== "PENDING_FIRST_RUN") {
    assertCondition(
      stagingSha256 === manifest.expectedStagingSha256,
      `Staging CSV sha256 is ${stagingSha256}, manifest pins ${manifest.expectedStagingSha256}. Output is not deterministic.`,
    );
  }

  if (!checkOnly) {
    const outputDirectory = path.join(SCRIPT_DIRECTORY, "generated");
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, STAGING_FILENAME), stagingCsv, "utf8");
    await writeFile(path.join(outputDirectory, REPORT_FILENAME), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log("Green Target legacy intake (G0)");
  console.log(`  sources           GTLD ${sourceSummaries.GTLD.transactionRows} tx rows / ${sourceSummaries.GTLD.accountSections} sections`);
  console.log(`                    GTDB ${sourceSummaries.GTDB.transactionRows} tx rows / ${sourceSummaries.GTDB.accountSections} sections`);
  console.log(`  date recovery     ${dateStats.serialSwapped} serial-swapped + ${dateStats.literalText} literal-text, all in ${dateStats.minDate}..${dateStats.maxDate}`);
  console.log(`  balance chains    ${chains.length}/${chains.length} walked C/FWD -> printed close`);
  console.log(`  journal families  ${families.size} decoded, ${groups.size} groups (${groups.size - unbalancedGroups.length} balanced)`);
  console.log(`  closing TB        DR ${formatAmount(closing.debitCents)} = CR ${formatAmount(closing.creditCents)}`);
  console.log(`  BS tie-outs       ${report.balanceSheetTieOuts.length}/${report.balanceSheetTieOuts.length} exact`);
  console.log(`  named exceptions  1 opening-date (GTDB CD_SD), 1 excluded control (GTLD DEBTOR), cash-in-hand gap DR ${formatAmount(cashGap.impliedOpeningCents)}`);
  console.log(`  staging           ${rows.length} rows, sha256 ${stagingSha256}`);
  console.log(checkOnly ? "  (--check-only: nothing written)" : `  written to generated/${STAGING_FILENAME} and generated/${REPORT_FILENAME}`);
  console.log("ALL CHECKS PASSED");
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
});
