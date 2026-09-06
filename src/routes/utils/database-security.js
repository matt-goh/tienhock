/** Reject privileged production connections before accepting requests.
 * @param {{ query: Function }} pool @returns {Promise<void>}
 */
export async function assertProductionDatabaseRole(pool) {
  const result = await pool.query(`SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
    has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schemas,
    has_database_privilege(current_user, current_database(), 'TEMP') AS can_create_temporary_objects,
    EXISTS (SELECT FROM pg_auth_members WHERE member = r.oid) AS has_membership,
    EXISTS (SELECT FROM pg_database WHERE datname = current_database() AND datdba = r.oid) AS owns_database,
    EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relowner = r.oid AND n.nspname IN ('public', 'greentarget', 'jellypolly')) AS owns_objects,
    has_schema_privilege(current_user, 'public', 'CREATE') OR has_schema_privilege(current_user, 'greentarget', 'CREATE')
      OR has_schema_privilege(current_user, 'jellypolly', 'CREATE') AS can_create
    FROM pg_roles r WHERE rolname = current_user`);
  if (result.rows.length !== 1 || Object.values(result.rows[0]).some(Boolean)) {
    throw new Error('Production requires an unprivileged runtime database role. Follow docs/security/SECURITY_REMEDIATION_2026-09-05.md');
  }
}
