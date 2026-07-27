/**
 * Minimal, dependency-free reader for the two Green Target legacy `.xlsx` exports.
 *
 * WHY THIS EXISTS INSTEAD OF AN `xlsx` LIBRARY
 * --------------------------------------------
 * Column B of these workbooks holds dates in TWO different cell kinds, and the
 * distinction is the only thing that lets us recover the true date (see
 * `docs/Account/GT_ACCOUNTING_HANDOVER.md` section 3a):
 *
 *   - numeric cell, style s=2 (numFmtId 14 = mm-dd-yy) -> Excel parsed the
 *     original `DD/MM/YYYY` text US-style and SWAPPED day and month.
 *   - shared string                                    -> Excel could not parse
 *     it (day > 12) and left the literal `DD/MM/YYYY` text.
 *
 * Any reader that helpfully converts serials to `Date` (`cellDates: true`) or
 * that round-trips the file through CSV destroys that distinction and silently
 * yields the swapped date. This reader therefore returns RAW cell values plus
 * the style index and type, and performs NO date interpretation whatsoever.
 * Date recovery lives in `prepare-staging.mjs`, where it is gated by assertions.
 *
 * @module read-xlsx
 */

import { inflateRawSync } from "node:zlib";

/** @typedef {"n" | "s" | "str" | "b" | "e" | "inlineStr"} CellType */

/**
 * @typedef {Object} RawCell
 * @property {string} ref Cell reference, e.g. `B10`.
 * @property {string} column Column letters, e.g. `B`.
 * @property {number} row 1-based row number.
 * @property {CellType} type Cell type; `n` (number) when the `t` attribute is absent.
 * @property {number} styleIndex Value of the `s` attribute (index into `cellXfs`); 0 when absent.
 * @property {string} raw The literal `<v>` text (or resolved string for `s`/`inlineStr`).
 * @property {boolean} isSharedString True when the value came from `sharedStrings.xml`.
 */

/**
 * @typedef {Object} RawRow
 * @property {number} rowNumber 1-based worksheet row number.
 * @property {Map<string, RawCell>} cells Keyed by column letters.
 */

/**
 * @typedef {Object} WorkbookNumberFormat
 * @property {number} styleIndex
 * @property {number} numberFormatId
 */

/**
 * @typedef {Object} ReadResult
 * @property {RawRow[]} rows Rows in worksheet order; rows absent from the XML are omitted.
 * @property {string} dimension The worksheet `<dimension ref>` value, e.g. `A1:H5158`.
 * @property {boolean} date1904 True when the workbook uses the 1904 date system.
 * @property {WorkbookNumberFormat[]} cellFormats One entry per `cellXfs` `<xf>`, in order.
 * @property {string[]} sharedStrings Resolved shared-string table.
 */

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

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
 * Read every member of a ZIP archive into memory.
 *
 * Only the two compression methods these workbooks use are supported (stored
 * and deflate); anything else aborts loudly rather than being skipped.
 *
 * @param {Buffer} archive
 * @returns {Map<string, Buffer>}
 */
