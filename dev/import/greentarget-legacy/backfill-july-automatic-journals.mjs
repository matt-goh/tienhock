// Guarded Green Target July 2026 automatic-journal repair.
//
// Default mode is a SELECT-only audit. No journal line is ever constructed or
// inserted here: --apply delegates sales and consolidated receipt journals to
// the real lifecycle services used by the application.
//
// Usage:
//   node dev/import/greentarget-legacy/backfill-july-automatic-journals.mjs
//   node dev/import/greentarget-legacy/backfill-july-automatic-journals.mjs --apply-safe
//   node dev/import/greentarget-legacy/backfill-july-automatic-journals.mjs --apply
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createDatabasePool } from "../../../src/routes/utils/db-pool.js";
import {
  GT_INVOICE_REVENUE_ACCOUNTS,
  syncGTSalesJournalEntry,
} from "../../../src/routes/greentarget/accounting/sales-journal.js";
import {
  GT_BANK_ACCOUNT,
  syncGTReceiptJournalEntry,
} from "../../../src/routes/greentarget/accounting/payment-journal.js";

const PERIOD_START = "2026-07-01";
const PERIOD_END = "2026-08-01";
const BACKFILL_ACTOR = "gt-july-parity-backfill";
const CONTROL_ACCOUNT = "CD_SD";
const EXPECTED_SOURCE_SHA256 =
  "fe0b5989e73d11aa7dcfe0b062b4fec0405beefc79b2ad1d18322d52a80a29d0";
const CHILD_EVIDENCE_PATH = fileURLToPath(
  new URL("./cd_sd_subledger_evidence.csv", import.meta.url)
);
const DIRECT_DEBTOR_MAP_PATH = fileURLToPath(
  new URL("./debtor-map.json", import.meta.url)
);
// Invoices whose cancelled S journal must be preserved untouched.
//
// This held 325 and 326 until 31 Jul 2026. Both were LIVE invoices whose
// journals had been cancelled by hand, so invoice 325 carried RM200 of
// receivable with no GL entry and invoice 326 was a paid bill with no journal
// at all. The user chose to RESTORE both rather than void the invoices, and
// dev/import/greentarget-legacy/apply-july-lifecycle-decisions.mjs did so; they
// are now ordinary posted journals this script re-syncs like any other.
// Re-adding an id here re-arms the guard.
const INTENTIONALLY_CANCELLED_S_INVOICE_IDS = new Set([]);

/**
 * These are the only customer mappings sufficiently proven for unattended
 * repair. Evidence is checked again at runtime against both the normalized
 * child fixture and the immutable imported journal rows.
 */
const AUDITED_CUSTOMER_MAPPINGS = new Map([
  [
    29,
    {
      accountCode: "CD-DCH",
      expectedCustomerName: "DCH TECHNOLOGY SDN BHD",
      expectedChildDescription: "DCH TECHNOLOGY SDN BHD",
      legacyToken: "CD-DCH",
      basis: "exact customer/child name plus repeated legacy /CD-DCH sales",
    },
  ],
  [
    40,
    {
      accountCode: "CD-MS",
      expectedCustomerName: "MS BERJAYA RESOURCES",
      expectedChildDescription: "MS BERJAYA RESOURCES",
      legacyToken: "CD-MS",
      basis: "exact customer/child name plus repeated legacy /CD-MS sales",
    },
  ],
  [
    54,
    {
      accountCode: "CD-ENRICH",
      expectedCustomerName: "ENRICH AURA SDN BHD",
      expectedChildDescription: "ENRICH AURA SDN BHD",
      legacyToken: "CD-ENRICH",
      basis:
        "exact customer/child name plus repeated legacy /CD-ENRICH sales",
    },
  ],
  [
    66,
    {
      accountCode: "HUNG TAI",
      expectedCustomerName: "HUNG TAI ENTERPRISE SABAH SDN BHD",
      expectedChildDescription: "HUNG TAI ENTERPRISE (SABAH) SDN BHD",
      legacyToken: "HUNG TAI",
      basis: "exact legal name plus repeated legacy /HUNG TAI sales",
    },
  ],
]);

const EXACT_REFERENCE_MAPPING = {
  customerId: 51,
  invoiceNumber: "2026/01009",
  accountCode: "CD-CASH",
  expectedCustomerName: "APG GEOTECHNICS E M SDN BHD",
  expectedChildDescription: "RECEIVE PAYMENT CASH/ONLINE",
};

const UNAPPROVED_DIRECT_CANDIDATES = new Map([
  [
    17,
    {
      accountCode: "PAUMIN",
      expectedCustomerName: "PAUMIN HARDWARE SDN BHD",
      note: "legacy debtor-map candidate remains approved:false",
    },
  ],
  [
    22,
    {
      accountCode: "NURI",
      expectedCustomerName:
        "SYARIKAT PENIAGAAN PERABOT NURI SDN BHD",
      note: "legacy debtor-map has no ERP customer mapping",
    },
  ],
]);

const NAMED_UNRESOLVED_CANDIDATES = new Map([
  [57, "No Zexie Carmelia child/name/phone match in the legacy schedule"],
  [61, "No MIZAN child match in the legacy schedule"],
  [62, "No ALIS WODI child match; Likas has multiple unrelated candidates"],
  [63, "ABE is not safely equivalent to CD-ABEL; Kobusak is ambiguous"],
  [64, "Kelvin Yap has conflicting CD-KELVIN/CD-KG CONTOH/name candidates"],
  [65, "CD-MIMIE describes SKM, KKIP while the ERP location is Minintod"],
]);

const suppliedArgs = process.argv.slice(2);
const allowedArgs = new Set(["--apply", "--apply-safe", "--help"]);
const unknownArgs = suppliedArgs.filter((argument) => !allowedArgs.has(argument));
if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
}
const APPLY_ALL = suppliedArgs.includes("--apply");
const APPLY_SAFE = suppliedArgs.includes("--apply-safe");
if (APPLY_ALL && APPLY_SAFE) {
  throw new Error("Choose either --apply or --apply-safe, not both");
}
const WRITE_MODE = APPLY_ALL || APPLY_SAFE;

const pool = createDatabasePool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "tienhock",
  password: process.env.DB_PASSWORD || "foodmaker",
  port: Number(process.env.DB_PORT || 5434),
});

/** @param {string} message */
function fail(message) {
  throw new Error(`GT July journal backfill aborted: ${message}`);
}

/** @param {unknown} value @returns {string} */
function clean(value) {
  return String(value ?? "").trim();
}

/** @param {unknown} value @returns {string} */
function normalizeName(value) {
  return clean(value)
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\bSENDIRIAN\b/g, "SDN")
    .replace(/\bBERHAD\b/g, "BHD")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {unknown} value @returns {number} */
function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : Number.NaN;
}

/** @param {number} left @param {number} right @returns {boolean} */
function sameMoney(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 0.005;
}

/**
 * Small RFC-4180 parser copied from the hash-pinned GT import builders.
 * @param {string} text
 * @returns {Array<Record<string, string>>}
 */
function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
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
  if (quoted) fail("unterminated quoted CSV field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length < 2) fail("CD_SD child evidence CSV is empty");
  rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  const header = rows.shift();
  return rows.map((cells) =>
    Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]))
  );
}

/**
 * @returns {{childRows: Array<Record<string, string>>, childByCode: Map<string, Record<string, string>>, directDebtorMap: Record<string, unknown>}}
 */
function loadEvidenceFixtures() {
  const childRows = parseCsv(fs.readFileSync(CHILD_EVIDENCE_PATH, "utf8"));
  /** @type {Map<string, Record<string, string>>} */
  const childByCode = new Map();
  for (const row of childRows) {
    const accountCode = clean(row.account_code);
    if (!accountCode) fail("child evidence contains a blank account code");
    if (childByCode.has(accountCode)) {
      fail(`child evidence contains duplicate account ${accountCode}`);
    }
    if (clean(row.source_sha256) !== EXPECTED_SOURCE_SHA256) {
      fail(`child evidence ${accountCode} has an unexpected source hash`);
    }
    childByCode.set(accountCode, row);
  }
  const directDebtorMap = JSON.parse(
    fs.readFileSync(DIRECT_DEBTOR_MAP_PATH, "utf8")
  );
  return { childRows, childByCode, directDebtorMap };
}

