-- Make the audit trail append-only at the database level.
--
-- Nothing in the application layer (ORM, raw query, soft delete) can rewrite or
-- erase an AuditLog row: PostgreSQL rejects UPDATE and DELETE outright. Lifting
-- this requires an explicit, privileged DDL change that is itself visible in the
-- migration history.

CREATE OR REPLACE FUNCTION pulso_audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog e append-only: % nao e permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON "AuditLog";

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION pulso_audit_log_append_only();
