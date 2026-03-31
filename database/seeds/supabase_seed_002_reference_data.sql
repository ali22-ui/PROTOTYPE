-- Supabase Seed Data: Reference/Bootstrap Records
-- PRD_011: Unified Supabase Data Architecture Migration
-- 
-- Run this AFTER migration_002 to populate required reference data
-- Only seeds mandatory bootstrap records, not mock/test data

-- ============================================
-- Seed: LGU Master Record (San Pedro)
-- ============================================
INSERT INTO lgus (id, name, city, province, zip_code, contact_email, address)
VALUES (
  'lgu_san_pedro_001',
  'San Pedro LGU',
  'San Pedro City',
  'Laguna',
  '4023',
  'tourism@sanpedro.gov.ph',
  'City Hall, San Pedro, Laguna 4023'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  province = EXCLUDED.province,
  zip_code = EXCLUDED.zip_code,
  updated_at = NOW();

-- ============================================
-- Seed: Update existing enterprise with LGU link
-- ============================================
UPDATE enterprises 
SET linked_lgu_id = 'lgu_san_pedro_001'
WHERE id = 'ent_archies_001';

-- ============================================
-- Seed: Enterprise Profile for Archies
-- ============================================
INSERT INTO enterprise_profiles (id, linked_lgu_id, business_permit_number, description)
VALUES (
  'ent_archies_001',
  'lgu_san_pedro_001',
  'BP-2024-00001',
  'Food and beverage establishment in Pacita 1, San Pedro'
) ON CONFLICT (id) DO UPDATE SET
  linked_lgu_id = EXCLUDED.linked_lgu_id,
  updated_at = NOW();

-- ============================================
-- Seed: Default LGU Settings
-- ============================================
INSERT INTO lgu_settings (lgu_id, setting_key, setting_value)
VALUES 
  ('lgu_san_pedro_001', 'reporting_reminder_days', '7'),
  ('lgu_san_pedro_001', 'reporting_warning_days', '3'),
  ('lgu_san_pedro_001', 'auto_close_reporting_window', 'true'),
  ('lgu_san_pedro_001', 'default_reporting_period_type', '"monthly"'),
  ('lgu_san_pedro_001', 'timezone', '"Asia/Manila"')
ON CONFLICT (lgu_id, setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  updated_at = NOW();

-- ============================================
-- Seed: Current Period Reporting Window for Archies
-- ============================================
INSERT INTO reporting_windows (enterprise_id, period, status, opened_at, opened_by, message, scope)
VALUES (
  'ent_archies_001',
  TO_CHAR(NOW(), 'YYYY-MM'),
  'OPEN',
  NOW(),
  'system',
  'Monthly reporting window opened automatically',
  'ALL'
) ON CONFLICT (enterprise_id, period) DO UPDATE SET
  status = EXCLUDED.status,
  opened_at = EXCLUDED.opened_at,
  updated_at = NOW();

-- ============================================
-- Seed: San Pedro Barangays
-- ============================================
INSERT INTO barangays (id, name, population, area_sqkm) VALUES
  ('bagong-silang', 'Bagong Silang', 15000, 1.2),
  ('calendola', 'Calendola', 12000, 0.9),
  ('chrysanthemum', 'Chrysanthemum', 18000, 1.5),
  ('cuyab', 'Cuyab', 22000, 2.1),
  ('estrella', 'Estrella', 14000, 1.1),
  ('fatima', 'Fatima', 16000, 1.3),
  ('gsis', 'G.S.I.S.', 25000, 1.8),
  ('landayan', 'Landayan', 30000, 2.5),
  ('langgam', 'Langgam', 20000, 1.6),
  ('laram', 'Laram', 11000, 0.8),
  ('magsaysay', 'Magsaysay', 17000, 1.4),
  ('maharlika', 'Maharlika', 13000, 1.0),
  ('narra', 'Narra', 19000, 1.5),
  ('nueva', 'Nueva', 21000, 1.7),
  ('pacita-1', 'Pacita I', 28000, 2.2),
  ('pacita-2', 'Pacita II', 26000, 2.0),
  ('poblacion', 'Poblacion', 35000, 3.0),
  ('riverside', 'Riverside', 15000, 1.2),
  ('rosario', 'Rosario', 18000, 1.4),
  ('sampaguita', 'Sampaguita Village', 14000, 1.1),
  ('san-antonio', 'San Antonio', 32000, 2.8),
  ('san-lorenzo-ruiz', 'San Lorenzo Ruiz', 16000, 1.3),
  ('san-roque', 'San Roque', 24000, 2.0),
  ('san-vicente', 'San Vicente', 20000, 1.6),
  ('santo-nino', 'Santo Niño', 22000, 1.8),
  ('united-bayanihan', 'United Bayanihan', 15000, 1.2),
  ('united-better-living', 'United Better Living', 17000, 1.4)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  population = EXCLUDED.population,
  area_sqkm = EXCLUDED.area_sqkm;

-- ============================================
-- Seed: Camera Source Config for existing camera
-- ============================================
INSERT INTO camera_source_config (camera_id, source_type, detection_enabled, detection_model)
VALUES (
  'cam_live_webcam',
  'webcam',
  TRUE,
  'yolov8'
) ON CONFLICT (camera_id) DO UPDATE SET
  detection_enabled = EXCLUDED.detection_enabled,
  updated_at = NOW();

-- ============================================
-- Audit log for seed operation
-- ============================================
INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, actor_type, new_value)
VALUES (
  'system',
  'seed_operation',
  'seed',
  'migration_script',
  'system',
  '{"migration": "002", "description": "Initial reference data seed"}'
);
