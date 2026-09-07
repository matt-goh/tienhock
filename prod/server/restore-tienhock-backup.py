#!/usr/bin/python3 -I
"""Fixed production restore entry point; install root-owned, never run from Git via sudo."""

from __future__ import annotations

import fcntl
import os
from pathlib import Path
import pwd
import re
import signal
import stat
import subprocess
import sys
import tempfile
from typing import BinaryIO


DATABASE: str = "tienhock_prod"
BACKUP_DIRECTORY: Path = Path("/var/backups/postgres/production")
RECOVERY_DIRECTORY: Path = Path("/var/lib/tienhock-restore")
RESTORE_USER: str = "tienhock_restore"
SCHEMAS: str = "'public', 'greentarget', 'jellypolly'"
TIMEOUT_SECONDS: int = 12 * 60
MAX_BACKUP_BYTES: int = 2 * 1024 * 1024 * 1024


def run_tool(args: list[str], user: str, *, input_text: str | None = None,
             output: BinaryIO | int = subprocess.DEVNULL) -> None:
    """Use peer authentication and a clean environment under an unprivileged OS user."""
    account: pwd.struct_passwd = pwd.getpwnam(user)
    process: subprocess.Popen[bytes] = subprocess.Popen(
        args, stdin=subprocess.PIPE if input_text is not None else subprocess.DEVNULL,
        stdout=output, stderr=subprocess.PIPE, cwd="/", user=account.pw_uid,
        group=account.pw_gid, extra_groups=[], start_new_session=True,
        env={"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "LANG": "C.UTF-8",
             "PGAPPNAME": "tienhock_backup_restore", "PGCONNECT_TIMEOUT": "10"},
    )
    try:
        _, stderr = process.communicate(
            input_text.encode("utf-8") if input_text is not None else None,
            timeout=TIMEOUT_SECONDS,
        )
    except BaseException:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
        raise
    if process.returncode != 0:
        # COPY errors can include business data. Keep details outside application logs.
        error_path: Path = RECOVERY_DIRECTORY / "last-error.log"
        error_path.write_bytes(stderr[-100_000:])
        error_path.chmod(0o600)
        raise RuntimeError(f"{Path(args[0]).name} failed; see the private restore log")


def psql_args(database: str, user: str) -> list[str]:
    return ["/usr/bin/psql", "-X", "--no-password", "--host=/var/run/postgresql",
            "--port=5432", f"--username={user}", f"--dbname={database}",
            "--set=ON_ERROR_STOP=1"]


def prepare_ownership(database: str) -> None:
    """Only application-schema objects move to the restore owner; no shared objects."""
    sql: str = f"""
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $ownership$
DECLARE object record;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '{RESTORE_USER}' AND
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
     OR EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
                WHERE r.rolname = '{RESTORE_USER}') THEN
    RAISE EXCEPTION 'Restore role must not have cluster administration powers';
  END IF;
  FOR object IN SELECT nspname FROM pg_namespace WHERE nspname IN ({SCHEMAS}) LOOP
    EXECUTE format('ALTER SCHEMA %I OWNER TO {RESTORE_USER}', object.nspname);
  END LOOP;
  FOR object IN SELECT n.nspname, c.relname, c.relkind FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ({SCHEMAS}) AND c.relkind IN ('r','p','v','m','S')
      ORDER BY (c.relkind = 'S') LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO {RESTORE_USER}',
      CASE object.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, object.nspname, object.relname);
  END LOOP;
  FOR object IN SELECT p.oid::regprocedure AS name, p.prokind FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ({SCHEMAS}) LOOP
    EXECUTE format('ALTER %s %s OWNER TO {RESTORE_USER}',
      CASE object.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE'
        ELSE 'FUNCTION' END, object.name);
  END LOOP;
  FOR object IN SELECT n.nspname, t.typname, t.typtype FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname IN ({SCHEMAS}) AND t.typtype IN ('e','d') LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO {RESTORE_USER}',
      CASE object.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END,
      object.nspname, object.typname);
  END LOOP;
  EXECUTE format('GRANT CONNECT, CREATE, TEMPORARY ON DATABASE %I TO {RESTORE_USER}', current_database());
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC, tienhock_app', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO tienhock_app', current_database());
END $ownership$;
COMMIT;
"""
    run_tool(psql_args(database, "postgres"), "postgres", input_text=sql)


