BEGIN;

DO $$
BEGIN
  IF TO_REGNAMESPACE('jellypolly') IS NULL THEN
    RAISE EXCEPTION
      'Jelly Polly debtor opening balances: schema jellypolly does not exist';
  END IF;

  IF TO_REGCLASS('public.customers') IS NULL THEN
    RAISE EXCEPTION
      'Jelly Polly debtor opening balances: public.customers does not exist';
  END IF;
END
$$;

-- Jelly Polly's debtor ledger is a virtual ledger over JP invoices, payments,
-- and adjustment documents. Its opening anchors must therefore stay inside the
-- JP schema and must never reuse Tien Hock's public.account_opening_balances.
--
-- customer_id deliberately has no foreign key. The shared customer maintenance
-- workflow changes an ID by inserting the replacement customer and deleting the
-- old row; a FK here would block that existing workflow. The API validates that
-- a customer exists whenever an anchor is created or edited.
CREATE TABLE IF NOT EXISTS jellypolly.debtor_opening_balances (
  id          SERIAL PRIMARY KEY,
  customer_id VARCHAR(50) NOT NULL,
  as_of_date  DATE NOT NULL,
  amount      NUMERIC(15, 2) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by  VARCHAR(50),
  updated_by  VARCHAR(50),
  CONSTRAINT jp_debtor_opening_balances_customer_date_unique
    UNIQUE (customer_id, as_of_date)
);

-- CREATE TABLE IF NOT EXISTS must not silently accept a malformed table left
-- by an interrupted/manual rollout. Assert the complete expected shape and the
-- two identity constraints before allowing the migration to commit.
DO $$
DECLARE
  actual_shape JSONB;
  expected_shape CONSTANT JSONB :=
    '[
      {"name":"id","type":"integer","udt":"int4","nullable":"NO","char_max":null,"precision":32,"scale":0},
      {"name":"customer_id","type":"character varying","udt":"varchar","nullable":"NO","char_max":50,"precision":null,"scale":null},
      {"name":"as_of_date","type":"date","udt":"date","nullable":"NO","char_max":null,"precision":null,"scale":null},
      {"name":"amount","type":"numeric","udt":"numeric","nullable":"NO","char_max":null,"precision":15,"scale":2},
      {"name":"notes","type":"text","udt":"text","nullable":"YES","char_max":null,"precision":null,"scale":null},
      {"name":"created_at","type":"timestamp without time zone","udt":"timestamp","nullable":"YES","char_max":null,"precision":null,"scale":null},
      {"name":"updated_at","type":"timestamp without time zone","udt":"timestamp","nullable":"YES","char_max":null,"precision":null,"scale":null},
      {"name":"created_by","type":"character varying","udt":"varchar","nullable":"YES","char_max":50,"precision":null,"scale":null},
      {"name":"updated_by","type":"character varying","udt":"varchar","nullable":"YES","char_max":50,"precision":null,"scale":null}
    ]'::JSONB;
BEGIN
  SELECT JSONB_AGG(
           JSONB_BUILD_OBJECT(
             'name', column_name,
             'type', data_type,
             'udt', udt_name,
             'nullable', is_nullable,
             'char_max', character_maximum_length,
             'precision', numeric_precision,
             'scale', numeric_scale
           )
           ORDER BY ordinal_position
         )
    INTO actual_shape
    FROM information_schema.columns
   WHERE table_schema = 'jellypolly'
     AND table_name = 'debtor_opening_balances';

  IF actual_shape IS DISTINCT FROM expected_shape THEN
    RAISE EXCEPTION
      'Jelly Polly debtor opening balances: unexpected table shape: %',
      actual_shape;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'jellypolly'
       AND table_name = 'debtor_opening_balances'
       AND column_name = 'id'
       AND column_default LIKE 'nextval(%'
  ) THEN
    RAISE EXCEPTION
      'Jelly Polly debtor opening balances: id must use a sequence default';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint constraint_record
      JOIN pg_class table_record
        ON table_record.oid = constraint_record.conrelid
      JOIN pg_namespace namespace_record
        ON namespace_record.oid = table_record.relnamespace
     WHERE namespace_record.nspname = 'jellypolly'
       AND table_record.relname = 'debtor_opening_balances'
       AND constraint_record.contype = 'p'
       AND (
         SELECT ARRAY_AGG(attribute_record.attname::TEXT ORDER BY key_record.ordinality)
           FROM UNNEST(constraint_record.conkey)
                WITH ORDINALITY AS key_record(attribute_number, ordinality)
           JOIN pg_attribute attribute_record
             ON attribute_record.attrelid = table_record.oid
            AND attribute_record.attnum = key_record.attribute_number
       ) = ARRAY['id']::TEXT[]
  ) THEN
    RAISE EXCEPTION
      'Jelly Polly debtor opening balances: primary key on id is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint constraint_record
      JOIN pg_class table_record
        ON table_record.oid = constraint_record.conrelid
      JOIN pg_namespace namespace_record
        ON namespace_record.oid = table_record.relnamespace
     WHERE namespace_record.nspname = 'jellypolly'
       AND table_record.relname = 'debtor_opening_balances'
       AND constraint_record.contype = 'u'
       AND (
         SELECT ARRAY_AGG(attribute_record.attname::TEXT ORDER BY key_record.ordinality)
           FROM UNNEST(constraint_record.conkey)
                WITH ORDINALITY AS key_record(attribute_number, ordinality)
           JOIN pg_attribute attribute_record
             ON attribute_record.attrelid = table_record.oid
            AND attribute_record.attnum = key_record.attribute_number
       ) = ARRAY['customer_id', 'as_of_date']::TEXT[]
  ) THEN
    RAISE EXCEPTION
      'Jelly Polly debtor opening balances: unique(customer_id, as_of_date) is missing';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_constraint constraint_record
      JOIN pg_class table_record
        ON table_record.oid = constraint_record.conrelid
      JOIN pg_namespace namespace_record
        ON namespace_record.oid = table_record.relnamespace
     WHERE namespace_record.nspname = 'jellypolly'
       AND table_record.relname = 'debtor_opening_balances'
       AND constraint_record.contype = 'f'
  ) THEN
    RAISE EXCEPTION
      'Jelly Polly debtor opening balances: this table must not carry a foreign key';
  END IF;
END
$$;

COMMIT;
