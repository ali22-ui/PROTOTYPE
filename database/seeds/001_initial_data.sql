-- ============================================
-- Supabase Initial Seed Data
-- PRD_013: Database Schema Simplification & Clean Reset
-- 
-- Created: 2026-03-31
-- 
-- Seeds all reference data including:
-- - LGU account (San Pedro City)
-- - All 27 barangays
-- - Sample enterprises
-- - User accounts for future authentication
-- - Default cameras
-- - Enterprise profile compatibility records
-- - System settings
-- - Reporting window defaults per enterprise
-- ============================================
-- ============================================
-- Seed: LGU Master Record (San Pedro City)
-- ============================================
INSERT INTO lgus (
    id,
    name,
    city,
    province,
    contact_email,
    reporting_reminder_days,
    reporting_warning_days,
    timezone
  )
VALUES (
    'lgu_san_pedro',
    'San Pedro City LGU',
    'San Pedro City',
    'Laguna',
    'tourism@sanpedro.gov.ph',
    7,
    3,
    'Asia/Manila'
  ) ON CONFLICT (id) DO
UPDATE
SET name = EXCLUDED.name,
  city = EXCLUDED.city,
  province = EXCLUDED.province,
  contact_email = EXCLUDED.contact_email,
  updated_at = NOW();
-- ============================================
-- Seed: San Pedro Barangays (27 total)
-- ============================================
INSERT INTO barangays (id, name, population, area_sqkm)
VALUES ('bagong-silang', 'Bagong Silang', 15000, 1.2),
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
  (
    'san-lorenzo-ruiz',
    'San Lorenzo Ruiz',
    16000,
    1.3
  ),
  ('san-roque', 'San Roque', 24000, 2.0),
  ('san-vicente', 'San Vicente', 20000, 1.6),
  ('santo-nino', 'Santo Niño', 22000, 1.8),
  (
    'united-bayanihan',
    'United Bayanihan',
    15000,
    1.2
  ),
  (
    'united-better-living',
    'United Better Living',
    17000,
    1.4
  ) ON CONFLICT (id) DO
UPDATE
SET name = EXCLUDED.name,
  population = EXCLUDED.population,
  area_sqkm = EXCLUDED.area_sqkm;
-- ============================================
-- Seed: Sample Enterprises
-- ============================================
INSERT INTO enterprises (
    id,
    company_name,
    linked_lgu_id,
    barangay_id,
    business_type,
    business_permit_number,
    address,
    contact_email,
    description
  )
VALUES (
    'ent_archies_001',
    'Archie''s Food House',
    'lgu_san_pedro',
    'pacita-1',
    'Food & Beverage',
    'BP-2024-00001',
    'Pacita Complex, Pacita I, San Pedro City',
    'archies@example.com',
    'Popular local restaurant serving Filipino and international cuisine'
  ),
  (
    'ent_plaza_001',
    'SM City San Pedro',
    'lgu_san_pedro',
    'poblacion',
    'Shopping Mall',
    'BP-2024-00002',
    'National Highway, Poblacion, San Pedro City',
    'sm.sanpedro@example.com',
    'Major shopping mall with retail stores, entertainment, and dining'
  ),
  (
    'ent_resort_001',
    'Laguna Splash Resort',
    'lgu_san_pedro',
    'san-antonio',
    'Resort & Recreation',
    'BP-2024-00003',
    'San Antonio Road, San Antonio, San Pedro City',
    'splash@example.com',
    'Family-friendly resort with swimming pools and recreational facilities'
  ),
  (
    'ent_cafe_001',
    'Brew & Bytes Cafe',
    'lgu_san_pedro',
    'landayan',
    'Food & Beverage',
    'BP-2024-00004',
    'Landayan Town Center, Landayan, San Pedro City',
    'brewbytes@example.com',
    'Modern cafe with coffee, food, and co-working space'
  ),
  (
    'ent_hotel_001',
    'San Pedro Inn',
    'lgu_san_pedro',
    'cuyab',
    'Accommodation',
    'BP-2024-00005',
    'Cuyab Road, Cuyab, San Pedro City',
    'sanpedroinn@example.com',
    'Budget-friendly hotel for travelers and tourists'
  ) ON CONFLICT (id) DO
