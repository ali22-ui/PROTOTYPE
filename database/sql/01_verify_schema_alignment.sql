-- ============================================
-- Verify Schema Alignment (Read-Only)
-- ============================================
-- Run after executing:
-- 1) database/migration/001_unified_schema.sql
-- 2) database/seeds/001_initial_data.sql
-- Critical tables expected by backend/runtime compatibility paths
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'enterprises',
    'enterprise_profiles',
    'reporting_windows',
    'report_submissions',
    'system_settings',
    'detection_events',
    'visitor_statistics'
  )
ORDER BY table_name;
-- Validate critical columns
SELECT table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (
      table_name = 'enterprise_profiles'
      AND column_name IN (
        'id',
        'business_permit_number',
        'owner_name',
        'owner_contact',
        'description',
        'logo_url',
        'settings'
      )
    )
    OR (
      table_name = 'reporting_windows'
      AND column_name IN (
        'enterprise_id',
        'period',
        'status',
        'opened_at',
        'updated_at'
      )
    )
    OR (
      table_name = 'report_submissions'
      AND column_name IN (
        'id',
        'enterprise_id',
        'period',
        'status',
        'submitted_at'
      )
    )
    OR (
      table_name = 'system_settings'
      AND column_name IN (
        'id',
        'is_reporting_window_open',
        'updated_at',
        'updated_by'
      )
    )
  )
ORDER BY table_name,
  column_name;
-- Validate RLS policies on critical tables
SELECT schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'enterprises',
    'enterprise_profiles',
    'reporting_windows',
    'report_submissions',
    'system_settings'
  )
ORDER BY tablename,
  policyname;
-- Validate role-level table privileges that often cause 42501 when missing
SELECT t.table_name,
  has_table_privilege(
    'anon',
    format('public.%I', t.table_name),
    'SELECT,INSERT,UPDATE,DELETE'
  ) AS anon_rw,
  has_table_privilege(
    'authenticated',
    format('public.%I', t.table_name),
    'SELECT,INSERT,UPDATE,DELETE'
  ) AS authenticated_rw,
  has_table_privilege(
    'service_role',
    format('public.%I', t.table_name),
    'SELECT,INSERT,UPDATE,DELETE'
  ) AS service_role_rw
FROM (
    VALUES ('enterprises'),
      ('enterprise_profiles'),
      ('reporting_windows'),
      ('report_submissions'),
      ('system_settings')
  ) AS t(table_name)
ORDER BY t.table_name;
-- Validate expected seed row counts
SELECT 'lgus' AS table_name,
  COUNT(*) AS row_count
FROM public.lgus
UNION ALL
SELECT 'barangays',
  COUNT(*)
FROM public.barangays
UNION ALL
SELECT 'enterprises',
  COUNT(*)
FROM public.enterprises
UNION ALL
SELECT 'enterprise_profiles',
  COUNT(*)
FROM public.enterprise_profiles
UNION ALL
SELECT 'accounts',
  COUNT(*)
FROM public.accounts
UNION ALL
SELECT 'cameras',
  COUNT(*)
FROM public.cameras
UNION ALL
SELECT 'system_settings',
  COUNT(*)
FROM public.system_settings
UNION ALL
SELECT 'reporting_windows (current month)',
  COUNT(*)
FROM public.reporting_windows
WHERE period = TO_CHAR(
    (NOW() AT TIME ZONE 'Asia/Manila')::date,
    'YYYY-MM'
  );