-- Valthoris Command Center — permissions and service-role RPCs
--
-- The `governance` schema is not exposed through PostgREST and the new tables
-- in `public` are only readable by an administrator. The browser therefore
-- reaches all of it exactly the way Phase 1 already does: through SECURITY
-- DEFINER wrappers in `public`, executable by `service_role` alone, called by
-- the `admin-api` Edge Function after it has authenticated the caller, checked
-- AAL2, resolved the administrator and decided RBAC.
--
-- The wrappers perform no authorization of their own — keeping them dumb keeps
-- the decision in one auditable place — but they do enforce the data rules
-- (enumerations, lengths, ranges, batch limits) so a mistake in the function
-- cannot write nonsense into the tables.
--
-- Counters are read from the real tables. A table that does not exist yet on a
-- given database reports NULL, which the UI renders as "sem dados" instead of
-- inventing a number. No example row is ever created.
--
-- Nothing existing is dropped: `governance_dashboard()` is replaced in place
-- and keeps every key it already returned.

-- ─── New permissions ─────────────────────────────────────────────────────────
--
-- `reports.*`, `threat_intel.*`, `users.read`, `audit.read` and `errors.read`
-- already exist and are reused as they are.

INSERT INTO governance.permissions (key, domain, description) VALUES
  ('blacklist.read',  'blacklist',  'Read the Valthoris blacklist.'),
  ('blacklist.write', 'blacklist',  'Add to or import into the Valthoris blacklist.'),
  ('reputation.read', 'reputation', 'Read entity reputation scores and their history.'),
  ('reputation.write','reputation', 'Change entity reputation scores.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO governance.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM governance.roles r
JOIN governance.permissions p ON p.key = ANY (
  CASE r.key
    WHEN 'SECURITY_ADMIN' THEN ARRAY[
      'blacklist.read', 'blacklist.write', 'reputation.read', 'reputation.write']
    WHEN 'DATA_ADMIN' THEN ARRAY[
      'blacklist.read', 'blacklist.write', 'reputation.read', 'reputation.write',
      'reports.read']
    WHEN 'AUDITOR' THEN ARRAY['blacklist.read', 'reputation.read']
    WHEN 'SUPPORT_ADMIN' THEN ARRAY['blacklist.read']
    ELSE ARRAY[]::TEXT[]
  END
)
ON CONFLICT DO NOTHING;

-- ─── Denúncias ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.governance_list_fraud_reports(
  p_limit    INT  DEFAULT 25,
  p_offset   INT  DEFAULT 0,
  p_search   TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_status   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
  -- Same shape as governance_list_audit_logs: one traversal produces both the
  -- page and the total, so the cost does not grow with the table.
  WITH page AS (
    SELECT r.id, r.created_at, r.category, r.target_type, r.target_value,
           r.description, r.status, r.severity, r.source, r.country, r.city,
           r.latitude, r.longitude,
           count(*) OVER () AS total_count
    FROM public.fraud_reports r
    WHERE (p_category IS NULL OR r.category = p_category)
      AND (p_status   IS NULL OR r.status   = p_status)
      AND (
        p_search IS NULL OR p_search = ''
        OR r.target_value ILIKE '%' || p_search || '%'
        OR COALESCE(r.description, '') ILIKE '%' || p_search || '%'
        OR COALESCE(r.city, '')        ILIKE '%' || p_search || '%'
        OR COALESCE(r.country, '')     ILIKE '%' || p_search || '%'
      )
    ORDER BY r.created_at DESC
    LIMIT  greatest(1, least(COALESCE(p_limit, 25), 200))
    OFFSET greatest(0, COALESCE(p_offset, 0))
  )
  SELECT jsonb_build_object(
    'total', COALESCE(
      (SELECT p.total_count FROM page p LIMIT 1),
      (SELECT count(*)
         FROM public.fraud_reports r
        WHERE (p_category IS NULL OR r.category = p_category)
          AND (p_status   IS NULL OR r.status   = p_status)
          AND (
            p_search IS NULL OR p_search = ''
            OR r.target_value ILIKE '%' || p_search || '%'
            OR COALESCE(r.description, '') ILIKE '%' || p_search || '%'
            OR COALESCE(r.city, '')        ILIKE '%' || p_search || '%'
            OR COALESCE(r.country, '')     ILIKE '%' || p_search || '%'
          ))
    ),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) - 'total_count' ORDER BY p.created_at DESC)
      FROM page p
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.governance_create_fraud_report(
  p_category     TEXT,
  p_target_type  TEXT,
  p_target_value TEXT,
  p_description  TEXT             DEFAULT NULL,
  p_severity     TEXT             DEFAULT 'UNKNOWN',
  p_status       TEXT             DEFAULT 'NEW',
  p_country      TEXT             DEFAULT NULL,
  p_city         TEXT             DEFAULT NULL,
  p_latitude     DOUBLE PRECISION DEFAULT NULL,
  p_longitude    DOUBLE PRECISION DEFAULT NULL,
  p_evidence     JSONB            DEFAULT '{}'::jsonb,
  p_source       TEXT             DEFAULT 'admin-center'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
DECLARE
  new_id UUID;
BEGIN
  -- A half-filled coordinate is not a location: it is dropped rather than
  -- stored as a point somewhere on the equator or the Greenwich meridian.
  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    p_latitude  := NULL;
    p_longitude := NULL;
  END IF;

  INSERT INTO public.fraud_reports (
    category, target_type, target_value, target_value_normalized, description,
    status, severity, source, country, city, latitude, longitude, evidence
  ) VALUES (
    p_category, p_target_type, p_target_value, lower(btrim(p_target_value)),
    nullif(btrim(COALESCE(p_description, '')), ''),
    COALESCE(nullif(p_status, ''), 'NEW'),
    COALESCE(nullif(p_severity, ''), 'UNKNOWN'),
    COALESCE(nullif(p_source, ''), 'admin-center'),
    nullif(btrim(COALESCE(p_country, '')), ''),
    nullif(btrim(COALESCE(p_city, '')), ''),
    p_latitude, p_longitude,
    COALESCE(p_evidence, '{}'::jsonb)
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('id', new_id);
END;
$$;

-- Only located reports: the map never plots a report that has no coordinates.
CREATE OR REPLACE FUNCTION public.governance_fraud_report_map(
  p_limit INT DEFAULT 500
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
  SELECT jsonb_build_object(
    'located', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT r.id, r.created_at, r.category, r.target_type, r.target_value,
               r.status, r.severity, r.country, r.city, r.latitude, r.longitude
        FROM public.fraud_reports r
        WHERE r.latitude IS NOT NULL AND r.longitude IS NOT NULL
        ORDER BY r.created_at DESC
        LIMIT greatest(1, least(COALESCE(p_limit, 500), 2000))
      ) x
    ), '[]'::jsonb),
    'totalReports', (SELECT count(*) FROM public.fraud_reports),
    'withoutLocation', (
      SELECT count(*) FROM public.fraud_reports
      WHERE latitude IS NULL OR longitude IS NULL
    )
  );
$$;

-- ─── Blacklist ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.governance_list_blacklist(
  p_limit    INT  DEFAULT 50,
  p_offset   INT  DEFAULT 0,
  p_category TEXT DEFAULT NULL,
  p_search   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
  WITH page AS (
    SELECT b.id, b.created_at, b.updated_at, b.category, b.value, b.reason,
           b.severity, b.source, b.active, b.expires_at,
           count(*) OVER () AS total_count
    FROM public.blacklist_entries b
    WHERE (p_category IS NULL OR b.category = p_category)
      AND (
        p_search IS NULL OR p_search = ''
        OR b.value ILIKE '%' || p_search || '%'
        OR COALESCE(b.reason, '') ILIKE '%' || p_search || '%'
      )
    ORDER BY b.created_at DESC
    LIMIT  greatest(1, least(COALESCE(p_limit, 50), 200))
    OFFSET greatest(0, COALESCE(p_offset, 0))
  )
  SELECT jsonb_build_object(
    'total', COALESCE(
      (SELECT p.total_count FROM page p LIMIT 1),
      (SELECT count(*)
         FROM public.blacklist_entries b
        WHERE (p_category IS NULL OR b.category = p_category)
          AND (
            p_search IS NULL OR p_search = ''
            OR b.value ILIKE '%' || p_search || '%'
            OR COALESCE(b.reason, '') ILIKE '%' || p_search || '%'
          ))
    ),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) - 'total_count' ORDER BY p.created_at DESC)
      FROM page p
    ), '[]'::jsonb),
    'byCategory', COALESCE((
      SELECT jsonb_object_agg(c.category, c.n)
      FROM (
        SELECT category, count(*) AS n
        FROM public.blacklist_entries
        GROUP BY category
      ) c
    ), '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.governance_add_blacklist_entry(
  p_category   TEXT,
  p_value      TEXT,
  p_reason     TEXT        DEFAULT NULL,
  p_severity   TEXT        DEFAULT 'MEDIUM',
  p_source     TEXT        DEFAULT 'manual',
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_admin_id   UUID        DEFAULT NULL,
  p_evidence   JSONB       DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
DECLARE
  new_id  UUID;
  existed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.blacklist_entries
    WHERE category = p_category AND value_normalized = lower(btrim(p_value))
  ) INTO existed;

  INSERT INTO public.blacklist_entries (
    category, value, value_normalized, reason, severity, source, expires_at,
    added_by_admin_id, evidence, active
  ) VALUES (
    p_category, p_value, lower(btrim(p_value)),
    nullif(btrim(COALESCE(p_reason, '')), ''),
    COALESCE(nullif(p_severity, ''), 'MEDIUM'),
    COALESCE(nullif(p_source, ''), 'manual'),
    p_expires_at, p_admin_id, COALESCE(p_evidence, '{}'::jsonb), true
  )
  ON CONFLICT (category, value_normalized) DO UPDATE SET
    reason     = COALESCE(EXCLUDED.reason, blacklist_entries.reason),
    severity   = EXCLUDED.severity,
    source     = EXCLUDED.source,
    expires_at = EXCLUDED.expires_at,
    evidence   = EXCLUDED.evidence,
    active     = true,
    updated_at = now()
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('id', new_id, 'updated', existed);
END;
$$;

