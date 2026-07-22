-- 2026-07-22: per-type product display ordering (products.sort_order)
--
-- products.sort_order (integer, NULL) is the explicit display order of a
-- product within its own type, shared by every product/production picker
-- (Production Entry selection, Product Stock picker, Production Records
-- filters, ProductSelector combobox). NULL = no explicit order; unordered
-- products keep the legacy prefix/alphabetical order after the ordered ones.
-- Managed via PUT /api/products/order and the Reorder modal on the Catalogue
-- Product page.
--
-- Seeds the requested default Mee order: 1-350G, 1-3UDG, 1-2UDG, 1-MNL first.

ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE products SET sort_order = 0 WHERE id = '1-350G' AND type = 'MEE' AND sort_order IS DISTINCT FROM 0;
UPDATE products SET sort_order = 1 WHERE id = '1-3UDG' AND type = 'MEE' AND sort_order IS DISTINCT FROM 1;
UPDATE products SET sort_order = 2 WHERE id = '1-2UDG' AND type = 'MEE' AND sort_order IS DISTINCT FROM 2;
UPDATE products SET sort_order = 3 WHERE id = '1-MNL'  AND type = 'MEE' AND sort_order IS DISTINCT FROM 3;