/** @param {Record<string, unknown>} account @returns {boolean} */
function isActiveDebtorLeaf(account) {
  return Boolean(
    account &&
      account.is_active === true &&
      account.ledger_type === "TD" &&
      clean(account.code) !== CONTROL_ACCOUNT &&
      account.has_active_children !== true
  );
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchJulyInvoices(client) {
  const result = await client.query(
    `SELECT i.*,
            to_char(i.date_issued, 'YYYY-MM-DD') AS date_issued_text,
            c.name AS customer_name,
            c.debtor_account_code AS customer_debtor_account_code
       FROM greentarget.invoices i
       JOIN greentarget.customers c ON c.customer_id = i.customer_id
      WHERE i.date_issued >= $1::date
        AND i.date_issued < $2::date
      ORDER BY i.date_issued, i.invoice_id`,
    [PERIOD_START, PERIOD_END]
  );
  return result.rows;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number[]} invoiceIds
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchInvoiceJournalCandidates(client, invoiceIds) {
  if (invoiceIds.length === 0) return [];
  const result = await client.query(
    `SELECT i.invoice_id AS owner_id,
            je.id, je.reference_no, je.display_reference, je.entry_type,
            to_char(je.entry_date, 'YYYY-MM-DD') AS entry_date,
            je.total_debit, je.total_credit, je.status, je.source_type,
            je.source_id, je.manual_override, je.created_by,
            COALESCE(lines.items, '[]'::jsonb) AS lines
       FROM greentarget.invoices i
       JOIN greentarget.journal_entries je
         ON je.id = i.journal_entry_id
         OR (je.source_type = 'invoice' AND je.source_id = i.invoice_id::text)
         OR (je.entry_type = 'S'
             AND (je.reference_no = i.invoice_number
                  OR je.display_reference = i.invoice_number))
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'line_number', line_number,
                    'account_code', account_code,
                    'debit_amount', debit_amount,
                    'credit_amount', credit_amount,
                    'reference', reference
                  ) ORDER BY line_number
                ) AS items
           FROM greentarget.journal_entry_lines
          WHERE journal_entry_id = je.id
       ) lines ON true
      WHERE i.invoice_id = ANY($1::int[])
      ORDER BY i.invoice_id, je.id`,
    [invoiceIds]
  );
  return result.rows;
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchJulyReceipts(client) {
  const result = await client.query(
    `SELECT r.*,
            to_char(r.received_date, 'YYYY-MM-DD') AS received_date_text,
            to_char(r.posting_date, 'YYYY-MM-DD') AS posting_date_text
       FROM greentarget.receipts r
      WHERE (r.received_date >= $1::date AND r.received_date < $2::date)
         OR (r.posting_date >= $1::date AND r.posting_date < $2::date)
         OR EXISTS (
              SELECT 1
                FROM greentarget.payments p
               WHERE p.receipt_id = r.id
                 AND p.payment_date >= $1::date
                 AND p.payment_date < $2::date
            )
      ORDER BY r.received_date, r.id`,
    [PERIOD_START, PERIOD_END]
  );
  return result.rows;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number[]} receiptIds
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchReceiptAllocations(client, receiptIds) {
  if (receiptIds.length === 0) return [];
  const result = await client.query(
    `SELECT p.*,
            to_char(p.payment_date, 'YYYY-MM-DD') AS payment_date_text,
            i.invoice_number, i.customer_id, i.status AS invoice_status,
            i.debtor_account_code,
            to_char(i.date_issued, 'YYYY-MM-DD') AS invoice_date_text,
            c.name AS customer_name,
            c.debtor_account_code AS customer_debtor_account_code
       FROM greentarget.payments p
       JOIN greentarget.invoices i ON i.invoice_id = p.invoice_id
       JOIN greentarget.customers c ON c.customer_id = i.customer_id
      WHERE p.receipt_id = ANY($1::int[])
      ORDER BY p.receipt_id, p.payment_id`,
    [receiptIds]
  );
  return result.rows;
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchJulyPaymentCoverage(client) {
  const result = await client.query(
    `SELECT payment_id, receipt_id, status,
            to_char(payment_date, 'YYYY-MM-DD') AS payment_date_text
       FROM greentarget.payments
      WHERE payment_date >= $1::date
        AND payment_date < $2::date
      ORDER BY payment_id`,
    [PERIOD_START, PERIOD_END]
  );
  return result.rows;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number[]} receiptIds
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchReceiptJournalCandidates(client, receiptIds) {
  if (receiptIds.length === 0) return [];
  const result = await client.query(
    `SELECT r.id AS owner_id,
            je.id, je.reference_no, je.display_reference, je.entry_type,
            to_char(je.entry_date, 'YYYY-MM-DD') AS entry_date,
            je.total_debit, je.total_credit, je.status, je.source_type,
            je.source_id, je.manual_override, je.created_by,
            COALESCE(lines.items, '[]'::jsonb) AS lines
       FROM greentarget.receipts r
       JOIN greentarget.journal_entries je
         ON je.id = r.journal_entry_id
         OR (je.source_type = 'receipt' AND je.source_id = r.id::text)
         OR EXISTS (
              SELECT 1
                FROM greentarget.payments p
               WHERE p.receipt_id = r.id
                 AND (je.id = p.journal_entry_id
                      OR (je.source_type = 'payment'
                          AND je.source_id = p.payment_id::text))
            )
         OR (je.entry_type = 'REC'
             AND r.display_reference IS NOT NULL
             AND (je.reference_no = r.display_reference
                  OR je.display_reference = r.display_reference))
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'line_number', line_number,
                    'account_code', account_code,
                    'debit_amount', debit_amount,
                    'credit_amount', credit_amount,
                    'reference', reference
                  ) ORDER BY line_number
                ) AS items
           FROM greentarget.journal_entry_lines
          WHERE journal_entry_id = je.id
       ) lines ON true
      WHERE r.id = ANY($1::int[])
      ORDER BY r.id, je.id`,
    [receiptIds]
  );
  return result.rows;
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {Promise<Map<string, Record<string, unknown>>>}
 */
async function fetchAccounts(client) {
  const result = await client.query(
    `SELECT ac.code, ac.description, ac.ledger_type, ac.parent_code,
            ac.is_active,
            EXISTS (
              SELECT 1
                FROM greentarget.account_codes child
               WHERE child.parent_code = ac.code
                 AND child.is_active = true
            ) AS has_active_children
       FROM greentarget.account_codes ac`
  );
  return new Map(result.rows.map((row) => [clean(row.code), row]));
}

/**
 * @param {import("pg").PoolClient} client
 * @param {string[]} invoiceNumbers
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchLegacyEvidenceRows(client, invoiceNumbers) {
  const result = await client.query(
    `SELECT stage_sequence,
            to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
            journal_ref, account_code, particulars, debit_cents, credit_cents
       FROM greentarget.import_legacy_rows
      WHERE (account_code = ANY($1::text[]) AND entry_date < $2::date)
         OR journal_ref = ANY($3::text[])
      ORDER BY stage_sequence`,
    [[...GT_INVOICE_REVENUE_ACCOUNTS], PERIOD_START, invoiceNumbers]
  );
  return result.rows;
}

/**
 * Payroll vouchers are explicitly user-triggered by POST /generate. This
 * audit reports whether July payroll exists and whether those vouchers have
 * already been generated, but it never imports or calls the generator.
 * @param {import("pg").PoolClient} client
 * @returns {Promise<Record<string, unknown>>}
 */
async function fetchPayrollStatus(client) {
  const payrollResult = await client.query(
    `SELECT COUNT(*)::int AS payroll_rows,
            COUNT(*) FILTER (WHERE ep.employee_id IN ('GOH', 'WONG'))::int
              AS director_rows,
            COUNT(*) FILTER (WHERE ep.employee_id NOT IN ('GOH', 'WONG'))::int
              AS staff_rows
       FROM greentarget.employee_payrolls ep
       JOIN greentarget.monthly_payrolls mp ON mp.id = ep.monthly_payroll_id
      WHERE mp.year = 2026 AND mp.month = 7`
  );
  const journalResult = await client.query(
    `SELECT reference_no, id, status
       FROM greentarget.journal_entries
      WHERE reference_no = ANY($1::text[])
      ORDER BY reference_no, id`,
    [["JWDR/07/26", "JBSL/07/26"]]
  );
  return {
    ...payrollResult.rows[0],
    journals: journalResult.rows,
  };
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} key
 * @returns {Map<number, Array<Record<string, unknown>>>}
 */
function indexRows(rows, key) {
  /** @type {Map<number, Array<Record<string, unknown>>>} */
  const indexed = new Map();
  for (const row of rows) {
    const id = Number(row[key]);
    const current = indexed.get(id) || [];
    current.push(row);
    indexed.set(id, current);
  }
  return indexed;
}

/**
 * @param {string} particulars
 * @param {string} token
 * @returns {boolean}
 */
function hasLegacyToken(particulars, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`/${escaped}(?=$|[\\s,/(])`, "i").test(particulars);
}

/**
 * @param {ReturnType<typeof loadEvidenceFixtures>} fixtures
 * @param {Array<Record<string, unknown>>} legacyRows
 * @returns {Map<number, Record<string, unknown>>}
 */
function buildAuditedMappingEvidence(fixtures, legacyRows) {
  /** @type {Map<number, Record<string, unknown>>} */
  const result = new Map();
  for (const [customerId, mapping] of AUDITED_CUSTOMER_MAPPINGS) {
    const child = fixtures.childByCode.get(mapping.accountCode);
    const descriptionMatches =
      normalizeName(child?.account_description) ===
      normalizeName(mapping.expectedChildDescription);
    const history = legacyRows.filter(
      (row) =>
        GT_INVOICE_REVENUE_ACCOUNTS.has(clean(row.account_code)) &&
        Number(row.credit_cents) > 0 &&
        hasLegacyToken(clean(row.particulars), mapping.legacyToken)
    );
    result.set(customerId, {
      ...mapping,
      childFixtureFound: Boolean(child),
      childDescriptionMatches: descriptionMatches,
      legacyRevenueRows: history.length,
      legacyRevenueAccounts: [...new Set(history.map((row) => row.account_code))].sort(),
      proven: Boolean(child && descriptionMatches && history.length > 0),
    });
  }

  const exactChild = fixtures.childByCode.get(EXACT_REFERENCE_MAPPING.accountCode);
  const exactRows = legacyRows.filter(
    (row) => clean(row.journal_ref) === EXACT_REFERENCE_MAPPING.invoiceNumber
  );
  const exactRevenueRows = exactRows.filter(
    (row) =>
      clean(row.account_code) === "TGA" &&
      Number(row.credit_cents) === 23000 &&
      hasLegacyToken(clean(row.particulars), EXACT_REFERENCE_MAPPING.accountCode)
  );
  result.set(EXACT_REFERENCE_MAPPING.customerId, {
    ...EXACT_REFERENCE_MAPPING,
    basis:
      "exact imported reference 2026/01009: 2026-06-30 TGA RM230 /CD-CASH",
    childFixtureFound: Boolean(exactChild),
    childDescriptionMatches:
      normalizeName(exactChild?.account_description) ===
      normalizeName(EXACT_REFERENCE_MAPPING.expectedChildDescription),
    legacyRevenueRows: exactRevenueRows.length,
    legacyRevenueAccounts: [...new Set(exactRevenueRows.map((row) => row.account_code))],
    proven: Boolean(
      exactChild &&
        exactRevenueRows.length === 1 &&
        normalizeName(exactChild.account_description) ===
          normalizeName(EXACT_REFERENCE_MAPPING.expectedChildDescription)
    ),
    duplicateLegacyReference: true,
  });
  return result;
}

/**
 * @param {ReturnType<typeof loadEvidenceFixtures>} fixtures
 * @returns {Map<number, Record<string, unknown>>}
 */
function validateUnapprovedDirectCandidates(fixtures) {
  const debtors = Array.isArray(fixtures.directDebtorMap.debtors)
    ? fixtures.directDebtorMap.debtors
    : [];
  /** @type {Map<number, Record<string, unknown>>} */
  const result = new Map();
  for (const [customerId, candidate] of UNAPPROVED_DIRECT_CANDIDATES) {
    const legacy = debtors.find(
      (debtor) => clean(debtor.gt_account_code) === candidate.accountCode
    );
    if (!legacy) fail(`debtor-map is missing ${candidate.accountCode}`);
    const approved = legacy.erp_customer?.approved === true;
    result.set(customerId, { ...candidate, legacy, approved });
  }
  return result;
}

/**
 * @param {Record<string, unknown>} document
 * @param {Map<string, Record<string, unknown>>} accounts
 * @param {Map<number, Record<string, unknown>>} mappingEvidence
 * @param {Map<number, Record<string, unknown>>} directCandidates
 * @returns {Record<string, unknown>}
 */
function resolveDebtorMapping(
  document,
  accounts,
  mappingEvidence,
  directCandidates
) {
  const customerId = Number(document.customer_id);
  const invoiceAccount = clean(document.debtor_account_code);
  const customerAccount = clean(document.customer_debtor_account_code);

  if (invoiceAccount && invoiceAccount !== CONTROL_ACCOUNT) {
    const account = accounts.get(invoiceAccount);
    return isActiveDebtorLeaf(account)
      ? {
          targetAccount: invoiceAccount,
          source: "invoice selection",
          accountReady: true,
          warning:
            customerAccount &&
            customerAccount !== CONTROL_ACCOUNT &&
            customerAccount !== invoiceAccount
              ? `invoice/customer selections differ (${invoiceAccount}/${customerAccount}); invoice wins`
              : null,
        }
      : {
          targetAccount: null,
          source: "invalid invoice selection",
          accountReady: false,
          problem: `${invoiceAccount} is not an active GT trade-debtor leaf`,
        };
  }

  if (customerAccount && customerAccount !== CONTROL_ACCOUNT) {
    const account = accounts.get(customerAccount);
    return isActiveDebtorLeaf(account)
      ? {
          targetAccount: customerAccount,
          source: "customer selection",
          accountReady: true,
          warning: null,
        }
      : {
          targetAccount: null,
          source: "invalid customer selection",
          accountReady: false,
          problem: `${customerAccount} is not an active GT trade-debtor leaf`,
        };
  }

  const audited = mappingEvidence.get(customerId);
  if (audited) {
    if (
      normalizeName(document.customer_name) !==
      normalizeName(audited.expectedCustomerName)
    ) {
      return {
        targetAccount: null,
        source: "audited legacy mapping",
        accountReady: false,
        problem: `customer ${customerId} name changed; expected ${audited.expectedCustomerName}`,
      };
    }
    if (audited.proven !== true) {
      return {
        targetAccount: null,
        source: "audited legacy mapping",
        accountReady: false,
        problem: `legacy evidence checks failed for ${audited.accountCode}`,
      };
    }
    return {
      targetAccount: audited.accountCode,
      source: "audited legacy mapping",
      accountReady: isActiveDebtorLeaf(accounts.get(clean(audited.accountCode))),
      warning: audited.duplicateLegacyReference
        ? "the same reference is already posted in the locked 2026-06-30 import"
        : null,
      duplicateLegacyReference: audited.duplicateLegacyReference === true,
      basis: audited.basis,
    };
  }

  const direct = directCandidates.get(customerId);
  if (direct) {
    return {
      targetAccount: null,
      candidateAccount: direct.accountCode,
      source: "unapproved direct candidate",
      accountReady: isActiveDebtorLeaf(accounts.get(clean(direct.accountCode))),
      problem: `${direct.accountCode} needs explicit user approval: ${direct.note}`,
    };
  }

  return {
    targetAccount: null,
    source: "unresolved",
    accountReady: false,
    problem:
      NAMED_UNRESOLVED_CANDIDATES.get(customerId) ||
      "no exact legacy child/customer mapping was proven",
  };
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Array<Record<string, unknown>>} journalCandidates
 * @param {Array<Record<string, unknown>>} legacyRows
 * @returns {Record<string, unknown>}
 */
function resolveRevenue(invoice, journalCandidates, legacyRows) {
  const current = clean(invoice.revenue_account_code);
  if (GT_INVOICE_REVENUE_ACCOUNTS.has(current)) {
    return { targetAccount: current, source: "existing invoice snapshot" };
  }

  const journalAccounts = new Set();
  for (const journal of journalCandidates) {
    if (clean(journal.entry_type) !== "S") continue;
    for (const line of Array.isArray(journal.lines) ? journal.lines : []) {
      const accountCode = clean(line.account_code);
      if (
        GT_INVOICE_REVENUE_ACCOUNTS.has(accountCode) &&
        money(line.credit_amount) > 0
      ) {
        journalAccounts.add(accountCode);
      }
    }
  }
  if (journalAccounts.size === 1) {
    return {
      targetAccount: [...journalAccounts][0],
      source: "exact existing S-journal credit",
      recovered: true,
    };
  }

  const legacyAccounts = new Set(
    legacyRows
      .filter(
        (row) =>
          clean(row.journal_ref) === clean(invoice.invoice_number) &&
          GT_INVOICE_REVENUE_ACCOUNTS.has(clean(row.account_code)) &&
          Number(row.credit_cents) > 0
      )
      .map((row) => clean(row.account_code))
  );
  if (legacyAccounts.size === 1) {
    return {
      targetAccount: [...legacyAccounts][0],
      source: "exact imported journal reference",
      recovered: true,
    };
  }
  return {
    targetAccount: null,
    source: "unresolved",
    problem: `invalid/missing revenue snapshot ${current || "(blank)"}; no unique exact journal evidence`,
  };
}

/**
 * @param {Record<string, unknown>} journal
 * @param {string} debtorAccount
 * @param {string} revenueAccount
 * @param {number} amount
 * @returns {boolean}
 */
function salesJournalMatches(journal, debtorAccount, revenueAccount, amount) {
  if (
    clean(journal.status) !== "posted" ||
    clean(journal.entry_type) !== "S" ||
    !sameMoney(money(journal.total_debit), amount) ||
    !sameMoney(money(journal.total_credit), amount)
  ) {
    return false;
  }
  const lines = Array.isArray(journal.lines) ? journal.lines : [];
  if (lines.length !== 2) return false;
  const debtorLine = lines.find(
    (line) =>
      clean(line.account_code) === debtorAccount &&
      sameMoney(money(line.debit_amount), amount) &&
      sameMoney(money(line.credit_amount), 0)
  );
  const revenueLine = lines.find(
    (line) =>
      clean(line.account_code) === revenueAccount &&
      sameMoney(money(line.credit_amount), amount) &&
      sameMoney(money(line.debit_amount), 0)
  );
  return Boolean(debtorLine && revenueLine);
}

/**
 * @param {Record<string, unknown>} invoice
 * @param {Array<Record<string, unknown>>} journals
 * @param {Record<string, unknown>} debtor
 * @param {Record<string, unknown>} revenue
 * @param {Array<Record<string, unknown>>} legacyRows
 * @returns {Record<string, unknown>}
 */
function classifyInvoice(invoice, journals, debtor, revenue, legacyRows) {
  const invoiceId = Number(invoice.invoice_id);
  const linkedId = Number(invoice.journal_entry_id || 0);
  const linked = journals.find((journal) => Number(journal.id) === linkedId);
  const ownedPosted = journals.filter(
    (journal) =>
      clean(journal.status) === "posted" &&
      clean(journal.source_type) === "invoice" &&
      clean(journal.source_id) === String(invoiceId)
  );
  const posted = journals.filter((journal) => clean(journal.status) === "posted");
  const exactLegacy = legacyRows.filter(
    (row) => clean(row.journal_ref) === clean(invoice.invoice_number)
  );
  const base = {
    invoiceId,
    invoiceNumber: clean(invoice.invoice_number),
    date: clean(invoice.date_issued_text),
    customerId: Number(invoice.customer_id),
    customer: clean(invoice.customer_name),
    status: clean(invoice.status),
    currentDebtor: clean(invoice.debtor_account_code) || "(blank)",
    targetDebtor: debtor.targetAccount || debtor.candidateAccount || "?",
    mappingSource: debtor.source,
    revenue: revenue.targetAccount || clean(invoice.revenue_account_code) || "?",
    revenueSource: revenue.source,
    journalIds: journals.map((journal) => Number(journal.id)).join(",") || "none",
    mapping: debtor,
    revenueResolution: revenue,
    invoice,
    journals,
    blocking: false,
    action: null,
  };

  if (INTENTIONALLY_CANCELLED_S_INVOICE_IDS.has(invoiceId)) {
    const cancellationPreserved = Boolean(
      linked && clean(linked.status) === "cancelled" && clean(linked.entry_type) === "S"
    );
    return {
      ...base,
      decision: "skip: intentionally cancelled S journal",
      detail: cancellationPreserved
        ? `journal ${linked.id} remains cancelled`
        : "expected cancelled S journal state changed; still skipped by explicit guard",
      intentionalCancellationStateOk: cancellationPreserved,
      blocking: !cancellationPreserved,
    };
  }

  if (clean(invoice.status) === "cancelled") {
    return {
      ...base,
      decision: "skip: cancelled invoice",
      detail: "cancelled source documents are never resurrected",
    };
  }

  if (exactLegacy.length > 0) {
    return {
      ...base,
      decision: "blocked: duplicate locked legacy reference",
      detail: `${invoice.invoice_number} already has ${exactLegacy.length} imported 2026-06-30 line(s); resolve the duplicate source document first`,
      blocking: true,
    };
  }

  if (ownedPosted.length > 1) {
    return {
      ...base,
      decision: "blocked: duplicate source ownership",
      detail: `${ownedPosted.length} posted invoice-owned journals found`,
      blocking: true,
    };
  }

  const owned = ownedPosted[0] || null;
  const otherPosted = posted.filter((journal) => !owned || journal.id !== owned.id);
  if (owned && linkedId && linkedId !== Number(owned.id)) {
    return {
      ...base,
      decision: "blocked: journal backlink conflict",
      detail: `invoice links ${linkedId}, but posted source owner is ${owned.id}`,
      blocking: true,
    };
  }
  if (owned && otherPosted.length > 0) {
    return {
      ...base,
      decision: "blocked: additional posted journal",
      detail: `source journal ${owned.id} coexists with posted candidate(s) ${otherPosted
        .map((journal) => journal.id)
        .join(",")}`,
      blocking: true,
    };
  }
  if (owned?.manual_override === true) {
    return {
      ...base,
      decision: "preserve: manual override",
      detail: `source journal ${owned.id} was hand-edited and is detached`,
    };
  }
  if (!owned && posted.length > 0) {
    return {
      ...base,
      decision: "blocked: protect user-entered posted journal",
      detail: `posted candidate(s) ${posted.map((journal) => journal.id).join(",")} are not owned by this invoice; no automatic journal will be duplicated`,
      blocking: true,
    };
  }
  if (!owned && journals.some((journal) => clean(journal.status) === "cancelled")) {
    return {
      ...base,
      decision: "blocked: unexpected cancelled journal",
      detail: "automatic creation would silently resurrect a cancelled reference",
      blocking: true,
    };
  }
  if (!debtor.targetAccount) {
    return {
      ...base,
      decision: "blocked: debtor mapping unresolved",
      detail: debtor.problem,
      blocking: true,
    };
  }
  if (debtor.duplicateLegacyReference === true) {
    return {
      ...base,
      decision: "blocked: duplicate locked legacy reference",
      detail: debtor.warning,
      blocking: true,
    };
  }
  if (debtor.accountReady !== true) {
    return {
      ...base,
      decision: "blocked: debtor child not loaded",
      detail: `${debtor.targetAccount} is proven by the fixture but is not yet an active TD leaf in the database`,
      blocking: true,
    };
  }
  if (!revenue.targetAccount) {
    return {
      ...base,
      decision: "blocked: revenue account unresolved",
      detail: revenue.problem,
      blocking: true,
    };
  }

  if (owned) {
    if (clean(owned.entry_type) !== "S") {
      return {
        ...base,
        decision: "blocked: invalid source journal type",
        detail: `journal ${owned.id} is ${owned.entry_type}, not S`,
        blocking: true,
      };
    }
    const alreadyMatches =
      clean(invoice.debtor_account_code) === debtor.targetAccount &&
      clean(invoice.revenue_account_code) === revenue.targetAccount &&
      salesJournalMatches(
        owned,
        clean(debtor.targetAccount),
        clean(revenue.targetAccount),
        money(invoice.total_amount)
      );
    if (alreadyMatches) {
      return {
        ...base,
        decision: "no-op: automatic S journal already exact",
        detail: `journal ${owned.id} is balanced and uses the resolved accounts`,
      };
    }
    return {
      ...base,
      decision: "apply: re-sync automatic S journal",
      detail: `service will replace journal ${owned.id}; revenue ${revenue.targetAccount} is retained`,
      action: "sync_invoice",
    };
  }

  return {
    ...base,
    decision: "apply: create missing automatic S journal",
    detail: `service will create one invoice-owned journal using ${debtor.targetAccount}/${revenue.targetAccount}`,
    action: "sync_invoice",
  };
}

/**
 * @param {Record<string, unknown>} journal
 * @param {Array<Record<string, unknown>>} allocations
 * @param {Map<number, Record<string, unknown>>} allocationMappings
 * @param {number} total
 * @returns {boolean}
 */
function receiptJournalMatches(journal, allocations, allocationMappings, total) {
  if (
    clean(journal.status) !== "posted" ||
    clean(journal.entry_type) !== "REC" ||
    !sameMoney(money(journal.total_debit), total) ||
    !sameMoney(money(journal.total_credit), total)
  ) {
    return false;
  }
  const remaining = [...(Array.isArray(journal.lines) ? journal.lines : [])];
  const bankIndex = remaining.findIndex(
    (line) =>
      clean(line.account_code) === GT_BANK_ACCOUNT &&
      sameMoney(money(line.debit_amount), total) &&
      sameMoney(money(line.credit_amount), 0)
  );
  if (bankIndex < 0) return false;
  remaining.splice(bankIndex, 1);
  for (const allocation of allocations) {
    const mapping = allocationMappings.get(Number(allocation.payment_id));
    const lineIndex = remaining.findIndex(
      (line) =>
        clean(line.account_code) === clean(mapping?.targetAccount) &&
        sameMoney(money(line.credit_amount), money(allocation.amount_paid)) &&
        sameMoney(money(line.debit_amount), 0) &&
        clean(line.reference) === clean(allocation.invoice_number)
    );
    if (lineIndex < 0) return false;
    remaining.splice(lineIndex, 1);
  }
  return remaining.length === 0;
}

/**
 * @param {Record<string, unknown>} receipt
 * @param {Array<Record<string, unknown>>} allocations
 * @param {Array<Record<string, unknown>>} journals
 * @param {Map<string, Record<string, unknown>>} accounts
 * @param {Map<number, Record<string, unknown>>} mappingEvidence
 * @param {Map<number, Record<string, unknown>>} directCandidates
 * @returns {Record<string, unknown>}
 */
function classifyReceipt(
  receipt,
  allocations,
  journals,
  accounts,
  mappingEvidence,
  directCandidates
) {
  const receiptId = Number(receipt.id);
  /** @type {Map<number, Record<string, unknown>>} */
  const allocationMappings = new Map(
    allocations.map((allocation) => [
      Number(allocation.payment_id),
      resolveDebtorMapping(allocation, accounts, mappingEvidence, directCandidates),
    ])
  );
  const base = {
    receiptId,
    reference: clean(receipt.display_reference) || `#${receiptId}`,
    receivedDate: clean(receipt.received_date_text),
    postingDate: clean(receipt.posting_date_text) || "(none)",
    status: clean(receipt.status),
    total: money(receipt.total_amount),
    payments: allocations.map((allocation) => Number(allocation.payment_id)).join(",") || "none",
    invoices: allocations.map((allocation) => clean(allocation.invoice_number)).join(",") || "none",
    targets:
      allocations
        .map((allocation) => {
          const mapping = allocationMappings.get(Number(allocation.payment_id));
          return `${allocation.invoice_number}:${mapping?.targetAccount || mapping?.candidateAccount || "?"}`;
        })
        .join(" | ") || "none",
    journalIds: journals.map((journal) => Number(journal.id)).join(",") || "none",
    receipt,
    allocations,
    journals,
    allocationMappings,
    blocking: false,
    action: null,
  };

  if (clean(receipt.status) === "cancelled") {
    return {
      ...base,
      decision: "skip: cancelled receipt",
      detail: "receipt, payments and any cancelled journal remain untouched",
    };
  }
  if (clean(receipt.status) === "pending") {
    return {
      ...base,
      decision: "skip: pending receipt",
      detail: "pending receipts post nothing until confirmed",
    };
  }
  if (allocations.length === 0) {
    return {
      ...base,
      decision: "blocked: no allocations",
      detail: "posted receipt has no payment allocations",
      blocking: true,
    };
  }
  const cancelledAllocations = allocations.filter(
    (allocation) => clean(allocation.status) === "cancelled"
  );
  if (cancelledAllocations.length > 0) {
    return {
      ...base,
      decision: "blocked: cancelled payment in active receipt",
      detail: `cancelled payment(s): ${cancelledAllocations
        .map((allocation) => allocation.payment_id)
        .join(",")}`,
      blocking: true,
    };
  }
  const allocationTotal = money(
    allocations.reduce((sum, allocation) => sum + money(allocation.amount_paid), 0)
  );
  if (!sameMoney(allocationTotal, money(receipt.total_amount))) {
    return {
      ...base,
      decision: "blocked: receipt total mismatch",
      detail: `header ${money(receipt.total_amount).toFixed(2)} vs allocations ${allocationTotal.toFixed(2)}`,
      blocking: true,
    };
  }
  const unresolved = allocations.filter((allocation) => {
    const mapping = allocationMappings.get(Number(allocation.payment_id));
    return !mapping?.targetAccount;
  });
  if (unresolved.length > 0) {
    return {
      ...base,
      decision: "blocked: allocation debtor unresolved",
      detail: unresolved
        .map((allocation) => {
          const mapping = allocationMappings.get(Number(allocation.payment_id));
          return `${allocation.invoice_number}: ${mapping?.problem}`;
        })
        .join("; "),
      blocking: true,
    };
  }
  const unavailable = allocations.filter((allocation) => {
    const mapping = allocationMappings.get(Number(allocation.payment_id));
    return mapping?.accountReady !== true;
  });
  if (unavailable.length > 0) {
    return {
      ...base,
      decision: "blocked: allocation debtor child not loaded",
      detail: unavailable
        .map((allocation) => {
          const mapping = allocationMappings.get(Number(allocation.payment_id));
          return `${allocation.invoice_number}:${mapping?.targetAccount}`;
        })
        .join(", "),
      blocking: true,
    };
  }

  const receiptOwned = journals.filter(
    (journal) =>
      clean(journal.status) === "posted" &&
      clean(journal.source_type) === "receipt" &&
      clean(journal.source_id) === String(receiptId)
  );
  const paymentOwned = journals.filter(
    (journal) =>
      clean(journal.status) === "posted" && clean(journal.source_type) === "payment"
  );
  const posted = journals.filter((journal) => clean(journal.status) === "posted");
  const linkedId = Number(receipt.journal_entry_id || 0);

  if (receiptOwned.length > 1) {
    return {
      ...base,
      decision: "blocked: duplicate receipt source ownership",
      detail: `${receiptOwned.length} posted receipt-owned journals found`,
      blocking: true,
    };
  }
  const owned = receiptOwned[0] || null;
  const otherPosted = posted.filter((journal) => !owned || journal.id !== owned.id);
  if (owned && linkedId && linkedId !== Number(owned.id)) {
    return {
      ...base,
      decision: "blocked: receipt backlink conflict",
      detail: `receipt links ${linkedId}, but source owner is ${owned.id}`,
      blocking: true,
    };
  }
  if (paymentOwned.length > 0) {
    return {
      ...base,
      decision: "blocked: legacy per-payment journal still posted",
      detail: `journal(s) ${paymentOwned.map((journal) => journal.id).join(",")} must be reviewed before consolidation`,
      blocking: true,
    };
  }
  if (owned && otherPosted.length > 0) {
    return {
      ...base,
      decision: "blocked: additional posted receipt journal",
      detail: `receipt source ${owned.id} coexists with ${otherPosted
        .map((journal) => journal.id)
        .join(",")}`,
      blocking: true,
    };
  }
  if (!owned && posted.length > 0) {
    return {
      ...base,
      decision: "blocked: protect user-entered posted receipt journal",
      detail: `posted candidate(s) ${posted.map((journal) => journal.id).join(",")} are not receipt-owned; no duplicate is created`,
      blocking: true,
    };
  }
  if (!owned && journals.some((journal) => clean(journal.status) === "cancelled")) {
    return {
      ...base,
      decision: "blocked: active receipt has cancelled journal history",
      detail: "automatic creation would silently resurrect a cancelled receipt reference",
      blocking: true,
    };
  }
  if (owned?.manual_override === true) {
    return {
      ...base,
      decision: "preserve: manual receipt override",
      detail: `receipt journal ${owned.id} was hand-edited and is detached`,
    };
  }
  if (owned) {
    if (
      receiptJournalMatches(
        owned,
        allocations,
        allocationMappings,
        money(receipt.total_amount)
      ) &&
      Number(receipt.journal_entry_id) === Number(owned.id) &&
      allocations.every(
        (allocation) => Number(allocation.journal_entry_id) === Number(owned.id)
      )
    ) {
      return {
        ...base,
        decision: "no-op: consolidated REC already exact",
        detail: `journal ${owned.id} is linked, balanced and uses PBB_1`,
      };
    }
    return {
      ...base,
      decision: "apply: re-sync consolidated REC journal",
      detail: `service will replace receipt-owned journal ${owned.id}`,
      action: "sync_receipt",
    };
  }
  return {
    ...base,
    decision: "apply: create missing consolidated REC journal",
    detail: `service will create one receipt-owned journal with ${allocations.length} debtor credit(s) and one ${GT_BANK_ACCOUNT} debit`,
    action: "sync_receipt",
  };
}

/**
 * @param {import("pg").PoolClient} client
 * @param {ReturnType<typeof loadEvidenceFixtures>} fixtures
 * @returns {Promise<Record<string, unknown>>}
 */
async function collectAudit(client, fixtures) {
  const invoices = await fetchJulyInvoices(client);
  const receipts = await fetchJulyReceipts(client);
  const invoiceIds = invoices.map((invoice) => Number(invoice.invoice_id));
  const receiptIds = receipts.map((receipt) => Number(receipt.id));
  const [
    invoiceJournals,
    allocations,
    julyPayments,
    receiptJournals,
    accounts,
    legacyRows,
    payroll,
  ] = await Promise.all([
    fetchInvoiceJournalCandidates(client, invoiceIds),
    fetchReceiptAllocations(client, receiptIds),
    fetchJulyPaymentCoverage(client),
    fetchReceiptJournalCandidates(client, receiptIds),
    fetchAccounts(client),
    fetchLegacyEvidenceRows(
      client,
      invoices.map((invoice) => clean(invoice.invoice_number))
    ),
    fetchPayrollStatus(client),
  ]);
  return {
    invoices,
    receipts,
    invoiceJournals,
    allocations,
    julyPayments,
    receiptJournals,
    accounts,
    legacyRows,
    payroll,
  };
}

/**
 * @param {Record<string, unknown>} audit
 * @param {ReturnType<typeof loadEvidenceFixtures>} fixtures
 * @returns {Record<string, unknown>}
 */
function buildPlan(audit, fixtures) {
  const mappingEvidence = buildAuditedMappingEvidence(fixtures, audit.legacyRows);
  const directCandidates = validateUnapprovedDirectCandidates(fixtures);
  const invoiceJournals = indexRows(audit.invoiceJournals, "owner_id");
  const receiptJournals = indexRows(audit.receiptJournals, "owner_id");
  const allocations = indexRows(audit.allocations, "receipt_id");

  const childCoverageRows = fixtures.childRows.filter((row) => {
    const account = audit.accounts.get(clean(row.account_code));
    return Boolean(
      isActiveDebtorLeaf(account) &&
        clean(account.parent_code) === CONTROL_ACCOUNT &&
        normalizeName(account.description) === normalizeName(row.account_description)
    );
  });

  const invoiceDecisions = audit.invoices.map((invoice) => {
    const journals = invoiceJournals.get(Number(invoice.invoice_id)) || [];
    const debtor = resolveDebtorMapping(
      invoice,
      audit.accounts,
      mappingEvidence,
      directCandidates
    );
    const revenue = resolveRevenue(invoice, journals, audit.legacyRows);
    return classifyInvoice(invoice, journals, debtor, revenue, audit.legacyRows);
  });
  const receiptDecisions = audit.receipts.map((receipt) =>
    classifyReceipt(
      receipt,
      allocations.get(Number(receipt.id)) || [],
      receiptJournals.get(Number(receipt.id)) || [],
      audit.accounts,
      mappingEvidence,
      directCandidates
    )
  );

  if (invoiceDecisions.length !== audit.invoices.length) {
    fail("not every July invoice was classified");
  }
  if (receiptDecisions.length !== audit.receipts.length) {
    fail("not every July receipt was classified");
  }
  const uniqueInvoiceIds = new Set(invoiceDecisions.map((item) => item.invoiceId));
  const uniqueReceiptIds = new Set(receiptDecisions.map((item) => item.receiptId));
  if (uniqueInvoiceIds.size !== invoiceDecisions.length) {
    fail("a July invoice was classified more than once");
  }
  if (uniqueReceiptIds.size !== receiptDecisions.length) {
    fail("a July receipt was classified more than once");
  }

  const allocationPaymentIds = new Set(
    audit.allocations.map((allocation) => Number(allocation.payment_id))
  );
  const uncoveredJulyPayments = audit.julyPayments.filter(
    (payment) => !allocationPaymentIds.has(Number(payment.payment_id))
  );

  /** @type {string[]} */
  const globalBlockers = [];
  /** @type {string[]} */
  const documentBlockers = [];
  if (childCoverageRows.length !== fixtures.childRows.length) {
    globalBlockers.push(
      `CD_SD child migration coverage is ${childCoverageRows.length}/${fixtures.childRows.length}; apply requires the full hash-pinned fixture`
    );
  }
  if (uncoveredJulyPayments.length > 0) {
    globalBlockers.push(
      `July payment(s) ${uncoveredJulyPayments
        .map((payment) => payment.payment_id)
        .join(",")} are not covered by a durable receipt header`
    );
  }
  for (const item of invoiceDecisions.filter((decision) => decision.blocking)) {
    documentBlockers.push(
      `invoice ${item.invoiceId} ${item.invoiceNumber}: ${item.detail}`
    );
  }
  for (const item of receiptDecisions.filter((decision) => decision.blocking)) {
    documentBlockers.push(
      `receipt ${item.receiptId} ${item.reference}: ${item.detail}`
    );
  }

  for (const expectedId of INTENTIONALLY_CANCELLED_S_INVOICE_IDS) {
    const decision = invoiceDecisions.find((item) => item.invoiceId === expectedId);
    if (!decision) {
      globalBlockers.push(
        `expected intentionally-cancelled invoice ${expectedId} is absent`
      );
    } else if (decision.intentionalCancellationStateOk !== true) {
      globalBlockers.push(
        `invoice ${expectedId} no longer has its expected cancelled S journal`
      );
    }
  }
  const guardedCancellationActions = invoiceDecisions.filter(
    (item) =>
      INTENTIONALLY_CANCELLED_S_INVOICE_IDS.has(item.invoiceId) && item.action
  );
  if (guardedCancellationActions.length > 0) {
    globalBlockers.push(
      `internal guard failure: intentionally-cancelled invoice action(s) ${guardedCancellationActions
        .map((item) => item.invoiceId)
        .join(",")}`
    );
  }

  const uniqueGlobalBlockers = [...new Set(globalBlockers)];
  const uniqueDocumentBlockers = [...new Set(documentBlockers)];

  return {
    fixtures,
    audit,
    mappingEvidence,
    directCandidates,
    childCoverage: {
      exact: childCoverageRows.length,
      total: fixtures.childRows.length,
    },
    invoiceDecisions,
    receiptDecisions,
    invoiceActions: invoiceDecisions.filter((decision) => decision.action),
    receiptActions: receiptDecisions.filter((decision) => decision.action),
    globalBlockers: uniqueGlobalBlockers,
    documentBlockers: uniqueDocumentBlockers,
    blockers: [...uniqueGlobalBlockers, ...uniqueDocumentBlockers],
  };
}

/** @param {Record<string, unknown>} plan */
function printPlan(plan) {
  const modeLabel = APPLY_ALL
    ? "APPLY (ALL-OR-NOTHING)"
    : APPLY_SAFE
      ? "APPLY SAFE (NON-BLOCKED ACTIONS ONLY)"
      : "DRY RUN";
  console.log(`\n=== Green Target July 2026 journal audit (${modeLabel}) ===`);
  console.log(
    `CD_SD child fixture: ${plan.childCoverage.exact}/${plan.childCoverage.total} exact active TD children loaded`
  );

  console.log("\nEvidence-backed mappings (not all are safe to apply):");
  console.table(
    [...plan.mappingEvidence.entries()].map(([customerId, evidence]) => ({
      customer_id: customerId,
      account: evidence.accountCode,
      proven: evidence.proven,
      child_fixture: evidence.childFixtureFound,
      legacy_sales_rows: evidence.legacyRevenueRows,
      legacy_revenue: (evidence.legacyRevenueAccounts || []).join("/") || "none",
      qualification: evidence.duplicateLegacyReference
        ? "mapping exact, but duplicate invoice reference blocks"
        : evidence.basis,
    }))
  );

  const pauminNuriRows = [...plan.directCandidates.entries()].map(
    ([customerId, candidate]) => {
      const history = plan.audit.legacyRows.filter(
        (row) =>
          GT_INVOICE_REVENUE_ACCOUNTS.has(clean(row.account_code)) &&
          Number(row.credit_cents) > 0 &&
          hasLegacyToken(clean(row.particulars), clean(candidate.accountCode))
      );
      const counts = {};
      for (const row of history) {
        const key = clean(row.account_code);
        counts[key] = (counts[key] || 0) + 1;
      }
      return {
        customer_id: customerId,
        candidate: candidate.accountCode,
        approved: candidate.approved,
        legacy_revenue_mix: Object.entries(counts)
          .map(([account, count]) => `${account}:${count}`)
          .join(", "),
        treatment: "no auto-map; retain the invoice's existing revenue snapshot",
      };
    }
  );
  console.log("\nPAUMIN/NURI uncertainty:");
  console.table(pauminNuriRows);

  console.log("\nJuly invoices:");
  console.table(
    plan.invoiceDecisions.map((item) => ({
      id: item.invoiceId,
      reference: item.invoiceNumber,
      date: item.date,
      customer: item.customer,
      debtor: `${item.currentDebtor} -> ${item.targetDebtor}`,
      revenue: `${item.revenue} (${item.revenueSource})`,
      journals: item.journalIds,
      decision: item.decision,
      detail: item.detail,
    }))
  );

  console.log("\nJuly receipts/payment groups:");
  console.table(
    plan.receiptDecisions.map((item) => ({
      id: item.receiptId,
      reference: item.reference,
      status: item.status,
      posting_date: item.postingDate,
      total: item.total,
      payments: item.payments,
      allocations: item.targets,
      journals: item.journalIds,
      decision: item.decision,
      detail: item.detail,
    }))
  );

  console.log("\nPayroll vouchers (report only; generation is user-triggered):");
  console.table([
    {
      payroll_rows: plan.audit.payroll.payroll_rows,
      director_rows: plan.audit.payroll.director_rows,
      staff_rows: plan.audit.payroll.staff_rows,
      existing_journals:
        plan.audit.payroll.journals
          .map((journal) => `${journal.reference_no}#${journal.id}:${journal.status}`)
          .join(", ") || "none",
      treatment: "not generated by this script",
    },
  ]);

  const cancelledInvoices = plan.invoiceDecisions.filter((item) =>
    item.decision.startsWith("skip: intentionally cancelled")
  ).length;
  const cancelledReceipts = plan.receiptDecisions.filter(
    (item) => item.status === "cancelled"
  ).length;
  console.log("\nSummary:");
  console.table([
    {
      july_invoices: plan.invoiceDecisions.length,
      invoice_actions: plan.invoiceActions.length,
      protected_cancelled_S: cancelledInvoices,
      july_receipts: plan.receiptDecisions.length,
      july_payments: plan.audit.julyPayments.length,
      receipt_actions: plan.receiptActions.length,
      protected_cancelled_receipts: cancelledReceipts,
      global_blockers: plan.globalBlockers.length,
      document_blockers: plan.documentBlockers.length,
    },
  ]);
  if (plan.globalBlockers.length > 0) {
    console.log("\nGLOBAL INTEGRITY BLOCKERS (both apply modes abort):");
    plan.globalBlockers.forEach((blocker, index) =>
      console.log(`${index + 1}. ${blocker}`)
    );
  }
  if (plan.documentBlockers.length > 0) {
    console.log("\nDOCUMENT REVIEW BLOCKERS (--apply aborts; --apply-safe leaves untouched):");
    plan.documentBlockers.forEach((blocker, index) =>
      console.log(`${index + 1}. ${blocker}`)
    );
  }
  if (plan.blockers.length === 0) {
    console.log(
      `\n${WRITE_MODE ? "Apply preflight passed." : "Dry run is clean; rerun with --apply to commit through the real services."}`
    );
  } else if (
    APPLY_SAFE &&
    plan.globalBlockers.length === 0 &&
    plan.documentBlockers.length > 0
  ) {
    console.log(
      `\nSafe-apply preflight passed: ${plan.invoiceActions.length} invoice action(s) and ${plan.receiptActions.length} receipt action(s) may run; ${plan.documentBlockers.length} ambiguous/conflicting document(s) remain untouched.`
    );
  }
}

/**
 * Lock mutable source rows before re-auditing in apply mode. The advisory lock
 * serializes this one-off script; row locks also make concurrent app edits wait.
 * @param {import("pg").PoolClient} client
 */
async function lockApplyScope(client) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('greentarget-july-2026-journal-backfill'))"
  );
  await client.query(
    `SELECT invoice_id
       FROM greentarget.invoices
      WHERE (date_issued >= $1::date AND date_issued < $2::date)
         OR EXISTS (
              SELECT 1
                FROM greentarget.payments p
                JOIN greentarget.receipts r ON r.id = p.receipt_id
               WHERE p.invoice_id = invoices.invoice_id
                 AND ((r.received_date >= $1::date AND r.received_date < $2::date)
                      OR (r.posting_date >= $1::date AND r.posting_date < $2::date)
                      OR (p.payment_date >= $1::date AND p.payment_date < $2::date))
            )
      ORDER BY invoice_id
      FOR UPDATE`,
    [PERIOD_START, PERIOD_END]
  );
  await client.query(
    `SELECT id
       FROM greentarget.receipts
      WHERE (received_date >= $1::date AND received_date < $2::date)
         OR (posting_date >= $1::date AND posting_date < $2::date)
         OR EXISTS (
              SELECT 1 FROM greentarget.payments p
               WHERE p.receipt_id = receipts.id
                 AND p.payment_date >= $1::date AND p.payment_date < $2::date
            )
      ORDER BY id
      FOR UPDATE`,
    [PERIOD_START, PERIOD_END]
  );
  await client.query(
    `SELECT payment_id
       FROM greentarget.payments
      WHERE (payment_date >= $1::date AND payment_date < $2::date)
         OR EXISTS (
              SELECT 1
                FROM greentarget.receipts r
               WHERE r.id = payments.receipt_id
                 AND ((r.received_date >= $1::date AND r.received_date < $2::date)
                      OR (r.posting_date >= $1::date AND r.posting_date < $2::date))
            )
      ORDER BY payment_id
      FOR UPDATE`,
    [PERIOD_START, PERIOD_END]
  );
  await client.query(
    `SELECT customer_id
       FROM greentarget.customers
      WHERE EXISTS (
              SELECT 1
                FROM greentarget.invoices i
               WHERE i.customer_id = customers.customer_id
                 AND ((i.date_issued >= $1::date AND i.date_issued < $2::date)
                      OR EXISTS (
                           SELECT 1
                             FROM greentarget.payments p
                             JOIN greentarget.receipts r ON r.id = p.receipt_id
                            WHERE p.invoice_id = i.invoice_id
                              AND ((r.received_date >= $1::date AND r.received_date < $2::date)
                                   OR (r.posting_date >= $1::date AND r.posting_date < $2::date)
                                   OR (p.payment_date >= $1::date AND p.payment_date < $2::date))
                         ))
            )
      ORDER BY customer_id
      FOR UPDATE`,
    [PERIOD_START, PERIOD_END]
  );
}

