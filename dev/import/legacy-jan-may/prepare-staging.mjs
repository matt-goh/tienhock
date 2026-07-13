import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {"THLD" | "THDB"} SourceKind */
/** @typedef {"opening" | "transaction"} RecordKind */

/**
 * @typedef {Object} SourceManifestEntry
 * @property {string} filename
 * @property {string} sha256
 * @property {number} byteLength
 * @property {number} physicalLineCount
 * @property {number} columnCount
 * @property {string} sentinelRecord
 * @property {{accountSections: number, activeAccounts: number, nonzeroOpenings: number, transactionRows: number}} expectedCounts
 * @property {Array<{physicalLine: number, accountCode: string, entryDate: string, runningBalanceCents: number}>} expectedOpeningDateExceptions
 * @property {Array<{offset: number, byte: number, physicalLine: number, reason: string}>} allowedControlBytes
 * @property {Array<{physicalLine: number, rawLineSha256: string, reason: string, normalizedFields: string[]}>} lineNormalizations
 */

/**
 * @typedef {Object} ParsedRecord
 * @property {SourceKind} sourceKind
 * @property {string} sourceFilename
 * @property {string} sourceSha256
 * @property {number} sourcePhysicalLine
 * @property {number} sourceRowIndex
 * @property {RecordKind} recordKind
 * @property {string} legacyAccountCode
 * @property {string} accountDescription
 * @property {string} entryDate
 * @property {"DD/MM/YYYY" | "MM-DD-YY"} sourceDateFormat
 * @property {string} journalRef
 * @property {string} particulars
 * @property {string} chequeReference
 * @property {number} debitCents
 * @property {number} creditCents
 * @property {number} runningBalanceCents
 * @property {boolean} sourceLineNormalized
 * @property {string} sourceLineNormalizationReason
 */

/**
 * @typedef {Object} StageRecord
 * @property {number} [stageSequence]
 * @property {RecordKind} recordKind
 * @property {string} sourceFile
 * @property {string} sourceKind
 * @property {string} sourceSha256
 * @property {number | null} sourcePhysicalLine
 * @property {number | null} sourceRowIndex
 * @property {number | null} injectedAfterPhysicalLine
 * @property {string} legacyAccountCode
 * @property {string} accountCode
 * @property {string} accountDescription
 * @property {string} entryDate
 * @property {string} journalRef
 * @property {string} journalGroupKey
 * @property {string} lineDisplayReference
 * @property {string} particulars
 * @property {string} chequeReference
 * @property {number} debitCents
 * @property {number} creditCents
 * @property {number | null} runningBalanceCents
 * @property {string} provenance
 * @property {boolean} repaired
 * @property {string} repairReason
 * @property {string} specialCase
 * @property {number} _sortSource
 * @property {number} _sortLine
 * @property {number} _sortOffset
 */

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const STAGING_FILENAME = "legacy_jan_may_staging.csv";
const REPORT_FILENAME = "validation-report.json";
const SOURCE_START_DATE = "2026-01-01";
const SOURCE_END_DATE = "2026-05-31";
const EXPECTED_STAGE_TRANSACTION_ROWS = 10068;
const EXPECTED_STAGE_OPENING_ROWS = 2567;
const EXPECTED_STAGE_GROUPS = 3863;
const EXPECTED_STAGE_SIDE_CENTS = 1350351615;

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
 * @param {string} value
 * @returns {string}
 */
function sha256Text(value) {
  return createHash("sha256").update(value, "ascii").digest("hex");
}

/**
 * @param {Buffer} value
 * @returns {string}
 */
function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Parse exactly one physical CSV record. Embedded newlines are deliberately not
 * supported because these two audited exports contain one record per CRLF line.
 *
 * @param {string} line
 * @param {string} context
 * @returns {string[]}
 */
function parseCsvLine(line, context) {
  /** @type {string[]} */
  const fields = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (quoteClosed) {
      assertCondition(
        character === ",",
        `${context}: unexpected character after a closing quote at column ${index + 1}.`,
      );
      fields.push(field);
      field = "";
      quoteClosed = false;
      continue;
    }

    if (character === ",") {
      fields.push(field);
      field = "";
    } else if (character === '"') {
      assertCondition(
        field.length === 0,
        `${context}: quote started inside an unquoted field at column ${index + 1}.`,
      );
      inQuotes = true;
    } else {
      field += character;
    }
  }

  assertCondition(!inQuotes, `${context}: unterminated quoted field.`);
  fields.push(field);
  return fields;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function encodeCsvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * @param {unknown[]} fields
 * @returns {string}
 */
function encodeCsvRow(fields) {
  return fields.map(encodeCsvCell).join(",");
}

/**
 * @param {string} rawValue
 * @param {string} context
 * @param {boolean} allowBlank
 * @returns {number}
 */
function parseCents(rawValue, context, allowBlank = true) {
  if (rawValue === "") {
    assertCondition(allowBlank, `${context}: amount is blank.`);
    return 0;
  }

  assertCondition(rawValue === rawValue.trim(), `${context}: amount has surrounding whitespace.`);
  assertCondition(
    /^(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?|\.\d{1,2})$/.test(rawValue),
    `${context}: invalid non-negative money value ${JSON.stringify(rawValue)}.`,
  );

  const normalizedValue = rawValue.replaceAll(",", "");
  const [wholePart = "0", fractionPart = ""] = normalizedValue.split(".");
  const wholeCents = Number(wholePart || "0") * 100;
  const fractionCents = Number(fractionPart.padEnd(2, "0"));
  const cents = wholeCents + fractionCents;
  assertCondition(Number.isSafeInteger(cents), `${context}: amount exceeds the safe integer range.`);
  return cents;
}

/**
 * @param {string} rawValue
 * @param {string} context
 * @returns {number}
 */
function parseRunningBalanceCents(rawValue, context) {
  const match = rawValue.match(/^(.+) (DR|CR)$/);
  assertCondition(match !== null, `${context}: invalid running balance ${JSON.stringify(rawValue)}.`);
  const cents = parseCents(match[1], `${context} amount`, false);
  return match[2] === "DR" ? cents : -cents;
}

