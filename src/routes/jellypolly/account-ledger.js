// Jelly Polly customer account ledger. Jelly Polly sales do not post to the
// shared journal tables, so this route projects its invoices, payments, and
// adjustment documents into a debit-normal virtual trade-debtor ledger.
import { Router } from "express";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Keep this movement definition shared by both endpoints so the browse counts,
// brought-forward balance, period rows, and closing balance cannot drift apart.
const MOVEMENTS_CTE = `
  WITH movements AS (
    SELECT
      i.customerid::text AS customer_id,
      'invoice:' || i.id::text AS line_id,
      i.id::text AS reference_no,
      i.id::text AS internal_reference,
      'S'::text AS entry_type,
      (to_timestamp(i.createddate::double precision / 1000)
        AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS entry_date,
      NULL::text AS cheque_no,
      'Invoice ' || i.id::text AS particulars,
      COALESCE(i.totalamountpayable, 0)::numeric AS debit_amount,
      0::numeric AS credit_amount,
      'invoice'::text AS source_type,
      i.id::text AS source_id,
      i.id::text AS invoice_id,
      10::integer AS same_day_order
    FROM jellypolly.invoices i
    WHERE LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
      AND COALESCE(i.is_consolidated, false) = false

    UNION ALL

    SELECT
      i.customerid::text AS customer_id,
      'payment:' || p.payment_id::text AS line_id,
      COALESCE(
        NULLIF(BTRIM(p.internal_reference), ''),
        'PAY-' || p.payment_id::text
      ) AS reference_no,
      NULLIF(BTRIM(p.internal_reference), '') AS internal_reference,
      'REC'::text AS entry_type,
      CASE
        WHEN COALESCE(p.notes, '') LIKE 'Automatic payment%'
          OR COALESCE(p.notes, '') LIKE 'Payment automatically recorded%'
          THEN (to_timestamp(i.createddate::double precision / 1000)
            AT TIME ZONE 'Asia/Kuala_Lumpur')::date
        ELSE COALESCE(p.posting_date, p.payment_date::date)::date
      END AS entry_date,
      NULLIF(BTRIM(p.payment_reference), '') AS cheque_no,
      INITCAP(REPLACE(COALESCE(p.payment_method, 'payment'), '_', ' '))
        || ' payment for Invoice ' || p.invoice_id::text
        || CASE
             WHEN NULLIF(BTRIM(p.notes), '') IS NOT NULL
               THEN ' - ' || BTRIM(p.notes)
             ELSE ''
           END AS particulars,
      0::numeric AS debit_amount,
      COALESCE(p.amount_paid, 0)::numeric AS credit_amount,
      'payment'::text AS source_type,
      p.payment_id::text AS source_id,
      p.invoice_id::text AS invoice_id,
      20::integer AS same_day_order
    FROM jellypolly.payments p
    JOIN jellypolly.invoices i ON i.id = p.invoice_id
    WHERE (p.status IS NULL OR LOWER(p.status) NOT IN ('cancelled', 'pending'))
      AND LOWER(COALESCE(i.invoice_status, '')) <> 'cancelled'
      AND COALESCE(i.is_consolidated, false) = false

    UNION ALL

    SELECT
      a.customerid::text AS customer_id,
      'adjustment:' || a.id::text AS line_id,
      COALESCE(NULLIF(BTRIM(a.display_id), ''), a.id::text) AS reference_no,
      a.id::text AS internal_reference,
      CASE a.type
        WHEN 'credit_note' THEN 'CN'
        WHEN 'debit_note' THEN 'DN'
        WHEN 'refund_note' THEN 'RN'
      END AS entry_type,
      (to_timestamp(a.createddate::double precision / 1000)
        AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS entry_date,
      CASE
        WHEN a.type = 'refund_note'
          THEN NULLIF(BTRIM(a.refund_reference), '')
        ELSE NULL::text
      END AS cheque_no,
      CASE a.type
        WHEN 'credit_note' THEN 'Credit Note'
        WHEN 'debit_note' THEN 'Debit Note'
        WHEN 'refund_note' THEN 'Refund Note'
      END
        || ' for Invoice ' || a.original_invoice_id::text
        || CASE
             WHEN NULLIF(BTRIM(a.reason), '') IS NOT NULL
               THEN ' - ' || BTRIM(a.reason)
             ELSE ''
           END AS particulars,
      CASE
        WHEN a.type = 'debit_note'
          OR (a.type = 'refund_note' AND a.paired_with_id IS NOT NULL)
          THEN COALESCE(a.totalamountpayable, 0)::numeric
        ELSE 0::numeric
      END AS debit_amount,
      CASE
        WHEN a.type = 'credit_note'
          THEN COALESCE(a.totalamountpayable, 0)::numeric
        ELSE 0::numeric
      END AS credit_amount,
      'adjustment'::text AS source_type,
      a.id::text AS source_id,
      a.original_invoice_id::text AS invoice_id,
      CASE a.type
        WHEN 'debit_note' THEN 30
        WHEN 'credit_note' THEN 40
        WHEN 'refund_note' THEN 50
      END::integer AS same_day_order
    FROM jellypolly.adjustment_documents a
    WHERE a.status = 'active'
      AND COALESCE(a.is_consolidated, false) = false
      AND (
        a.type IN ('credit_note', 'debit_note')
        OR (a.type = 'refund_note' AND a.paired_with_id IS NOT NULL)
      )
  )`;