-- Bulk import. The Edge Function hands over an already-parsed array (the CSV is
-- parsed in the browser), and this validates every row: a bad row is counted as
-- skipped and never aborts the batch.
CREATE OR REPLACE FUNCTION public.governance_import_blacklist(
  p_entries  JSONB,
  p_source   TEXT DEFAULT 'import',
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
DECLARE
  entry      JSONB;
  v_category TEXT;
  v_value    TEXT;
  v_severity TEXT;
  inserted   INT := 0;
  updated    INT := 0;
  skipped    INT := 0;
  processed  INT := 0;
  existed    BOOLEAN;
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RETURN jsonb_build_object(
      'inserted', 0, 'updated', 0, 'skipped', 0, 'processed', 0);
  END IF;

  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    -- A hard ceiling per call; the caller sends further rows in another batch.
    EXIT WHEN processed >= 5000;
    processed := processed + 1;

    v_category := upper(btrim(COALESCE(entry ->> 'category', '')));
    v_value    := btrim(COALESCE(entry ->> 'value', ''));
    v_severity := upper(btrim(COALESCE(entry ->> 'severity', 'MEDIUM')));

    IF v_category NOT IN ('IP','PHONE','EMAIL','CRYPTO','IBAN','DOMAIN','OTHER')
       OR v_value = '' OR length(v_value) > 512 THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    IF v_severity NOT IN ('LOW','MEDIUM','HIGH','CRITICAL') THEN
      v_severity := 'MEDIUM';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.blacklist_entries
      WHERE category = v_category AND value_normalized = lower(v_value)
    ) INTO existed;

    INSERT INTO public.blacklist_entries (
      category, value, value_normalized, reason, severity, source,
      added_by_admin_id, active
    ) VALUES (
      v_category, v_value, lower(v_value),
      nullif(left(btrim(COALESCE(entry ->> 'reason', '')), 2000), ''),
      v_severity, COALESCE(nullif(p_source, ''), 'import'), p_admin_id, true
    )
    ON CONFLICT (category, value_normalized) DO UPDATE SET
      reason     = COALESCE(EXCLUDED.reason, blacklist_entries.reason),
      severity   = EXCLUDED.severity,
      source     = EXCLUDED.source,
      active     = true,
      updated_at = now();

    IF existed THEN
      updated := updated + 1;
    ELSE
      inserted := inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', inserted, 'updated', updated,
    'skipped', skipped, 'processed', processed);