/**
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
function daysInMonth(year, month) {
  if (month === 2) {
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * @param {string} rawValue
 * @param {string} context
 * @returns {{isoDate: string, sourceFormat: "DD/MM/YYYY" | "MM-DD-YY"}}
 */
function parseLegacyDate(rawValue, context) {
  const slashMatch = rawValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const dashMatch = rawValue.match(/^(\d{2})-(\d{2})-(\d{2})$/);

  assertCondition(
    slashMatch !== null || dashMatch !== null,
    `${context}: date must be DD/MM/YYYY or MM-DD-YY, received ${JSON.stringify(rawValue)}.`,
  );

  const sourceFormat = slashMatch !== null ? "DD/MM/YYYY" : "MM-DD-YY";
  const year = slashMatch !== null ? Number(slashMatch[3]) : 2000 + Number(dashMatch[3]);
  const month = slashMatch !== null ? Number(slashMatch[2]) : Number(dashMatch[1]);
  const day = slashMatch !== null ? Number(slashMatch[1]) : Number(dashMatch[2]);

  assertCondition(year === 2026, `${context}: expected accounting year 2026, received ${year}.`);
  assertCondition(month >= 1 && month <= 12, `${context}: invalid month ${month}.`);
  assertCondition(day >= 1 && day <= daysInMonth(year, month), `${context}: invalid day ${day}.`);

  const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  assertCondition(
    isoDate >= SOURCE_START_DATE && isoDate <= SOURCE_END_DATE,
    `${context}: date ${isoDate} is outside the Jan-May 2026 source window.`,
  );
  return { isoDate, sourceFormat };
}

/**
 * @param {string} rawValue
 * @returns {boolean}
 */
function looksLikeDate(rawValue) {
  return /^(?:\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{2})$/.test(rawValue);
}

/**
 * @param {unknown[]} left
 * @param {unknown[]} right
 * @returns {boolean}
 */
function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * @param {string} filePath
 * @returns {Promise<any>}
 */
async function readJson(filePath) {
  const fileContents = await readFile(filePath, "utf8");
  return JSON.parse(fileContents);
}

/**
 * @param {SourceKind} sourceKind
 * @param {string} sourcePath
 * @param {SourceManifestEntry} manifest
 * @returns {Promise<{records: ParsedRecord[], summary: any, sections: Map<string, any>, balanceChainAnomalies: any[]} >}
 */
