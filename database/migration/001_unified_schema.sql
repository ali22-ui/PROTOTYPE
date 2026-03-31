-- ============================================
-- Supabase Unified Schema Migration
-- PRD_013: Database Schema Simplification & Clean Reset
-- 
-- Created: 2026-03-31
-- 
-- This migration creates a clean, simplified schema with 15 tables.
-- Run this in Supabase SQL Editor after backing up existing data.
-- ============================================
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- ============================================
-- DROP ALL EXISTING TABLES (Clean Slate)
-- ============================================
-- Drop in reverse dependency order
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS enterprise_infractions CASCADE;
DROP TABLE IF EXISTS enterprise_compliance_actions CASCADE;
DROP TABLE IF EXISTS enterprise_action_tickets CASCADE;
DROP TABLE IF EXISTS authority_packages CASCADE;
DROP TABLE IF EXISTS report_submissions CASCADE;
DROP TABLE IF EXISTS reporting_windows CASCADE;
DROP TABLE IF EXISTS visitor_statistics CASCADE;
DROP TABLE IF EXISTS detection_events CASCADE;
DROP TABLE IF EXISTS cameras CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS enterprises CASCADE;
DROP TABLE IF EXISTS barangays CASCADE;
DROP TABLE IF EXISTS lgus CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
-- Also drop old tables that are being removed
DROP TABLE IF EXISTS enterprise_profiles CASCADE;
DROP TABLE IF EXISTS lgu_settings CASCADE;
DROP TABLE IF EXISTS camera_source_config CASCADE;
DROP TABLE IF EXISTS unified_detections CASCADE;
DROP TABLE IF EXISTS report_artifacts CASCADE;
-- ============================================
-- Table: lgus (Local Government Units)
-- ============================================
CREATE TABLE lgus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT,
  contact_email TEXT,
  -- Flattened settings (previously in lgu_settings)
  reporting_reminder_days INTEGER DEFAULT 7,
  reporting_warning_days INTEGER DEFAULT 3,
  timezone TEXT DEFAULT 'Asia/Manila',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lgus_city ON lgus(city);
ALTER TABLE lgus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to lgus" ON lgus FOR
SELECT USING (true);
CREATE POLICY "Allow insert to lgus" ON lgus FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to lgus" ON lgus FOR
UPDATE USING (true);
CREATE POLICY "Allow service role full access to lgus" ON lgus FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: barangays (Reference Data)
-- ============================================
CREATE TABLE barangays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  geojson JSONB,
  population INTEGER,
  area_sqkm REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE barangays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to barangays" ON barangays FOR