END;
$$;

-- ─── Reputação de entidades ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.governance_list_entity_reputation(
  p_limit       INT  DEFAULT 50,
  p_offset      INT  DEFAULT 0,
  p_entity_type TEXT DEFAULT NULL,
  p_search      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
  WITH page AS (
    SELECT e.id, e.entity_type, e.entity_value, e.score, e.level, e.signals,
           e.computed_at, e.created_at, e.updated_at,
           count(*) OVER () AS total_count
    FROM public.entity_reputation e
    WHERE (p_entity_type IS NULL OR e.entity_type = p_entity_type)
      AND (
        p_search IS NULL OR p_search = ''
        OR e.entity_value ILIKE '%' || p_search || '%'
      )
    ORDER BY e.score ASC, e.updated_at DESC
    LIMIT  greatest(1, least(COALESCE(p_limit, 50), 200))
    OFFSET greatest(0, COALESCE(p_offset, 0))
  )
  SELECT jsonb_build_object(
    'total', COALESCE(
      (SELECT p.total_count FROM page p LIMIT 1),
      (SELECT count(*)
         FROM public.entity_reputation e
        WHERE (p_entity_type IS NULL OR e.entity_type = p_entity_type)
          AND (
            p_search IS NULL OR p_search = ''
            OR e.entity_value ILIKE '%' || p_search || '%'
          ))
    ),
    'items', COALESCE((
      SELECT jsonb_agg(
        (to_jsonb(p) - 'total_count') || jsonb_build_object(
          'history', COALESCE((
            SELECT jsonb_agg(to_jsonb(h) ORDER BY h.occurred_at DESC)
            FROM (
              SELECT hh.occurred_at, hh.previous_score, hh.new_score,
                     hh.previous_level, hh.new_level, hh.reason,
                     hh.actor_admin_email
              FROM public.entity_reputation_history hh
              WHERE hh.reputation_id = p.id
              ORDER BY hh.occurred_at DESC
              LIMIT 20
            ) h
          ), '[]'::jsonb)
        )
        ORDER BY p.score ASC, p.updated_at DESC
      )
      FROM page p
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.governance_upsert_entity_reputation(
  p_entity_type  TEXT,
  p_entity_value TEXT,
  p_score        INT,
  p_level        TEXT  DEFAULT NULL,
  p_reason       TEXT  DEFAULT NULL,
  p_actor_email  TEXT  DEFAULT NULL,
  p_signals      JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
DECLARE
  v_level    TEXT;
  v_id       UUID;
  old_score  INT;
  old_level  TEXT;
BEGIN
  -- The level is derived from the score unless one was explicitly given, so a
  -- row can never carry a level that contradicts its own number.
  v_level := COALESCE(nullif(p_level, ''), CASE
    WHEN p_score >= 80 THEN 'TRUSTED'
    WHEN p_score >= 60 THEN 'NEUTRAL'
    WHEN p_score >= 30 THEN 'SUSPICIOUS'
    ELSE 'DANGEROUS'
  END);

  SELECT e.id, e.score, e.level INTO v_id, old_score, old_level
  FROM public.entity_reputation e
  WHERE e.entity_type = p_entity_type
    AND e.entity_value_normalized = lower(btrim(p_entity_value));

  INSERT INTO public.entity_reputation (
    entity_type, entity_value, entity_value_normalized, score, level, signals,
    computed_at
  ) VALUES (
    p_entity_type, p_entity_value, lower(btrim(p_entity_value)),
    p_score, v_level, COALESCE(p_signals, '{}'::jsonb), now()
  )
  ON CONFLICT (entity_type, entity_value_normalized) DO UPDATE SET
    score       = EXCLUDED.score,
    level       = EXCLUDED.level,
    signals     = EXCLUDED.signals,
    computed_at = now(),
    updated_at  = now()
  RETURNING id INTO v_id;

  INSERT INTO public.entity_reputation_history (
    reputation_id, previous_score, new_score, previous_level, new_level,
    reason, actor_admin_email, signals
  ) VALUES (
    v_id, old_score, p_score, old_level, v_level,
    nullif(btrim(COALESCE(p_reason, '')), ''), lower(p_actor_email),
    COALESCE(p_signals, '{}'::jsonb)
  );

  RETURN jsonb_build_object('id', v_id, 'level', v_level, 'created', old_score IS NULL);
END;
$$;

-- ─── Threat Intelligence ─────────────────────────────────────────────────────
--
-- Indicators aggregated by type, counted from this project's own tables. There
-- is no external feed behind this: a type with no rows reports zero and the UI
-- shows it as empty.

CREATE OR REPLACE FUNCTION public.governance_threat_intel_summary()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
  WITH kinds(key, label, report_categories, blacklist_category, entity_type) AS (
    VALUES
      ('phone_scam',        'Scam telefónico',   ARRAY['PHONE_SCAM','SMISHING'],              'PHONE',  'PHONE'),
      ('phishing',          'Phishing',          ARRAY['PHISHING'],                           'EMAIL',  'EMAIL'),
      ('fraudulent_url',    'URLs fraudulentos', ARRAY['FRAUDULENT_URL'],                     'OTHER',  'URL'),
      ('malicious_ip',      'IPs maliciosos',    ARRAY['MALICIOUS_IP'],                       'IP',     'IP'),
      ('suspicious_domain', 'Domínios suspeitos',ARRAY['SUSPICIOUS_DOMAIN'],                  'DOMAIN', 'DOMAIN'),
      ('crypto_fraud',      'Cripto fraude',     ARRAY['CRYPTO_FRAUD'],                       'CRYPTO', 'CRYPTO'),
      ('suspicious_iban',   'IBAN suspeito',     ARRAY['SUSPICIOUS_IBAN','BANK_FRAUD'],       'IBAN',   'IBAN'),
      ('romance_scam',      'Romance scam',      ARRAY['ROMANCE_SCAM'],                       'OTHER',  'OTHER')
  )
  SELECT jsonb_build_object(
    'generatedAt', now(),
    'indicators', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.total DESC, x.label)
      FROM (
        SELECT
          k.key,
          k.label,
          (SELECT count(*) FROM public.fraud_reports r
            WHERE r.category = ANY (k.report_categories)) AS reports,
          (SELECT count(*) FROM public.fraud_reports r
            WHERE r.category = ANY (k.report_categories)
              AND r.created_at > now() - INTERVAL '7 days')  AS reports7d,
          (SELECT count(*) FROM public.fraud_reports r
            WHERE r.category = ANY (k.report_categories)
              AND r.status = 'CONFIRMED')                    AS confirmed,
          (SELECT count(*) FROM public.blacklist_entries b
            WHERE b.category = k.blacklist_category AND b.active) AS blacklisted,
          (SELECT count(*) FROM public.entity_reputation e
            WHERE e.entity_type = k.entity_type
              AND e.level IN ('SUSPICIOUS', 'DANGEROUS'))    AS "flaggedEntities",
          (
            (SELECT count(*) FROM public.fraud_reports r
              WHERE r.category = ANY (k.report_categories))
            + (SELECT count(*) FROM public.blacklist_entries b
                WHERE b.category = k.blacklist_category AND b.active)
          ) AS total
        FROM kinds k
      ) x
    ), '[]'::jsonb)
  );
$$;

-- ─── Monitorização global ────────────────────────────────────────────────────
--
-- A single recent-activity feed built from what already exists: the audit trail
-- and the technical error log.

CREATE OR REPLACE FUNCTION public.governance_recent_events(
  p_limit INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
  SELECT jsonb_build_object(
    'generatedAt', now(),
    'events', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC)
      FROM (
        SELECT * FROM (
          SELECT 'AUDIT'::TEXT   AS kind,
                 l.occurred_at,
                 l.action        AS title,
                 l.actor_email   AS actor,
                 l.result        AS state,
                 l.reason        AS detail
          FROM governance.audit_logs l
          UNION ALL
          SELECT 'ERROR'::TEXT,
                 e.occurred_at,
                 e.message,
                 e.actor_email,
                 e.severity,
                 e.source
          FROM governance.error_logs e
        ) u
        ORDER BY u.occurred_at DESC
        LIMIT greatest(1, least(COALESCE(p_limit, 60), 200))
      ) x
    ), '[]'::jsonb),
    'counters', jsonb_build_object(
      'audit24h',  (SELECT count(*) FROM governance.audit_logs
                     WHERE occurred_at > now() - INTERVAL '24 hours'),
      'denied24h', (SELECT count(*) FROM governance.audit_logs
                     WHERE result = 'DENIED' AND occurred_at > now() - INTERVAL '24 hours'),
      'errors24h', (SELECT count(*) FROM governance.error_logs
                     WHERE occurred_at > now() - INTERVAL '24 hours')
    )
  );