POST_RESTORE_SQL: str = f"""
SET search_path = pg_catalog;
DO $validation$
BEGIN
  IF (SELECT count(*) FROM pg_namespace WHERE nspname IN ({SCHEMAS})) <> 3
    OR to_regclass('public.active_sessions') IS NULL
    OR to_regclass('public.staffs') IS NULL
    OR to_regclass('public.invoices') IS NULL
    OR to_regclass('public.journal_entries') IS NULL
    OR to_regclass('greentarget.customers') IS NULL
    OR to_regclass('jellypolly.invoices') IS NULL THEN
    RAISE EXCEPTION 'Backup is missing required application structures';
  END IF;
  IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ({SCHEMAS})
      AND (p.prosecdef OR p.proleakproof OR NOT l.lanpltrusted)) THEN
    RAISE EXCEPTION 'Backup contains privileged routines';
  END IF;
  IF has_database_privilege('tienhock_app', current_database(), 'CREATE')
    OR has_database_privilege('tienhock_app', current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION 'Runtime database privileges must remain restricted';
  END IF;
END $validation$;
DELETE FROM public.active_sessions;
REVOKE CREATE ON SCHEMA public, greentarget, jellypolly FROM PUBLIC, tienhock_app;
GRANT USAGE ON SCHEMA public, greentarget, jellypolly TO tienhock_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, greentarget, jellypolly TO tienhock_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, greentarget, jellypolly TO tienhock_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, greentarget, jellypolly TO tienhock_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public, greentarget, jellypolly
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tienhock_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public, greentarget, jellypolly
  GRANT USAGE, SELECT ON SEQUENCES TO tienhock_app;
"""


def copy_backup(filename: str, directory: Path, destination: Path) -> None:
    """Walk by directory descriptors; reject links, special files and oversized input."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.gz", filename) or ".." in filename:
        raise ValueError("Invalid backup filename")
    directory_fd: int = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in directory.parts[1:]:
            next_fd: int = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                   dir_fd=directory_fd)
            os.close(directory_fd)
            directory_fd = next_fd
        source_fd: int = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                                 dir_fd=directory_fd)
        with os.fdopen(source_fd, "rb") as source:
            info: os.stat_result = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not 0 < info.st_size <= MAX_BACKUP_BYTES:
                raise ValueError("Backup must be a regular file of at most 2 GiB")
            with destination.open("xb") as target:
                remaining: int = MAX_BACKUP_BYTES + 1
                while remaining > 0:
                    chunk: bytes = source.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    target.write(chunk)
                    remaining -= len(chunk)
                if remaining == 0:
                    raise ValueError("Backup exceeds the size limit")
    finally:
        os.close(directory_fd)


def restore_backup(filename: str, database: str = DATABASE,
                   backup_directory: Path = BACKUP_DIRECTORY) -> None:
    """The CLI supplies only a filename; alternate targets are for isolated operator tests."""
    restore_account: pwd.struct_passwd = pwd.getpwnam(RESTORE_USER)
    with tempfile.TemporaryDirectory(prefix="job-", dir=RECOVERY_DIRECTORY) as work:
        work_path: Path = Path(work)
        os.chown(work, 0, restore_account.pw_gid)
        work_path.chmod(0o750)
        archive: Path = work_path / "selected.dump"
        copy_backup(filename, backup_directory, archive)
        os.chown(archive, 0, restore_account.pw_gid)
        archive.chmod(0o640)
        run_tool(["/usr/bin/pg_restore", "--list", str(archive)], RESTORE_USER)

        # Root-only recovery copy is outside the app's writable backup directory.
        recovery_fd: int
        recovery_name: str
        recovery_fd, recovery_name = tempfile.mkstemp(prefix="before-restore-", suffix=".dump.partial",
                                                       dir=RECOVERY_DIRECTORY)
        with os.fdopen(recovery_fd, "wb") as recovery:
            run_tool(["/usr/bin/pg_dump", "--host=/var/run/postgresql", "--port=5432",
                      "--username=postgres", f"--dbname={database}", "--format=custom",
                      "--exclude-table-data=public.active_sessions"], "postgres", output=recovery)
        Path(recovery_name).rename(recovery_name.removesuffix(".partial"))
        prepare_ownership(database)

        sql_path: Path = work_path / "restore.sql"
        with sql_path.open("xb") as sql_file:
            run_tool(["/usr/bin/pg_restore", "--clean", "--if-exists", "--no-owner",
                      "--no-privileges", "--no-comments", "--file=-", str(archive)],
                     RESTORE_USER, output=sql_file)
        os.chown(sql_path, 0, restore_account.pw_gid)
        sql_path.chmod(0o640)
        grants_path: Path = work_path / "runtime-access.sql"
        grants_path.write_text(POST_RESTORE_SQL, encoding="utf-8")
        os.chown(grants_path, 0, restore_account.pw_gid)
        grants_path.chmod(0o640)
        run_tool(psql_args(database, RESTORE_USER) + ["--single-transaction",
                 f"--file={sql_path}", f"--file={grants_path}"], RESTORE_USER)


def interrupted(signum: int, frame: object) -> None:
    raise RuntimeError(f"Restore interrupted by signal {signum}")


def main() -> None:
    if os.geteuid() != 0 or len(sys.argv) != 2:
        raise ValueError("Use the installed restore helper with one backup filename")
    RECOVERY_DIRECTORY.mkdir(mode=0o711, parents=True, exist_ok=True)
    RECOVERY_DIRECTORY.chmod(0o711)
    os.umask(0o077)
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, interrupted)
    with (RECOVERY_DIRECTORY / "operation.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if sys.argv[1] == "--check":
            run_tool(psql_args(DATABASE, RESTORE_USER), RESTORE_USER, input_text="SELECT 1;")
        else:
            restore_backup(sys.argv[1])
    print("Restore helper check passed" if sys.argv[1] == "--check" else "Database restore completed")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