/**
 * Validate a bare yyyy-MM-dd route parameter without a UTC conversion.
 *
 * @param {string} value
 * @returns {{ valid: true, year: number, month: number } | { valid: false }}
 */
function validateDateString(value) {
  const match = DATE_RE.exec(value);
  if (!match) return { valid: false };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return { valid: false };
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return { valid: false };

  return { valid: true, year, month };
}

/**
 * @param {import("pg").Pool} pool
 * @returns {import("express").Router}
 */
export default function createJellyPollyAccountLedgerRouter(pool) {
  const router = Router();

  // Virtual account-code-shaped customer list, limited to customers that have
  // at least one movement in the exact projection used by the ledger route.
  router.get("/accounts", async (_req, res) => {
    try {
      const result = await pool.query(`
        ${MOVEMENTS_CTE},
        customer_activity AS (
          SELECT customer_id, COUNT(*)::integer AS transaction_count
          FROM movements
          GROUP BY customer_id
        )
        SELECT
          c.id::text AS code,
          COALESCE(c.name, c.id::text) AS description,
          'TD'::text AS ledger_type,
          NULL::text AS parent_code,
          1::integer AS level,
          (ROW_NUMBER() OVER (
            ORDER BY LOWER(COALESCE(c.name, '')), COALESCE(c.name, ''), c.id::text
          ))::integer AS sort_order,
          true AS is_active,
          false AS is_system,
          ca.transaction_count
        FROM customer_activity ca
        JOIN customers c ON c.id::text = ca.customer_id
        ORDER BY sort_order
      `);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Jelly Polly ledger accounts:", error);
      res.status(500).json({
        message: "Error fetching Jelly Polly ledger accounts",
        error: error.message,
      });
    }
  });

  // Arbitrary inclusive period for one Jelly Polly customer. Opening is the
  // net of the same virtual movements strictly before the requested start.
  router.get("/:customerId/range/:start/:end", async (req, res) => {
    const { customerId, start, end } = req.params;
    const startValidation = validateDateString(start);
    const endValidation = validateDateString(end);

    if (!startValidation.valid || !endValidation.valid) {
      return res
        .status(400)
        .json({ message: "Dates must be valid yyyy-MM-dd values" });
    }
    if (start > end) {
      return res.status(400).json({ message: "start must be on or before end" });
    }

    try {
      const customerResult = await pool.query(
        `SELECT id::text AS code, COALESCE(name, id::text) AS description
           FROM customers
          WHERE id = $1`,
        [customerId]
      );
      if (customerResult.rows.length === 0) {
        return res.status(404).json({
          message: `Customer ${customerId} not found`,
        });
      }

      const ledgerResult = await pool.query(
        `${MOVEMENTS_CTE},
         opening AS (
           SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS opening_balance
           FROM movements
           WHERE customer_id = $1 AND entry_date < $2::date
         ),
         period_rows AS (
           SELECT *
           FROM movements
           WHERE customer_id = $1
             AND entry_date >= $2::date
             AND entry_date <= $3::date
         )
         SELECT
           o.opening_balance,
           p.line_id,
           p.reference_no,
           p.internal_reference,
           p.entry_type,
           TO_CHAR(p.entry_date, 'YYYY-MM-DD') AS entry_date,
           p.cheque_no,
           p.particulars,
           p.debit_amount,
           p.credit_amount,
           p.source_type,
           p.source_id,
           p.invoice_id
         FROM opening o
         LEFT JOIN period_rows p ON true
         ORDER BY p.entry_date ASC NULLS LAST,
                  p.same_day_order ASC NULLS LAST,
                  p.reference_no ASC NULLS LAST,
                  p.source_id ASC NULLS LAST`,
        [customerId, start, end]
      );

      const openingBalance = Number(ledgerResult.rows[0]?.opening_balance || 0);
      let runningBalance = openingBalance;
      let totalDebit = 0;
      let totalCredit = 0;

      const transactions = ledgerResult.rows
        .filter((row) => row.line_id !== null)
        .map((row) => {
          const debit = Number(row.debit_amount || 0);
          const credit = Number(row.credit_amount || 0);
          totalDebit += debit;
          totalCredit += credit;
          runningBalance += debit - credit;

          return {
            line_id: row.line_id,
            journal_entry_id: null,
            reference_no: row.reference_no,
            internal_reference: row.internal_reference,
            entry_type: row.entry_type,
            entry_date: row.entry_date,
            cheque_no: row.cheque_no,
            particulars: row.particulars,
            debit,
            credit,
            balance: runningBalance,
            source_type: row.source_type,
            source_id: row.source_id,
            invoice_id: row.invoice_id,
          };
        });

      const customer = customerResult.rows[0];
      res.json({
        account: {
          code: customer.code,
          description: customer.description,
          ledger_type: "TD",
        },
        opening_balance: openingBalance,
        opening_source: { type: "derived" },
        transactions,
        closing_balance: runningBalance,
        totals: {
          debit: totalDebit,
          credit: totalCredit,
          count: transactions.length,
        },
        period: {
          mode: "range",
          year: startValidation.year,
          month: startValidation.month,
          start_date: start,
          end_date: end,
        },
      });
    } catch (error) {
      console.error("Error generating Jelly Polly account ledger:", error);
      res.status(500).json({
        message: "Error generating Jelly Polly account ledger",
        error: error.message,
      });
    }
  });

  return router;
}