$$;

-- ─── Gestão de administradores e utilizadores ────────────────────────────────
--
-- The administrators come from `governance.admins`, which the Phase 1 page
-- already reads; this adds the platform accounts next to them so both live in
-- one section. Only account-level facts are returned — never a password hash,
-- never a token, never bulk personal data.

CREATE OR REPLACE FUNCTION public.governance_list_platform_users(
  p_limit  INT  DEFAULT 50,
  p_offset INT  DEFAULT 0,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
  WITH page AS (
    SELECT u.id, u.email, u.created_at, u.last_sign_in_at,
           (u.email_confirmed_at IS NOT NULL) AS confirmed,
           EXISTS (SELECT 1 FROM governance.admins a WHERE a.user_id = u.id) AS is_admin,
           count(*) OVER () AS total_count
    FROM auth.users u
    WHERE (
      p_search IS NULL OR p_search = ''
      OR COALESCE(u.email, '') ILIKE '%' || p_search || '%'
    )
    ORDER BY u.created_at DESC
    LIMIT  greatest(1, least(COALESCE(p_limit, 50), 200))
    OFFSET greatest(0, COALESCE(p_offset, 0))
  )
  SELECT jsonb_build_object(
    'total', COALESCE(
      (SELECT p.total_count FROM page p LIMIT 1),
      (SELECT count(*) FROM auth.users u
        WHERE (p_search IS NULL OR p_search = ''
               OR COALESCE(u.email, '') ILIKE '%' || p_search || '%'))
    ),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) - 'total_count' ORDER BY p.created_at DESC)
      FROM page p
    ), '[]'::jsonb),
    'counters', jsonb_build_object(
      'total',     (SELECT count(*) FROM auth.users),
      'new7d',     (SELECT count(*) FROM auth.users WHERE created_at > now() - INTERVAL '7 days'),
      'confirmed', (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL),
      'admins',    (SELECT count(*) FROM governance.admins),
      'profiles',  (SELECT count(*) FROM public.profiles)
    )
  );