SELECT USING (true);
CREATE POLICY "Allow insert to barangays" ON barangays FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to barangays" ON barangays FOR
UPDATE USING (true);
-- ============================================
-- Table: enterprises (Merged with enterprise_profiles)
-- ============================================
CREATE TABLE enterprises (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  linked_lgu_id TEXT REFERENCES lgus(id) ON DELETE
  SET NULL,
    barangay_id TEXT REFERENCES barangays(id) ON DELETE
  SET NULL,
    business_type TEXT,
    address TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    -- Merged from enterprise_profiles
    business_permit_number TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_enterprises_lgu ON enterprises(linked_lgu_id);
CREATE INDEX idx_enterprises_barangay ON enterprises(barangay_id);
ALTER TABLE enterprises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to enterprises" ON enterprises FOR
SELECT USING (true);
CREATE POLICY "Allow insert to enterprises" ON enterprises FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to enterprises" ON enterprises FOR
UPDATE USING (true);
CREATE POLICY "Allow delete to enterprises" ON enterprises FOR DELETE USING (true);
CREATE POLICY "Allow service role full access to enterprises" ON enterprises FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: accounts (For Future Authentication)
-- ============================================
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  -- NULL for now, populated when auth is implemented
  role TEXT NOT NULL CHECK (role IN ('lgu_admin', 'enterprise_user')),
  linked_entity_id TEXT,
  -- References lgus.id or enterprises.id based on role
  display_name TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_accounts_username ON accounts(username);
CREATE INDEX idx_accounts_role ON accounts(role);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to accounts" ON accounts FOR
SELECT USING (true);
CREATE POLICY "Allow insert to accounts" ON accounts FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to accounts" ON accounts FOR
UPDATE USING (true);
CREATE POLICY "Allow service role full access to accounts" ON accounts FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: cameras (Merged with camera_source_config)
-- ============================================
CREATE TABLE cameras (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ERROR')),
  -- Merged from camera_source_config
  source_type TEXT CHECK (
    source_type IN ('rtsp', 'http', 'webcam', 'file')
  ),
  source_url TEXT,
  detection_enabled BOOLEAN DEFAULT TRUE,
  last_active TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cameras_enterprise ON cameras(enterprise_id);
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to cameras" ON cameras FOR
SELECT USING (true);
CREATE POLICY "Allow insert to cameras" ON cameras FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to cameras" ON cameras FOR
UPDATE USING (true);
CREATE POLICY "Allow service role full access to cameras" ON cameras FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: detection_events (Simplified)
-- ============================================
CREATE TABLE detection_events (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  camera_id TEXT REFERENCES cameras(id) ON DELETE
  SET NULL,
    track_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    sex TEXT CHECK (sex IN ('male', 'female', 'unknown')),
    confidence_person REAL CHECK (
      confidence_person >= 0
      AND confidence_person <= 1
    ),
    confidence_sex REAL CHECK (
      confidence_sex >= 0
      AND confidence_sex <= 1
    ),
    dwell_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_detection_enterprise_timestamp ON detection_events(enterprise_id, timestamp DESC);
CREATE INDEX idx_detection_track_id ON detection_events(track_id);
CREATE INDEX idx_detection_timestamp ON detection_events(timestamp DESC);
ALTER TABLE detection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to detection_events" ON detection_events FOR
SELECT USING (true);
CREATE POLICY "Allow insert to detection_events" ON detection_events FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow delete to detection_events" ON detection_events FOR DELETE USING (true);
CREATE POLICY "Allow service role full access to detection_events" ON detection_events FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: visitor_statistics (Hourly Aggregates)
-- ============================================
CREATE TABLE visitor_statistics (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hour INTEGER CHECK (
    hour >= 0
    AND hour <= 23
  ),
  male_count INTEGER DEFAULT 0,
  female_count INTEGER DEFAULT 0,
  unknown_count INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  avg_dwell_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, date, hour)
);
CREATE INDEX idx_visitor_stats_enterprise_date ON visitor_statistics(enterprise_id, date DESC);
CREATE INDEX idx_visitor_stats_date ON visitor_statistics(date DESC);
ALTER TABLE visitor_statistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to visitor_statistics" ON visitor_statistics FOR
SELECT USING (true);
CREATE POLICY "Allow insert to visitor_statistics" ON visitor_statistics FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to visitor_statistics" ON visitor_statistics FOR
UPDATE USING (true);
CREATE POLICY "Allow service role full access to visitor_statistics" ON visitor_statistics FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: reporting_windows
-- ============================================
CREATE TABLE reporting_windows (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  -- Format: YYYY-MM
  status TEXT NOT NULL DEFAULT 'CLOSED' CHECK (
    status IN (
      'OPEN',
      'REMIND',
      'WARN',
      'RENOTIFY',
      'SUBMITTED',
      'CLOSED'
    )
  ),
  opened_at TIMESTAMPTZ,
  opened_by TEXT,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, period)
);
CREATE INDEX idx_reporting_windows_enterprise ON reporting_windows(enterprise_id);
CREATE INDEX idx_reporting_windows_period ON reporting_windows(period);
CREATE INDEX idx_reporting_windows_status ON reporting_windows(status);
ALTER TABLE reporting_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to reporting_windows" ON reporting_windows FOR
SELECT USING (true);
CREATE POLICY "Allow insert to reporting_windows" ON reporting_windows FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to reporting_windows" ON reporting_windows FOR
UPDATE USING (true);
CREATE POLICY "Allow service role full access to reporting_windows" ON reporting_windows FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: report_submissions (Simplified)
-- ============================================
CREATE TABLE report_submissions (
  id TEXT PRIMARY KEY,
  -- Format: rpt_{enterprise_id}_{period}
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  linked_lgu_id TEXT REFERENCES lgus(id) ON DELETE
  SET NULL,
    period TEXT NOT NULL,
    -- Format: YYYY-MM
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (
      status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')
    ),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_by TEXT,
    -- Summary KPIs (calculated at submission time)
    total_visitors INTEGER DEFAULT 0,
    male_count INTEGER DEFAULT 0,
    female_count INTEGER DEFAULT 0,
    row_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(enterprise_id, period)
);
CREATE INDEX idx_report_submissions_enterprise ON report_submissions(enterprise_id);
CREATE INDEX idx_report_submissions_period ON report_submissions(period);
CREATE INDEX idx_report_submissions_lgu ON report_submissions(linked_lgu_id);
CREATE INDEX idx_report_submissions_status ON report_submissions(status);
ALTER TABLE report_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to report_submissions" ON report_submissions FOR
SELECT USING (true);
CREATE POLICY "Allow insert to report_submissions" ON report_submissions FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to report_submissions" ON report_submissions FOR
UPDATE USING (true);
CREATE POLICY "Allow service role full access to report_submissions" ON report_submissions FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: authority_packages (Simplified)
-- ============================================
CREATE TABLE authority_packages (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  classification TEXT DEFAULT 'READY_FOR_HIGHER_AUTHORITY_SUBMISSION',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT,
  executive_summary JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_authority_packages_report ON authority_packages(report_id);
CREATE INDEX idx_authority_packages_enterprise ON authority_packages(enterprise_id);
CREATE INDEX idx_authority_packages_period ON authority_packages(period);
ALTER TABLE authority_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to authority_packages" ON authority_packages FOR
SELECT USING (true);
CREATE POLICY "Allow insert to authority_packages" ON authority_packages FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to authority_packages" ON authority_packages FOR
UPDATE USING (true);
CREATE POLICY "Allow service role full access to authority_packages" ON authority_packages FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: enterprise_action_tickets
-- ============================================
CREATE TABLE enterprise_action_tickets (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  ticket_type TEXT NOT NULL CHECK (
    ticket_type IN (
      'maintenance',
      'manual-log-correction',
      'support',
      'other'
    )
  ),
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN (
      'open',
      'in_progress',
      'resolved',
      'closed',
      'cancelled'
    )
  ),
  message TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_enterprise_action_tickets_enterprise ON enterprise_action_tickets(enterprise_id);
CREATE INDEX idx_enterprise_action_tickets_type ON enterprise_action_tickets(ticket_type);
CREATE INDEX idx_enterprise_action_tickets_status ON enterprise_action_tickets(status);
ALTER TABLE enterprise_action_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to enterprise_action_tickets" ON enterprise_action_tickets FOR
SELECT USING (true);
CREATE POLICY "Allow insert to enterprise_action_tickets" ON enterprise_action_tickets FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to enterprise_action_tickets" ON enterprise_action_tickets FOR
UPDATE USING (true);
CREATE POLICY "Allow service role full access to enterprise_action_tickets" ON enterprise_action_tickets FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: enterprise_compliance_actions
-- ============================================
CREATE TABLE enterprise_compliance_actions (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  lgu_id TEXT NOT NULL REFERENCES lgus(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (
    action_type IN ('OPEN', 'REMIND', 'WARN', 'RENOTIFY', 'CLOSE')
  ),
  message TEXT,
  triggered_by TEXT NOT NULL,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_enterprise_compliance_actions_enterprise ON enterprise_compliance_actions(enterprise_id);
CREATE INDEX idx_enterprise_compliance_actions_lgu ON enterprise_compliance_actions(lgu_id);
CREATE INDEX idx_enterprise_compliance_actions_period ON enterprise_compliance_actions(period);
ALTER TABLE enterprise_compliance_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to enterprise_compliance_actions" ON enterprise_compliance_actions FOR
SELECT USING (true);
CREATE POLICY "Allow insert to enterprise_compliance_actions" ON enterprise_compliance_actions FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow service role full access to enterprise_compliance_actions" ON enterprise_compliance_actions FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: enterprise_infractions
-- ============================================
CREATE TABLE enterprise_infractions (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  lgu_id TEXT NOT NULL REFERENCES lgus(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  infraction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  infraction_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'strike', 'suspension')),
  source TEXT NOT NULL,
  note TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_enterprise_infractions_enterprise ON enterprise_infractions(enterprise_id);
CREATE INDEX idx_enterprise_infractions_lgu ON enterprise_infractions(lgu_id);
CREATE INDEX idx_enterprise_infractions_period ON enterprise_infractions(period);
CREATE INDEX idx_enterprise_infractions_severity ON enterprise_infractions(severity);
ALTER TABLE enterprise_infractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to enterprise_infractions" ON enterprise_infractions FOR
SELECT USING (true);
CREATE POLICY "Allow insert to enterprise_infractions" ON enterprise_infractions FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow update to enterprise_infractions" ON enterprise_infractions FOR
UPDATE USING (true);
CREATE POLICY "Allow service role full access to enterprise_infractions" ON enterprise_infractions FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: audit_logs
-- ============================================
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_type TEXT,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to audit_logs" ON audit_logs FOR
SELECT USING (true);
CREATE POLICY "Allow insert to audit_logs" ON audit_logs FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow service role full access to audit_logs" ON audit_logs FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Table: system_settings (Singleton)
-- ============================================
CREATE TABLE system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_reporting_window_open BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to system_settings" ON system_settings FOR
SELECT USING (true);
CREATE POLICY "Allow update to system_settings" ON system_settings FOR
UPDATE USING (true);
CREATE POLICY "Allow insert to system_settings" ON system_settings FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow service role full access to system_settings" ON system_settings FOR ALL USING (auth.role() = 'service_role');
-- ============================================
-- Trigger: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER update_lgus_updated_at BEFORE
UPDATE ON lgus FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_enterprises_updated_at BEFORE
UPDATE ON enterprises FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_accounts_updated_at BEFORE
UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cameras_updated_at BEFORE
UPDATE ON cameras FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_visitor_statistics_updated_at BEFORE
UPDATE ON visitor_statistics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reporting_windows_updated_at BEFORE
UPDATE ON reporting_windows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_report_submissions_updated_at BEFORE
UPDATE ON report_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_authority_packages_updated_at BEFORE
UPDATE ON authority_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_enterprise_action_tickets_updated_at BEFORE
UPDATE ON enterprise_action_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_enterprise_infractions_updated_at BEFORE
UPDATE ON enterprise_infractions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- ============================================
-- Enable Realtime for key tables
-- ============================================
DO $$ BEGIN -- Only add to publication if not already added
IF NOT EXISTS (
  SELECT 1
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND tablename = 'visitor_statistics'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE visitor_statistics;
END IF;
IF NOT EXISTS (
  SELECT 1
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND tablename = 'reporting_windows'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE reporting_windows;
END IF;
IF NOT EXISTS (
  SELECT 1
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND tablename = 'report_submissions'
) THEN ALTER PUBLICATION supabase_realtime
ADD TABLE report_submissions;
END IF;
END $$;
-- ============================================
-- Schema Migration Complete
-- ============================================
-- Tables created: 15
-- 1. lgus
-- 2. barangays
-- 3. enterprises
-- 4. accounts
-- 5. cameras
-- 6. detection_events
-- 7. visitor_statistics
-- 8. reporting_windows
-- 9. report_submissions
-- 10. authority_packages
-- 11. enterprise_action_tickets
-- 12. enterprise_compliance_actions
-- 13. enterprise_infractions
-- 14. audit_logs
-- 15. system_settings