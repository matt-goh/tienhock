-- Read-only ERP invoice <-> imported legacy sales-row reconciliation.
--
-- Scope:
--   * ERP invoices whose LOCAL Asia/Kuala_Lumpur date is 2026-01-01..2026-05-31.
--   * Cancelled invoices are excluded.
--   * Consolidated wrapper invoices are reported, then excluded because their
--     child invoices are the accounting source rows.
--   * Legacy sales rows are the posted/staged CASH_SALES and CR_SALES lines.
--
-- Matching:
--   * Numeric legacy references lost leading zeroes in Excel, so numeric refs
--     match numeric ERP IDs after ltrim(..., '0').
--   * F-prefixed references remain distinct. They are zero-value informational
--     legacy rows, not aliases of the normal numeric sales row.
--   * Two explicit source-reference typo pairs are declared below.
--
-- This script changes no database object or application row.

\set ON_ERROR_STOP on

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- Hard acceptance gate. Keep every expected value explicit: a refreshed
-- database must produce a new reviewed reconciliation, not silently pass.
WITH
invoice_window AS (
  SELECT invoices.*,
         (
           TO_TIMESTAMP(invoices.createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date AS local_date,
         ROUND(COALESCE(invoices.totalamountpayable, 0) * 100)::bigint
           AS amount_cents
    FROM invoices
   WHERE (
           TO_TIMESTAMP(invoices.createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
),
erp_source AS (
  SELECT invoice_window.*,
         CASE
           WHEN invoice_window.id ~ '^[0-9]+$'
             THEN LTRIM(invoice_window.id, '0')
           WHEN invoice_window.id ~* '^F[0-9]+$'
             THEN UPPER(invoice_window.id)
           ELSE invoice_window.id
         END AS match_key
    FROM invoice_window
   WHERE invoice_window.invoice_status <> 'cancelled'
     AND COALESCE(invoice_window.is_consolidated, false) = false
),
erp_regular AS (
  SELECT *
    FROM erp_source
   WHERE id ~ '^[0-9]+$'
),
erp_free_only AS (
  SELECT *
    FROM erp_source
   WHERE id ~* '^F[0-9]+$'
),
legacy_sales AS (
  SELECT staged.*,
         CASE
           WHEN staged.journal_ref ~ '^[0-9]+$'
             THEN LTRIM(staged.journal_ref, '0')
           WHEN staged.journal_ref ~ '^F[0-9]+$'
             THEN staged.journal_ref
           ELSE staged.journal_ref
         END AS match_key
    FROM import_legacy_rows staged
   WHERE staged.record_kind = 'transaction'
     AND staged.account_code IN ('CASH_SALES', 'CR_SALES')
),
legacy_main AS (
  SELECT *
    FROM legacy_sales
   WHERE journal_ref ~ '^[0-9]+$'
),
legacy_auxiliary_f AS (
  SELECT *
    FROM legacy_sales
   WHERE journal_ref ~ '^F[0-9]+$'
),
direct_matches AS (
  SELECT legacy.stage_sequence,
         legacy.journal_group_key,
         legacy.entry_date AS legacy_date,
         legacy.account_code AS legacy_sales_account,
         legacy.journal_ref AS legacy_ref,
         legacy.particulars,
         legacy.source_physical_line,
         legacy.credit_cents AS legacy_cents,
         erp.id AS erp_id,
         erp.local_date AS erp_date,
         erp.customerid,
         erp.paymenttype,
         erp.amount_cents AS erp_cents,
         CASE
           WHEN erp.paymenttype = 'CASH' THEN 'CASH_SALES'
           ELSE 'CR_SALES'
         END AS expected_sales_account
    FROM legacy_main legacy
    JOIN erp_regular erp USING (match_key)
),
direct_audited AS (
  SELECT matched.*,
         shape.debtor_debit_count,
         shape.actual_debtor,
         shape.exact_ch_rev1_pair_count,
         expected.expected_debtor,
         matched.legacy_date = matched.erp_date AS date_matches,
         matched.legacy_cents = matched.erp_cents AS amount_matches,
         matched.legacy_sales_account = matched.expected_sales_account
           AS sale_term_matches,
         CASE
           WHEN matched.legacy_sales_account = 'CASH_SALES'
             THEN shape.exact_ch_rev1_pair_count = 1
           ELSE shape.debtor_debit_count = 1
             AND shape.actual_debtor = expected.expected_debtor
         END AS counterparty_matches
    FROM direct_matches matched
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (
               WHERE accounts.parent_code = 'DEBTOR'
                 AND grouped.debit_cents > 0
             )::integer AS debtor_debit_count,
             (
               ARRAY_AGG(grouped.account_code ORDER BY grouped.stage_sequence)
                 FILTER (
                   WHERE accounts.parent_code = 'DEBTOR'
                     AND grouped.debit_cents > 0
                 )
             )[1] AS actual_debtor,
             COUNT(*) FILTER (
               WHERE grouped.account_code = 'CH_REV1'
                 AND grouped.debit_cents = matched.legacy_cents
                 AND grouped.credit_cents = 0
             )::integer AS exact_ch_rev1_pair_count
        FROM import_legacy_rows grouped
        LEFT JOIN account_codes accounts ON accounts.code = grouped.account_code
       WHERE grouped.record_kind = 'transaction'
         AND grouped.journal_group_key = matched.journal_group_key
    ) shape ON true
    LEFT JOIN LATERAL (
      SELECT accounts.code AS expected_debtor
        FROM account_codes accounts
       WHERE accounts.parent_code = 'DEBTOR'
         AND accounts.code = ANY(
           ARRAY[matched.customerid, matched.customerid || '-D']::text[]
             || ARRAY(
               SELECT matched.customerid || '-D' || suffix_number::text
                 FROM GENERATE_SERIES(2, 50) suffix_number
             )
         )
       ORDER BY ARRAY_POSITION(
         ARRAY[matched.customerid, matched.customerid || '-D']::text[]
           || ARRAY(
             SELECT matched.customerid || '-D' || suffix_number::text
               FROM GENERATE_SERIES(2, 50) suffix_number
           ),
         accounts.code::text
       )
       LIMIT 1
    ) expected ON true
),
evidence_pairs (
  legacy_ref,
  erp_id,
  expected_date,
  expected_customer,
  expected_sales_account,
  expected_cents,
  reason
) AS (
  VALUES
    (
      '135699'::varchar,
      '013569'::varchar,
      DATE '2026-01-16',
      'TSEN-KY'::varchar,
      'CASH_SALES'::varchar,
      10000::bigint,
      'Legacy journal/particulars contain an extra trailing 9'
    ),
    (
      '15306'::varchar,
      '05306'::varchar,
      DATE '2026-04-04',
      'ROSE'::varchar,
      'CR_SALES'::varchar,
      1590::bigint,
      'Legacy 015306 and ERP 05306 uniquely agree on date/customer/type/amount'
    )
),
evidence_matches AS (
  SELECT pairs.*,
         legacy.stage_sequence,
         legacy.entry_date AS legacy_date,
         legacy.account_code AS legacy_sales_account,
         legacy.credit_cents AS legacy_cents,
         legacy.particulars,
         erp.local_date AS erp_date,
         erp.customerid,
         erp.paymenttype,
         erp.amount_cents AS erp_cents
    FROM evidence_pairs pairs
    JOIN legacy_main legacy ON legacy.journal_ref = pairs.legacy_ref
    JOIN erp_regular erp ON erp.id = pairs.erp_id
   WHERE legacy.entry_date = pairs.expected_date
     AND erp.local_date = pairs.expected_date
     AND erp.customerid = pairs.expected_customer
     AND legacy.account_code = pairs.expected_sales_account
     AND legacy.credit_cents = pairs.expected_cents
     AND erp.amount_cents = pairs.expected_cents
     AND legacy.account_code = CASE
           WHEN erp.paymenttype = 'CASH' THEN 'CASH_SALES'
           ELSE 'CR_SALES'
         END
),
legacy_main_unmatched AS (
  SELECT legacy.*
    FROM legacy_main legacy
   WHERE NOT EXISTS (
           SELECT 1 FROM erp_regular erp
            WHERE erp.match_key = legacy.match_key
         )
     AND NOT EXISTS (
           SELECT 1 FROM evidence_pairs pairs
            WHERE pairs.legacy_ref = legacy.journal_ref
         )
),
erp_regular_unmatched AS (
  SELECT erp.*
    FROM erp_regular erp
   WHERE NOT EXISTS (
           SELECT 1 FROM legacy_main legacy
            WHERE legacy.match_key = erp.match_key
         )
     AND NOT EXISTS (
           SELECT 1 FROM evidence_pairs pairs
            WHERE pairs.erp_id = erp.id
         )
),
order_rollup AS (
  SELECT details.invoiceid,
         COUNT(*) FILTER (WHERE COALESCE(details.issubtotal, false) = false)
           AS product_lines,
         COALESCE(SUM(details.quantity)
           FILTER (WHERE COALESCE(details.issubtotal, false) = false), 0)
           AS quantity,
         COALESCE(SUM(details.freeproduct)
           FILTER (WHERE COALESCE(details.issubtotal, false) = false), 0)
           AS free_units,
         COALESCE(SUM(details.returnproduct)
           FILTER (WHERE COALESCE(details.issubtotal, false) = false), 0)
           AS return_units,
         COALESCE(SUM(details.total)
           FILTER (WHERE COALESCE(details.issubtotal, false) = false), 0)
           AS line_total
    FROM order_details details
   GROUP BY details.invoiceid
),
erp_numeric_unmatched_audit AS (
  SELECT unmatched.id,
         unmatched.amount_cents,
         COALESCE(orders.free_units, 0)::bigint AS free_units,
         COALESCE(orders.return_units, 0)::bigint AS return_units,
         CASE
           WHEN COALESCE(orders.return_units, 0) > 0 THEN 'return_only'
           WHEN COALESCE(orders.free_units, 0) > 0 THEN 'free_only'
           ELSE 'unclassified'
         END::varchar AS category
    FROM erp_regular_unmatched unmatched
    LEFT JOIN order_rollup orders ON orders.invoiceid = unmatched.id
),
erp_f_audit AS (
  SELECT free_invoices.id,
         free_invoices.amount_cents,
         COALESCE(orders.free_units, 0)::bigint AS free_units,
         COALESCE(orders.return_units, 0)::bigint AS return_units
    FROM erp_free_only free_invoices
    LEFT JOIN order_rollup orders ON orders.invoiceid = free_invoices.id
),
legacy_f_audit AS (
  SELECT legacy.*,
         SUBSTRING(legacy.journal_ref FROM 2)::bigint AS base_ref_number,
         (base_legacy.stage_sequence IS NOT NULL) AS has_legacy_base_sale,
         base_erp.id AS erp_base_id,
         COALESCE(base_orders.free_units, 0) AS erp_base_free_units,
         shape.exact_zero_group
    FROM legacy_auxiliary_f legacy
    LEFT JOIN legacy_main base_legacy
      ON base_legacy.journal_ref::bigint
           = SUBSTRING(legacy.journal_ref FROM 2)::bigint
    LEFT JOIN erp_regular base_erp
      ON base_erp.id::bigint = SUBSTRING(legacy.journal_ref FROM 2)::bigint
    LEFT JOIN order_rollup base_orders ON base_orders.invoiceid = base_erp.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) = 2
             AND COUNT(*) FILTER (
                   WHERE grouped.account_code = 'CH_REV1'
                     AND grouped.debit_cents = 0
                     AND grouped.credit_cents = 0
                 ) = 1
             AS exact_zero_group
        FROM import_legacy_rows grouped
       WHERE grouped.record_kind = 'transaction'
         AND grouped.journal_group_key = legacy.journal_group_key
    ) shape ON true
),
expected_direct_exceptions (
  legacy_ref,
  erp_id,
  legacy_date,
  erp_date,
  legacy_sales_account,
  expected_sales_account,
  legacy_cents,
  erp_cents,
  customerid,
  actual_debtor,
  expected_debtor,
  date_matches,
  amount_matches,
  sale_term_matches,
  counterparty_matches
) AS (
  VALUES
    ('34304'::varchar, '34304'::varchar, DATE '2026-01-06',
     DATE '2026-01-06', 'CR_SALES'::varchar, 'CASH_SALES'::varchar,
     243160::bigint, 243160::bigint, 'LAI'::varchar, 'LAI'::varchar,
     'LAI'::varchar, true, true, false, true),
    ('26120', '026120', DATE '2026-01-12', DATE '2026-01-12',
     'CASH_SALES', 'CASH_SALES', 4660, 4720, 'RAMBU', NULL, 'RAMBU',
     true, false, true, true),
    ('34402', '34402', DATE '2026-01-28', DATE '2026-01-28',
     'CR_SALES', 'CASH_SALES', 53000, 53000, 'POOI', 'POOI', 'POOI',
     true, true, false, true),
    ('2004559', '2004559', DATE '2026-01-30', DATE '2026-01-30',
     'CASH_SALES', 'CR_SALES', 11580, 11580, 'KY', NULL, 'KY',
     true, true, false, true),
    ('13581', '013581', DATE '2026-02-02', DATE '2026-02-02',
     'CASH_SALES', 'CASH_SALES', 4200, 1400, 'FELLECIA', NULL,
     'FELLECIA', true, false, true, true),
    ('34439', '34439', DATE '2026-02-04', DATE '2026-02-04',
     'CR_SALES', 'CASH_SALES', 172920, 172920, 'HAPHUAT', 'HAPHUAT',
     'HAPHUAT', true, true, false, true),
    ('63263', '63263', DATE '2026-02-04', DATE '2026-02-04',
     'CR_SALES', 'CR_SALES', 171000, 171000, 'AA-T', 'AA', 'AA-T',
     true, true, true, false),
    ('2004601', '2004601', DATE '2026-02-10', DATE '2026-02-10',
     'CASH_SALES', 'CR_SALES', 3480, 3480, '1M', NULL, '1M',
     true, true, false, true),
    ('13595', '013595', DATE '2026-02-24', DATE '2026-02-25',
     'CASH_SALES', 'CASH_SALES', 15000, 15000, 'TSEN-KY', NULL,
     'TSEN-KY', false, true, true, true),
    ('13596', '013596', DATE '2026-02-24', DATE '2026-02-25',
     'CASH_SALES', 'CASH_SALES', 32000, 32000, 'MARGARET', NULL,
     'MARGARET', false, true, true, true),
    ('2004628', '2004628', DATE '2026-02-25', DATE '2026-02-25',
     'CASH_SALES', 'CR_SALES', 87000, 87000, 'AFRID', NULL, 'AFRID',
     true, true, false, true),
    ('34832', '34832', DATE '2026-05-05', DATE '2026-05-05',
     'CR_SALES', 'CASH_SALES', 53000, 53000, 'KEDAI NO.1',
     'KEDAI NO.1', 'KEDAI NO.1', true, true, false, true),
    ('63760', '63760', DATE '2026-05-09', DATE '2026-05-09',
     'CR_SALES', 'CR_SALES', 141500, 141500, 'FRESHMART',
     'NEW FRESHMART', 'FRESHMART', true, true, true, false),
    ('2004882', '2004882', DATE '2026-05-26', DATE '2026-05-26',
     'CASH_SALES', 'CR_SALES', 87000, 87000, 'SENANG', NULL, 'SENANG',
     true, true, false, true)
),
expected_legacy_main_unmatched (
  journal_ref,
  entry_date,
  account_code,
  credit_cents,
  particulars
) AS (
  VALUES
    ('13573'::varchar, DATE '2026-01-26', 'CR_SALES'::varchar,
     28000::bigint, 'INV.NO : 013573 JIMMY'::text),
    ('13575', DATE '2026-01-28', 'CR_SALES', 28000,
     'INV.NO : 013575 BIUNG'),
    ('26134', DATE '2026-01-28', 'CR_SALES', 2920,
     'INV/NO : 026134 LUV'),
    ('26140', DATE '2026-01-28', 'CR_SALES', 23000,
     'INV/NO : 026140 CHU'),
    ('13576', DATE '2026-01-29', 'CASH_SALES', 3600,
     'CASH BILL : 013576 HELEN'),
    ('26141', DATE '2026-01-29', 'CR_SALES', 14320,
     'INV/NO : 026141 TONY'),
    ('26162', DATE '2026-02-14', 'CASH_SALES', 3260,
     'CASH BILL : 026162 HELEN'),
    ('101640', DATE '2026-02-25', 'CR_SALES', 0,
     'INV/NO : 101640 RE CHAI'),
    ('26169', DATE '2026-02-26', 'CASH_SALES', 36000,
     'CASH BILL : 026169 JINO')
),
expected_erp_numeric_unmatched (
  id,
  category,
  amount_cents,
  free_units,
  return_units
) AS (
  VALUES
    ('34424'::varchar, 'return_only'::varchar, 0::bigint, 0::bigint, 4::bigint),
    ('34433', 'return_only', 0, 0, 2),
    ('34441', 'return_only', 0, 0, 3),
    ('34543', 'return_only', 0, 0, 3),
    ('34544', 'free_only', 0, 2, 0),
    ('34545', 'free_only', 0, 4, 0),
    ('34554', 'return_only', 0, 0, 1),
    ('34591', 'return_only', 0, 0, 2),
    ('34623', 'return_only', 0, 0, 1),
    ('34742', 'return_only', 0, 0, 11),
    ('34748', 'return_only', 0, 0, 1),
    ('34754', 'return_only', 0, 0, 6),
    ('34759', 'return_only', 0, 0, 1),
    ('34787', 'return_only', 0, 0, 4),
    ('34833', 'return_only', 0, 0, 5),
    ('34857', 'return_only', 0, 0, 3),
    ('34868', 'free_only', 0, 20, 0),
    ('34874', 'return_only', 0, 0, 1),
    ('34911', 'return_only', 0, 0, 12),
    ('34917', 'return_only', 0, 0, 5),
    ('63078', 'return_only', 0, 0, 1),
    ('63104', 'return_only', 0, 0, 1),
    ('63138', 'return_only', 0, 0, 2),
    ('63179', 'return_only', 0, 0, 4),
    ('63273', 'return_only', 0, 0, 9),
    ('63282', 'return_only', 0, 0, 1),
    ('63288', 'return_only', 0, 0, 4),
    ('63291', 'return_only', 0, 0, 5),
    ('63364', 'return_only', 0, 0, 2),
    ('63380', 'return_only', 0, 0, 2),
    ('63426', 'return_only', 0, 0, 5),
    ('63442', 'return_only', 0, 0, 7),
    ('63444', 'return_only', 0, 0, 25),
    ('63454', 'return_only', 0, 0, 2),
    ('63517', 'return_only', 0, 0, 23),
    ('63572', 'return_only', 0, 0, 1),
    ('63588', 'return_only', 0, 0, 1),
    ('63591', 'return_only', 0, 0, 1),
    ('63598', 'return_only', 0, 0, 8),
    ('63603', 'return_only', 0, 0, 2),
    ('63610', 'return_only', 0, 0, 2),
    ('63636', 'return_only', 0, 0, 17),
    ('63639', 'return_only', 0, 0, 1),
    ('63683', 'return_only', 0, 0, 1),
    ('63689', 'return_only', 0, 0, 1),
    ('63700', 'return_only', 0, 0, 21),
    ('63705', 'return_only', 0, 0, 1),
    ('63712', 'return_only', 0, 0, 1),
    ('63754', 'return_only', 0, 0, 9),
    ('63819', 'return_only', 0, 0, 3),
    ('63827', 'return_only', 0, 0, 1)
),
expected_erp_f_unmatched (
  id,
  amount_cents,
  free_units,
  return_units
) AS (
  VALUES
    ('F010614'::varchar, 0::bigint, 3::bigint, 0::bigint),
    ('F010615', 0, 1, 0),
    ('F010616', 0, 2, 0),
    ('F010617', 0, 16, 0),
    ('F010618', 0, 2, 0),
    ('f010619', 0, 3, 0),
    ('F010620', 0, 8, 0),
    ('F010621', 0, 2, 0),
    ('F010622', 0, 5, 0),
    ('F010623', 0, 5, 0),
    ('F010624', 0, 1, 0),
    ('F010626', 0, 2, 0),
    ('F010627', 0, 4, 0),
    ('F010628', 0, 2, 0),
    ('F010629', 0, 4, 0),
    ('F010630', 0, 2, 0),
    ('F010631', 0, 3, 0),
    ('F010633', 0, 3, 0),
    ('F010634', 0, 5, 0),
    ('F010635', 0, 4, 0),
    ('F010636', 0, 2, 0),
    ('f010654', 0, 1, 0),
    ('F010654', 0, 2, 0),
    ('f010655', 0, 1, 0),
    ('F010655', 0, 1, 0),
    ('f010656', 0, 3, 0),
    ('F010656', 0, 3, 0),
    ('f010657', 0, 2, 0),
    ('F010658', 0, 4, 0),
    ('F010659', 0, 2, 0),
    ('F010660', 0, 3, 0),
    ('F010661', 0, 4, 0),
    ('F010662', 0, 2, 0),
    ('F010663', 0, 2, 0),
    ('F010664', 0, 6, 0),
    ('F010665', 0, 1, 0),
    ('F010666', 0, 10, 0),
    ('F010668', 0, 20, 0),
    ('F010669', 0, 2, 0)
),
expected_legacy_f (
  journal_ref,
  entry_date,
  has_legacy_base_sale,
  erp_base_id,
  erp_base_free_units,
  exact_zero_group
) AS (
  VALUES
    ('F013562'::varchar, DATE '2026-01-06', true, '013562'::varchar,
     4::bigint, true),
    ('F013566', DATE '2026-01-14', true, '013566', 4, true),
    ('F013567', DATE '2026-01-14', true, '013567', 4, true),
    ('F013572', DATE '2026-01-26', true, '013572', 4, true),
    ('F013573', DATE '2026-01-26', true, NULL, 0, true),
    ('F013574', DATE '2026-01-27', true, '013574', 4, true),
    ('F013575', DATE '2026-01-28', true, NULL, 0, true),
    ('F013580', DATE '2026-01-31', true, '013580', 1, true),
    ('F026146', DATE '2026-02-02', true, '026146', 4, true),
    ('F031583', DATE '2026-02-03', false, NULL, 0, true),
    ('F013584', DATE '2026-02-06', true, '013584', 4, true),
    ('F013591', DATE '2026-02-14', true, '013591', 4, true),
    ('F013592', DATE '2026-02-16', true, '013592', 2, true),
    ('F013594', DATE '2026-02-23', true, '013594', 4, true),
    ('F013596', DATE '2026-02-24', true, '013596', 4, true),
    ('F013597', DATE '2026-02-25', true, '013597', 4, true),
    ('F026173', DATE '2026-02-28', true, '026173', 200, true),
    ('F022206', DATE '2026-03-07', true, '022206', 4, true),
    ('F022213', DATE '2026-03-12', true, '022213', 3, true),
    ('F022216', DATE '2026-03-13', true, '022216', 2, true),
    ('F022218', DATE '2026-03-14', true, '022218', 3, true),
    ('F022221', DATE '2026-03-17', true, '022221', 4, true),
    ('F022222', DATE '2026-03-17', true, '022222', 4, true),
    ('F022223', DATE '2026-03-18', true, '022223', 4, true),
    ('F022226', DATE '2026-03-27', true, '022226', 4, true),
    ('F022231', DATE '2026-04-01', true, '022231', 4, true),
    ('F022234', DATE '2026-04-11', true, '022234', 8, true),
    ('F022237', DATE '2026-04-15', true, '022237', 4, true),
    ('F022236', DATE '2026-04-16', true, '022236', 4, true),
    ('F022240', DATE '2026-04-16', true, '022240', 4, true),
    ('F022238', DATE '2026-04-17', true, '022238', 2, true),
    ('F022243', DATE '2026-04-23', true, '022243', 8, true),
    ('F022248', DATE '2026-04-29', true, '022248', 1, true),
    ('F022252', DATE '2026-05-04', true, '022252', 8, true),
    ('F022253', DATE '2026-05-06', true, '022253', 1, true),
    ('F022257', DATE '2026-05-07', true, '022257', 4, true),
    ('F022258', DATE '2026-05-08', true, '022258', 4, true),
    ('F015339', DATE '2026-05-13', true, '015339', 1, true),
    ('F022269', DATE '2026-05-21', true, '022269', 2, true)
),
direct_exception_delta AS (
  (
    SELECT legacy_ref, erp_id, legacy_date, erp_date,
           legacy_sales_account, expected_sales_account,
           legacy_cents, erp_cents, customerid, actual_debtor,
           expected_debtor, date_matches, amount_matches,
           sale_term_matches, counterparty_matches
      FROM expected_direct_exceptions
    EXCEPT
    SELECT legacy_ref, erp_id, legacy_date, erp_date,
           legacy_sales_account, expected_sales_account,
           legacy_cents, erp_cents, customerid, actual_debtor,
           expected_debtor, date_matches, amount_matches,
           sale_term_matches, counterparty_matches
      FROM direct_audited
     WHERE NOT (
       date_matches AND amount_matches
         AND sale_term_matches AND counterparty_matches
     )
  )
  UNION ALL
  (
    SELECT legacy_ref, erp_id, legacy_date, erp_date,
           legacy_sales_account, expected_sales_account,
           legacy_cents, erp_cents, customerid, actual_debtor,
           expected_debtor, date_matches, amount_matches,
           sale_term_matches, counterparty_matches
      FROM direct_audited
     WHERE NOT (
       date_matches AND amount_matches
         AND sale_term_matches AND counterparty_matches
     )
    EXCEPT
    SELECT legacy_ref, erp_id, legacy_date, erp_date,
           legacy_sales_account, expected_sales_account,
           legacy_cents, erp_cents, customerid, actual_debtor,
           expected_debtor, date_matches, amount_matches,
           sale_term_matches, counterparty_matches
      FROM expected_direct_exceptions
  )
),
typo_mapping_delta AS (
  (
    SELECT legacy_ref, erp_id, expected_date, expected_customer,
           expected_sales_account, expected_cents
      FROM evidence_pairs
    EXCEPT
    SELECT legacy_ref, erp_id, expected_date, expected_customer,
           expected_sales_account, expected_cents
      FROM evidence_matches
  )
  UNION ALL
  (
    SELECT legacy_ref, erp_id, expected_date, expected_customer,
           expected_sales_account, expected_cents
      FROM evidence_matches
    EXCEPT
    SELECT legacy_ref, erp_id, expected_date, expected_customer,
           expected_sales_account, expected_cents
      FROM evidence_pairs
  )
),
legacy_main_unmatched_delta AS (
  (
    SELECT journal_ref, entry_date, account_code, credit_cents, particulars
      FROM expected_legacy_main_unmatched
    EXCEPT
    SELECT journal_ref, entry_date, account_code, credit_cents, particulars
      FROM legacy_main_unmatched
  )
  UNION ALL
  (
    SELECT journal_ref, entry_date, account_code, credit_cents, particulars
      FROM legacy_main_unmatched
    EXCEPT
    SELECT journal_ref, entry_date, account_code, credit_cents, particulars
      FROM expected_legacy_main_unmatched
  )
),
erp_numeric_unmatched_delta AS (
  (
    SELECT id, category, amount_cents, free_units, return_units
      FROM expected_erp_numeric_unmatched
    EXCEPT
    SELECT id, category, amount_cents, free_units, return_units
      FROM erp_numeric_unmatched_audit
  )
  UNION ALL
  (
    SELECT id, category, amount_cents, free_units, return_units
      FROM erp_numeric_unmatched_audit
    EXCEPT
    SELECT id, category, amount_cents, free_units, return_units
      FROM expected_erp_numeric_unmatched
  )
),
erp_f_delta AS (
  (
    SELECT id, amount_cents, free_units, return_units
      FROM expected_erp_f_unmatched
    EXCEPT
    SELECT id, amount_cents, free_units, return_units
      FROM erp_f_audit
  )
  UNION ALL
  (
    SELECT id, amount_cents, free_units, return_units
      FROM erp_f_audit
    EXCEPT
    SELECT id, amount_cents, free_units, return_units
      FROM expected_erp_f_unmatched
  )
),
legacy_f_delta AS (
  (
    SELECT journal_ref, entry_date, has_legacy_base_sale, erp_base_id,
           erp_base_free_units, exact_zero_group
      FROM expected_legacy_f
    EXCEPT
    SELECT journal_ref, entry_date, has_legacy_base_sale, erp_base_id,
           erp_base_free_units::bigint, exact_zero_group
      FROM legacy_f_audit
  )
  UNION ALL
  (
    SELECT journal_ref, entry_date, has_legacy_base_sale, erp_base_id,
           erp_base_free_units::bigint, exact_zero_group
      FROM legacy_f_audit
    EXCEPT
    SELECT journal_ref, entry_date, has_legacy_base_sale, erp_base_id,
           erp_base_free_units, exact_zero_group
      FROM expected_legacy_f
  )
),
metrics AS (
  SELECT
    (SELECT COUNT(*) FROM invoice_window) AS all_invoice_rows,
    (SELECT SUM(amount_cents) FROM invoice_window) AS all_invoice_cents,
    (SELECT COUNT(*) FROM invoice_window
      WHERE invoice_status = 'cancelled') AS cancelled_rows,
    (SELECT SUM(amount_cents) FROM invoice_window
      WHERE invoice_status = 'cancelled') AS cancelled_cents,
    (SELECT COUNT(*) FROM invoice_window
      WHERE invoice_status <> 'cancelled') AS noncancelled_rows,
    (SELECT SUM(amount_cents) FROM invoice_window
      WHERE invoice_status <> 'cancelled') AS noncancelled_cents,
    (SELECT COUNT(*) FROM invoice_window
      WHERE invoice_status <> 'cancelled'
        AND COALESCE(is_consolidated, false)) AS wrapper_rows,
    (SELECT SUM(amount_cents) FROM invoice_window
      WHERE invoice_status <> 'cancelled'
        AND COALESCE(is_consolidated, false)) AS wrapper_cents,
    (SELECT COUNT(*) FROM erp_source) AS erp_source_rows,
    (SELECT SUM(amount_cents) FROM erp_source) AS erp_source_cents,
    (SELECT COUNT(*) FROM erp_regular) AS erp_regular_rows,
    (SELECT SUM(amount_cents) FROM erp_regular) AS erp_regular_cents,
    (SELECT COUNT(*) FROM erp_free_only) AS erp_f_rows,
    (SELECT SUM(amount_cents) FROM erp_free_only) AS erp_f_cents,
    (SELECT SUM(COALESCE(orders.free_units, 0))
       FROM erp_free_only free_invoices
       LEFT JOIN order_rollup orders ON orders.invoiceid = free_invoices.id)
      AS erp_f_free_units,
    (SELECT COUNT(*) FROM legacy_sales) AS legacy_sales_rows,
    (SELECT SUM(credit_cents) FROM legacy_sales) AS legacy_sales_cents,
    (SELECT COUNT(*) FROM legacy_main) AS legacy_main_rows,
    (SELECT SUM(credit_cents) FROM legacy_main) AS legacy_main_cents,
    (SELECT COUNT(*) FROM legacy_auxiliary_f) AS legacy_f_rows,
    (SELECT SUM(credit_cents) FROM legacy_auxiliary_f) AS legacy_f_cents,
    (SELECT COUNT(*) FROM direct_audited) AS direct_matches,
    (SELECT SUM(legacy_cents) FROM direct_audited) AS direct_legacy_cents,
    (SELECT SUM(erp_cents) FROM direct_audited) AS direct_erp_cents,
    (SELECT COUNT(*) FROM direct_audited
      WHERE date_matches AND amount_matches AND sale_term_matches
        AND counterparty_matches) AS fully_exact_matches,
    (SELECT COUNT(*) FROM direct_audited
      WHERE NOT (date_matches AND amount_matches AND sale_term_matches
        AND counterparty_matches)) AS direct_named_exceptions,
    (SELECT COUNT(*) FROM direct_audited
      WHERE NOT date_matches) AS date_differences,
    (SELECT COUNT(*) FROM direct_audited
      WHERE NOT amount_matches) AS amount_differences,
    (SELECT COUNT(*) FROM direct_audited
      WHERE NOT sale_term_matches) AS sale_term_differences,
    (SELECT COUNT(*) FROM direct_audited
      WHERE legacy_sales_account = 'CR_SALES') AS matched_credit_rows,
    (SELECT COUNT(*) FROM direct_audited
      WHERE legacy_sales_account = 'CR_SALES'
        AND counterparty_matches) AS matched_credit_debtor_exact,
    (SELECT COUNT(*) FROM direct_audited
      WHERE legacy_sales_account = 'CASH_SALES') AS matched_cash_rows,
    (SELECT COUNT(*) FROM direct_audited
      WHERE legacy_sales_account = 'CASH_SALES'
        AND counterparty_matches) AS matched_cash_holding_exact,
    (SELECT COUNT(*) FROM evidence_matches) AS evidence_match_rows,
    (SELECT SUM(expected_cents) FROM evidence_matches) AS evidence_match_cents,
    (SELECT COUNT(*) FROM legacy_main_unmatched) AS legacy_main_unmatched_rows,
    (SELECT COUNT(*) FROM legacy_main_unmatched
      WHERE credit_cents > 0) AS legacy_main_unmatched_positive_rows,
    (SELECT SUM(credit_cents) FROM legacy_main_unmatched)
      AS legacy_main_unmatched_cents,
    (SELECT COUNT(*) FROM erp_regular_unmatched)
      AS erp_regular_unmatched_rows,
    (SELECT SUM(amount_cents) FROM erp_regular_unmatched)
      AS erp_regular_unmatched_cents,
    (SELECT COUNT(*) FROM erp_regular_unmatched unmatched
      LEFT JOIN order_rollup orders ON orders.invoiceid = unmatched.id
      WHERE COALESCE(orders.return_units, 0) > 0) AS erp_unmatched_return_rows,
    (SELECT COUNT(*) FROM erp_regular_unmatched unmatched
      LEFT JOIN order_rollup orders ON orders.invoiceid = unmatched.id
      WHERE COALESCE(orders.return_units, 0) = 0
        AND COALESCE(orders.free_units, 0) > 0) AS erp_unmatched_free_rows,
    (SELECT COUNT(*) FROM legacy_f_audit
      WHERE exact_zero_group) AS legacy_f_exact_zero_groups,
    (SELECT COUNT(*) FROM legacy_f_audit
      WHERE has_legacy_base_sale) AS legacy_f_with_legacy_base,
    (SELECT COUNT(*) FROM legacy_f_audit
      WHERE erp_base_id IS NOT NULL) AS legacy_f_with_erp_base,
    (SELECT COUNT(*) FROM legacy_f_audit
      WHERE erp_base_id IS NOT NULL
        AND erp_base_free_units > 0) AS legacy_f_erp_base_with_free_units,
    (SELECT COUNT(*) = 0 FROM direct_exception_delta)
      AS direct_exception_identities_exact,
    (SELECT COUNT(*) = 0 FROM typo_mapping_delta)
      AS typo_mapping_identities_exact,
    (SELECT COUNT(*) = 0 FROM legacy_main_unmatched_delta)
      AS legacy_main_unmatched_identities_exact,
    (SELECT COUNT(*) = 0 FROM erp_numeric_unmatched_delta)
      AS erp_numeric_unmatched_identities_exact,
    (SELECT COUNT(*) = 0 FROM erp_f_delta)
      AS erp_f_identities_exact,
    (SELECT COUNT(*) = 0 FROM legacy_f_delta)
      AS legacy_f_identities_exact
)
SELECT
  metrics.*,
  (
    metrics.all_invoice_rows = 2208
    AND metrics.all_invoice_cents = 466188865
    AND metrics.cancelled_rows = 40
    AND metrics.cancelled_cents = 0
    AND metrics.noncancelled_rows = 2168
    AND metrics.noncancelled_cents = 466188865
    AND metrics.wrapper_rows = 5
    AND metrics.wrapper_cents = 132682280
    AND metrics.erp_source_rows = 2163
    AND metrics.erp_source_cents = 333506585
    AND metrics.erp_regular_rows = 2124
    AND metrics.erp_regular_cents = 333506585
    AND metrics.erp_f_rows = 39
    AND metrics.erp_f_cents = 0
    AND metrics.erp_f_free_units = 148
    AND metrics.legacy_sales_rows = 2121
    AND metrics.legacy_sales_cents = 333648425
    AND metrics.legacy_main_rows = 2082
    AND metrics.legacy_main_cents = 333648425
    AND metrics.legacy_f_rows = 39
    AND metrics.legacy_f_cents = 0
    AND metrics.direct_matches = 2071
    AND metrics.direct_legacy_cents = 333497735
    AND metrics.direct_erp_cents = 333494995
    AND metrics.fully_exact_matches = 2057
    AND metrics.direct_named_exceptions = 14
    AND metrics.date_differences = 2
    AND metrics.amount_differences = 2
    AND metrics.sale_term_differences = 8
    AND metrics.matched_credit_rows = 885
    AND metrics.matched_credit_debtor_exact = 883
    AND metrics.matched_cash_rows = 1186
    AND metrics.matched_cash_holding_exact = 1186
    AND metrics.evidence_match_rows = 2
    AND metrics.evidence_match_cents = 11590
    AND metrics.legacy_main_unmatched_rows = 9
    AND metrics.legacy_main_unmatched_positive_rows = 8
    AND metrics.legacy_main_unmatched_cents = 139100
    AND metrics.erp_regular_unmatched_rows = 51
    AND metrics.erp_regular_unmatched_cents = 0
    AND metrics.erp_unmatched_return_rows = 48
    AND metrics.erp_unmatched_free_rows = 3
    AND metrics.legacy_f_exact_zero_groups = 39
    AND metrics.legacy_f_with_legacy_base = 38
    AND metrics.legacy_f_with_erp_base = 36
    AND metrics.legacy_f_erp_base_with_free_units = 36
    AND metrics.direct_exception_identities_exact
    AND metrics.typo_mapping_identities_exact
    AND metrics.legacy_main_unmatched_identities_exact
    AND metrics.erp_numeric_unmatched_identities_exact
    AND metrics.erp_f_identities_exact
    AND metrics.legacy_f_identities_exact
    AND metrics.legacy_main_cents - metrics.erp_regular_cents = 141840
    AND metrics.legacy_main_unmatched_cents
          + metrics.direct_legacy_cents - metrics.direct_erp_cents = 141840
  ) AS invoice_reconciliation_ok
FROM metrics
\gset

\if :invoice_reconciliation_ok
  \echo 'Invoice reconciliation hard totals: PASS'
\else
  \echo 'Invoice reconciliation hard totals: FAILED'
  \quit 3
\endif

-- 1. Scope bridge. The original plan count includes wrappers; source invoices
-- are the non-cancelled, non-wrapper population.
SELECT 'all ERP rows in local-date window' AS population,
       COUNT(*) AS rows,
       SUM(ROUND(COALESCE(totalamountpayable, 0) * 100))::bigint AS cents
  FROM invoices
 WHERE (
         TO_TIMESTAMP(createddate::bigint / 1000.0)
           AT TIME ZONE 'Asia/Kuala_Lumpur'
       )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
UNION ALL
SELECT 'non-cancelled (plan population)', COUNT(*),
       SUM(ROUND(COALESCE(totalamountpayable, 0) * 100))::bigint
  FROM invoices
 WHERE invoice_status <> 'cancelled'
   AND (
         TO_TIMESTAMP(createddate::bigint / 1000.0)
           AT TIME ZONE 'Asia/Kuala_Lumpur'
       )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
UNION ALL
SELECT 'consolidated wrappers (excluded)', COUNT(*),
       SUM(ROUND(COALESCE(totalamountpayable, 0) * 100))::bigint
  FROM invoices
 WHERE invoice_status <> 'cancelled'
   AND COALESCE(is_consolidated, false)
   AND (
         TO_TIMESTAMP(createddate::bigint / 1000.0)
           AT TIME ZONE 'Asia/Kuala_Lumpur'
       )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
UNION ALL
SELECT 'ERP source invoices (non-wrapper)', COUNT(*),
       SUM(ROUND(COALESCE(totalamountpayable, 0) * 100))::bigint
  FROM invoices
 WHERE invoice_status <> 'cancelled'
   AND COALESCE(is_consolidated, false) = false
   AND (
         TO_TIMESTAMP(createddate::bigint / 1000.0)
           AT TIME ZONE 'Asia/Kuala_Lumpur'
       )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
UNION ALL
SELECT 'posted IMP sales lines', COUNT(*),
       SUM(ROUND(lines.credit_amount * 100))::bigint
  FROM journal_entries headers
  JOIN journal_entry_lines lines ON lines.journal_entry_id = headers.id
 WHERE headers.entry_type = 'IMP'
   AND headers.status = 'posted'
   AND lines.account_code IN ('CASH_SALES', 'CR_SALES')
ORDER BY population;

-- The five wrappers are e-invoice containers and are not separate sales.
SELECT id,
       (
         TO_TIMESTAMP(createddate::bigint / 1000.0)
           AT TIME ZONE 'Asia/Kuala_Lumpur'
       )::date AS local_date,
       totalamountpayable,
       JSONB_ARRAY_LENGTH(COALESCE(consolidated_invoices, '[]'::jsonb))
         AS child_count
  FROM invoices
 WHERE invoice_status <> 'cancelled'
   AND COALESCE(is_consolidated, false)
   AND (
         TO_TIMESTAMP(createddate::bigint / 1000.0)
           AT TIME ZONE 'Asia/Kuala_Lumpur'
       )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
 ORDER BY local_date, id;

-- 2. Month/category totals for normal numeric sales rows.
WITH legacy AS (
  SELECT DATE_TRUNC('month', entry_date)::date AS month_start,
         account_code AS category,
         COUNT(*) AS rows,
         SUM(credit_cents)::bigint AS cents
    FROM import_legacy_rows
   WHERE record_kind = 'transaction'
     AND account_code IN ('CASH_SALES', 'CR_SALES')
     AND journal_ref ~ '^[0-9]+$'
   GROUP BY 1, 2
), erp AS (
  SELECT DATE_TRUNC(
           'month',
           (
             TO_TIMESTAMP(createddate::bigint / 1000.0)
               AT TIME ZONE 'Asia/Kuala_Lumpur'
           )::date
         )::date AS month_start,
         CASE WHEN paymenttype = 'CASH' THEN 'CASH_SALES'
              ELSE 'CR_SALES' END AS category,
         COUNT(*) AS rows,
         SUM(ROUND(COALESCE(totalamountpayable, 0) * 100))::bigint AS cents
    FROM invoices
   WHERE invoice_status <> 'cancelled'
     AND COALESCE(is_consolidated, false) = false
     AND id ~ '^[0-9]+$'
     AND (
           TO_TIMESTAMP(createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
   GROUP BY 1, 2
)
SELECT COALESCE(legacy.month_start, erp.month_start) AS month_start,
       COALESCE(legacy.category, erp.category) AS category,
       legacy.rows AS legacy_rows,
       erp.rows AS erp_rows,
       legacy.cents AS legacy_cents,
       erp.cents AS erp_cents,
       legacy.cents - erp.cents AS legacy_minus_erp_cents
  FROM legacy
  FULL JOIN erp USING (month_start, category)
 ORDER BY month_start, category;

-- 3. The 14 direct-reference exceptions. `difference_kinds` names every
-- failed dimension; categories do not overlap in this snapshot.
WITH
erp AS (
  SELECT invoices.*,
         (
           TO_TIMESTAMP(createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date AS local_date,
         ROUND(COALESCE(totalamountpayable, 0) * 100)::bigint AS amount_cents,
         LTRIM(id, '0') AS match_key
    FROM invoices
   WHERE invoice_status <> 'cancelled'
     AND COALESCE(is_consolidated, false) = false
     AND id ~ '^[0-9]+$'
     AND (
           TO_TIMESTAMP(createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
), legacy AS (
  SELECT staged.*,
         LTRIM(journal_ref, '0') AS match_key
    FROM import_legacy_rows staged
   WHERE record_kind = 'transaction'
     AND account_code IN ('CASH_SALES', 'CR_SALES')
     AND journal_ref ~ '^[0-9]+$'
), matched AS (
  SELECT legacy.stage_sequence,
         legacy.journal_group_key,
         legacy.entry_date AS legacy_date,
         legacy.account_code AS legacy_sales_account,
         legacy.journal_ref AS legacy_ref,
         legacy.credit_cents AS legacy_cents,
         legacy.particulars,
         legacy.source_physical_line,
         erp.id AS erp_id,
         erp.local_date AS erp_date,
         erp.customerid,
         erp.paymenttype,
         erp.amount_cents AS erp_cents,
         CASE WHEN erp.paymenttype = 'CASH' THEN 'CASH_SALES'
              ELSE 'CR_SALES' END AS expected_sales_account
    FROM legacy
    JOIN erp USING (match_key)
), audited AS (
  SELECT matched.*,
         shape.actual_debtor,
         expected.expected_debtor,
         matched.legacy_date = matched.erp_date AS date_matches,
         matched.legacy_cents = matched.erp_cents AS amount_matches,
         matched.legacy_sales_account = matched.expected_sales_account
           AS sale_term_matches,
         CASE
           WHEN matched.legacy_sales_account = 'CASH_SALES'
             THEN shape.exact_ch_rev1_pairs = 1
           ELSE shape.debtor_debits = 1
             AND shape.actual_debtor = expected.expected_debtor
         END AS counterparty_matches
    FROM matched
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (
               WHERE accounts.parent_code = 'DEBTOR'
                 AND grouped.debit_cents > 0
             )::integer AS debtor_debits,
             (
               ARRAY_AGG(grouped.account_code ORDER BY grouped.stage_sequence)
                 FILTER (
                   WHERE accounts.parent_code = 'DEBTOR'
                     AND grouped.debit_cents > 0
                 )
             )[1] AS actual_debtor,
             COUNT(*) FILTER (
               WHERE grouped.account_code = 'CH_REV1'
                 AND grouped.debit_cents = matched.legacy_cents
                 AND grouped.credit_cents = 0
             )::integer AS exact_ch_rev1_pairs
        FROM import_legacy_rows grouped
        LEFT JOIN account_codes accounts ON accounts.code = grouped.account_code
       WHERE grouped.record_kind = 'transaction'
         AND grouped.journal_group_key = matched.journal_group_key
    ) shape ON true
    LEFT JOIN LATERAL (
      SELECT accounts.code AS expected_debtor
        FROM account_codes accounts
       WHERE accounts.parent_code = 'DEBTOR'
         AND accounts.code = ANY(
           ARRAY[matched.customerid, matched.customerid || '-D']::text[]
             || ARRAY(
               SELECT matched.customerid || '-D' || suffix_number::text
                 FROM GENERATE_SERIES(2, 50) suffix_number
             )
         )
       ORDER BY ARRAY_POSITION(
         ARRAY[matched.customerid, matched.customerid || '-D']::text[]
           || ARRAY(
             SELECT matched.customerid || '-D' || suffix_number::text
               FROM GENERATE_SERIES(2, 50) suffix_number
           ),
         accounts.code::text
       )
       LIMIT 1
    ) expected ON true
)
SELECT legacy_date,
       erp_date,
       legacy_ref,
       erp_id,
       legacy_sales_account,
       expected_sales_account,
       paymenttype,
       legacy_cents,
       erp_cents,
       legacy_cents - erp_cents AS legacy_minus_erp_cents,
       customerid,
       actual_debtor,
       expected_debtor,
       CONCAT_WS(
         ', ',
         CASE WHEN NOT date_matches THEN 'date' END,
         CASE WHEN NOT amount_matches THEN 'amount' END,
         CASE WHEN NOT sale_term_matches THEN 'sale-term/account' END,
         CASE WHEN NOT counterparty_matches THEN 'debtor/counterparty' END
       ) AS difference_kinds,
       particulars,
       source_physical_line AS thld_source_line
  FROM audited
 WHERE NOT (
   date_matches AND amount_matches AND sale_term_matches AND counterparty_matches
 )
 ORDER BY legacy_date, legacy_ref;

-- 4. Two explicit, unique reference-typo matches.
WITH evidence (
  legacy_ref,
  erp_id,
  expected_date,
  expected_customer,
  expected_sales_account,
  expected_cents,
  reason
) AS (
  VALUES
    ('135699', '013569', DATE '2026-01-16', 'TSEN-KY',
     'CASH_SALES', 10000::bigint,
     'Legacy journal/particulars contain an extra trailing 9'),
    ('15306', '05306', DATE '2026-04-04', 'ROSE',
     'CR_SALES', 1590::bigint,
     'Legacy 015306 and ERP 05306 uniquely agree on date/customer/type/amount')
)
SELECT evidence.*,
       legacy.particulars AS legacy_particulars,
       legacy.source_physical_line AS thld_source_line,
       erp.paymenttype AS erp_paymenttype,
       erp.totalamountpayable AS erp_amount
  FROM evidence
  JOIN import_legacy_rows legacy
    ON legacy.record_kind = 'transaction'
   AND legacy.account_code = evidence.expected_sales_account
   AND legacy.journal_ref = evidence.legacy_ref
  JOIN invoices erp ON erp.id = evidence.erp_id
 ORDER BY expected_date, legacy_ref;

-- 5. Nine normal legacy sales rows with no ERP row anywhere. Every group is
-- balanced in the imported source; `group_proof` names the counterpart.
WITH evidence_refs(legacy_ref) AS (
  VALUES ('135699'::varchar), ('15306'::varchar)
), erp_keys AS (
  SELECT LTRIM(id, '0') AS match_key
    FROM invoices
   WHERE invoice_status <> 'cancelled'
     AND COALESCE(is_consolidated, false) = false
     AND id ~ '^[0-9]+$'
     AND (
           TO_TIMESTAMP(createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
), missing AS (
  SELECT staged.*
    FROM import_legacy_rows staged
   WHERE staged.record_kind = 'transaction'
     AND staged.account_code IN ('CASH_SALES', 'CR_SALES')
     AND staged.journal_ref ~ '^[0-9]+$'
     AND NOT EXISTS (
       SELECT 1 FROM erp_keys
        WHERE erp_keys.match_key = LTRIM(staged.journal_ref, '0')
     )
     AND NOT EXISTS (
       SELECT 1 FROM evidence_refs
        WHERE evidence_refs.legacy_ref = staged.journal_ref
     )
)
SELECT missing.entry_date,
       missing.journal_ref,
       missing.account_code,
       missing.credit_cents,
       missing.particulars,
       missing.source_physical_line AS thld_source_line,
       STRING_AGG(
         grouped.account_code || ':' || grouped.debit_cents::text || 'DR/'
           || grouped.credit_cents::text || 'CR@' || grouped.source_kind || ':'
           || COALESCE(grouped.source_physical_line::text, 'derived'),
         ', ' ORDER BY grouped.stage_sequence
       ) AS group_proof
  FROM missing
  JOIN import_legacy_rows grouped
    ON grouped.record_kind = 'transaction'
   AND grouped.journal_group_key = missing.journal_group_key
 GROUP BY missing.stage_sequence,
          missing.entry_date,
          missing.journal_ref,
          missing.account_code,
          missing.credit_cents,
          missing.particulars,
          missing.source_physical_line
 ORDER BY missing.entry_date, missing.journal_ref;

-- 6. ERP-only zero-value source documents after the two evidence mappings.
-- This is an exact named list: 51 normal IDs (48 return rows + 3 free rows)
-- and 39 F-prefixed free-only documents (148 free units).
WITH legacy_keys AS (
  SELECT LTRIM(journal_ref, '0') AS match_key
    FROM import_legacy_rows
   WHERE record_kind = 'transaction'
     AND account_code IN ('CASH_SALES', 'CR_SALES')
     AND journal_ref ~ '^[0-9]+$'
), evidence_erp_ids(erp_id) AS (
  VALUES ('013569'::varchar), ('05306'::varchar)
), erp_unmatched AS (
  SELECT invoices.*,
         (
           TO_TIMESTAMP(createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date AS local_date
    FROM invoices
   WHERE invoice_status <> 'cancelled'
     AND COALESCE(is_consolidated, false) = false
     AND (
           TO_TIMESTAMP(createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
     AND (
       id ~* '^F[0-9]+$'
       OR (
         id ~ '^[0-9]+$'
         AND NOT EXISTS (
           SELECT 1 FROM legacy_keys
            WHERE legacy_keys.match_key = LTRIM(invoices.id, '0')
         )
         AND NOT EXISTS (
           SELECT 1 FROM evidence_erp_ids
            WHERE evidence_erp_ids.erp_id = invoices.id
         )
       )
     )
), order_rollup AS (
  SELECT invoiceid,
         COALESCE(SUM(quantity)
           FILTER (WHERE COALESCE(issubtotal, false) = false), 0) AS quantity,
         COALESCE(SUM(freeproduct)
           FILTER (WHERE COALESCE(issubtotal, false) = false), 0) AS free_units,
         COALESCE(SUM(returnproduct)
           FILTER (WHERE COALESCE(issubtotal, false) = false), 0) AS return_units,
         COALESCE(SUM(total)
           FILTER (WHERE COALESCE(issubtotal, false) = false), 0) AS line_total
    FROM order_details
   GROUP BY invoiceid
)
SELECT erp.local_date,
       erp.id,
       erp.customerid,
       erp.paymenttype,
       erp.totalamountpayable,
       COALESCE(orders.quantity, 0) AS quantity,
       COALESCE(orders.free_units, 0) AS free_units,
       COALESCE(orders.return_units, 0) AS return_units,
       COALESCE(orders.line_total, 0) AS line_total,
       CASE
         WHEN erp.id ~* '^F[0-9]+$' THEN 'ERP F-prefixed free-only; no legacy row'
         WHEN COALESCE(orders.return_units, 0) > 0
           THEN 'ERP numeric return-only zero; no legacy row'
         ELSE 'ERP numeric free-only zero; no legacy row'
       END AS difference_reason
  FROM erp_unmatched erp
  LEFT JOIN order_rollup orders ON orders.invoiceid = erp.id
 ORDER BY erp.local_date, LOWER(erp.id), erp.id;

-- 7. Legacy F informational projections. All 39 are exact two-line zero
-- CASH_SALES/CH_REV1 groups. Thirty-six link to an ERP base invoice whose
-- order lines contain freeproduct; the three exceptions are shown naturally.
WITH legacy_main AS (
  SELECT *
    FROM import_legacy_rows
   WHERE record_kind = 'transaction'
     AND account_code IN ('CASH_SALES', 'CR_SALES')
     AND journal_ref ~ '^[0-9]+$'
), erp_regular AS (
  SELECT *
    FROM invoices
   WHERE invoice_status <> 'cancelled'
     AND COALESCE(is_consolidated, false) = false
     AND id ~ '^[0-9]+$'
     AND (
           TO_TIMESTAMP(createddate::bigint / 1000.0)
             AT TIME ZONE 'Asia/Kuala_Lumpur'
         )::date BETWEEN DATE '2026-01-01' AND DATE '2026-05-31'
), order_rollup AS (
  SELECT invoiceid, COALESCE(SUM(freeproduct), 0) AS free_units
    FROM order_details
   WHERE COALESCE(issubtotal, false) = false
   GROUP BY invoiceid
)
SELECT auxiliary.entry_date,
       auxiliary.journal_ref,
       auxiliary.particulars,
       auxiliary.source_physical_line AS thld_source_line,
       (base_legacy.stage_sequence IS NOT NULL) AS has_legacy_base_sale,
       base_erp.id AS erp_base_id,
       COALESCE(orders.free_units, 0) AS erp_base_free_units
  FROM import_legacy_rows auxiliary
  LEFT JOIN legacy_main base_legacy
    ON base_legacy.journal_ref::bigint
         = SUBSTRING(auxiliary.journal_ref FROM 2)::bigint
  LEFT JOIN erp_regular base_erp
    ON base_erp.id::bigint = SUBSTRING(auxiliary.journal_ref FROM 2)::bigint
  LEFT JOIN order_rollup orders ON orders.invoiceid = base_erp.id
 WHERE auxiliary.record_kind = 'transaction'
   AND auxiliary.account_code = 'CASH_SALES'
   AND auxiliary.journal_ref ~ '^F[0-9]+$'
 ORDER BY auxiliary.entry_date, auxiliary.stage_sequence;

COMMIT;