$$;

-- ─── Estatísticas ────────────────────────────────────────────────────────────
--
-- Real counts of the tables this project actually has. A table that is absent
-- on a given database reports NULL and the UI shows "sem dados" — never a
-- fabricated number, and never a number from anywhere but this Supabase.

CREATE OR REPLACE FUNCTION public.governance_command_center_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, governance, pg_temp
AS $$
DECLARE
  tables TEXT[] := ARRAY[
    'public.fraud_reports', 'public.blacklist_entries', 'public.entity_reputation',
    'public.entity_reputation_history', 'public.fraud_events', 'public.fraud_decisions',
    'public.fraud_workflow_runs', 'public.profiles', 'public.notifications',
    'public.waiting_list', 'public.safe_rooms', 'public.safe_room_messages',
    'public.cached_news', 'governance.admins', 'governance.roles',
    'governance.audit_logs', 'governance.error_logs'
  ];
  t       TEXT;
  n       BIGINT;
  counts  JSONB := '{}'::jsonb;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(t) IS NULL THEN
      counts := counts || jsonb_build_object(t, NULL::BIGINT);
    ELSE
      EXECUTE format('SELECT count(*) FROM %s', t) INTO n;
      counts := counts || jsonb_build_object(t, n);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'generatedAt', now(),
    'tables', counts,
    'reports', jsonb_build_object(
      'total',     (SELECT count(*) FROM public.fraud_reports),
      'last7d',    (SELECT count(*) FROM public.fraud_reports
                     WHERE created_at > now() - INTERVAL '7 days'),
      'confirmed', (SELECT count(*) FROM public.fraud_reports WHERE status = 'CONFIRMED'),
      'located',   (SELECT count(*) FROM public.fraud_reports
                     WHERE latitude IS NOT NULL AND longitude IS NOT NULL)
    ),
    'blacklist', jsonb_build_object(
      'total',  (SELECT count(*) FROM public.blacklist_entries),
      'active', (SELECT count(*) FROM public.blacklist_entries WHERE active)
    ),
    'reputation', jsonb_build_object(
      'total',   (SELECT count(*) FROM public.entity_reputation),
      'flagged', (SELECT count(*) FROM public.entity_reputation
                   WHERE level IN ('SUSPICIOUS', 'DANGEROUS'))
    ),
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM auth.users),
      'new7d', (SELECT count(*) FROM auth.users WHERE created_at > now() - INTERVAL '7 days')
    )
  );
