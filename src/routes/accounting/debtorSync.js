const DEBTOR_PARENT_CODE = "DEBTOR";
const DEBTOR_LEDGER_TYPE = "TD";
const DEBTOR_FS_NOTE = "22";
const DEBTOR_LEVEL = 2;
const DEBTOR_CODE_SUFFIX_LIMIT = 50;

/**
 * @typedef {{ query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} QueryClient
 * @typedef {{ id: string, name: string }} CustomerIdentity
 */

/**
 * @param {string} customerId
 * @returns {string[]}
 */
const buildDebtorCodeCandidates = (customerId) => {
  const candidates = [customerId, `${customerId}-D`];

  for (let suffixNumber = 2; suffixNumber <= DEBTOR_CODE_SUFFIX_LIMIT; suffixNumber += 1) {
    candidates.push(`${customerId}-D${suffixNumber}`);
  }

  return candidates;
};

/**
 * @param {QueryClient} client
 * @param {string} customerId
 * @returns {Promise<string | null>}
 */
export async function resolveDebtorChildCode(client, customerId) {
  const candidates = buildDebtorCodeCandidates(customerId);
  const result = await client.query(
    `
      SELECT code
      FROM account_codes
      WHERE parent_code = $1
        AND code = ANY($2::text[])
      ORDER BY array_position($2::text[], code::text)
      LIMIT 1
    `,
    [DEBTOR_PARENT_CODE, candidates]
  );

  return result.rows.length > 0 ? String(result.rows[0].code) : null;
}

/**
 * @param {QueryClient} client
 * @param {string} customerId
 * @returns {Promise<string>}
 */
export async function computeDebtorCode(client, customerId) {
  const candidates = buildDebtorCodeCandidates(customerId);

  for (const candidate of candidates) {
    const result = await client.query(
      "SELECT 1 FROM account_codes WHERE code = $1 LIMIT 1",
      [candidate]
    );

    if (result.rows.length === 0) {
      return candidate;
    }
  }

  throw new Error(`No available debtor account code for customer ${customerId}`);
}

/**
 * @param {QueryClient} client
 * @returns {Promise<number>}
 */
const getNextDebtorSortOrder = async (client) => {
  const result = await client.query(
    `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
      FROM account_codes
      WHERE parent_code = $1
    `,
    [DEBTOR_PARENT_CODE]
  );

  return Number(result.rows[0].next_sort_order) || 1;
};

/**
 * @param {QueryClient} client
 * @param {CustomerIdentity} customer
 * @returns {Promise<string>}
 */
export async function ensureDebtorAccount(client, customer) {
  const existingCode = await resolveDebtorChildCode(client, customer.id);

  if (existingCode) {
    await client.query(
      `
        UPDATE account_codes
        SET description = $2,
            ledger_type = $3,
            parent_code = $4,
            level = $5,
            is_active = TRUE,
            fs_note = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE code = $1
          AND parent_code = $4
      `,
      [
        existingCode,
        customer.name,
        DEBTOR_LEDGER_TYPE,
        DEBTOR_PARENT_CODE,
        DEBTOR_LEVEL,
        DEBTOR_FS_NOTE,
      ]
    );

    return existingCode;
  }

  const debtorCode = await computeDebtorCode(client, customer.id);
  const sortOrder = await getNextDebtorSortOrder(client);

  await client.query(
    `
      INSERT INTO account_codes (
        code, description, ledger_type, parent_code,
        level, sort_order, is_active, is_system, fs_note
      )
      VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, $7)
    `,
    [
      debtorCode,
      customer.name,
      DEBTOR_LEDGER_TYPE,
      DEBTOR_PARENT_CODE,
      DEBTOR_LEVEL,
      sortOrder,
      DEBTOR_FS_NOTE,
    ]
  );

  return debtorCode;
}

/**
 * Resolves (and ensures) the customer's debtor child account for POSTING.
 * Falls back to the TR control account with a warning when the customer id is
 * missing/unknown, so a sale or receipt is never blocked by a sync gap.
 *
 * @param {QueryClient} client
 * @param {string | null | undefined} customerId
 * @returns {Promise<string>} account code to post the receivable side to
 */
export async function getCustomerDebtorAccountCode(client, customerId) {
  if (!customerId) {
    console.warn("getCustomerDebtorAccountCode: no customer id — posting to TR");
    return "TR";
  }

  const existingCode = await resolveDebtorChildCode(client, customerId);
  if (existingCode) return existingCode;

  const customerResult = await client.query(
    "SELECT id, name FROM customers WHERE id = $1",
    [customerId]
  );
  const customer =
    customerResult.rows.length > 0
      ? { id: String(customerResult.rows[0].id), name: String(customerResult.rows[0].name || customerId) }
      : { id: String(customerId), name: String(customerId) }; // historical/deleted customer

  return ensureDebtorAccount(client, customer);
}

/**
 * Renames a customer's debtor child when the customer id changes.
 * `journal_entry_lines.account_code` and `account_opening_balances.account_code`
 * reference `account_codes.code` WITHOUT cascade, so the rename creates the new
 * code first, moves every reference, then removes (or deactivates) the old one.
 *
 * @param {QueryClient} client
 * @param {string} oldId
 * @param {string} newId
 * @param {string} name
 * @returns {Promise<string>}
 */
export async function changeDebtorCode(client, oldId, newId, name) {
  const existingCode = await resolveDebtorChildCode(client, oldId);

  if (!existingCode) {
    return ensureDebtorAccount(client, { id: newId, name });
  }

  const debtorCode = await ensureDebtorAccount(client, { id: newId, name });
  if (debtorCode === existingCode) {
    return debtorCode;
  }

  // Move every reference from the old child to the new one.
  await client.query(
    "UPDATE journal_entry_lines SET account_code = $1 WHERE account_code = $2",
    [debtorCode, existingCode]
  );
  await client.query(
    `UPDATE account_opening_balances aob
        SET account_code = $1
      WHERE account_code = $2
        AND NOT EXISTS (
          SELECT 1 FROM account_opening_balances x
           WHERE x.account_code = $1 AND x.as_of_date = aob.as_of_date
        )`,
    [debtorCode, existingCode]
  );

  await client.query(
    "DELETE FROM account_codes WHERE code = $1 AND parent_code = $2",
    [existingCode, DEBTOR_PARENT_CODE]
  );

  return debtorCode;
}

/**
 * @param {QueryClient} client
 * @param {string} customerId
 * @returns {Promise<void>}
 */
export async function removeDebtorAccount(client, customerId) {
  const debtorCode = await resolveDebtorChildCode(client, customerId);

  if (!debtorCode) {
    return;
  }

  const journalResult = await client.query(
    "SELECT 1 FROM journal_entry_lines WHERE account_code = $1 LIMIT 1",
    [debtorCode]
  );

  if (journalResult.rows.length > 0) {
    await client.query(
      `
        UPDATE account_codes
        SET is_active = FALSE,
            updated_at = CURRENT_TIMESTAMP
        WHERE code = $1
          AND parent_code = $2
      `,
      [debtorCode, DEBTOR_PARENT_CODE]
    );
    return;
  }

  await client.query(
    "DELETE FROM account_codes WHERE code = $1 AND parent_code = $2",
    [debtorCode, DEBTOR_PARENT_CODE]
  );
}
