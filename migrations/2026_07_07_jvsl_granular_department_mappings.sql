-- JVSL now reproduces the legacy Journal Voucher 1:1: each department is booked by
-- component (Salary, Bonus, OT, RND, employer EPF/SOCSO/SIP), and Salesman / Ikut
-- Lori split their commission 50/50 into a MEE and a BIHUN account, with Ikut Lori's
-- "others" column on its own account. This registers the granular JVSL mappings the
-- new department model needs (the codes are editable afterwards on the Account Code
-- Mappings page). Idempotent.
-- Apply: docker exec -i tienhock_dev_db psql -U postgres -d tienhock < migrations/2026_07_07_jvsl_granular_department_mappings.sql

BEGIN;

INSERT INTO location_account_mappings
  (location_id, location_name, mapping_type, account_code, voucher_type, is_active)
VALUES
  -- Salesman (03): total commission booked 50/50 MEE / BIHUN
  ('03', 'Salesman',  'commission_mee', 'MS_SM',   'JVSL', true),
  ('03', 'Salesman',  'commission_bh',  'BS_SM',   'JVSL', true),
  -- Ikut Lori (04): 50/50 MEE / BIHUN, plus its commission column as "Others"
  ('04', 'Ikut Lori', 'commission_mee', 'MS_IL',   'JVSL', true),
  ('04', 'Ikut Lori', 'commission_bh',  'BS_IL',   'JVSL', true),
  ('04', 'Ikut Lori', 'others',         'MBS_ILO', 'JVSL', true),
  -- Ice-Polly jelly SALES carved out of the 50/50 split into its own line
  -- (Salesman -> Commission Jelly THJ_CK; Ikut Lori -> Salary Salesman (Jelly) THJ_SM)
  ('03', 'Salesman',  'commission_jelly', 'THJ_CK', 'JVSL', true),
  ('04', 'Ikut Lori', 'commission_jelly', 'THJ_SM', 'JVSL', true),
  -- Office (02): dedicated Bonus line (legacy prints "OFFICE (BONUS)")
  ('02', 'Office',    'bonus',          'MBS_O',   'JVSL', true)
ON CONFLICT (location_id, mapping_type, voucher_type) DO UPDATE
  SET account_code = EXCLUDED.account_code, is_active = true;

COMMIT;
