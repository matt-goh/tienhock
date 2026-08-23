import { createHash } from "node:crypto";
import { Router } from "express";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { DEBTOR_CHILDREN_QUERY } from "./debtors.js";

/** @typedef {"ledgers" | "debtors"} AuditExportKind */

/**
 * @typedef {Object} AuditTransaction
 * @property {string} journalEntryId
 * @property {string} reference
 * @property {string} entryDate
 * @property {string} particulars
 * @property {string} chequeReference
 * @property {number} debitCents
 * @property {number} creditCents
 */

/**
 * @typedef {Object} AuditAccount
 * @property {string} accountCode
 * @property {string} displayCode
 * @property {string} description
 * @property {boolean} isDebtor
 * @property {boolean} isActive
 * @property {number} openingCents
 * @property {string | null} anchorAsOfDate
 * @property {AuditTransaction[]} transactions
 */

/**
 * @typedef {Object} AuditExportData
 * @property {number} year
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} extractedAtKualaLumpur
 * @property {AuditAccount[]} accounts
 * @property {number} journalCount
 * @property {number | null} highestJournalEntryId
 * @property {number} periodDebitCents
 * @property {number} periodCreditCents
 */

/**
 * @typedef {Object} WorkbookStats
 * @property {AuditExportKind} kind
 * @property {number} sectionCount
 * @property {number} transactionCount
 * @property {number} rowCount
 * @property {number} openingCents
 * @property {number} periodDebitCents
 * @property {number} periodCreditCents
 * @property {number} closingCents
 */

/**
 * @typedef {Object} BuiltWorkbook
 * @property {Buffer} buffer
 * @property {WorkbookStats} stats
 */

const COMPANY_NAME = "TIEN HOCK FOOD INDUSTRIES SDN BHD";
const FIRST_EXPORT_YEAR = 2026;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EXPORT_VERSION_PATTERN = /^\d{8}-\d{6}$/;
const MONEY_FORMAT = "#,##0.00";
const DATE_FORMAT = "dd/mm/yyyy";

/**
 * Convert a PostgreSQL bigint cents value into a safe JavaScript integer.
 *
 * @param {unknown} value
 * @param {string} context
 * @returns {number}
 */
