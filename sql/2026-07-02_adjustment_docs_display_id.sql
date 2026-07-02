-- Add a user-facing document number for adjustment documents.
-- The existing id remains the unique internal row key; display_id is what
-- users see on forms, PDFs, and e-invoices.

ALTER TABLE adjustment_documents
  ADD COLUMN IF NOT EXISTS display_id VARCHAR;

UPDATE adjustment_documents
   SET display_id = id
 WHERE display_id IS NULL
   AND id LIKE 'TH-%';

CREATE UNIQUE INDEX IF NOT EXISTS idx_adj_docs_active_display_id
  ON adjustment_documents ((COALESCE(display_id, id)))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_adj_docs_display_id
  ON adjustment_documents ((COALESCE(display_id, id)));

ALTER TABLE jellypolly.adjustment_documents
  ADD COLUMN IF NOT EXISTS display_id VARCHAR;

UPDATE jellypolly.adjustment_documents
   SET display_id = id
 WHERE display_id IS NULL
   AND id LIKE 'JP-%';

CREATE UNIQUE INDEX IF NOT EXISTS idx_jp_adj_docs_active_display_id
  ON jellypolly.adjustment_documents ((COALESCE(display_id, id)))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_jp_adj_docs_display_id
  ON jellypolly.adjustment_documents ((COALESCE(display_id, id)));
