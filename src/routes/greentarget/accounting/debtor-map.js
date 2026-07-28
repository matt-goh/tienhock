// src/routes/greentarget/accounting/debtor-map.js
//
// Green Target debtor map resolver (phase G7, handover R6).
//
// The 28 GT debtor child accounts are IMPORT-OWNED, created by G3 from the
// GTDB ledger sections — never from greentarget.customers. This module is the
// "non-destructive sync" of R6: it reads the tracked, user-approved
// `dev/import/greentarget-legacy/debtor-map.json` and resolves an ERP
// customer_id to its legacy debtor child account. It NEVER creates, renames,
// or deletes an account, and it never links a customer whose mapping is not
// `approved: true` in the JSON file (approvals are a user decision recorded
// by editing that file, not something code can infer).
//
// Unmapped customers resolve to CD_SD ("CASH DEBTORS (SUNDRY DEBTORS)"), the
// legacy sundry-debtor account that carried every counter sale in the import.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEBTOR_MAP_PATH = path.resolve(
  __dirname,
  "../../../../dev/import/greentarget-legacy/debtor-map.json"
);

/** The sundry-debtors catch-all receivable account (import-owned). */
export const GT_SUNDRY_DEBTOR_ACCOUNT = "CD_SD";

let cachedMap = null;

/**
 * Load and cache the approved mappings as a Map of
 * customer_id (number) -> { legacy_code, gt_account_code }.
 * Fails loudly if the tracked file is missing or malformed: a posting service
 * must never fall back to guesses about who owes GT money.
 *
 * @returns {Map<number, {legacy_code: string, gt_account_code: string}>}
 */
function loadApprovedMappings() {
  if (cachedMap) {
    return cachedMap;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(DEBTOR_MAP_PATH, "utf8"));
  } catch (error) {
    throw new Error(
      `Green Target debtor map could not be read at ${DEBTOR_MAP_PATH}: ${error.message}`
    );
  }
  const mappings = new Map();
  for (const debtor of parsed.debtors || []) {
    const erpCustomer = debtor.erp_customer;
    if (
      erpCustomer &&
      erpCustomer.approved === true &&
      Number.isInteger(erpCustomer.customer_id)
    ) {
      mappings.set(erpCustomer.customer_id, {
        legacy_code: debtor.legacy_code,
        gt_account_code: debtor.gt_account_code,
      });
    }
  }
  cachedMap = mappings;
  return cachedMap;
}

/**
 * Resolve an ERP customer to its approved legacy debtor child account.
 *
 * @param {number|null|undefined} customerId
 * @returns {{legacy_code: string, gt_account_code: string}|null} The approved
 *   mapping, or null when the customer has none (callers then use CD_SD).
 */
export function lookupApprovedDebtorMapping(customerId) {
  if (customerId === null || customerId === undefined) {
    return null;
  }
  return loadApprovedMappings().get(Number(customerId)) || null;
}

/**
 * Test hook: drop the cached map so a changed debtor-map.json is re-read.
 */
export function resetDebtorMapCache() {
  cachedMap = null;
}