function parseCents(value, context) {
  const textValue = String(value ?? "0");
  if (!/^-?\d+$/.test(textValue)) {
    throw new Error(`${context}: invalid cents value ${JSON.stringify(textValue)}`);
  }
  const cents = Number(textValue);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${context}: cents value is outside the safe integer range`);
  }
  return cents;
}

/**
 * Parse and validate a bare yyyy-MM-dd string without a timestamp round-trip.
 *
 * @param {string} isoDate
 * @returns {{ year: number, month: number, day: number }}
 */
function parseBareDate(isoDate) {
  if (!DATE_PATTERN.test(isoDate)) {
    throw new Error(`Invalid bare date ${JSON.stringify(isoDate)}`);
  }
  const [year, month, day] = isoDate.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    throw new Error(`Invalid calendar date ${JSON.stringify(isoDate)}`);
  }
  return { year, month, day };
}

/**
 * Convert a known bare accounting date to an Excel 1900-system serial. The
 * components are already authoritative, so UTC is used only as deterministic
 * calendar arithmetic; no API/DB timestamp is converted or sliced here.
 *
 * @param {string} isoDate
 * @returns {number}
 */
export function toExcelSerial(isoDate) {
  const { year, month, day } = parseBareDate(isoDate);
  return Date.UTC(year, month - 1, day) / 86400000 + 25569;
}

/**
 * @param {number} cents
 * @returns {string}
 */
function formatSignedBalance(cents) {
  const amount = (Math.abs(cents) / 100).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });
  return `${amount} ${cents >= 0 ? "DR" : "CR"}`;
}

/**
 * @param {number} year
 * @returns {{ startDate: string, endDate: string, nextYearDate: string }}
 */
function getYearBounds(year) {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    nextYearDate: `${year + 1}-01-01`,
  };
}

/**
 * @param {unknown} rawYear
 * @returns {{ valid: true, year: number } | { valid: false, message: string }}
 */
function validateYear(rawYear) {
  const year = Number(rawYear);
  const currentYear = new Date().getFullYear();
  if (
    !Number.isInteger(year) ||
    year < FIRST_EXPORT_YEAR ||
    year > currentYear
  ) {
    return {
      valid: false,
      message: `Year must be between ${FIRST_EXPORT_YEAR} and ${currentYear}`,
    };
  }
  return { valid: true, year };
}

/**
 * @param {unknown} rawVersion
 * @returns {{ valid: true, version: string | null } | { valid: false, message: string }}
 */
function validateExportVersion(rawVersion) {
  if (rawVersion === undefined) {
    return { valid: true, version: null };
  }
  if (
    typeof rawVersion !== "string" ||
    !EXPORT_VERSION_PATTERN.test(rawVersion)
  ) {
    return {
      valid: false,
      message: "Version must use yyyyMMdd-HHmmss format",
    };
  }
  return { valid: true, version: rawVersion };
}

/**
 * Convert the already-formatted Kuala Lumpur extraction time into a filename
 * version. This value is generated by PostgreSQL, not by slicing a DB date.
 *
 * @param {string} extractedAtKualaLumpur
 * @returns {string}
 */
function exportVersionFromExtraction(extractedAtKualaLumpur) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
      extractedAtKualaLumpur
    );
  if (!match) {
    throw new Error("Invalid Kuala Lumpur extraction timestamp");
  }
  return `${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}${match[6]}`;
}

/**
 * Load both complementary account populations from one read-only,
 * repeatable-read database transaction.
 *
 * @param {{ connect: () => Promise<any> }} pool
 * @param {number} year
 * @returns {Promise<AuditExportData>}
 */
export async function loadAuditExportData(pool, year) {
  const { startDate, endDate, nextYearDate } = getYearBounds(year);
  const client = await pool.connect();

  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );

    const extractionResult = await client.query(
      `SELECT to_char(
                CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur',
                'YYYY-MM-DD HH24:MI:SS'
              ) AS extracted_at`
    );

    const mappingResult = await client.query(`
      WITH debtor_children AS (
        ${DEBTOR_CHILDREN_QUERY}
      )
      SELECT (SELECT COUNT(*)::int FROM customers) AS customer_count,
             COUNT(*)::int AS mapped_count,
             COUNT(DISTINCT child_code)::int AS distinct_child_count
        FROM debtor_children
    `);
    const mappingStats = mappingResult.rows[0];
    const customerCount = Number(mappingStats.customer_count);
    const mappedCount = Number(mappingStats.mapped_count);
    const distinctChildCount = Number(mappingStats.distinct_child_count);
    if (
      customerCount !== mappedCount ||
      mappedCount !== distinctChildCount
    ) {
      throw new Error(
        `Debtor account mapping is incomplete or ambiguous: ${mappedCount} mappings ` +
          `(${distinctChildCount} distinct) for ${customerCount} customers`
      );
    }

    const accountResult = await client.query(`
      WITH debtor_children AS (
        ${DEBTOR_CHILDREN_QUERY}
      )
      SELECT ac.code AS account_code,
             COALESCE(dc.customer_id, ac.code) AS display_code,
             COALESCE(dc.customer_name, ac.description, '') AS description,
             (ac.parent_code = 'DEBTOR') AS is_debtor,
             ac.is_active
        FROM account_codes ac
        LEFT JOIN debtor_children dc ON dc.child_code = ac.code
       ORDER BY (COALESCE(dc.customer_id, ac.code)) COLLATE "C",
                ac.code COLLATE "C"
    `);

    const openingResult = await client.query(
      `WITH latest_anchors AS (
         SELECT DISTINCT ON (aob.account_code)
                aob.account_code,
                aob.as_of_date,
                aob.amount
           FROM account_opening_balances aob
          WHERE aob.as_of_date <= $1::date
          ORDER BY aob.account_code, aob.as_of_date DESC
       ),
       opening_movements AS (
         SELECT jel.account_code,
                ROUND(SUM(jel.debit_amount - jel.credit_amount) * 100)::bigint
                  AS movement_cents
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
           LEFT JOIN latest_anchors anchor
             ON anchor.account_code = jel.account_code
          WHERE je.status = 'posted'
            AND je.entry_date < $1::date
            AND (
              anchor.as_of_date IS NULL OR
              je.entry_date >= anchor.as_of_date
            )
          GROUP BY jel.account_code
       )
       SELECT ac.code AS account_code,
              (
                COALESCE(ROUND(anchor.amount * 100)::bigint, 0) +
                COALESCE(movement.movement_cents, 0)
              )::bigint AS opening_cents,
              to_char(anchor.as_of_date, 'YYYY-MM-DD') AS anchor_as_of_date
         FROM account_codes ac
         LEFT JOIN latest_anchors anchor ON anchor.account_code = ac.code
         LEFT JOIN opening_movements movement ON movement.account_code = ac.code`,
      [startDate]
    );

    const transactionResult = await client.query(
      `SELECT jel.account_code,
              je.id::text AS journal_entry_id,
              COALESCE(
                jel.display_reference,
                je.display_reference,
                je.reference_no
              ) AS reference,
              to_char(je.entry_date, 'YYYY-MM-DD') AS entry_date,
              COALESCE(
                NULLIF(jel.particulars, ''),
                NULLIF(je.description, ''),
                ''
              ) AS particulars,
              COALESCE(jel.cheque_reference, je.cheque_no, '') AS cheque_reference,
              ROUND(COALESCE(jel.debit_amount, 0) * 100)::bigint AS debit_cents,
              ROUND(COALESCE(jel.credit_amount, 0) * 100)::bigint AS credit_cents
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted'
          AND je.entry_date >= $1::date
          AND je.entry_date < $2::date
        ORDER BY jel.account_code COLLATE "C",
                 je.entry_date ASC,
                 je.posting_sequence ASC NULLS LAST,
                 COALESCE(
                   jel.display_reference,
                   je.display_reference,
                   je.reference_no
                 ) ASC,
                 je.id ASC,
                 jel.display_order ASC NULLS LAST,
                 jel.line_number ASC,
                 jel.id ASC`,
      [startDate, nextYearDate]
    );

    await client.query("COMMIT");

    /** @type {AuditAccount[]} */
    const accounts = accountResult.rows.map((row) => ({
      accountCode: String(row.account_code),
      displayCode: String(row.display_code),
      description: String(row.description),
      isDebtor: row.is_debtor === true,
      isActive: row.is_active === true,
      openingCents: 0,
      anchorAsOfDate: null,
      transactions: [],
    }));
    /** @type {Map<string, AuditAccount>} */
    const accountByCode = new Map(
      accounts.map((account) => [account.accountCode, account])
    );
    if (accountByCode.size !== accounts.length) {
      throw new Error("Debtor mapping duplicated an account code");
    }

    openingResult.rows.forEach((row) => {
      const account = accountByCode.get(String(row.account_code));
      if (!account) {
        throw new Error(`Opening balance references unknown account ${row.account_code}`);
      }
      account.openingCents = parseCents(
        row.opening_cents,
        `Opening balance ${row.account_code}`
      );
      account.anchorAsOfDate = row.anchor_as_of_date
        ? String(row.anchor_as_of_date)
        : null;
    });

    /** @type {Set<string>} */
    const journalIds = new Set();
    let highestJournalEntryId = null;
    let periodDebitCents = 0;
    let periodCreditCents = 0;

    transactionResult.rows.forEach((row) => {
      const accountCode = String(row.account_code);
      const account = accountByCode.get(accountCode);
      if (!account) {
        throw new Error(`Journal line references unknown account ${accountCode}`);
      }
      const journalEntryId = String(row.journal_entry_id);
      const numericJournalEntryId = Number(journalEntryId);
      if (
        Number.isSafeInteger(numericJournalEntryId) &&
        (highestJournalEntryId === null ||
          numericJournalEntryId > highestJournalEntryId)
      ) {
        highestJournalEntryId = numericJournalEntryId;
      }
      const debitCents = parseCents(
        row.debit_cents,
        `Journal ${journalEntryId} debit`
      );
      const creditCents = parseCents(
        row.credit_cents,
        `Journal ${journalEntryId} credit`
      );
      const transaction = {
        journalEntryId,
        reference: String(row.reference ?? ""),
        entryDate: String(row.entry_date),
        particulars: String(row.particulars),
        chequeReference: String(row.cheque_reference),
        debitCents,
        creditCents,
      };
      account.transactions.push(transaction);
      journalIds.add(journalEntryId);
      periodDebitCents += debitCents;
      periodCreditCents += creditCents;
    });

    if (periodDebitCents !== periodCreditCents) {
      throw new Error(
        `Posted journal population is out of balance for ${year}: ` +
          `DR ${periodDebitCents} cents / CR ${periodCreditCents} cents`
      );
    }

    return {
      year,
      startDate,
      endDate,
      extractedAtKualaLumpur: String(extractionResult.rows[0].extracted_at),
      accounts,
      journalCount: journalIds.size,
      highestJournalEntryId,
      periodDebitCents,
      periodCreditCents,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Audit export rollback failed:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {AuditExportData} data
 * @param {AuditExportKind} kind
 * @returns {Promise<BuiltWorkbook>}
 */
export async function buildAuditWorkbook(data, kind) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  workbook.lastModifiedBy = COMPANY_NAME;
  workbook.created = new Date();
  workbook.modified = new Date();

  const isDebtors = kind === "debtors";
  const worksheet = workbook.addWorksheet("Sheet1", {
    properties: { defaultRowHeight: 15 },
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      scale: isDebtors ? 70 : 75,
      horizontalDpi: 180,
      verticalDpi: 180,
      margins: isDebtors
        ? {
            left: 0.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          }
        : {
            left: 0.5,
            right: 0.2,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
    },
    views: [{ state: "frozen", ySplit: 2, activeCell: "B3" }],
  });

  const columnWidths = isDebtors
    ? [6, 17.285, 11.71, 40, 12.855, 8, 9.14, 12]
    : [6.57, 11.425, 12.855, 31.855, 17, 12.425, 11.71, 13];
  columnWidths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  const accounts = data.accounts.filter((account) =>
    isDebtors ? account.isDebtor : !account.isDebtor
  );
  const fontSize = isDebtors ? 11 : 10;
  let rowIndex = 0;
  let transactionCount = 0;
  let openingCents = 0;
  let periodDebitCents = 0;
  let periodCreditCents = 0;
  let closingCents = 0;

  /**
   * @param {Array<string | number | null>} valuesBToH
   * @returns {import("exceljs").Row}
   */
  const appendIndexedRow = (valuesBToH) => {
    rowIndex += 1;
    const row = worksheet.addRow([rowIndex, ...valuesBToH]);
    row.font = { name: "Calibri", size: fontSize };
    row.getCell(1).alignment = { horizontal: "center" };
    return row;
  };

  const titleRow = appendIndexedRow([
    null,
    null,
    "LEDGER REPORT",
    null,
    null,
    null,
    null,
  ]);
  titleRow.getCell(4).font = {
    name: "Calibri",
    size: fontSize + 2,
    bold: true,
  };

  const headerRow = appendIndexedRow([
    "ACC/NO",
    "JOURNAL",
    "PARTICULAR",
    "CHEQUE",
    "DR",
    "CR",
    "BALANCE",
  ]);
  headerRow.font = { name: "Calibri", size: fontSize, bold: true };
  headerRow.alignment = { horizontal: "center" };

  accounts.forEach((account) => {
    const accountRow = appendIndexedRow([
      account.displayCode,
      null,
      account.description,
      null,
      null,
      null,
      null,
    ]);
    accountRow.getCell(2).font = {
      name: "Calibri",
      size: fontSize,
      bold: true,
    };
    accountRow.getCell(4).font = {
      name: "Calibri",
      size: fontSize,
      bold: true,
    };
    appendIndexedRow([null, null, null, null, null, null, null]);

    const openingDebit = account.openingCents > 0
      ? account.openingCents / 100
      : null;
    const openingCredit = account.openingCents < 0
      ? Math.abs(account.openingCents) / 100
      : null;
    const openingRow = appendIndexedRow([
      toExcelSerial(data.startDate),
      null,
      "BALANCE C/FWD",
      null,
      openingDebit,
      openingCredit,
      formatSignedBalance(account.openingCents),
    ]);
    openingRow.getCell(2).numFmt = DATE_FORMAT;
    openingRow.getCell(2).alignment = { horizontal: "center" };
    openingRow.getCell(6).numFmt = MONEY_FORMAT;
    openingRow.getCell(7).numFmt = MONEY_FORMAT;
    openingRow.getCell(6).alignment = { horizontal: "right" };
    openingRow.getCell(7).alignment = { horizontal: "right" };
    openingRow.getCell(8).alignment = { horizontal: "right" };

    let runningCents = account.openingCents;
    openingCents += account.openingCents;
    account.transactions.forEach((transaction) => {
      runningCents += transaction.debitCents - transaction.creditCents;
      const transactionRow = appendIndexedRow([
        toExcelSerial(transaction.entryDate),
        transaction.reference,
        transaction.particulars,
        transaction.chequeReference || null,
        transaction.debitCents !== 0
          ? transaction.debitCents / 100
          : null,
        transaction.creditCents !== 0
          ? transaction.creditCents / 100
          : null,
        formatSignedBalance(runningCents),
      ]);
      transactionRow.getCell(2).numFmt = DATE_FORMAT;
      transactionRow.getCell(2).alignment = { horizontal: "center" };
      transactionRow.getCell(6).numFmt = MONEY_FORMAT;
      transactionRow.getCell(7).numFmt = MONEY_FORMAT;
      transactionRow.getCell(6).alignment = { horizontal: "right" };
      transactionRow.getCell(7).alignment = { horizontal: "right" };
      transactionRow.getCell(8).alignment = { horizontal: "right" };
      transactionCount += 1;
      periodDebitCents += transaction.debitCents;
      periodCreditCents += transaction.creditCents;
    });
    closingCents += runningCents;

    appendIndexedRow([null, null, null, null, null, null, null]);
    appendIndexedRow([null, null, null, null, null, null, null]);
  });

  worksheet.pageSetup.printArea = `A1:H${rowIndex}`;
  worksheet.pageSetup.printTitlesRow = "1:2";

  if (
    closingCents !==
    openingCents + periodDebitCents - periodCreditCents
  ) {
    throw new Error(`${kind} workbook running-balance control failed`);
  }

  const output = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(output),
    stats: {
      kind,
      sectionCount: accounts.length,
      transactionCount,
      rowCount: rowIndex,
      openingCents,
      periodDebitCents,
      periodCreditCents,
      closingCents,
    },
  };
}

/**
 * @param {AuditExportKind} kind
 * @param {number} year
 * @param {string} version
 * @returns {string}
 */
function workbookFilename(kind, year, version) {
  const shortYear = String(year).slice(-2);
  return kind === "ledgers"
    ? `EXCEL_THLD_(JAN-DEC${shortYear})_${version}.xlsx`
    : `EXCEL_THDB_(Jan-Dec${shortYear})_${version}.xlsx`;
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * @param {any} response
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} contentType
 * @returns {void}
 */
function sendDownload(response, buffer, filename, contentType) {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Content-Type", contentType);
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  response.setHeader("Content-Length", String(buffer.length));
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.send(buffer);
}

/**
 * @param {{ connect: () => Promise<any> }} pool
 * @returns {import("express").Router}
 */
export default function createAuditExportsRouter(pool) {
  const router = Router();

  router.get("/pack/:year", async (request, response) => {
    const validation = validateYear(request.params.year);
    if (!validation.valid) {
      return response.status(400).json({ message: validation.message });
    }
    const versionValidation = validateExportVersion(request.query.version);
    if (!versionValidation.valid) {
      return response.status(400).json({ message: versionValidation.message });
    }

    try {
      const data = await loadAuditExportData(pool, validation.year);
      const version =
        versionValidation.version ??
        exportVersionFromExtraction(data.extractedAtKualaLumpur);
      const ledgers = await buildAuditWorkbook(data, "ledgers");
      const debtors = await buildAuditWorkbook(data, "debtors");
      const coveredSectionCount =
        ledgers.stats.sectionCount + debtors.stats.sectionCount;
      const coveredTransactionCount =
        ledgers.stats.transactionCount + debtors.stats.transactionCount;
      const expectedTransactionCount = data.accounts.reduce(
        (count, account) => count + account.transactions.length,
        0
      );
      if (
        coveredSectionCount !== data.accounts.length ||
        coveredTransactionCount !== expectedTransactionCount ||
        ledgers.stats.periodDebitCents + debtors.stats.periodDebitCents !==
          data.periodDebitCents ||
        ledgers.stats.periodCreditCents + debtors.stats.periodCreditCents !==
          data.periodCreditCents
      ) {
        throw new Error("Audit workbook population control failed");
      }
      const ledgersFilename = workbookFilename(
        "ledgers",
        validation.year,
        version
      );
      const debtorsFilename = workbookFilename(
        "debtors",
        validation.year,
        version
      );
      const manifest = {
        schemaVersion: 2,
        packVersion: version,
        company: COMPANY_NAME,
        period: {
          start: data.startDate,
          end: data.endDate,
        },
        extractedAtKualaLumpur: data.extractedAtKualaLumpur,
        extractionControl: {
          databaseReadIsolation: "repeatable_read_read_only",
          postedJournals: data.journalCount,
          highestJournalEntryId: data.highestJournalEntryId,
          periodDebitCents: data.periodDebitCents,
          periodCreditCents: data.periodCreditCents,
          requiresExternalFreezeRecord: true,
        },
        files: [
          {
            filename: ledgersFilename,
            bytes: ledgers.buffer.length,
            sha256: sha256(ledgers.buffer),
            ...ledgers.stats,
          },
          {
            filename: debtorsFilename,
            bytes: debtors.buffer.length,
            sha256: sha256(debtors.buffer),
            ...debtors.stats,
          },
        ],
      };

      const zip = new JSZip();
      zip.file(ledgersFilename, ledgers.buffer);
      zip.file(debtorsFilename, debtors.buffer);
      zip.file(
        "AUDIT_EXPORT_MANIFEST.json",
        `${JSON.stringify(manifest, null, 2)}\n`
      );
      const zipBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "STORE",
      });
      sendDownload(
        response,
        zipBuffer,
        `TIEN_HOCK_AUDIT_LEDGERS_${validation.year}_${version}.zip`,
        "application/zip"
      );
    } catch (error) {
      console.error("Error generating audit Excel pack:", error);
      response.status(500).json({
        message: "Error generating audit Excel pack",
      });
    }
  });

  router.get("/:kind/:year", async (request, response) => {
    const kind = request.params.kind;
    if (kind !== "ledgers" && kind !== "debtors") {
      return response.status(400).json({ message: "Invalid audit export kind" });
    }
    const validation = validateYear(request.params.year);
    if (!validation.valid) {
      return response.status(400).json({ message: validation.message });
    }
    const versionValidation = validateExportVersion(request.query.version);
    if (!versionValidation.valid) {
      return response.status(400).json({ message: versionValidation.message });
    }

    try {
      const data = await loadAuditExportData(pool, validation.year);
      const version =
        versionValidation.version ??
        exportVersionFromExtraction(data.extractedAtKualaLumpur);
      const workbook = await buildAuditWorkbook(data, kind);
      sendDownload(
        response,
        workbook.buffer,
        workbookFilename(kind, validation.year, version),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    } catch (error) {
      console.error(`Error generating ${kind} audit workbook:`, error);
      response.status(500).json({
        message: "Error generating audit workbook",
      });
    }
  });

  return router;
}