/**
 * @param {import("pg").PoolClient} client
 * @param {Record<string, unknown>} plan
 */
async function applyPlan(client, plan) {
  /** @type {Map<number, {accountCode: string, source: string}>} */
  const invoiceMappingUpdates = new Map();
  /** @type {Map<number, {accountCode: string, customerId: number, source: string}>} */
  const customerMappingUpdates = new Map();

  for (const action of plan.invoiceActions) {
    invoiceMappingUpdates.set(action.invoiceId, {
      accountCode: clean(action.mapping.targetAccount),
      source: clean(action.mapping.source),
    });
    if (action.mapping.source === "audited legacy mapping") {
      customerMappingUpdates.set(action.customerId, {
        accountCode: clean(action.mapping.targetAccount),
        customerId: action.customerId,
        source: clean(action.mapping.source),
      });
    }
  }
  for (const action of plan.receiptActions) {
    for (const allocation of action.allocations) {
      const mapping = action.allocationMappings.get(Number(allocation.payment_id));
      invoiceMappingUpdates.set(Number(allocation.invoice_id), {
        accountCode: clean(mapping.targetAccount),
        source: clean(mapping.source),
      });
      if (mapping.source === "audited legacy mapping") {
        customerMappingUpdates.set(Number(allocation.customer_id), {
          accountCode: clean(mapping.targetAccount),
          customerId: Number(allocation.customer_id),
          source: clean(mapping.source),
        });
      }
    }
  }

  for (const update of customerMappingUpdates.values()) {
    const result = await client.query(
      `UPDATE greentarget.customers
          SET debtor_account_code = $1
        WHERE customer_id = $2
          AND (debtor_account_code IS NULL
               OR btrim(debtor_account_code) = ''
               OR debtor_account_code = $3)
      RETURNING customer_id`,
      [update.accountCode, update.customerId, CONTROL_ACCOUNT]
    );
    if (result.rowCount !== 1) {
      fail(
        `customer ${update.customerId} mapping changed during apply; explicit user selection was not overwritten`
      );
    }
  }

  for (const [invoiceId, update] of invoiceMappingUpdates) {
    const result = await client.query(
      `UPDATE greentarget.invoices
          SET debtor_account_code = $1
        WHERE invoice_id = $2
          AND (debtor_account_code IS NULL
               OR btrim(debtor_account_code) = ''
               OR debtor_account_code = $3
               OR debtor_account_code = $1)
      RETURNING invoice_id`,
      [update.accountCode, invoiceId, CONTROL_ACCOUNT]
    );
    if (result.rowCount !== 1) {
      fail(`invoice ${invoiceId} debtor selection changed during apply`);
    }
  }

  for (const action of plan.invoiceActions) {
    if (action.revenueResolution.recovered === true) {
      const result = await client.query(
        `UPDATE greentarget.invoices
            SET revenue_account_code = $1
          WHERE invoice_id = $2
            AND (revenue_account_code IS NULL
                 OR btrim(revenue_account_code) = ''
                 OR revenue_account_code = $1)
        RETURNING invoice_id`,
        [action.revenueResolution.targetAccount, action.invoiceId]
      );
      if (result.rowCount !== 1) {
        fail(`invoice ${action.invoiceId} revenue selection changed during apply`);
      }
    }
    const invoiceResult = await client.query(
      "SELECT * FROM greentarget.invoices WHERE invoice_id = $1 FOR UPDATE",
      [action.invoiceId]
    );
    if (invoiceResult.rows.length !== 1) fail(`invoice ${action.invoiceId} disappeared`);
    await syncGTSalesJournalEntry(
      client,
      invoiceResult.rows[0],
      BACKFILL_ACTOR
    );
  }

  for (const action of plan.receiptActions) {
    const receiptResult = await client.query(
      "SELECT * FROM greentarget.receipts WHERE id = $1 FOR UPDATE",
      [action.receiptId]
    );
    if (receiptResult.rows.length !== 1) fail(`receipt ${action.receiptId} disappeared`);
    await syncGTReceiptJournalEntry(
      client,
      receiptResult.rows[0],
      BACKFILL_ACTOR
    );
  }
}