UPDATE
SET company_name = EXCLUDED.company_name,
  linked_lgu_id = EXCLUDED.linked_lgu_id,
  barangay_id = EXCLUDED.barangay_id,
  business_type = EXCLUDED.business_type,
  business_permit_number = EXCLUDED.business_permit_number,
  address = EXCLUDED.address,
  contact_email = EXCLUDED.contact_email,
  description = EXCLUDED.description,
  updated_at = NOW();
-- ============================================
-- Seed: Enterprise Profiles (Compatibility Layer)
-- ============================================
INSERT INTO enterprise_profiles (
    id,
    business_permit_number,
    owner_name,
    owner_contact,
    description,
    logo_url,
    settings
  )
VALUES (
    'ent_archies_001',
    'BP-2024-00001',
    'Archie Santos',
    '+63-917-000-1001',
    'Popular local restaurant serving Filipino and international cuisine',
    NULL,
    '{"emailNotifications": true, "themePreference": "system"}'::jsonb
  ),
  (
    'ent_plaza_001',
    'BP-2024-00002',
    'Maria Reyes',
    '+63-917-000-1002',
    'Major shopping mall with retail stores, entertainment, and dining',
    NULL,
    '{"emailNotifications": true, "themePreference": "system"}'::jsonb
  ),
  (
    'ent_resort_001',
    'BP-2024-00003',
    'Carlos Dela Cruz',
    '+63-917-000-1003',
    'Family-friendly resort with swimming pools and recreational facilities',
    NULL,
    '{"emailNotifications": true, "themePreference": "system"}'::jsonb
  ),
  (
    'ent_cafe_001',
    'BP-2024-00004',
    'Anna Lim',
    '+63-917-000-1004',
    'Modern cafe with coffee, food, and co-working space',
    NULL,
    '{"emailNotifications": true, "themePreference": "system"}'::jsonb
  ),
  (
    'ent_hotel_001',
    'BP-2024-00005',
    'John Bautista',
    '+63-917-000-1005',
    'Budget-friendly hotel for travelers and tourists',
    NULL,
    '{"emailNotifications": true, "themePreference": "system"}'::jsonb
  ) ON CONFLICT (id) DO
UPDATE
SET business_permit_number = EXCLUDED.business_permit_number,
  owner_name = EXCLUDED.owner_name,
  owner_contact = EXCLUDED.owner_contact,
  description = EXCLUDED.description,
  logo_url = EXCLUDED.logo_url,
  settings = EXCLUDED.settings,
  updated_at = NOW();
-- ============================================
-- Seed: User Accounts (For Future Authentication)
-- ============================================
INSERT INTO accounts (
    id,
    username,
    password_hash,
    role,
    linked_entity_id,
    display_name,
    email,
    is_active
  )
VALUES -- LGU Admin accounts
  (
    'acc_lgu_admin_01',
    'lgu_admin',
    NULL,
    -- Password will be set when auth is implemented
    'lgu_admin',
    'lgu_san_pedro',
    'LGU Administrator',
    'admin@sanpedro.gov.ph',
    TRUE
  ),
  (
    'acc_lgu_tourism_01',
    'tourism_officer',
    NULL,
    'lgu_admin',
    'lgu_san_pedro',
    'Tourism Officer',
    'tourism@sanpedro.gov.ph',
    TRUE
  ),
  -- Enterprise user accounts
  (
    'acc_archies_01',
    'archies_user',
    NULL,
    'enterprise_user',
    'ent_archies_001',
    'Archie''s Manager',
    'manager@archies.example.com',
    TRUE
  ),
  (
    'acc_plaza_01',
    'plaza_user',
    NULL,
    'enterprise_user',
    'ent_plaza_001',
    'SM San Pedro Admin',
    'admin@sm-sanpedro.example.com',
    TRUE
  ),
  (
    'acc_resort_01',
    'resort_user',
    NULL,
    'enterprise_user',
    'ent_resort_001',
    'Resort Manager',
    'manager@lagunasplash.example.com',
    TRUE
  ),
  (
    'acc_cafe_01',
    'cafe_user',
    NULL,
    'enterprise_user',
    'ent_cafe_001',
    'Cafe Owner',
    'owner@brewbytes.example.com',
    TRUE
  ),
  (
    'acc_hotel_01',
    'hotel_user',
    NULL,
    'enterprise_user',
    'ent_hotel_001',
    'Hotel Manager',
    'manager@sanpedroinn.example.com',
    TRUE
  ) ON CONFLICT (id) DO
