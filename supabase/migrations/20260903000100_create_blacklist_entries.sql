-- Valthoris Command Center — `public.blacklist_entries`
--
-- The table behind the "Blacklist" section. It holds only what an administrator
-- of this project puts there, by hand or through the CSV / JSON bulk import;
-- nothing is fetched from an external feed and no example row is seeded.
--
-- The unique key `(category, value_normalized)` is what makes the bulk import
-- idempotent: re-importing the same file updates the rows instead of
-- duplicating them.
--
-- Nothing existing is modified or dropped; the migration is idempotent.

CREATE TABLE IF NOT EXISTS public.blacklist_entries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  category         TEXT        NOT NULL,
  value            TEXT        NOT NULL,
  -- Lower-cased, trimmed form; the trigger below keeps it in step with `value`.
  value_normalized TEXT        NOT NULL,

  reason           TEXT,
  severity         TEXT        NOT NULL DEFAULT 'MEDIUM',
  -- Provenance of the row inside Valthoris ('manual', 'import', 'report', …).
  source           TEXT        NOT NULL DEFAULT 'manual',
  evidence         JSONB       NOT NULL DEFAULT '{}'::jsonb,

  active           BOOLEAN     NOT NULL DEFAULT true,
  expires_at       TIMESTAMPTZ,

  -- The administrator who added it, when the write came from the Command
  -- Center. `governance.admins` is never deleted from, so this is stable.
  added_by_admin_id UUID,

  CONSTRAINT blacklist_entries_category_valid CHECK (category IN (
    'IP', 'PHONE', 'EMAIL', 'CRYPTO', 'IBAN', 'DOMAIN', 'OTHER'
  )),
  CONSTRAINT blacklist_entries_severity_valid CHECK (severity IN (
    'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  )),
  CONSTRAINT blacklist_entries_value_length CHECK (length(value) BETWEEN 1 AND 512),
  CONSTRAINT blacklist_entries_reason_length CHECK (
    reason IS NULL OR length(reason) <= 2000
  )
);

-- The foreign key is added separately: the `governance` schema is created by
-- another migration and the migrations are applied one file at a time.
DO $$
BEGIN
  IF to_regclass('governance.admins') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'blacklist_entries_added_by_admin_fk'
          AND conrelid = 'public.blacklist_entries'::regclass
     ) THEN
    EXECUTE '
      ALTER TABLE public.blacklist_entries
        ADD CONSTRAINT blacklist_entries_added_by_admin_fk
        FOREIGN KEY (added_by_admin_id)
        REFERENCES governance.admins(id) ON DELETE SET NULL';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS blacklist_entries_unique_value_idx
  ON public.blacklist_entries (category, value_normalized);
CREATE INDEX IF NOT EXISTS blacklist_entries_category_idx
  ON public.blacklist_entries (category, created_at DESC);
CREATE INDEX IF NOT EXISTS blacklist_entries_active_idx
  ON public.blacklist_entries (active, created_at DESC);

CREATE OR REPLACE FUNCTION public.blacklist_entries_normalize()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.value            := btrim(NEW.value);
  NEW.value_normalized := lower(btrim(NEW.value));
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blacklist_entries_normalize_trg ON public.blacklist_entries;
CREATE TRIGGER blacklist_entries_normalize_trg
  BEFORE INSERT OR UPDATE ON public.blacklist_entries
  FOR EACH ROW EXECUTE FUNCTION public.blacklist_entries_normalize();

ALTER TABLE public.blacklist_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blacklist_entries_service_role_all" ON public.blacklist_entries;
CREATE POLICY "blacklist_entries_service_role_all"
  ON public.blacklist_entries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- The blacklist is administrative data: an ordinary account reads none of it.
DO $$
BEGIN
  IF to_regprocedure('governance.is_admin()') IS NOT NULL
     AND to_regprocedure('governance.has_permission(text)') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "blacklist_entries_admin_read" ON public.blacklist_entries';
    EXECUTE $policy$
      CREATE POLICY "blacklist_entries_admin_read"
        ON public.blacklist_entries
        FOR SELECT
        TO authenticated
        USING (governance.is_admin() AND governance.has_permission('blacklist.read'))
    $policy$;
  END IF;
END $$;

REVOKE ALL ON public.blacklist_entries FROM anon, authenticated;
GRANT SELECT ON public.blacklist_entries TO authenticated;
GRANT ALL    ON public.blacklist_entries TO service_role;

COMMENT ON TABLE public.blacklist_entries IS
  'Valthoris blacklist: IP / phone / e-mail / crypto / IBAN / domain / other. '
  'Filled by administrators of this project only, by hand or by CSV/JSON import.';
