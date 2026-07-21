// src/routes/accounting/overpayments.js
// Unapplied receipt overpayments ("excess" allocations) held in CUST_DEP.
// READ-ONLY display helpers for the customer statement, debtors report and
// account ledger overpayment badge — nothing here posts or modifies anything.
// The money itself lives in CUST_DEP (customer deposits), never on the
// customer's DEBTOR child account, so it cannot be read from the child ledger.
// Remaining per allocation = amount − applied − refunded.

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Current unapplied overpayment per customer (posted receipts only).
 * Returns a Map<customerId, number> (RM, 2dp).
 */
export async function fetchUnappliedOverpayments(pool, customerIds) {
  const result = new Map();
  if (!Array.isArray(customerIds) || customerIds.length === 0) return result;
  const queryResult = await pool.query(
    `SELECT ra.customer_id,
            SUM(ra.amount - ra.applied_amount - ra.refunded_amount) AS unapplied
       FROM receipt_allocations ra
       JOIN receipts r ON r.id = ra.receipt_id
      WHERE ra.allocation_type = 'excess'
        AND r.status = 'posted'
        AND ra.customer_id = ANY($1)
      GROUP BY ra.customer_id`,
    [customerIds]
  );
  for (const row of queryResult.rows) {
    const unapplied = roundMoney(row.unapplied);
    if (unapplied > 0.005) result.set(row.customer_id, unapplied);
  }
  return result;
}

/**
 * Unapplied overpayment of one customer as at a date (yyyy-MM-dd), for as-at
 * documents like the customer statement: excess from receipts posted on/before
 * the date, minus overpayment applications dated on/before the date (from the
 * dated overpayment_applications records, excluding cancelled applications),
 * minus refunds (standalone refund notes against the overpaid payment) created
 * on/before the date.
 */
export async function fetchUnappliedOverpaymentAsOf(pool, customerId, asOfDate) {
  const endOfDayMs = new Date(`${asOfDate}T23:59:59.999`).getTime();
  const queryResult = await pool.query(
    `SELECT
       (SELECT COALESCE(SUM(ra.amount), 0)
          FROM receipt_allocations ra
          JOIN receipts r ON r.id = ra.receipt_id
         WHERE ra.allocation_type = 'excess'
           AND r.status = 'posted'
           AND ra.customer_id = $1
           AND r.posting_date <= $2)
       -
       (SELECT COALESCE(SUM(oa.amount), 0)
          FROM overpayment_applications oa
          JOIN payments p ON p.payment_id = oa.payment_id
          JOIN receipt_allocations ra ON ra.id = oa.receipt_allocation_id
         WHERE ra.customer_id = $1
           AND p.status = 'active'
           AND p.payment_date <= $2)
       -
       (SELECT COALESCE(SUM(ad.totalamountpayable), 0)
          FROM adjustment_documents ad
          JOIN payments p ON p.payment_id = ad.linked_payment_id
          JOIN receipt_allocations ra ON ra.id = p.receipt_allocation_id
         WHERE ad.type = 'refund_note'
           AND ad.paired_with_id IS NULL
           AND ad.status = 'active'
           AND ra.allocation_type = 'excess'
           AND ra.customer_id = $1
           AND ad.createddate <= $3) AS unapplied`,
    [customerId, asOfDate, endOfDayMs]
  );
  return Math.max(0, roundMoney(queryResult.rows[0]?.unapplied));
}

/**
 * Non-posting account-ledger badge value: when the viewed account is a
 * customer's DEBTOR child, return the customer's CURRENT unapplied
 * overpayment held in CUST_DEP; otherwise 0. (The overpayment is never posted
 * to the child account, so this must stay a separate display-only figure.)
 */
export async function fetchDebtorChildOverpayment(pool, accountCode) {
  const customerResult = await pool.query(
    `SELECT c.id
       FROM account_codes ac
       JOIN customers c ON ac.code = c.id OR ac.code LIKE c.id || '-D%'
      WHERE ac.code = $1 AND ac.parent_code = 'DEBTOR'
      ORDER BY (ac.code = c.id) DESC
      LIMIT 1`,
    [accountCode]
  );
  if (customerResult.rows.length === 0) return 0;
  const overpayments = await fetchUnappliedOverpayments(pool, [
    customerResult.rows[0].id,
  ]);
  return overpayments.get(customerResult.rows[0].id) || 0;
}