UPDATE
SET username = EXCLUDED.username,
  role = EXCLUDED.role,
  linked_entity_id = EXCLUDED.linked_entity_id,
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
-- ============================================
-- Seed: Default Cameras for Enterprises
-- ============================================
INSERT INTO cameras (
    id,
    enterprise_id,
    name,
    status,
    source_type,
    detection_enabled
  )
VALUES (
    'cam_archies_main',
    'ent_archies_001',
    'Main Entrance Camera',
    'INACTIVE',
    'webcam',
    TRUE
  ),
  (
    'cam_plaza_entrance',
    'ent_plaza_001',
    'Mall Main Entrance',
    'INACTIVE',
    'rtsp',
    TRUE
  ),
  (
    'cam_plaza_food_court',
    'ent_plaza_001',
    'Food Court Camera',
    'INACTIVE',
    'rtsp',
    TRUE
  ),
  (
    'cam_resort_gate',
    'ent_resort_001',
    'Resort Main Gate',
    'INACTIVE',
    'rtsp',
    TRUE
  ),
  (
    'cam_resort_pool',
    'ent_resort_001',
    'Pool Area Camera',
    'INACTIVE',
    'rtsp',
    TRUE
  ),
  (
    'cam_cafe_counter',
    'ent_cafe_001',
    'Counter Camera',
    'INACTIVE',
    'webcam',
    TRUE
  ),
  (
    'cam_hotel_lobby',
    'ent_hotel_001',
    'Lobby Camera',
    'INACTIVE',
    'rtsp',
    TRUE
  ) ON CONFLICT (id) DO
UPDATE
SET enterprise_id = EXCLUDED.enterprise_id,
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  detection_enabled = EXCLUDED.detection_enabled,
  updated_at = NOW();
-- ============================================
-- Seed: System Settings (Global)
-- ============================================
INSERT INTO system_settings (id, is_reporting_window_open, updated_by)
VALUES (1, FALSE, 'system') ON CONFLICT (id) DO
UPDATE
SET is_reporting_window_open = EXCLUDED.is_reporting_window_open,
  updated_at = NOW();
-- ============================================
-- Seed: Reporting Windows (Current Month Defaults)
-- ============================================
INSERT INTO reporting_windows (
    enterprise_id,
    period,
    status,
    opened_at,
    opened_by,
    message
  )
SELECT e.id,
  TO_CHAR(
    (NOW() AT TIME ZONE 'Asia/Manila')::date,
    'YYYY-MM'
  ),
  CASE
    WHEN s.is_reporting_window_open THEN 'OPEN'
    ELSE 'CLOSED'
  END,
  CASE
    WHEN s.is_reporting_window_open THEN NOW()
    ELSE NULL
  END,
  'system',
  CASE
    WHEN s.is_reporting_window_open THEN 'Initialized as OPEN from system settings seed.'
    ELSE 'Initialized as CLOSED from system settings seed.'
  END
FROM enterprises e
  CROSS JOIN system_settings s ON CONFLICT (enterprise_id, period) DO
UPDATE
SET status = EXCLUDED.status,
  opened_at = COALESCE(reporting_windows.opened_at, EXCLUDED.opened_at),
  opened_by = COALESCE(reporting_windows.opened_by, EXCLUDED.opened_by),
  message = EXCLUDED.message,
  updated_at = NOW();
-- ============================================
-- Seed: Initial Audit Log Entry
-- ============================================
INSERT INTO audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    actor_type,
    new_value
  )
VALUES (
    'system',
    'database_seed',
    'seed',
    'migration_script',
    'system',
    '{"migration": "001_unified_schema", "seed": "001_initial_data", "description": "Clean database reset with simplified schema"}'
  );
-- ============================================
-- Seed Data Summary
-- ============================================
-- LGU: 1 (San Pedro City)
-- Barangays: 27
-- Enterprises: 5
-- Enterprise Profiles: 5
-- Accounts: 7 (2 LGU admin + 5 enterprise users)
-- Cameras: 7
-- System Settings: 1
-- Reporting Windows: 5 (current month)