async function parseSource(sourceKind, sourcePath, manifest) {
  const sourceBuffer = await readFile(sourcePath);
  const sourceHash = sha256Buffer(sourceBuffer);

  assertCondition(
    sourceBuffer.length === manifest.byteLength,
    `${sourceKind}: expected ${manifest.byteLength} bytes but found ${sourceBuffer.length}.`,
  );
  assertCondition(
    sourceHash === manifest.sha256,
    `${sourceKind}: SHA-256 mismatch; expected ${manifest.sha256}, found ${sourceHash}.`,
  );

  let sentinelByteCount = 0;
  const allowedControlByteByOffset = new Map(
    manifest.allowedControlBytes.map((controlByte) => [controlByte.offset, controlByte]),
  );
  const seenAllowedControlOffsets = new Set();
  for (let byteIndex = 0; byteIndex < sourceBuffer.length; byteIndex += 1) {
    const byte = sourceBuffer[byteIndex];
    const allowedControlByte = allowedControlByteByOffset.get(byteIndex);
    const allowedByte =
      byte === 10 ||
      byte === 13 ||
      byte === 26 ||
      (byte >= 32 && byte <= 126) ||
      allowedControlByte?.byte === byte;
    assertCondition(allowedByte, `${sourceKind}: unexpected byte 0x${byte.toString(16)} at offset ${byteIndex}.`);
    if (allowedControlByte?.byte === byte) {
      seenAllowedControlOffsets.add(byteIndex);
    }
    if (byte === 26) {
      sentinelByteCount += 1;
    }
  }
  assertCondition(sentinelByteCount === 1, `${sourceKind}: expected one Ctrl-Z sentinel byte, found ${sentinelByteCount}.`);
  assertCondition(
    seenAllowedControlOffsets.size === manifest.allowedControlBytes.length,
    `${sourceKind}: audited control-byte set changed.`,
  );

  const sourceText = sourceBuffer.toString("ascii");
  assertCondition(sourceText.endsWith("\r\n"), `${sourceKind}: source must end with CRLF.`);
  const crlfCount = sourceText.match(/\r\n/g)?.length ?? 0;
  assertCondition(
    crlfCount === manifest.physicalLineCount,
    `${sourceKind}: expected ${manifest.physicalLineCount} CRLF records, found ${crlfCount}.`,
  );
  const textWithoutCrlf = sourceText.replaceAll("\r\n", "");
  assertCondition(!/[\r\n]/.test(textWithoutCrlf), `${sourceKind}: source contains a bare CR or LF.`);

  const rawLines = sourceText.slice(0, -2).split("\r\n");
  assertCondition(
    rawLines.length === manifest.physicalLineCount,
    `${sourceKind}: physical record split produced ${rawLines.length} records.`,
  );
  assertCondition(
    rawLines.at(-1) === manifest.sentinelRecord,
    `${sourceKind}: final DOS sentinel record does not match the audited source.`,
  );

  const normalizationByLine = new Map(
    manifest.lineNormalizations.map((normalization) => [normalization.physicalLine, normalization]),
  );
  /** @type {string[][]} */
  const parsedLines = [];

  for (let physicalLine = 1; physicalLine < rawLines.length; physicalLine += 1) {
    const rawLine = rawLines[physicalLine - 1];
    const normalization = normalizationByLine.get(physicalLine);
    let parseableLine = rawLine;

    if (normalization !== undefined) {
      assertCondition(
        sha256Text(rawLine) === normalization.rawLineSha256,
        `${sourceKind} line ${physicalLine}: malformed-line fingerprint changed; refusing normalization.`,
      );
      assertCondition(
        normalization.normalizedFields.length === manifest.columnCount,
        `${sourceKind} line ${physicalLine}: normalization has the wrong number of fields.`,
      );
      assertCondition(
        normalization.normalizedFields[0] === String(physicalLine),
        `${sourceKind} line ${physicalLine}: normalized row index does not match the physical line.`,
      );
      parseableLine = encodeCsvRow(normalization.normalizedFields);
    }

    const fields = parseCsvLine(parseableLine, `${sourceKind} line ${physicalLine}`);
    assertCondition(
      fields.length === manifest.columnCount,
      `${sourceKind} line ${physicalLine}: expected ${manifest.columnCount} columns, found ${fields.length}.`,
    );
    assertCondition(
      fields[0] === String(physicalLine),
      `${sourceKind} line ${physicalLine}: row index ${JSON.stringify(fields[0])} does not match the physical line.`,
    );
    parsedLines.push(fields);
  }

  const reportHeader = parsedLines[0];
  const expectedReportHeader = Array(manifest.columnCount).fill("");
  expectedReportHeader[0] = "1";
  expectedReportHeader[3] = "LEDGER REPORT";
  assertCondition(arraysEqual(reportHeader, expectedReportHeader), `${sourceKind}: unexpected report-title row.`);

  const columnHeader = parsedLines[1];
  const expectedColumnHeader = Array(manifest.columnCount).fill("");
  ["2", "ACC/NO", "JOURNAL", "PARTICULAR", "CHEQUE", "DR", "CR", "BALANCE"].forEach(
    (value, index) => {
      expectedColumnHeader[index] = value;
    },
  );
  assertCondition(arraysEqual(columnHeader, expectedColumnHeader), `${sourceKind}: unexpected column-header row.`);

  /** @type {ParsedRecord[]} */
  const records = [];
  /** @type {Map<string, any>} */
  const sections = new Map();
  /** @type {any[]} */
  const balanceChainAnomalies = [];
  /** @type {any | null} */
  let currentSection = null;

  for (let parsedIndex = 2; parsedIndex < parsedLines.length; parsedIndex += 1) {
    const fields = parsedLines[parsedIndex];
    const physicalLine = parsedIndex + 1;
    const isBlankRow = fields.slice(1).every((field) => field === "");
    if (isBlankRow) {
      continue;
    }

    if (!looksLikeDate(fields[1])) {
      assertCondition(fields[1] === fields[1].trim(), `${sourceKind} line ${physicalLine}: account code has outer whitespace.`);
      assertCondition(fields[1] !== "", `${sourceKind} line ${physicalLine}: unrecognized non-date row.`);
      assertCondition(fields[2] === "", `${sourceKind} line ${physicalLine}: account header has a journal reference.`);
      assertCondition(fields[3] !== "", `${sourceKind} line ${physicalLine}: account header has no description.`);
      assertCondition(
        fields.slice(4).every((field) => field === ""),
        `${sourceKind} line ${physicalLine}: account header contains unexpected amount data.`,
      );
      assertCondition(!sections.has(fields[1]), `${sourceKind}: duplicate account section ${fields[1]}.`);
      currentSection = {
        code: fields[1],
        description: fields[3],
        headerPhysicalLine: physicalLine,
        openingCount: 0,
        transactionCount: 0,
        lastDate: null,
        runningBalanceCents: null,
      };
      sections.set(fields[1], currentSection);
      continue;
    }

    assertCondition(currentSection !== null, `${sourceKind} line ${physicalLine}: dated row appears before an account header.`);
    const dateResult = parseLegacyDate(fields[1], `${sourceKind} line ${physicalLine}`);
    assertCondition(
      currentSection.lastDate === null || dateResult.isoDate >= currentSection.lastDate,
      `${sourceKind} line ${physicalLine}: date ${dateResult.isoDate} moves backwards within ${currentSection.code}.`,
    );
    currentSection.lastDate = dateResult.isoDate;

    const debitCents = parseCents(fields[5], `${sourceKind} line ${physicalLine} DR`);
    const creditCents = parseCents(fields[6], `${sourceKind} line ${physicalLine} CR`);
    assertCondition(
      debitCents === 0 || creditCents === 0,
      `${sourceKind} line ${physicalLine}: both DR and CR are nonzero.`,
    );
    const runningBalanceCents = parseRunningBalanceCents(
      fields[7],
      `${sourceKind} line ${physicalLine} BALANCE`,
    );
    const lineNormalization = normalizationByLine.get(physicalLine);

    if (fields[2] === "") {
      assertCondition(
        fields[3] === "BALANCE C/FWD",
        `${sourceKind} line ${physicalLine}: blank journal is only valid for BALANCE C/FWD.`,
      );
      assertCondition(fields[4] === "", `${sourceKind} line ${physicalLine}: opening row has a cheque reference.`);
      assertCondition(currentSection.openingCount === 0, `${sourceKind} ${currentSection.code}: duplicate opening row.`);
      const openingAmountWasPrinted = fields[5] !== "" || fields[6] !== "";
      assertCondition(
        !openingAmountWasPrinted || debitCents - creditCents === runningBalanceCents,
        `${sourceKind} line ${physicalLine}: printed opening amount does not equal its running balance.`,
      );
      currentSection.openingCount += 1;
      currentSection.runningBalanceCents = runningBalanceCents;
      records.push({
        sourceKind,
        sourceFilename: manifest.filename,
        sourceSha256: sourceHash,
        sourcePhysicalLine: physicalLine,
        sourceRowIndex: Number(fields[0]),
        recordKind: "opening",
        legacyAccountCode: currentSection.code,
        accountDescription: currentSection.description,
        entryDate: dateResult.isoDate,
        sourceDateFormat: dateResult.sourceFormat,
        journalRef: "",
        particulars: fields[3],
        chequeReference: "",
        debitCents,
        creditCents,
        runningBalanceCents,
        sourceLineNormalized: lineNormalization !== undefined,
        sourceLineNormalizationReason: lineNormalization?.reason ?? "",
      });
      continue;
    }

    assertCondition(currentSection.openingCount === 1, `${sourceKind} line ${physicalLine}: transaction precedes its opening.`);
    assertCondition(fields[2] === fields[2].trim(), `${sourceKind} line ${physicalLine}: journal reference has outer whitespace.`);
    const expectedRunningBalanceCents = currentSection.runningBalanceCents + debitCents - creditCents;
    if (expectedRunningBalanceCents !== runningBalanceCents) {
      balanceChainAnomalies.push({
        source: sourceKind,
        accountCode: currentSection.code,
        physicalLine,
        journalRef: fields[2],
        expectedRunningBalanceCents,
        printedRunningBalanceCents: runningBalanceCents,
        differenceCents: runningBalanceCents - expectedRunningBalanceCents,
      });
    }
    currentSection.runningBalanceCents = runningBalanceCents;
    currentSection.transactionCount += 1;
    records.push({
      sourceKind,
      sourceFilename: manifest.filename,
      sourceSha256: sourceHash,
      sourcePhysicalLine: physicalLine,
      sourceRowIndex: Number(fields[0]),
      recordKind: "transaction",
      legacyAccountCode: currentSection.code,
      accountDescription: currentSection.description,
      entryDate: dateResult.isoDate,
      sourceDateFormat: dateResult.sourceFormat,
      journalRef: fields[2],
      particulars: fields[3],
      chequeReference: fields[4],
      debitCents,
      creditCents,
      runningBalanceCents,
      sourceLineNormalized: lineNormalization !== undefined,
      sourceLineNormalizationReason: lineNormalization?.reason ?? "",
    });
  }

  for (const section of sections.values()) {
    assertCondition(section.openingCount === 1, `${sourceKind} ${section.code}: expected one opening row.`);
  }

  const openingRows = records.filter((record) => record.recordKind === "opening");
  const transactionRows = records.filter((record) => record.recordKind === "transaction");
  const activeAccounts = new Set(transactionRows.map((record) => record.legacyAccountCode)).size;
  const nonzeroOpenings = openingRows.filter((record) => record.runningBalanceCents !== 0).length;
  const actualCounts = {
    accountSections: sections.size,
    activeAccounts,
    nonzeroOpenings,
    transactionRows: transactionRows.length,
  };
  const openingDateExceptions = openingRows
    .filter((record) => record.entryDate !== SOURCE_START_DATE)
    .map((record) => ({
      physicalLine: record.sourcePhysicalLine,
      accountCode: record.legacyAccountCode,
      entryDate: record.entryDate,
      runningBalanceCents: record.runningBalanceCents,
    }));
  assertCondition(
    JSON.stringify(openingDateExceptions) === JSON.stringify(manifest.expectedOpeningDateExceptions),
    `${sourceKind}: opening-date exception set changed to ${JSON.stringify(openingDateExceptions)}.`,
  );

  for (const [countName, expectedCount] of Object.entries(manifest.expectedCounts)) {
    assertCondition(
      actualCounts[countName] === expectedCount,
      `${sourceKind}: ${countName} expected ${expectedCount}, found ${actualCounts[countName]}.`,
    );
  }

  return {
    records,
    sections,
    balanceChainAnomalies,
    summary: {
      source: sourceKind,
      filename: manifest.filename,
      sha256: sourceHash,
      byteLength: sourceBuffer.length,
      physicalLineCount: rawLines.length,
      sentinelRecordHex: Buffer.from(manifest.sentinelRecord, "ascii").toString("hex"),
      integrityChecksPassed: true,
      ...actualCounts,
      openingRows: openingRows.length,
      openingDateExceptions,
      ddMmYyyyRows: records.filter((record) => record.sourceDateFormat === "DD/MM/YYYY").length,
      mmDdYyRows: records.filter((record) => record.sourceDateFormat === "MM-DD-YY").length,
      normalizedPhysicalLines: manifest.lineNormalizations.map((normalization) => ({
        physicalLine: normalization.physicalLine,
        rawLineSha256: normalization.rawLineSha256,
        reason: normalization.reason,
      })),
      allowedControlBytes: manifest.allowedControlBytes,
    },
  };
}

