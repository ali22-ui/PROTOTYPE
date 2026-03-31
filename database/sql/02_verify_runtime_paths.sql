-- ============================================
-- Verify Runtime Data Paths (Read-Only)
-- ============================================
-- Focused checks for enterprise pages and archived report flows.
-- 1) Global reporting-window setting singleton
SELECT id,
  is_reporting_window_open,
  updated_at,
  updated_by
FROM public.system_settings
WHERE id = 1;
-- 2) Enterprise profile compatibility row (used by account settings APIs)
SELECT id,
  business_permit_number,
  owner_name,
  owner_contact,
  logo_url,
  settings
FROM public.enterprise_profiles
WHERE id = 'ent_archies_001';
-- 3) Current month reporting-window row (used by request/notification status APIs)
SELECT enterprise_id,
  period,
  status,
  opened_at,
  opened_by,
  message,
  updated_at
FROM public.reporting_windows
WHERE enterprise_id = 'ent_archies_001'
  AND period = TO_CHAR(
    (NOW() AT TIME ZONE 'Asia/Manila')::date,
    'YYYY-MM'
  );
-- 4) Archived reports source rows
SELECT id,
  enterprise_id,
  period,
  status,
  submitted_at,
  submitted_by,
  total_visitors,
  male_count,
  female_count
FROM public.report_submissions
WHERE enterprise_id = 'ent_archies_001'
ORDER BY submitted_at DESC
LIMIT 20;
-- 5) Recent camera telemetry source rows (for dashboard/logs paths)
SELECT id,
  enterprise_id,
  camera_id,
  track_id,
  timestamp,
  sex,
  dwell_seconds
FROM public.detection_events
WHERE enterprise_id = 'ent_archies_001'
ORDER BY timestamp DESC
LIMIT 20;
SELECT id,
  enterprise_id,
  date,
  hour,
  male_count,
  female_count,
  unknown_count,
  unique_visitors,
  avg_dwell_seconds
FROM public.visitor_statistics
WHERE enterprise_id = 'ent_archies_001'
ORDER BY date DESC,
  hour DESC
LIMIT 48;