END;
$$;

-- ─── The Phase 1 dashboard, extended ─────────────────────────────────────────
--
-- Replaced in place; every key it already returned is still returned, so the
-- existing dashboard page keeps working unchanged. The new keys are read from
-- the new tables when they exist and are NULL otherwise.

CREATE OR REPLACE FUNCTION public.governance_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
DECLARE
  -- Deliberately not named `result`: `audit_logs.result` is a column and the
  -- reference inside the query below would be ambiguous.
  payload           JSONB;
  users_total       BIGINT;
  users_new         BIGINT;
  reports_total     BIGINT := NULL;
  reports_7d        BIGINT := NULL;
  blacklist_total   BIGINT := NULL;
  reputation_total  BIGINT := NULL;
BEGIN
  SELECT count(*) INTO users_total FROM auth.users;
  SELECT count(*) INTO users_new   FROM auth.users WHERE created_at > now() - INTERVAL '7 days';

  IF to_regclass('public.fraud_reports') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.fraud_reports' INTO reports_total;
    EXECUTE 'SELECT count(*) FROM public.fraud_reports WHERE created_at > now() - INTERVAL ''7 days'''
      INTO reports_7d;
  END IF;
  IF to_regclass('public.blacklist_entries') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.blacklist_entries WHERE active' INTO blacklist_total;
  END IF;
  IF to_regclass('public.entity_reputation') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.entity_reputation' INTO reputation_total;
  END IF;

  payload := jsonb_build_object(
    'generatedAt', now(),
    'users', jsonb_build_object('total', users_total, 'new7d', users_new),
    'administration', jsonb_build_object(
      'admins',      (SELECT count(*) FROM governance.admins),
      'root',        (SELECT count(*) FROM governance.admins WHERE is_root),
      'mfaRequired', (SELECT count(*) FROM governance.admins WHERE mfa_required),
      'roles',       (SELECT count(*) FROM governance.roles)
    ),
    'audit', jsonb_build_object(
      'total',   (SELECT count(*) FROM governance.audit_logs),
      'last24h', (SELECT count(*) FROM governance.audit_logs WHERE occurred_at > now() - INTERVAL '24 hours'),
      'denied7d',(SELECT count(*) FROM governance.audit_logs WHERE result = 'DENIED' AND occurred_at > now() - INTERVAL '7 days')
    ),
    'errors', jsonb_build_object(
      'total',   (SELECT count(*) FROM governance.error_logs),
      'last24h', (SELECT count(*) FROM governance.error_logs WHERE occurred_at > now() - INTERVAL '24 hours')
    ),
    'reports', jsonb_build_object('total', reports_total, 'last7d', reports_7d),
    'blacklist', jsonb_build_object('active', blacklist_total),
    'reputation', jsonb_build_object('total', reputation_total)
  );

  RETURN payload;
END;
$$;

-- ─── Privileges ──────────────────────────────────────────────────────────────
--
-- Exactly the Phase 1 rule: nobody but the service role may execute any of
-- these, so holding the anon key (or any user JWT) is worthless.

DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.governance_list_fraud_reports(INT, INT, TEXT, TEXT, TEXT)',
    'public.governance_create_fraud_report(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, JSONB, TEXT)',
    'public.governance_fraud_report_map(INT)',
    'public.governance_list_blacklist(INT, INT, TEXT, TEXT)',
    'public.governance_add_blacklist_entry(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, JSONB)',
    'public.governance_import_blacklist(JSONB, TEXT, UUID)',
    'public.governance_list_entity_reputation(INT, INT, TEXT, TEXT)',
    'public.governance_upsert_entity_reputation(TEXT, TEXT, INT, TEXT, TEXT, TEXT, JSONB)',
    'public.governance_threat_intel_summary()',
    'public.governance_recent_events(INT)',
    'public.governance_list_platform_users(INT, INT, TEXT)',
    'public.governance_command_center_stats()',
    'public.governance_dashboard()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
