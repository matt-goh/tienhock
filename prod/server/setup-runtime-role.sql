\set ON_ERROR_STOP on
-- Run as postgres against tienhock_prod, during the security cutover.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'tienhock_prod' THEN RAISE EXCEPTION 'Expected tienhock_prod'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tienhock_app') THEN
    CREATE ROLE tienhock_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname IN ('public', 'greentarget', 'jellypolly')) THEN
    RAISE EXCEPTION 'Review SECURITY DEFINER functions before granting runtime access';
  END IF;
END $$;
ALTER ROLE tienhock_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 30;
ALTER ROLE tienhock_app SET statement_timeout = '5min';
ALTER ROLE tienhock_app SET idle_in_transaction_session_timeout = '5min';
REVOKE CREATE, TEMPORARY ON DATABASE tienhock_prod FROM PUBLIC;
GRANT CONNECT ON DATABASE tienhock_prod TO tienhock_app;
REVOKE CREATE ON SCHEMA public, greentarget, jellypolly FROM PUBLIC;
GRANT USAGE ON SCHEMA public, greentarget, jellypolly TO tienhock_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, greentarget, jellypolly TO tienhock_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, greentarget, jellypolly TO tienhock_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, greentarget, jellypolly TO tienhock_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, greentarget, jellypolly
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tienhock_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, greentarget, jellypolly
  GRANT USAGE, SELECT ON SEQUENCES TO tienhock_app;
COMMIT;
-- At an interactive psql prompt, run: \password tienhock_app
-- Then: ALTER ROLE tienhock_app LOGIN;
-- Store THAT password in GitHub's ERP_DB_PASSWORD secret, never the postgres password.
-- The deployment workflow writes it into the application's DB_PASSWORD variable.