/**
 * @param {ParsedRecord[] | StageRecord[]} transactionRows
 * @param {(record: any) => string} keyForRecord
 * @returns {{groupCount: number, debitCents: number, creditCents: number, imbalancedGroups: any[]}}
 */
function summarizeJournalGroups(transactionRows, keyForRecord) {
  /** @type {Map<string, {key: string, entryDate: string, journalRefs: Set<string>, rowCount: number, debitCents: number, creditCents: number}>} */
  const groups = new Map();
  let debitCents = 0;
  let creditCents = 0;

  for (const record of transactionRows) {
    const key = keyForRecord(record);
    const group = groups.get(key) ?? {
      key,
      entryDate: record.entryDate,
      journalRefs: new Set(),
      rowCount: 0,
      debitCents: 0,
      creditCents: 0,
    };
    group.journalRefs.add(record.journalRef);
    group.rowCount += 1;
    group.debitCents += record.debitCents;
    group.creditCents += record.creditCents;
    groups.set(key, group);
    debitCents += record.debitCents;
    creditCents += record.creditCents;
  }

  const imbalancedGroups = [...groups.values()]
    .filter((group) => group.debitCents !== group.creditCents)
    .map((group) => ({
      key: group.key,
      entryDate: group.entryDate,
      journalRefs: [...group.journalRefs].sort(),
      rowCount: group.rowCount,
      debitCents: group.debitCents,
      creditCents: group.creditCents,
      netDebitCents: group.debitCents - group.creditCents,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  return { groupCount: groups.size, debitCents, creditCents, imbalancedGroups };
}

/**
 * @param {ParsedRecord} record
 * @returns {string}
 */
function rawJournalGroupKey(record) {
  return `${record.entryDate}|${record.journalRef}`;
}

/**
 * @param {number} cents
 * @returns {string}
 */
function formatCents(cents) {
  const sign = cents < 0 ? "-" : "";
  const absoluteCents = Math.abs(cents);
  return `${sign}${Math.floor(absoluteCents / 100)}.${String(absoluteCents % 100).padStart(2, "0")}`;
}

/**
 * @param {ParsedRecord[]} allTransactions
 * @param {any} aliasesConfig
 * @param {any} expectedCombinedSource
 * @returns {any}
 */
function validateCombinedSource(allTransactions, aliasesConfig, expectedCombinedSource) {
  const rawSummary = summarizeJournalGroups(allTransactions, rawJournalGroupKey);
  assertCondition(
    allTransactions.length === expectedCombinedSource.transactionRows,
    `Combined source: expected ${expectedCombinedSource.transactionRows} transactions, found ${allTransactions.length}.`,
  );
  assertCondition(
    rawSummary.groupCount === expectedCombinedSource.journalGroups,
    `Combined source: expected ${expectedCombinedSource.journalGroups} journal groups, found ${rawSummary.groupCount}.`,
  );
  assertCondition(
    rawSummary.debitCents === expectedCombinedSource.debitCents &&
      rawSummary.creditCents === expectedCombinedSource.creditCents,
    `Combined source totals changed: expected DR ${formatCents(expectedCombinedSource.debitCents)} / CR ${formatCents(expectedCombinedSource.creditCents)}, found DR ${formatCents(rawSummary.debitCents)} / CR ${formatCents(rawSummary.creditCents)}.`,
  );
  assertCondition(
    rawSummary.imbalancedGroups.length === expectedCombinedSource.unbalancedJournalGroups,
    `Combined source: expected ${expectedCombinedSource.unbalancedJournalGroups} known unbalanced groups, found ${rawSummary.imbalancedGroups.length}.`,
  );

  const thldHrRows = allTransactions.filter(
    (record) => record.sourceKind === "THLD" && record.legacyAccountCode === "HR",
  );
  const thdbHrRows = allTransactions.filter(
    (record) => record.sourceKind === "THDB" && record.legacyAccountCode === "HR",
  );
  assertCondition(thldHrRows.length === 6 && thdbHrRows.length === 6, "HR duplicate audit expected six rows in each source.");

  const duplicateSignature = (record) =>
    [
      record.entryDate,
      record.journalRef,
      record.particulars,
      record.chequeReference,
      record.debitCents,
      record.creditCents,
      record.runningBalanceCents,
    ].join("\u001f");
  const thldHrSignatures = thldHrRows.map(duplicateSignature).sort();
  const thdbHrSignatures = thdbHrRows.map(duplicateSignature).sort();
  assertCondition(arraysEqual(thldHrSignatures, thdbHrSignatures), "THLD HR rows no longer duplicate THDB HR exactly.");

  const hrKeys = thldHrRows.map(rawJournalGroupKey);
  const specialCase = aliasesConfig.specialCases.invoice015347;
  const specialKeys = [
    `${specialCase.entryDate}|${specialCase.salesSource.journalRef}`,
    `${specialCase.entryDate}|${specialCase.bankSource.journalRef}`,
  ];
  const expectedUnbalancedKeys = [...new Set([...hrKeys, ...specialKeys])].sort();
  const actualUnbalancedKeys = rawSummary.imbalancedGroups.map((group) => group.key).sort();
  assertCondition(
    arraysEqual(expectedUnbalancedKeys, actualUnbalancedKeys),
    `Combined source: unbalanced group set changed. Expected ${expectedUnbalancedKeys.join(", ")}; found ${actualUnbalancedKeys.join(", ")}.`,
  );

  const salesGroup = rawSummary.imbalancedGroups.find(
    (group) => group.key === `${specialCase.entryDate}|${specialCase.salesSource.journalRef}`,
  );
  const bankGroup = rawSummary.imbalancedGroups.find(
    (group) => group.key === `${specialCase.entryDate}|${specialCase.bankSource.journalRef}`,
  );
  assertCondition(salesGroup?.netDebitCents === -specialCase.amountCents, "015347 sales source amount changed.");
  assertCondition(bankGroup?.netDebitCents === specialCase.amountCents, "015347 bank source amount changed.");

  return rawSummary;
}

/**
 * @param {ParsedRecord} record
 * @param {Map<string, any>} aliasBySourceCode
 * @returns {StageRecord}
 */
function toStageRecord(record, aliasBySourceCode) {
  const alias = aliasBySourceCode.get(`${record.sourceKind}\u001f${record.legacyAccountCode}`);
  const accountCode = alias?.targetCode ?? record.legacyAccountCode;
  assertCondition(accountCode === accountCode.trim(), `Mapped account code ${JSON.stringify(accountCode)} has outer whitespace.`);
  return {
    recordKind: record.recordKind,
    sourceFile: record.sourceFilename,
    sourceKind: record.sourceKind,
    sourceSha256: record.sourceSha256,
    sourcePhysicalLine: record.sourcePhysicalLine,
    sourceRowIndex: record.sourceRowIndex,
    injectedAfterPhysicalLine: null,
    legacyAccountCode: record.legacyAccountCode,
    accountCode,
    accountDescription: record.accountDescription,
    entryDate: record.entryDate,
    journalRef: record.journalRef,
    journalGroupKey: record.recordKind === "transaction" ? rawJournalGroupKey(record) : "",
    lineDisplayReference: record.journalRef,
    particulars: record.particulars,
    chequeReference: record.chequeReference,
    debitCents: record.debitCents,
    creditCents: record.creditCents,
    runningBalanceCents: record.runningBalanceCents,
    provenance: record.sourceLineNormalized ? "source_csv_normalized" : "source_csv",
    repaired: record.sourceLineNormalized,
    repairReason: record.sourceLineNormalizationReason,
    specialCase: "",
    _sortSource: record.sourceKind === "THLD" ? 0 : 1,
    _sortLine: record.sourcePhysicalLine,
    _sortOffset: 0,
  };
}

/**
 * @param {ParsedRecord[]} allRecords
 * @param {Map<string, any>} sectionsBySourceCode
 * @param {any} aliasesConfig
 * @returns {{stageRecords: StageRecord[], transformationReport: any}}
 */
function transformRecords(allRecords, sectionsBySourceCode, aliasesConfig) {
  const aliasBySourceCode = new Map();
  for (const alias of aliasesConfig.aliases) {
    const key = `${alias.source}\u001f${alias.sourceCode}`;
    assertCondition(!aliasBySourceCode.has(key), `Duplicate alias definition for ${alias.source} ${alias.sourceCode}.`);
    assertCondition(alias.targetCode === alias.targetCode.trim(), `Alias target ${alias.targetCode} has outer whitespace.`);
    aliasBySourceCode.set(key, alias);
  }

  for (const exactCode of aliasesConfig.requiredExactCodes) {
    const section = sectionsBySourceCode.get(`${exactCode.source}\u001f${exactCode.code}`);
    assertCondition(section !== undefined, `Required exact source code ${exactCode.source} ${exactCode.code} is missing.`);
    assertCondition(
      !aliasBySourceCode.has(`${exactCode.source}\u001f${exactCode.code}`),
      `Required exact code ${exactCode.code} must not be aliased.`,
    );
  }

  const excludedSectionBySourceCode = new Map(
    aliasesConfig.excludedSections.map((exclusion) => [
      `${exclusion.source}\u001f${exclusion.code}`,
      exclusion,
    ]),
  );
  const sourceOwnedJournalRefs = new Set(aliasesConfig.sourceOwnedJournalRefs);
  /** @type {Map<string, number>} */
  const excludedSectionCounts = new Map();
  /** @type {Map<string, number>} */
  const sourceOwnedRefCounts = new Map();
  /** @type {ParsedRecord[]} */
  const retainedRecords = [];

  for (const record of allRecords) {
    const sectionKey = `${record.sourceKind}\u001f${record.legacyAccountCode}`;
    if (excludedSectionBySourceCode.has(sectionKey)) {
      excludedSectionCounts.set(sectionKey, (excludedSectionCounts.get(sectionKey) ?? 0) + 1);
      continue;
    }
    if (record.recordKind === "transaction" && sourceOwnedJournalRefs.has(record.journalRef)) {
      sourceOwnedRefCounts.set(record.journalRef, (sourceOwnedRefCounts.get(record.journalRef) ?? 0) + 1);
      continue;
    }
    retainedRecords.push(record);
  }

  assertCondition(excludedSectionCounts.get("THLD\u001fHR") === 7, "THLD HR exclusion must remove one opening and six transactions.");
  assertCondition(excludedSectionCounts.get("THLD\u001fDEBTOR") === 1, "THLD DEBTOR exclusion must remove its one opening.");
  assertCondition(sourceOwnedRefCounts.size === 16, "Expected all 16 THCN source-owned journal references.");
  for (const journalRef of sourceOwnedJournalRefs) {
    assertCondition(
      sourceOwnedRefCounts.get(journalRef) === 2,
      `${journalRef}: expected one THLD and one THDB source row to be excluded.`,
    );
  }

  /** @type {StageRecord[]} */
  const stageRecords = retainedRecords.map((record) => toStageRecord(record, aliasBySourceCode));
  const specialCase = aliasesConfig.specialCases.invoice015347;
  const salesRecord = stageRecords.find(
    (record) =>
      record.sourceKind === specialCase.salesSource.source &&
      record.sourcePhysicalLine === specialCase.salesSource.physicalLine,
  );
  const bankRecord = stageRecords.find(
    (record) =>
      record.sourceKind === specialCase.bankSource.source &&
      record.sourcePhysicalLine === specialCase.bankSource.physicalLine,
  );
  assertCondition(salesRecord !== undefined && bankRecord !== undefined, "015347 source rows are missing from staging.");
  assertCondition(
    salesRecord.legacyAccountCode === specialCase.salesSource.legacyAccountCode &&
      salesRecord.entryDate === specialCase.entryDate &&
      salesRecord.journalRef === specialCase.salesSource.journalRef &&
      salesRecord.particulars === specialCase.salesSource.particulars &&
      salesRecord.debitCents === 0 &&
      salesRecord.creditCents === specialCase.amountCents,
    "015347 CR_SALES source row changed.",
  );
  assertCondition(
    bankRecord.legacyAccountCode === specialCase.bankSource.legacyAccountCode &&
      bankRecord.accountCode === "BANK_PBB" &&
      bankRecord.entryDate === specialCase.entryDate &&
      bankRecord.journalRef === specialCase.bankSource.journalRef &&
      bankRecord.particulars === specialCase.bankSource.particulars &&
      bankRecord.chequeReference === specialCase.bankSource.chequeReference &&
      bankRecord.debitCents === specialCase.amountCents &&
      bankRecord.creditCents === 0,
    "015347 BANK_PBB source row changed.",
  );

  salesRecord.journalGroupKey = specialCase.groupKey;
  salesRecord.specialCase = "invoice_015347_charles_c";
  bankRecord.journalGroupKey = specialCase.groupKey;
  bankRecord.specialCase = "invoice_015347_charles_c";

  const syntheticSalesDebtor = {
    ...salesRecord,
    sourceKind: "DERIVED",
    sourcePhysicalLine: null,
    sourceRowIndex: null,
    injectedAfterPhysicalLine: specialCase.salesSource.physicalLine,
    legacyAccountCode: specialCase.customerAccount,
    accountCode: specialCase.customerAccount,
    accountDescription: specialCase.customerAccount,
    debitCents: specialCase.amountCents,
    creditCents: 0,
    runningBalanceCents: null,
    provenance: "user_approved_special_routing",
    repaired: true,
    repairReason: specialCase.reason,
    _sortOffset: -1,
  };
  const syntheticBankDebtor = {
    ...bankRecord,
    sourceKind: "DERIVED",
    sourcePhysicalLine: null,
    sourceRowIndex: null,
    injectedAfterPhysicalLine: specialCase.bankSource.physicalLine,
    legacyAccountCode: specialCase.customerAccount,
    accountCode: specialCase.customerAccount,
    accountDescription: specialCase.customerAccount,
    debitCents: 0,
    creditCents: specialCase.amountCents,
    runningBalanceCents: null,
    provenance: "user_approved_special_routing",
    repaired: true,
    repairReason: specialCase.reason,
    _sortOffset: 1,
  };
  stageRecords.push(syntheticSalesDebtor, syntheticBankDebtor);

  stageRecords.sort(
    (left, right) =>
      left._sortSource - right._sortSource ||
      left._sortLine - right._sortLine ||
      left._sortOffset - right._sortOffset,
  );
  stageRecords.forEach((record, index) => {
    record.stageSequence = index + 1;
  });

  const aliasUsage = aliasesConfig.aliases.map((alias) => ({
    source: alias.source,
    sourceCode: alias.sourceCode,
    targetCode: alias.targetCode,
    stagedRows: stageRecords.filter(
      (record) => record.sourceKind === alias.source && record.legacyAccountCode === alias.sourceCode,
    ).length,
    reason: alias.reason,
  }));
  for (const usage of aliasUsage) {
    assertCondition(usage.stagedRows > 0, `Alias ${usage.source} ${usage.sourceCode} was not exercised.`);
  }

  return {
    stageRecords,
    transformationReport: {
      excludedSections: aliasesConfig.excludedSections.map((exclusion) => ({
        ...exclusion,
        excludedRows: excludedSectionCounts.get(`${exclusion.source}\u001f${exclusion.code}`) ?? 0,
      })),
      sourceOwnedJournals: {
        journalCount: sourceOwnedRefCounts.size,
        excludedSourceRows: [...sourceOwnedRefCounts.values()].reduce((sum, count) => sum + count, 0),
        refs: [...sourceOwnedRefCounts.entries()].map(([journalRef, excludedSourceRows]) => ({
          journalRef,
          excludedSourceRows,
        })),
        note: "Each of the 16 source-owned CN journals has one THLD and one THDB projection row, so 32 physical source rows are excluded.",
      },
      aliases: aliasUsage,
      requiredExactCodes: aliasesConfig.requiredExactCodes,
      invoice015347: {
        invoiceId: specialCase.invoiceId,
        customerAccount: specialCase.customerAccount,
        entryDate: specialCase.entryDate,
        amountCents: specialCase.amountCents,
        groupKey: specialCase.groupKey,
        retainedSourceRows: 2,
        addedDebtorRoutingRows: 2,
        lineDisplayReferences: [specialCase.salesSource.journalRef, specialCase.bankSource.journalRef],
        reason: specialCase.reason,
      },
    },
  };
}

const STAGING_COLUMNS = [
  "stage_sequence",
  "record_kind",
  "source_file",
  "source_kind",
  "source_sha256",
  "source_physical_line",
  "source_row_index",
  "injected_after_physical_line",
  "legacy_account_code",
  "account_code",
  "account_description",
  "entry_date",
  "journal_ref",
  "journal_group_key",
  "line_display_reference",
  "particulars",
  "cheque_reference",
  "debit_cents",
  "credit_cents",
  "running_balance_cents",
  "provenance",
  "repaired",
  "repair_reason",
  "special_case",
];

/**
 * @param {StageRecord[]} stageRecords
 * @returns {string}
 */
function serializeStagingCsv(stageRecords) {
  const rows = [STAGING_COLUMNS];
  for (const record of stageRecords) {
    rows.push([
      record.stageSequence,
      record.recordKind,
      record.sourceFile,
      record.sourceKind,
      record.sourceSha256,
      record.sourcePhysicalLine,
      record.sourceRowIndex,
      record.injectedAfterPhysicalLine,
      record.legacyAccountCode,
      record.accountCode,
      record.accountDescription,
      record.entryDate,
      record.journalRef,
      record.journalGroupKey,
      record.lineDisplayReference,
      record.particulars,
      record.chequeReference,
      record.debitCents,
      record.creditCents,
      record.runningBalanceCents,
      record.provenance,
      record.repaired ? "true" : "false",
      record.repairReason,
      record.specialCase,
    ]);
  }
  return `${rows.map(encodeCsvRow).join("\r\n")}\r\n`;
}

/**
 * @param {string[]} argumentsList
 * @returns {{thldPath: string, thdbPath: string, outputDirectory: string, checkOnly: boolean, showHelp: boolean}}
 */
function parseArguments(argumentsList) {
  let thldPath = path.join(SCRIPT_DIRECTORY, "data", "EXCEL_THLD_(JAN-MAY26).csv");
  let thdbPath = path.join(SCRIPT_DIRECTORY, "data", "EXCEL_THDB_(Jan-May26).csv");
  let outputDirectory = path.join(SCRIPT_DIRECTORY, "generated");
  let checkOnly = false;
  let showHelp = false;
  const seenOptions = new Set();

  for (let index = 0; index < argumentsList.length; index += 1) {
    const option = argumentsList[index];
    if (option === "--check-only") {
      assertCondition(!seenOptions.has(option), `Duplicate option ${option}.`);
      seenOptions.add(option);
      checkOnly = true;
      continue;
    }
    if (option === "--help" || option === "-h") {
      showHelp = true;
      continue;
    }
    assertCondition(
      ["--thld", "--thdb", "--output-dir"].includes(option),
      `Unknown option ${JSON.stringify(option)}. Use --help for usage.`,
    );
    assertCondition(!seenOptions.has(option), `Duplicate option ${option}.`);
    seenOptions.add(option);
    const optionValue = argumentsList[index + 1];
    assertCondition(optionValue !== undefined && !optionValue.startsWith("--"), `${option} requires a path.`);
    index += 1;
    if (option === "--thld") {
      thldPath = path.resolve(optionValue);
    } else if (option === "--thdb") {
      thdbPath = path.resolve(optionValue);
    } else {
      outputDirectory = path.resolve(optionValue);
    }
  }

  return { thldPath, thdbPath, outputDirectory, checkOnly, showHelp };
}

/**
 * @returns {void}
 */
function printHelp() {
  console.log(`Usage: node dev/import/legacy-jan-may/prepare-staging.mjs [options]

Options:
  --thld PATH        THLD source CSV (default: data/EXCEL_THLD_(JAN-MAY26).csv)
  --thdb PATH        THDB source CSV (default: data/EXCEL_THDB_(Jan-May26).csv)
  --output-dir PATH  Output directory (default: generated/)
  --check-only       Validate and transform in memory without writing output files
  --help, -h         Show this help`);
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.showHelp) {
    printHelp();
    return;
  }

  const sourceManifest = await readJson(path.join(SCRIPT_DIRECTORY, "source-manifest.json"));
  const aliasesConfig = await readJson(path.join(SCRIPT_DIRECTORY, "account-aliases.json"));
  assertCondition(sourceManifest.schemaVersion === 1, "Unsupported source-manifest schema version.");
  assertCondition(aliasesConfig.schemaVersion === 1, "Unsupported account-aliases schema version.");

  const [thldResult, thdbResult] = await Promise.all([
    parseSource("THLD", options.thldPath, sourceManifest.sources.THLD),
    parseSource("THDB", options.thdbPath, sourceManifest.sources.THDB),
  ]);
  const balanceChainAnomalies = [
    ...thldResult.balanceChainAnomalies,
    ...thdbResult.balanceChainAnomalies,
  ];
  assertCondition(
    balanceChainAnomalies.length === 0,
    `Printed running-balance chain has ${balanceChainAnomalies.length} unexpected anomalies: ${JSON.stringify(balanceChainAnomalies.slice(0, 5))}`,
  );

  const allRecords = [...thldResult.records, ...thdbResult.records];
  const allTransactions = allRecords.filter((record) => record.recordKind === "transaction");
  const rawGroupSummary = validateCombinedSource(
    allTransactions,
    aliasesConfig,
    sourceManifest.expectedCombinedSource,
  );
  const sectionsBySourceCode = new Map();
  for (const [code, section] of thldResult.sections) {
    sectionsBySourceCode.set(`THLD\u001f${code}`, section);
  }
  for (const [code, section] of thdbResult.sections) {
    sectionsBySourceCode.set(`THDB\u001f${code}`, section);
  }

  const { stageRecords, transformationReport } = transformRecords(
    allRecords,
    sectionsBySourceCode,
    aliasesConfig,
  );
  const stageTransactions = stageRecords.filter((record) => record.recordKind === "transaction");
  const stageOpenings = stageRecords.filter((record) => record.recordKind === "opening");
  const stageGroupSummary = summarizeJournalGroups(
    stageTransactions,
    (record) => record.journalGroupKey,
  );

  assertCondition(
    stageTransactions.length === EXPECTED_STAGE_TRANSACTION_ROWS,
    `Staging: expected ${EXPECTED_STAGE_TRANSACTION_ROWS} transactions, found ${stageTransactions.length}.`,
  );
  assertCondition(
    stageOpenings.length === EXPECTED_STAGE_OPENING_ROWS,
    `Staging: expected ${EXPECTED_STAGE_OPENING_ROWS} openings, found ${stageOpenings.length}.`,
  );
  assertCondition(
    stageGroupSummary.groupCount === EXPECTED_STAGE_GROUPS,
    `Staging: expected ${EXPECTED_STAGE_GROUPS} journal groups, found ${stageGroupSummary.groupCount}.`,
  );
  assertCondition(
    stageGroupSummary.imbalancedGroups.length === 0,
    `Staging has unbalanced journal groups: ${JSON.stringify(stageGroupSummary.imbalancedGroups.slice(0, 5))}`,
  );
  assertCondition(
    stageGroupSummary.debitCents === EXPECTED_STAGE_SIDE_CENTS &&
      stageGroupSummary.creditCents === EXPECTED_STAGE_SIDE_CENTS,
    `Staging totals changed: DR ${formatCents(stageGroupSummary.debitCents)}, CR ${formatCents(stageGroupSummary.creditCents)}.`,
  );

  const stagingCsv = serializeStagingCsv(stageRecords);
  const stagingSha256 = sha256Text(stagingCsv);
  assertCondition(
    stagingSha256 === sourceManifest.expectedStagingSha256,
    `Staging SHA-256 changed: expected ${sourceManifest.expectedStagingSha256}, found ${stagingSha256}.`,
  );
  const validationReport = {
    schemaVersion: 1,
    import: "legacy-jan-may-2026",
    sourceWindow: { start: SOURCE_START_DATE, end: SOURCE_END_DATE },
    moneyUnit: "integer cents",
    sources: [thldResult.summary, thdbResult.summary],
    combinedSource: {
      transactionRows: allTransactions.length,
      journalGroups: rawGroupSummary.groupCount,
      debitCents: rawGroupSummary.debitCents,
      creditCents: rawGroupSummary.creditCents,
      netDebitCents: rawGroupSummary.debitCents - rawGroupSummary.creditCents,
      knownUnbalancedGroups: rawGroupSummary.imbalancedGroups,
      printedBalanceChainAnomalies: balanceChainAnomalies,
    },
    transformations: transformationReport,
    staging: {
      filename: STAGING_FILENAME,
      sha256: stagingSha256,
      totalRows: stageRecords.length,
      openingRows: stageOpenings.length,
      transactionRows: stageTransactions.length,
      journalGroups: stageGroupSummary.groupCount,
      unbalancedJournalGroups: stageGroupSummary.imbalancedGroups.length,
      debitCents: stageGroupSummary.debitCents,
      creditCents: stageGroupSummary.creditCents,
      netDebitCents: stageGroupSummary.debitCents - stageGroupSummary.creditCents,
      repairedRows: stageRecords.filter((record) => record.repaired).length,
    },
    anomalies: [],
  };

  if (!options.checkOnly) {
    await mkdir(options.outputDirectory, { recursive: true });
    await Promise.all([
      writeFile(path.join(options.outputDirectory, STAGING_FILENAME), stagingCsv, "utf8"),
      writeFile(
        path.join(options.outputDirectory, REPORT_FILENAME),
        `${JSON.stringify(validationReport, null, 2)}\n`,
        "utf8",
      ),
    ]);
  }

  const outputMessage = options.checkOnly
    ? "Check-only mode: no output files written."
    : `Wrote ${path.join(options.outputDirectory, STAGING_FILENAME)} and ${path.join(options.outputDirectory, REPORT_FILENAME)}.`;
  console.log(
    `Validated ${allTransactions.length} source transactions; staged ${stageTransactions.length} transactions and ${stageOpenings.length} openings in ${stageGroupSummary.groupCount} balanced groups. Staging SHA-256 ${stagingSha256}. ${outputMessage}`,
  );
}

main().catch((error) => {
  console.error(`Legacy Jan-May staging failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
