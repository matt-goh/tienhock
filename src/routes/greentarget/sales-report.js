import { Router } from "express";

/**
 * @typedef {object} ReportRow
 * @property {number} invoice_id
 * @property {string} invoice_number
 * @property {string} date_issued
 * @property {string} customer_name
 * @property {string | null} legacy_particular
 * @property {string | null} customer_phone_number
 * @property {Array<Record<string, unknown>>} locations
 * @property {number} amount_before_tax
 * @property {number} total_amount
 * @property {string} status
 * @property {number} balance_due
 * @property {number} amount_paid
 * @property {number} adjustment_effect
 * @property {Array<Record<string, unknown>>} payments
 */

/**
 * Keep every report amount on exact cent boundaries after pg numeric values
 * enter JavaScript.
 *
 * @param {unknown} value
 * @returns {number}
 */
function money(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.round(numericValue * 100) / 100
    : 0;
}

/** @type {string} */
const COMPLETE_SALES_COVERAGE_FROM = "2026-01-01";

/**
 * Validate a required API date without converting it through UTC.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
function isValidBareDate(value) {
  if (typeof value !== "string") return false;

  /** @type {RegExpMatchArray | null} */
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  /** @type {number} */
  const year = Number(match[1]);
  /** @type {number} */
  const month = Number(match[2]);
  /** @type {number} */
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  /** @type {boolean} */
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  /** @type {number[]} */
  const daysByMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysByMonth[month - 1];
}

/**
 * @param {import("pg").Pool} pool
 * @returns {import("express").Router}
 */
