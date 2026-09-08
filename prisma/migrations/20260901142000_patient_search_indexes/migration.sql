-- Fast patient lookup by partial name / phone / document number.
--
-- Trigram indexes make `ILIKE '%termo%'` an index scan instead of a sequential
-- scan. The extension is optional: where it cannot be installed the migration
-- still succeeds and the queries simply fall back to the existing btree
-- indexes, so no environment is blocked by this.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm indisponivel; a saltar indices de trigrama';
    RETURN;
  END;

  CREATE INDEX IF NOT EXISTS "Patient_name_trgm_idx" ON "Patient" USING gin ("name" gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS "Patient_phone_trgm_idx" ON "Patient" USING gin ("phone" gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS "Patient_email_trgm_idx" ON "Patient" USING gin ("email" gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS "PatientIdentityDocument_number_trgm_idx"
    ON "PatientIdentityDocument" USING gin ("number" gin_trgm_ops);
END
$$;
