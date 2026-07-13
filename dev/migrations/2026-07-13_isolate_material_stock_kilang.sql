-- =============================================================================
-- Isolate Material Stock's Stock Kilang costing records from operational stock.
--
-- Each MEE/BIHUN product has an independent manually entered quantity per month.
-- The unit cost is snapshotted when the row is saved so later catalogue price or
-- production/sales changes cannot rewrite historical costing values.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS material_stock_kilang_entries (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  product_line VARCHAR(10) NOT NULL CHECK (product_line IN ('mee', 'bihun')),
  product_id VARCHAR(255) NOT NULL REFERENCES products(id),
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  stock_value NUMERIC(16, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  UNIQUE (year, month, product_line, product_id)
);

COMMENT ON TABLE material_stock_kilang_entries IS
  'Monthly costing-only Stock Kilang entries from Material Stock; isolated from production, sales, stock openings and operational stock adjustments.';
COMMENT ON COLUMN material_stock_kilang_entries.unit_cost IS
  'Product unit cost snapshotted when the manual monthly quantity is saved.';

-- Preserve any quantities users previously entered through Material Stock, then
-- remove those legacy rows from operational stock so they no longer change it.
INSERT INTO material_stock_kilang_entries (
  year,
  month,
  product_line,
  product_id,
  quantity,
  unit_cost,
  stock_value,
  created_by,
  updated_by
)
SELECT
  EXTRACT(YEAR FROM sa.entry_date)::integer,
  EXTRACT(MONTH FROM sa.entry_date)::integer,
  CASE sa.reference
    WHEN 'Material Stock Kilang - MEE' THEN 'mee'
    WHEN 'Material Stock Kilang - BIHUN' THEN 'bihun'
  END,
  sa.product_id,
  SUM(
    CASE sa.adjustment_type
      WHEN 'ADJ_IN' THEN sa.quantity
      WHEN 'ADJ_OUT' THEN -sa.quantity
      ELSE 0
    END
  )::numeric(14, 4),
  COALESCE(p.price_per_unit, 0)::numeric(14, 4),
  (
    SUM(
      CASE sa.adjustment_type
        WHEN 'ADJ_IN' THEN sa.quantity
        WHEN 'ADJ_OUT' THEN -sa.quantity
        ELSE 0
      END
    ) * COALESCE(p.price_per_unit, 0)
  )::numeric(16, 2),
  MAX(sa.created_by),
  MAX(sa.created_by)
FROM stock_adjustments sa
JOIN products p ON p.id = sa.product_id
WHERE sa.reference IN (
  'Material Stock Kilang - MEE',
  'Material Stock Kilang - BIHUN'
)
GROUP BY
  EXTRACT(YEAR FROM sa.entry_date),
  EXTRACT(MONTH FROM sa.entry_date),
  sa.reference,
  sa.product_id,
  p.price_per_unit
HAVING SUM(
  CASE sa.adjustment_type
    WHEN 'ADJ_IN' THEN sa.quantity
    WHEN 'ADJ_OUT' THEN -sa.quantity
    ELSE 0
  END
) <> 0
ON CONFLICT (year, month, product_line, product_id)
DO UPDATE SET
  quantity = EXCLUDED.quantity,
  unit_cost = EXCLUDED.unit_cost,
  stock_value = EXCLUDED.stock_value,
  updated_at = CURRENT_TIMESTAMP,
  updated_by = EXCLUDED.updated_by;

DELETE FROM stock_adjustments
WHERE reference IN (
  'Material Stock Kilang - MEE',
  'Material Stock Kilang - BIHUN'
);

COMMIT;