export default function createGreenTargetSalesReportRouter(pool) {
  /** @type {import("express").Router} */
  const router = Router();

  router.get("/", async (req, res) => {
    /** @type {unknown} */
    const startDate = req.query.start_date;
    /** @type {unknown} */
    const endDate = req.query.end_date;

    if (!isValidBareDate(startDate) || !isValidBareDate(endDate)) {
      return res.status(400).json({
        message: "start_date and end_date are required valid yyyy-MM-dd dates",
      });
    }
    if (startDate > endDate) {
      return res.status(400).json({
        message: "start_date must be on or before end_date",
      });
    }

    try {
      // The imported ledger is the complete sales source for Jan–Jun 2026.
      // Invoice-table rows in that window are delayed e-Invoice submissions or
      // replacements, so they may enrich legacy rows but must not create sales.
      /** @type {import("pg").QueryResult} */
      const rowsResult = await pool.query(
        `WITH legacy_sales AS (
             SELECT je.id AS journal_id,
                    BTRIM(COALESCE(je.display_reference, je.reference_no))
                      AS invoice_number,
                    je.entry_date,
                    je.legacy_entry_type,
                    je.total_debit
               FROM greentarget.journal_entries je
              WHERE je.source_type = 'legacy_import'
                AND je.status = 'posted'
                AND je.legacy_entry_type IN ('#/#', 'I#/#')
                AND je.entry_date BETWEEN DATE '2026-01-01'
                                      AND DATE '2026-06-30'
           ),
           selected_legacy_sales AS (
             SELECT *
               FROM legacy_sales
              WHERE entry_date BETWEEN $1::date AND $2::date
           ),
           selected_invoices AS (
             SELECT i.invoice_id, i.invoice_number, i.date_issued,
                    i.customer_id, i.amount_before_tax, i.total_amount,
                    i.status, i.balance_due
               FROM greentarget.invoices i
              WHERE i.date_issued BETWEEN $1::date AND $2::date
                AND COALESCE(i.is_consolidated, FALSE) = FALSE
                AND LOWER(COALESCE(i.type, '')) <> 'consolidated'
                AND NOT (
                  i.date_issued BETWEEN DATE '2026-01-01'
                                    AND DATE '2026-06-30'
                )
                AND NOT EXISTS (
                  SELECT 1
                    FROM legacy_sales legacy
                   WHERE UPPER(legacy.invoice_number) =
                     CASE
                       WHEN UPPER(BTRIM(i.invoice_number)) ~
                         '^(I[0-9]{4}/[0-9]{4}|[0-9]{4}/[0-9]{5})[(][A-Z][)]$'
                         THEN REGEXP_REPLACE(
                           UPPER(BTRIM(i.invoice_number)),
                           '[(][A-Z][)]$',
                           ''
                         )
                       ELSE UPPER(BTRIM(i.invoice_number))
                     END
                )
           ),
           payment_totals AS (
             SELECT p.invoice_id, COALESCE(SUM(p.amount_paid), 0) AS amount_paid
               FROM greentarget.payments p
               JOIN selected_invoices si ON si.invoice_id = p.invoice_id
              WHERE p.status IS NULL OR p.status = 'active'
              GROUP BY p.invoice_id
           ),
           receipt_payments AS (
             SELECT p.invoice_id,
                    JSONB_AGG(
                      JSONB_BUILD_OBJECT(
                        'payment_id', p.payment_id,
                        'payment_date', TO_CHAR(p.payment_date, 'YYYY-MM-DD'),
                        'posting_date', TO_CHAR(r.posting_date, 'YYYY-MM-DD'),
                        'amount_paid', p.amount_paid,
                        'payment_method', p.payment_method,
                        'payment_reference', p.payment_reference,
                        'internal_reference', p.internal_reference,
                        'status', p.status
                      )
                      ORDER BY p.payment_date, p.payment_id
                    ) AS payments
               FROM greentarget.payments p
               JOIN selected_invoices si ON si.invoice_id = p.invoice_id
               JOIN greentarget.receipts r ON r.id = p.receipt_id
              WHERE COALESCE(p.status, '') <> 'cancelled'
                AND COALESCE(r.status, '') <> 'cancelled'
              GROUP BY p.invoice_id
           ),
           invoice_locations AS (
             SELECT location_rows.invoice_id,
                    JSONB_AGG(
                      JSONB_BUILD_OBJECT(
                        'location_id', location_rows.location_id,
                        'site', location_rows.site,
                        'address', location_rows.address,
                        'phone_number', location_rows.phone_number
                      )
                      ORDER BY location_rows.location_id
                    ) AS locations
               FROM (
                 SELECT DISTINCT ir.invoice_id, l.location_id, l.site,
                                 l.address, l.phone_number
                   FROM greentarget.invoice_rentals ir
                   JOIN selected_invoices si ON si.invoice_id = ir.invoice_id
                   JOIN greentarget.rentals rental
                     ON rental.rental_id = ir.rental_id
                   JOIN greentarget.locations l
                     ON l.location_id = rental.location_id
               ) AS location_rows
              GROUP BY location_rows.invoice_id
           ),
           adjustment_totals AS (
             SELECT a.original_invoice_id AS invoice_id,
                    COALESCE(SUM(
                      CASE
                        WHEN a.type = 'credit_note' THEN -a.total_amount
                        WHEN a.type = 'debit_note' THEN a.total_amount
                        WHEN a.type = 'refund_note' AND a.paired_with_id IS NOT NULL
                          THEN a.total_amount
                        ELSE 0
                      END
                    ), 0) AS adjustment_effect
              FROM greentarget.adjustment_documents a
              JOIN selected_invoices si
                ON si.invoice_id = a.original_invoice_id
              WHERE a.status = 'active'
                AND COALESCE(a.is_consolidated, FALSE) = FALSE
              GROUP BY a.original_invoice_id
           ),
           legacy_receipt_lines AS (
             SELECT SUBSTRING(
                      line.particulars
                      FROM 'I[0-9]{4}/[0-9]{4}'
                    ) AS invoice_number,
                    receipt.id AS receipt_id,
                    receipt.entry_date AS receipt_date,
                    COALESCE(receipt.display_reference, receipt.reference_no)
                      AS receipt_reference,
                    line.id AS receipt_line_id,
                    line.account_code AS debtor_account_code,
                    line.credit_amount AS amount_paid
               FROM greentarget.journal_entries receipt
               JOIN greentarget.journal_entry_lines line
                 ON line.journal_entry_id = receipt.id
              WHERE receipt.source_type = 'legacy_import'
                AND receipt.status = 'posted'
                AND receipt.legacy_entry_type = 'RV#/#/#'
                AND line.credit_amount > 0
                AND line.particulars ~ 'I[0-9]{4}/[0-9]{4}'
           ),
           legacy_receipts AS (
             SELECT invoice_number, debtor_account_code,
                    COALESCE(SUM(amount_paid), 0) AS amount_paid,
                    JSONB_AGG(
                      JSONB_BUILD_OBJECT(
                        'payment_id', -receipt_line_id,
                        'payment_date', TO_CHAR(receipt_date, 'YYYY-MM-DD'),
                        'posting_date', TO_CHAR(receipt_date, 'YYYY-MM-DD'),
                        'amount_paid', amount_paid,
                        'payment_method', NULL,
                        'payment_reference', NULL,
                        'internal_reference', receipt_reference,
                        'status', 'active'
                      )
                      ORDER BY receipt_date, receipt_id, receipt_line_id
                    ) AS payments
               FROM legacy_receipt_lines
              GROUP BY invoice_number, debtor_account_code
           ),
           legacy_sale_details AS (
             SELECT sale.*,
                    revenue.particulars AS revenue_particulars,
                    debtor.account_code AS debtor_account_code
               FROM selected_legacy_sales sale
               LEFT JOIN LATERAL (
                 SELECT line.particulars
                   FROM greentarget.journal_entry_lines line
                  WHERE line.journal_entry_id = sale.journal_id
                    AND line.credit_amount > 0
                  ORDER BY line.line_number
                  LIMIT 1
               ) revenue ON TRUE
               LEFT JOIN LATERAL (
                 SELECT line.account_code
                   FROM greentarget.journal_entry_lines line
                  WHERE line.journal_entry_id = sale.journal_id
                    AND line.debit_amount > 0
                    AND line.account_code <> 'CD_SD'
                  ORDER BY line.line_number
                  LIMIT 1
               ) debtor ON TRUE
           ),
           legacy_invoice_metadata AS (
             SELECT DISTINCT ON (sale.journal_id)
                    sale.journal_id, invoice.invoice_id,
                    customer.name AS customer_name,
                    customer.phone_number AS customer_phone_number
               FROM selected_legacy_sales sale
               JOIN greentarget.invoices invoice
                 ON BTRIM(invoice.invoice_number) = sale.invoice_number
               LEFT JOIN greentarget.customers customer
                 ON customer.customer_id = invoice.customer_id
              ORDER BY sale.journal_id, invoice.invoice_id
           ),
           legacy_invoice_locations AS (
             SELECT location_rows.journal_id,
                    JSONB_AGG(
                      JSONB_BUILD_OBJECT(
                        'location_id', location_rows.location_id,
                        'site', location_rows.site,
                        'address', location_rows.address,
                        'phone_number', location_rows.phone_number
                      )
                      ORDER BY location_rows.location_id
                    ) AS locations
               FROM (
                 SELECT DISTINCT metadata.journal_id, location.location_id,
                                 location.site, location.address,
                                 location.phone_number
                   FROM legacy_invoice_metadata metadata
                   JOIN greentarget.invoice_rentals invoice_rental
                     ON invoice_rental.invoice_id = metadata.invoice_id
                   JOIN greentarget.rentals rental
                     ON rental.rental_id = invoice_rental.rental_id
                   JOIN greentarget.locations location
                     ON location.location_id = rental.location_id
               ) location_rows
              GROUP BY location_rows.journal_id
           ),
           operational_rows AS (
             SELECT si.invoice_id, si.invoice_number,
                    TO_CHAR(si.date_issued, 'YYYY-MM-DD') AS date_issued,
                    COALESCE(c.name, '') AS customer_name,
                    NULL::text AS legacy_particular,
                    c.phone_number AS customer_phone_number,
                    COALESCE(il.locations, '[]'::jsonb) AS locations,
                    COALESCE(si.amount_before_tax, 0) AS amount_before_tax,
                    COALESCE(si.total_amount, 0) AS total_amount,
                    COALESCE(si.status, '') AS status,
                    COALESCE(si.balance_due, 0) AS balance_due,
                    COALESCE(pt.amount_paid, 0) AS amount_paid,
                    COALESCE(at.adjustment_effect, 0) AS adjustment_effect,
                    COALESCE(rp.payments, '[]'::jsonb) AS payments,
                    1 AS source_rank, si.invoice_id AS source_id
               FROM selected_invoices si
               LEFT JOIN greentarget.customers c
                 ON c.customer_id = si.customer_id
               LEFT JOIN payment_totals pt ON pt.invoice_id = si.invoice_id
               LEFT JOIN receipt_payments rp ON rp.invoice_id = si.invoice_id
               LEFT JOIN invoice_locations il ON il.invoice_id = si.invoice_id
               LEFT JOIN adjustment_totals at ON at.invoice_id = si.invoice_id
           ),
           legacy_rows AS (
             SELECT -sale.journal_id AS invoice_id,
                    sale.invoice_number,
                    TO_CHAR(sale.entry_date, 'YYYY-MM-DD') AS date_issued,
                    COALESCE(
                      NULLIF(BTRIM(metadata.customer_name), ''),
                      CASE
                        WHEN sale.legacy_entry_type = 'I#/#' THEN
                          COALESCE(
                            NULLIF(BTRIM(mapped_customer.name), ''),
                            NULLIF(BTRIM(debtor_account.description), '')
                          )
                        ELSE NULL
                      END,
                      ''
                    ) AS customer_name,
                    CASE
                      WHEN sale.legacy_entry_type = '#/#' THEN
                        COALESCE(
                          NULLIF(BTRIM(counter_party.description), ''),
                          NULLIF(BTRIM(counter_tail.party_code), '')
                        )
                      ELSE NULL
                    END AS legacy_particular,
                    COALESCE(
                      metadata.customer_phone_number,
                      mapped_customer.phone_number
                    ) AS customer_phone_number,
                    COALESCE(locations.locations, '[]'::jsonb) AS locations,
                    COALESCE(sale.total_debit, 0) AS amount_before_tax,
                    COALESCE(sale.total_debit, 0) AS total_amount,
                    CASE
                      WHEN sale.legacy_entry_type = '#/#' THEN 'paid'
                      WHEN COALESCE(receipt.amount_paid, 0) > 0 THEN 'paid'
                      ELSE 'unpaid'
                    END AS status,
                    CASE
                      WHEN sale.legacy_entry_type = '#/#' THEN 0
                      ELSE GREATEST(
                        COALESCE(sale.total_debit, 0) -
                          COALESCE(receipt.amount_paid, 0),
                        0
                      )
                    END AS balance_due,
                    CASE
                      WHEN sale.legacy_entry_type = '#/#'
                        THEN COALESCE(sale.total_debit, 0)
                      ELSE COALESCE(receipt.amount_paid, 0)
                    END AS amount_paid,
                    0::numeric AS adjustment_effect,
                    CASE
                      WHEN sale.legacy_entry_type = '#/#' THEN
                        JSONB_BUILD_ARRAY(
                          JSONB_BUILD_OBJECT(
                            'payment_id', -sale.journal_id,
                            'payment_date', TO_CHAR(sale.entry_date, 'YYYY-MM-DD'),
                            'posting_date', TO_CHAR(sale.entry_date, 'YYYY-MM-DD'),
                            'amount_paid', sale.total_debit,
                            'payment_method', 'cash',
                            'payment_reference', NULL,
                            'internal_reference', NULL,
                            'status', 'active'
                          )
                        )
                      ELSE COALESCE(receipt.payments, '[]'::jsonb)
                    END AS payments,
                    0 AS source_rank, sale.journal_id AS source_id
               FROM legacy_sale_details sale
               LEFT JOIN LATERAL (
                 SELECT NULLIF(
                          BTRIM(SUBSTRING(
                            sale.revenue_particulars FROM '[[:space:]]/(.+)$'
                          )),
                          ''
                        ) AS party_code
               ) counter_tail ON TRUE
               LEFT JOIN greentarget.debtor_subledger_registry counter_party
                 ON UPPER(BTRIM(counter_party.code)) =
                    UPPER(counter_tail.party_code)
               LEFT JOIN greentarget.account_codes debtor_account
                 ON debtor_account.code = sale.debtor_account_code
               LEFT JOIN greentarget.customers mapped_customer
                 ON mapped_customer.debtor_account_code =
                    sale.debtor_account_code
               LEFT JOIN legacy_receipts receipt
                 ON receipt.invoice_number = sale.invoice_number
                AND receipt.debtor_account_code = sale.debtor_account_code
               LEFT JOIN legacy_invoice_metadata metadata
                 ON metadata.journal_id = sale.journal_id
               LEFT JOIN legacy_invoice_locations locations
                 ON locations.journal_id = sale.journal_id
           ),
           report_rows AS (
             SELECT * FROM operational_rows
             UNION ALL
             SELECT * FROM legacy_rows
           )
           SELECT invoice_id, invoice_number, date_issued, customer_name,
                  legacy_particular, customer_phone_number, locations,
                  amount_before_tax, total_amount, status, balance_due,
                  amount_paid, adjustment_effect, payments
             FROM report_rows
            ORDER BY date_issued, source_rank, source_id`,
        [startDate, endDate]
      );

      /** @type {ReportRow[]} */
      const rows = rowsResult.rows.map((databaseRow) => {
        return {
          invoice_id: Number(databaseRow.invoice_id),
          invoice_number: String(databaseRow.invoice_number || ""),
          date_issued: databaseRow.date_issued,
          customer_name: databaseRow.customer_name,
          legacy_particular: databaseRow.legacy_particular,
          customer_phone_number: databaseRow.customer_phone_number,
          locations: databaseRow.locations || [],
          amount_before_tax: money(databaseRow.amount_before_tax),
          total_amount: money(databaseRow.total_amount),
          status: databaseRow.status,
          balance_due: money(databaseRow.balance_due),
          amount_paid: money(databaseRow.amount_paid),
          adjustment_effect: money(databaseRow.adjustment_effect),
          payments: databaseRow.payments || [],
        };
      });
      /** @type {ReportRow[]} */
      const nonCancelledRows = rows.filter(
        (row) => row.status.toLowerCase() !== "cancelled"
      );

      res.json({
        period: { start_date: startDate, end_date: endDate },
        coverage: {
          complete_from: COMPLETE_SALES_COVERAGE_FROM,
          is_complete: startDate >= COMPLETE_SALES_COVERAGE_FROM,
        },
        rows,
        opening_balance: 0,
        totals: {
          total_sales: money(
            nonCancelledRows.reduce(
              (sum, row) => sum + row.total_amount,
              0
            )
          ),
          total_paid: money(
            nonCancelledRows.reduce(
              (sum, row) => sum + row.amount_paid,
              0
            )
          ),
          total_outstanding: money(
            nonCancelledRows.reduce(
              (sum, row) => sum + row.balance_due,
              0
            )
          ),
          invoice_count: rows.length,
          cancelled_count: rows.length - nonCancelledRows.length,
        },
      });
    } catch (error) {
      console.error("Error fetching Green Target sales report:", error);
      res.status(500).json({ message: "Error fetching sales report" });
    }
  });

  return router;
}