/**
 * @param {Record<string, unknown>} beforePlan
 * @param {Record<string, unknown>} afterPlan
 */
function assertAppliedActionsAreNoOps(beforePlan, afterPlan) {
  for (const applied of beforePlan.invoiceActions) {
    const verified = afterPlan.invoiceDecisions.find(
      (decision) => decision.invoiceId === applied.invoiceId
    );
    if (
      !verified ||
      verified.action ||
      verified.decision !== "no-op: automatic S journal already exact"
    ) {
      fail(
        `invoice ${applied.invoiceId} did not become an exact idempotent no-op after apply`
      );
    }
  }
  for (const applied of beforePlan.receiptActions) {
    const verified = afterPlan.receiptDecisions.find(
      (decision) => decision.receiptId === applied.receiptId
    );
    if (
      !verified ||
      verified.action ||
      verified.decision !== "no-op: consolidated REC already exact"
    ) {
      fail(
        `receipt ${applied.receiptId} did not become an exact idempotent no-op after apply`
      );
    }
  }
}

async function main() {
  if (suppliedArgs.includes("--help")) {
    console.log(
      "Default: SELECT-only July audit. --apply is all-or-nothing. --apply-safe commits only non-blocked actions, but still aborts on any global integrity blocker."
    );
    return;
  }
  const fixtures = loadEvidenceFixtures();
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    if (WRITE_MODE) {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      transactionOpen = true;
      await lockApplyScope(client);
    } else {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      transactionOpen = true;
    }

    const audit = await collectAudit(client, fixtures);
    const plan = buildPlan(audit, fixtures);
    printPlan(plan);

    if (!WRITE_MODE) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      console.log("\nDRY RUN COMPLETE: no database rows were written.");
      return;
    }
    if (plan.globalBlockers.length > 0) {
      fail(
        `${plan.globalBlockers.length} global integrity blocker(s) remain; nothing was changed`
      );
    }
    if (APPLY_ALL && plan.documentBlockers.length > 0) {
      fail(
        `${plan.documentBlockers.length} document blocker(s) remain; all-or-nothing apply changed nothing`
      );
    }

    await applyPlan(client, plan);
    const verificationAudit = await collectAudit(client, fixtures);
    const verificationPlan = buildPlan(verificationAudit, fixtures);
    assertAppliedActionsAreNoOps(plan, verificationPlan);
    if (verificationPlan.globalBlockers.length > 0) {
      fail(
        `post-apply global integrity check failed (${verificationPlan.globalBlockers.length} blocker(s))`
      );
    }
    if (
      verificationPlan.invoiceActions.length > 0 ||
      verificationPlan.receiptActions.length > 0
    ) {
      fail(
        `post-apply idempotency check left ${verificationPlan.invoiceActions.length} invoice action(s) and ${verificationPlan.receiptActions.length} receipt action(s)`
      );
    }
    if (APPLY_ALL && verificationPlan.documentBlockers.length > 0) {
      fail(
        `all-or-nothing verification found ${verificationPlan.documentBlockers.length} document blocker(s)`
      );
    }
    await client.query("COMMIT");
    transactionOpen = false;
    console.log(
      `\n${APPLY_SAFE ? "SAFE APPLY" : "APPLY"} COMPLETE: ${plan.invoiceActions.length} invoice journal(s) and ${plan.receiptActions.length} consolidated receipt journal(s) synced; every applied action verified as a no-op on rerun.${APPLY_SAFE && verificationPlan.documentBlockers.length > 0 ? ` ${verificationPlan.documentBlockers.length} document review blocker(s) remain untouched.` : ""}`
    );
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(`\nFAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