export function readZipEntries(archive) {
  let endOfCentralDirectoryOffset = -1;
  for (let offset = archive.length - 22; offset >= 0; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      endOfCentralDirectoryOffset = offset;
      break;
    }
  }
  assertCondition(endOfCentralDirectoryOffset !== -1, "Not a ZIP archive: no end-of-central-directory record.");

  const entryCount = archive.readUInt16LE(endOfCentralDirectoryOffset + 10);
  let cursor = archive.readUInt32LE(endOfCentralDirectoryOffset + 16);

  /** @type {Map<string, Buffer>} */
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    assertCondition(
      archive.readUInt32LE(cursor) === CENTRAL_DIRECTORY_SIGNATURE,
      `Corrupt ZIP: expected a central-directory header at offset ${cursor}.`,
    );
    const compressionMethod = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    assertCondition(
      archive.readUInt32LE(localHeaderOffset) === LOCAL_FILE_HEADER_SIGNATURE,
      `Corrupt ZIP: expected a local file header for ${name}.`,
    );
    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);

    let contents;
    if (compressionMethod === 0) {
      contents = Buffer.from(compressed);
    } else if (compressionMethod === 8) {
      contents = inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${name}.`);
    }
    assertCondition(
      contents.length === uncompressedSize,
      `Corrupt ZIP: ${name} inflated to ${contents.length} bytes, expected ${uncompressedSize}.`,
    );

    entries.set(name, contents);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Decode the five predefined XML entities plus numeric character references.
 *
 * @param {string} value
 * @returns {string}
 */
function decodeXmlText(value) {
  if (!value.includes("&")) {
    return value;
  }
  return value.replace(/&(#x?[0-9A-Fa-f]+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    switch (entity) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        break;
    }
    const codePoint = entity.startsWith("#x") || entity.startsWith("#X")
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    assertCondition(Number.isFinite(codePoint), `Unsupported XML entity ${match}.`);
    return String.fromCodePoint(codePoint);
  });
}

/**
 * Concatenate the `<t>` runs of one `<si>` element, which is how Excel stores a
 * single logical string that happens to carry mixed formatting.
 *
 * @param {string} sharedItemXml
 * @returns {string}
 */
function collectTextRuns(sharedItemXml) {
  let text = "";
  const runPattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let match;
  while ((match = runPattern.exec(sharedItemXml)) !== null) {
    text += match[1] === undefined ? "" : decodeXmlText(match[1]);
  }
  return text;
}

/**
 * @param {Buffer | undefined} sharedStringsXml
 * @returns {string[]}
 */
function parseSharedStrings(sharedStringsXml) {
  if (!sharedStringsXml) {
    return [];
  }
  const xml = sharedStringsXml.toString("utf8");
  /** @type {string[]} */
  const strings = [];
  const itemPattern = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si(?:\s[^>]*)?\/>/g;
  let match;
  while ((match = itemPattern.exec(xml)) !== null) {
    strings.push(match[1] === undefined ? "" : collectTextRuns(match[1]));
  }

  const declared = /<sst[^>]*\buniqueCount="(\d+)"/.exec(xml);
  if (declared) {
    assertCondition(
      strings.length === Number(declared[1]),
      `sharedStrings.xml declares uniqueCount=${declared[1]} but ${strings.length} <si> elements were parsed.`,
    );
  }
  return strings;
}

/**
 * @param {Buffer | undefined} stylesXml
 * @returns {WorkbookNumberFormat[]}
 */
function parseCellFormats(stylesXml) {
  if (!stylesXml) {
    return [];
  }
  const xml = stylesXml.toString("utf8");
  const block = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!block) {
    return [];
  }
  /** @type {WorkbookNumberFormat[]} */
  const formats = [];
  const formatPattern = /<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g;
  let match;
  while ((match = formatPattern.exec(block[1])) !== null) {
    const numberFormatId = /\bnumFmtId="(\d+)"/.exec(match[1]);
    formats.push({
      styleIndex: formats.length,
      numberFormatId: numberFormatId ? Number(numberFormatId[1]) : 0,
    });
  }
  return formats;
}

/**
 * @param {string} cellXml One `<c ...>...</c>` (or self-closing) element.
 * @param {string[]} sharedStrings
 * @returns {RawCell | null} `null` for a cell that carries no value at all.
 */
function parseCell(cellXml, sharedStrings) {
  const attributes = /^<c\b([^>]*?)\/?>/.exec(cellXml);
  assertCondition(attributes !== null, `Unparsable cell element: ${cellXml.slice(0, 120)}`);
  const reference = /\br="([A-Z]+)(\d+)"/.exec(attributes[1]);
  assertCondition(reference !== null, `Cell without an r attribute: ${cellXml.slice(0, 120)}`);
  const typeMatch = /\bt="([^"]+)"/.exec(attributes[1]);
  const styleMatch = /\bs="(\d+)"/.exec(attributes[1]);
  /** @type {CellType} */
  const type = /** @type {CellType} */ (typeMatch ? typeMatch[1] : "n");
  const styleIndex = styleMatch ? Number(styleMatch[1]) : 0;

  let raw;
  if (type === "inlineStr") {
    const inline = /<is>([\s\S]*?)<\/is>/.exec(cellXml);
    raw = inline ? collectTextRuns(inline[1]) : "";
  } else {
    const valueMatch = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cellXml);
    if (!valueMatch) {
      return null;
    }
    raw = decodeXmlText(valueMatch[1]);
    if (type === "s") {
      const index = Number(raw);
      assertCondition(
        Number.isInteger(index) && index >= 0 && index < sharedStrings.length,
        `Shared-string index ${raw} out of range at ${reference[0]}.`,
      );
      raw = sharedStrings[index];
    }
  }

  return {
    ref: `${reference[1]}${reference[2]}`,
    column: reference[1],
    row: Number(reference[2]),
    type,
    styleIndex,
    raw,
    isSharedString: type === "s",
  };
}

/**
 * Read one worksheet of an `.xlsx` file without interpreting any value.
 *
 * @param {Buffer} archive Raw bytes of the `.xlsx` file.
 * @param {string} [worksheetPath] Archive member to read.
 * @returns {ReadResult}
 */
export function readWorksheet(archive, worksheetPath = "xl/worksheets/sheet1.xml") {
  const entries = readZipEntries(archive);
  const worksheet = entries.get(worksheetPath);
  assertCondition(worksheet !== undefined, `Archive has no member ${worksheetPath}.`);

  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml"));
  const cellFormats = parseCellFormats(entries.get("xl/styles.xml"));

  const workbookXml = entries.get("xl/workbook.xml");
  const date1904 = workbookXml
    ? /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbookXml.toString("utf8"))
    : false;

  const xml = worksheet.toString("utf8");
  const dimensionMatch = /<dimension\s+ref="([^"]+)"/.exec(xml);
  const dimension = dimensionMatch ? dimensionMatch[1] : "";

  const sheetData = /<sheetData(?:\s[^>]*)?>([\s\S]*?)<\/sheetData>/.exec(xml);
  assertCondition(sheetData !== null, `${worksheetPath} has no <sheetData> block.`);

  /** @type {RawRow[]} */
  const rows = [];
  const rowPattern = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(sheetData[1])) !== null) {
    const rowNumberMatch = /\br="(\d+)"/.exec(rowMatch[1]);
    assertCondition(rowNumberMatch !== null, "Worksheet row without an r attribute.");
    /** @type {Map<string, RawCell>} */
    const cells = new Map();
    const body = rowMatch[2] ?? "";
    const cellPattern = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(body)) !== null) {
      const cell = parseCell(cellMatch[0], sharedStrings);
      if (cell === null) {
        continue;
      }
      assertCondition(
        cell.row === Number(rowNumberMatch[1]),
        `Cell ${cell.ref} appears inside row ${rowNumberMatch[1]}.`,
      );
      cells.set(cell.column, cell);
    }
    rows.push({ rowNumber: Number(rowNumberMatch[1]), cells });
  }

  return { rows, dimension, date1904, cellFormats, sharedStrings };
}

/**
 * Convert an Excel serial date to its calendar parts WITHOUT any timezone
 * involvement. The 1900 system is assumed (asserted by the caller via
 * `ReadResult.date1904`), including Excel's deliberate 1900-02-29 bug, which is
 * why serial 60 is rejected rather than guessed at.
 *
 * @param {number} serial
 * @returns {{year: number, month: number, day: number}}
 */
export function excelSerialToParts(serial) {
  assertCondition(Number.isInteger(serial) && serial > 60, `Unsupported Excel date serial ${serial}.`);
  // Serial 61 is 1900-03-01. Anchor there to sidestep Excel's phantom 1900-02-29.
  const daysSinceAnchor = serial - 61;
  const anchor = Date.UTC(1900, 2, 1);
  const resolved = new Date(anchor + daysSinceAnchor * 86400000);
  return {
    year: resolved.getUTCFullYear(),
    month: resolved.getUTCMonth() + 1,
    day: resolved.getUTCDate(),
  };
}
