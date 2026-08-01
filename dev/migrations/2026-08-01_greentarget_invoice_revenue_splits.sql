-- Green Target invoice revenue allocation and invoice-number series.
--
-- Legacy evidence contains ordered three-line sales journals, including
-- repeated credits to the same revenue account and one genuinely mixed
-- TGA/WS_OTH invoice.  Header.revenue_account_code cannot preserve that
-- shape, so the ordered child rows below become authoritative.  The header
-- column remains as a compatibility summary (one account when every split
-- uses the same account, NULL when mixed).

BEGIN;

CREATE TABLE IF NOT EXISTS greentarget.invoice_revenue_splits (
  invoice_id    integer NOT NULL
    REFERENCES greentarget.invoices(invoice_id) ON DELETE CASCADE,
  line_number   integer NOT NULL,
  account_code  varchar(50) NOT NULL
    REFERENCES greentarget.account_codes(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  amount        numeric(14,2) NOT NULL,
  created_at    timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (invoice_id, line_number),
  CONSTRAINT gt_invoice_revenue_splits_line_number_check
    CHECK (line_number > 0),
  CONSTRAINT gt_invoice_revenue_splits_amount_check
    CHECK (amount > 0),
  CONSTRAINT gt_invoice_revenue_splits_account_check
    CHECK (account_code IN ('TGA', 'TGB', 'WS_OTH', 'WS_OTH4'))
);

CREATE INDEX IF NOT EXISTS idx_gt_invoice_revenue_splits_account
  ON greentarget.invoice_revenue_splits(account_code);

-- Prefer the source-owned sales journal because it preserves duplicate rows
-- and their exact order.  Organic invoices without a journal fall back to the
-- existing scalar snapshot.  Locked historical operational invoices whose
-- revenue was never snapshotted remain untouched rather than being guessed.
INSERT INTO greentarget.invoice_revenue_splits (
  invoice_id, line_number, account_code, amount
)
SELECT source.invoice_id,
       ROW_NUMBER() OVER (
         PARTITION BY source.invoice_id
         ORDER BY source.display_order, source.line_number, source.line_id
       )::integer,
       source.account_code,
       source.amount
  FROM (
    SELECT i.invoice_id,
           jel.id AS line_id,
           jel.line_number,
           COALESCE(jel.display_order, jel.line_number) AS display_order,
           jel.account_code,
           jel.credit_amount AS amount
      FROM greentarget.invoices i
      JOIN greentarget.journal_entries je
        ON je.id = i.journal_entry_id
       AND je.entry_type = 'S'
      JOIN greentarget.journal_entry_lines jel
        ON jel.journal_entry_id = je.id
       AND jel.credit_amount > 0
       AND jel.account_code IN ('TGA', 'TGB', 'WS_OTH', 'WS_OTH4')
     WHERE NOT EXISTS (
       SELECT 1
         FROM greentarget.invoice_revenue_splits existing
        WHERE existing.invoice_id = i.invoice_id
     )
  ) source
ON CONFLICT (invoice_id, line_number) DO NOTHING;

INSERT INTO greentarget.invoice_revenue_splits (
  invoice_id, line_number, account_code, amount
)
SELECT i.invoice_id, 1, i.revenue_account_code, i.total_amount
  FROM greentarget.invoices i
 WHERE i.revenue_account_code IN ('TGA', 'TGB', 'WS_OTH')
   AND i.total_amount > 0
   AND NOT EXISTS (
     SELECT 1
       FROM greentarget.invoice_revenue_splits split
      WHERE split.invoice_id = i.invoice_id
   )
ON CONFLICT (invoice_id, line_number) DO NOTHING;

-- Recompute the compatibility header from the authoritative rows.
WITH summaries AS (
  SELECT invoice_id,
         CASE
           WHEN COUNT(DISTINCT account_code) = 1 THEN MIN(account_code)
           ELSE NULL
         END AS header_account
    FROM greentarget.invoice_revenue_splits
   GROUP BY invoice_id
)
UPDATE greentarget.invoices invoice
   SET revenue_account_code = summaries.header_account
  FROM summaries
 WHERE invoice.invoice_id = summaries.invoice_id
   AND invoice.revenue_account_code IS DISTINCT FROM summaries.header_account;

-- CN/DN revenue is also an ordered immutable document snapshot.  RN never
-- touches revenue and therefore has no rows here.
CREATE TABLE IF NOT EXISTS greentarget.adjustment_revenue_splits (
  adjustment_doc_id  varchar(50) NOT NULL
    REFERENCES greentarget.adjustment_documents(id) ON DELETE CASCADE,
  line_number        integer NOT NULL,
  account_code       varchar(50) NOT NULL
    REFERENCES greentarget.account_codes(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  amount             numeric(14,2) NOT NULL,
  created_at         timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (adjustment_doc_id, line_number),
  CONSTRAINT gt_adjustment_revenue_splits_line_number_check
    CHECK (line_number > 0),
  CONSTRAINT gt_adjustment_revenue_splits_amount_check
    CHECK (amount > 0),
  CONSTRAINT gt_adjustment_revenue_splits_account_check
    CHECK (account_code IN ('TGA', 'TGB', 'WS_OTH', 'WS_OTH4'))
);

CREATE INDEX IF NOT EXISTS idx_gt_adjustment_revenue_splits_account
  ON greentarget.adjustment_revenue_splits(account_code);

-- Backfill any existing source-owned CN/DN journal exactly.  There are no
-- assumptions about current dev cardinality; a production row is preserved
-- whenever its journal provides deterministic revenue legs.
INSERT INTO greentarget.adjustment_revenue_splits (
  adjustment_doc_id, line_number, account_code, amount
)
SELECT source.adjustment_doc_id,
       ROW_NUMBER() OVER (
         PARTITION BY source.adjustment_doc_id
         ORDER BY source.display_order, source.line_number, source.line_id
       )::integer,
       source.account_code,
       source.amount
  FROM (
    SELECT adjustment.id AS adjustment_doc_id,
           jel.id AS line_id,
           jel.line_number,
           COALESCE(jel.display_order, jel.line_number) AS display_order,
           jel.account_code,
           CASE
             WHEN adjustment.type = 'credit_note' THEN jel.debit_amount
             ELSE jel.credit_amount
           END AS amount
      FROM greentarget.adjustment_documents adjustment
      JOIN greentarget.journal_entries je
        ON je.id = adjustment.journal_entry_id
       AND je.entry_type IN ('CN', 'DN')
      JOIN greentarget.journal_entry_lines jel
        ON jel.journal_entry_id = je.id
       AND jel.account_code IN ('TGA', 'TGB', 'WS_OTH', 'WS_OTH4')
       AND (
         (adjustment.type = 'credit_note' AND jel.debit_amount > 0)
         OR
         (adjustment.type = 'debit_note' AND jel.credit_amount > 0)
       )
     WHERE adjustment.type IN ('credit_note', 'debit_note')
       AND NOT EXISTS (
         SELECT 1
           FROM greentarget.adjustment_revenue_splits existing
          WHERE existing.adjustment_doc_id = adjustment.id
       )
  ) source
ON CONFLICT (adjustment_doc_id, line_number) DO NOTHING;

-- Transactional counters are scoped by accounting year and legacy series.
CREATE TABLE IF NOT EXISTS greentarget.invoice_number_sequences (
  invoice_year  integer NOT NULL,
  series        varchar(20) NOT NULL,
  last_number   integer NOT NULL,
  updated_at    timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (invoice_year, series),
  CONSTRAINT gt_invoice_number_sequences_year_check
    CHECK (invoice_year BETWEEN 1900 AND 2100),
  CONSTRAINT gt_invoice_number_sequences_series_check
    CHECK (series IN ('counter', 'named')),
  CONSTRAINT gt_invoice_number_sequences_last_number_check
    CHECK (last_number >= 0)
);

WITH years AS (
  SELECT DISTINCT EXTRACT(YEAR FROM date_issued)::integer AS invoice_year
    FROM greentarget.invoices
  UNION SELECT 2026
), maxima AS (
  SELECT years.invoice_year,
         series.series,
         COALESCE(MAX(
           CASE
             WHEN series.series = 'counter'
              AND invoice.invoice_number ~ ('^' || years.invoice_year || '/[0-9]{5}$')
               THEN SUBSTRING(invoice.invoice_number FROM '/([0-9]{5})$')::integer
             WHEN series.series = 'named'
              AND invoice.invoice_number ~ ('^I' || years.invoice_year || '/[0-9]{4}$')
               THEN SUBSTRING(invoice.invoice_number FROM '/([0-9]{4})$')::integer
             ELSE NULL
           END
         ), 0) AS last_number
    FROM years
    CROSS JOIN (VALUES ('counter'::varchar), ('named'::varchar)) series(series)
    LEFT JOIN greentarget.invoices invoice
      ON EXTRACT(YEAR FROM invoice.date_issued)::integer = years.invoice_year
   GROUP BY years.invoice_year, series.series
)
INSERT INTO greentarget.invoice_number_sequences (
  invoice_year, series, last_number
)
SELECT invoice_year, series, last_number
  FROM maxima
ON CONFLICT (invoice_year, series)
DO UPDATE
   SET last_number = GREATEST(
         greentarget.invoice_number_sequences.last_number,
         EXCLUDED.last_number
       ),
       updated_at = CURRENT_TIMESTAMP;

DO $verification$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(invoice_id::text, ', ' ORDER BY invoice_id)
    INTO v_bad
    FROM (
      SELECT invoice.invoice_id
        FROM greentarget.invoices invoice
        JOIN greentarget.invoice_revenue_splits split
          ON split.invoice_id = invoice.invoice_id
       GROUP BY invoice.invoice_id, invoice.total_amount
      HAVING SUM(split.amount) <> invoice.total_amount
    ) mismatch;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'GT revenue split totals disagree with invoice(s): %', v_bad;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM greentarget.invoice_revenue_splits split
     WHERE split.line_number <> (
       SELECT COUNT(*)
         FROM greentarget.invoice_revenue_splits prior
        WHERE prior.invoice_id = split.invoice_id
          AND prior.line_number <= split.line_number
     )
  ) THEN
    RAISE EXCEPTION 'GT invoice revenue split numbering is not dense';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM greentarget.invoice_number_sequences
     WHERE invoice_year = 2026
       AND series = 'counter'
       AND last_number >= 1023
  ) OR NOT EXISTS (
    SELECT 1
      FROM greentarget.invoice_number_sequences
     WHERE invoice_year = 2026
       AND series = 'named'
       AND last_number >= 91
  ) THEN
    RAISE EXCEPTION 'GT 2026 invoice series were not seeded from the current maxima';
  END IF;
END
$verification$;

COMMIT;
