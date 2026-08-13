// Jelly Polly customer account ledger. Jelly Polly sales do not post to the
// shared journal tables, so this route projects its invoices, payments, and
// adjustment documents into a debit-normal virtual trade-debtor ledger.
import { Router } from "express";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Keep this movement definition shared by both endpoints so the browse counts,
// brought-forward balance, period rows, and closing balance cannot drift apart.
export const JELLY_POLLY_DEBTOR_MOVEMENTS_CTE = `
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

const MAX_OPENING_BALANCE = 9999999999999.99;

/**
 * @param {import("express").Request} req
 * @returns {string | null}
 */
function getRequestActor(req) {
  const actor =
    req.staffId ||
    req.session?.staff_id ||
    req.session?.staff?.id ||
    (req.apiKey ? "API_KEY" : null);
  return actor === null || actor === undefined
    ? null
    : String(actor).slice(0, 50);
}

/**
 * @param {unknown} value
 * @returns {{ valid: true, amount: number } | { valid: false }}
 */
function validateOpeningAmount(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (typeof value !== "string" && typeof value !== "number")
  ) {
    return { valid: false };
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) > MAX_OPENING_BALANCE) {
    return { valid: false };
  }

  return { valid: true, amount: Math.round(amount * 100) / 100 };
}

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
  // at least one movement in the exact projection used by the ledger route or
  // at least one JP debtor opening anchor. The latter keeps an opening-only
  // customer selectable before their first JP invoice or receipt is entered.
  router.get("/accounts", async (_req, res) => {
    try {
      const result = await pool.query(`
        ${JELLY_POLLY_DEBTOR_MOVEMENTS_CTE},
        customer_activity AS (
          SELECT customer_id, COUNT(*)::integer AS transaction_count
          FROM movements
          GROUP BY customer_id
        ),
        customer_scope AS (
          SELECT customer_id FROM customer_activity
          UNION
          SELECT customer_id FROM jellypolly.debtor_opening_balances
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
          COALESCE(ca.transaction_count, 0)::integer AS transaction_count
        FROM customer_scope scope
        JOIN customers c ON c.id::text = scope.customer_id
        LEFT JOIN customer_activity ca ON ca.customer_id = scope.customer_id
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

  // GET /opening-balances/:customerId - latest applicable JP debtor anchor and
  // full anchor history. Optional ?as_of=yyyy-MM-dd limits the applicable row
  // to the latest anchor on or before that local calendar date.
  router.get("/opening-balances/:customerId", async (req, res) => {
    const { customerId } = req.params;
    const asOf = req.query.as_of;

    if (
      asOf !== undefined &&
      (typeof asOf !== "string" || !validateDateString(asOf).valid)
    ) {
      return res
        .status(400)
        .json({ message: "as_of must be a valid yyyy-MM-dd value" });
    }

    try {
      const customerResult = await pool.query(
        `SELECT 1 FROM customers WHERE id = $1`,
        [customerId]
      );
      if (customerResult.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const applicableParams = [customerId];
      let applicableWhere = "customer_id = $1";
      if (asOf !== undefined) {
        applicableParams.push(asOf);
        applicableWhere += " AND as_of_date <= $2::date";
      }

      const [applicableResult, historyResult] = await Promise.all([
        pool.query(
          `SELECT id,
                  customer_id,
                  TO_CHAR(as_of_date, 'YYYY-MM-DD') AS as_of_date,
                  amount,
                  notes,
                  created_at,
                  updated_at,
                  created_by,
                  updated_by
             FROM jellypolly.debtor_opening_balances
            WHERE ${applicableWhere}
            ORDER BY as_of_date DESC
            LIMIT 1`,
          applicableParams
        ),
        pool.query(
          `SELECT id,
                  customer_id,
                  TO_CHAR(as_of_date, 'YYYY-MM-DD') AS as_of_date,
                  amount,
                  notes,
                  created_at,
                  updated_at,
                  created_by,
                  updated_by
             FROM jellypolly.debtor_opening_balances
            WHERE customer_id = $1
            ORDER BY as_of_date DESC`,
          [customerId]
        ),
      ]);

      const parseAnchor = (row) => ({
        ...row,
        amount: Number(row.amount || 0),
      });

      res.json({
        opening_balance:
          applicableResult.rows.length > 0
            ? parseAnchor(applicableResult.rows[0])
            : null,
        history: historyResult.rows.map(parseAnchor),
      });
    } catch (error) {
      console.error("Error fetching Jelly Polly debtor opening balance:", error);
      res.status(500).json({
        message: "Error fetching Jelly Polly debtor opening balance",
        error: error.message,
      });
    }
  });

  // PUT /opening-balances/:customerId - upsert one signed, debit-normal anchor.
  // Omitted notes preserve an existing note (inline amount-only edits); an
  // explicit string/null updates or clears it (the full modal workflow).
  router.put("/opening-balances/:customerId", async (req, res) => {
    const { customerId } = req.params;
    const { as_of_date: asOfDate, amount } = req.body || {};
    const hasNotes = Object.prototype.hasOwnProperty.call(req.body || {}, "notes");
    const notes = hasNotes ? req.body.notes : null;

    if (typeof asOfDate !== "string" || !validateDateString(asOfDate).valid) {
      return res
        .status(400)
        .json({ message: "as_of_date must be a valid yyyy-MM-dd value" });
    }

    const amountValidation = validateOpeningAmount(amount);
    if (!amountValidation.valid) {
      return res.status(400).json({
        message: `amount must be a finite number between -${MAX_OPENING_BALANCE} and ${MAX_OPENING_BALANCE}`,
      });
    }

    if (hasNotes && notes !== null && typeof notes !== "string") {
      return res
        .status(400)
        .json({ message: "notes must be a string or null when provided" });
    }

    try {
      const customerResult = await pool.query(
        `SELECT 1 FROM customers WHERE id = $1`,
        [customerId]
      );
      if (customerResult.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const actor = getRequestActor(req);
      const normalizedNotes =
        notes === null || notes === undefined || notes.trim() === ""
          ? null
          : notes.trim();
      const result = await pool.query(
        `INSERT INTO jellypolly.debtor_opening_balances
           (customer_id, as_of_date, amount, notes, created_by, updated_by)
         VALUES ($1, $2::date, $3, $4, $5, $5)
         ON CONFLICT (customer_id, as_of_date)
         DO UPDATE SET amount = EXCLUDED.amount,
                       notes = CASE
                         WHEN $6::boolean THEN EXCLUDED.notes
                         ELSE jellypolly.debtor_opening_balances.notes
                       END,
                       updated_at = CURRENT_TIMESTAMP,
                       updated_by = EXCLUDED.updated_by
         RETURNING id,
                   customer_id,
                   TO_CHAR(as_of_date, 'YYYY-MM-DD') AS as_of_date,
                   amount,
                   notes,
                   created_at,
                   updated_at,
                   created_by,
                   updated_by`,
        [
          customerId,
          asOfDate,
          amountValidation.amount,
          normalizedNotes,
          actor,
          hasNotes,
        ]
      );

      res.json({
        message: "Opening balance saved",
        opening_balance: {
          ...result.rows[0],
          amount: Number(result.rows[0].amount || 0),
        },
      });
    } catch (error) {
      console.error("Error saving Jelly Polly debtor opening balance:", error);
      res.status(500).json({
        message: "Error saving Jelly Polly debtor opening balance",
        error: error.message,
      });
    }
  });

  // DELETE /opening-balances/:customerId/:asOfDate - remove one exact anchor.
  router.delete("/opening-balances/:customerId/:asOfDate", async (req, res) => {
    const { customerId, asOfDate } = req.params;
    if (!validateDateString(asOfDate).valid) {
      return res
        .status(400)
        .json({ message: "asOfDate must be a valid yyyy-MM-dd value" });
    }

    try {
      const customerResult = await pool.query(
        `SELECT 1 FROM customers WHERE id = $1`,
        [customerId]
      );
      if (customerResult.rows.length === 0) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const result = await pool.query(
        `DELETE FROM jellypolly.debtor_opening_balances
          WHERE customer_id = $1
            AND as_of_date = $2::date`,
        [customerId, asOfDate]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Opening balance not found" });
      }

      res.json({ message: "Opening balance deleted" });
    } catch (error) {
      console.error("Error deleting Jelly Polly debtor opening balance:", error);
      res.status(500).json({
        message: "Error deleting Jelly Polly debtor opening balance",
        error: error.message,
      });
    }
  });

  // Arbitrary inclusive period for one Jelly Polly customer. Opening is the
  // latest applicable JP anchor plus the same virtual movements from that
  // anchor to the requested start. Activity before an anchor is ignored.
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
        `${JELLY_POLLY_DEBTOR_MOVEMENTS_CTE},
         anchor AS (
           SELECT as_of_date, amount
           FROM jellypolly.debtor_opening_balances
           WHERE customer_id = $1
             AND as_of_date <= $2::date
           ORDER BY as_of_date DESC
           LIMIT 1
         ),
         opening AS (
           SELECT COALESCE((SELECT amount FROM anchor), 0)
                  + COALESCE(SUM(debit_amount - credit_amount), 0)
                    AS opening_balance
           FROM movements
           WHERE customer_id = $1
             AND entry_date < $2::date
             AND (
               NOT EXISTS (SELECT 1 FROM anchor)
               OR entry_date >= (SELECT as_of_date FROM anchor)
             )
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
           TO_CHAR(a.as_of_date, 'YYYY-MM-DD') AS anchor_date,
           a.amount AS anchor_amount,
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
         LEFT JOIN anchor a ON true
         LEFT JOIN period_rows p ON true
         ORDER BY p.entry_date ASC NULLS LAST,
                  p.same_day_order ASC NULLS LAST,
                  p.reference_no ASC NULLS LAST,
                  p.source_id ASC NULLS LAST`,
        [customerId, start, end]
      );

      const openingBalance = Number(ledgerResult.rows[0]?.opening_balance || 0);
      const anchorDate = ledgerResult.rows[0]?.anchor_date || null;
      const anchorAmount = Number(ledgerResult.rows[0]?.anchor_amount || 0);
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
        opening_source: anchorDate
          ? {
              type: "anchored",
              as_of_date: anchorDate,
              amount: anchorAmount,
            }
          : { type: "derived" },
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
