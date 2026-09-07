\set ON_ERROR_STOP on
-- Run as postgres against tienhock_prod. No business rows or employee passwords change.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'tienhock_prod' THEN RAISE EXCEPTION 'Expected tienhock_prod'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tienhock_restore') THEN
    CREATE ROLE tienhock_restore LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'tienhock_restore' AND
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
               WHERE r.rolname='tienhock_restore') THEN
    RAISE EXCEPTION 'Unexpected privileges on restore role';
  END IF;
END $$;
-- Local peer authentication by the dedicated OS user; no credential in the app.
ALTER ROLE tienhock_restore PASSWORD NULL;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE tienhock_prod TO tienhock_restore;
COMMIT;
