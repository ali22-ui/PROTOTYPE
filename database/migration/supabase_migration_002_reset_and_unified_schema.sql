-- Supabase Database Migration 002: Unified Schema Reset
-- PRD_011: Unified Supabase Data Architecture Migration
-- 
-- This migration adds tables for:
-- - LGU operations and settings
-- - Reporting windows lifecycle
-- - Report submissions and artifacts
-- - Authority packages
-- - Enterprise action tickets
-- - Compliance actions and infractions
-- - Audit logs
--
-- Run this migration in the Supabase SQL Editor AFTER migration_001

-- ============================================
-- Table: lgus (Local Government Units)
-- ============================================
CREATE TABLE IF NOT EXISTS lgus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT,
  zip_code TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lgus_city ON lgus(city);
ALTER TABLE lgus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to lgus" ON lgus FOR SELECT USING (true);
CREATE POLICY "Allow service role full access to lgus" ON lgus FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: enterprise_profiles (extended enterprise data)
-- ============================================
CREATE TABLE IF NOT EXISTS enterprise_profiles (
  id TEXT PRIMARY KEY REFERENCES enterprises(id) ON DELETE CASCADE,
  linked_lgu_id TEXT REFERENCES lgus(id) ON DELETE SET NULL,
  business_permit_number TEXT,
  registration_date DATE,
  owner_name TEXT,
  owner_contact TEXT,
  description TEXT,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enterprise_profiles_lgu ON enterprise_profiles(linked_lgu_id);
ALTER TABLE enterprise_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to enterprise_profiles" ON enterprise_profiles FOR SELECT USING (true);
CREATE POLICY "Allow service role full access to enterprise_profiles" ON enterprise_profiles FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: lgu_settings
-- ============================================
CREATE TABLE IF NOT EXISTS lgu_settings (
  id BIGSERIAL PRIMARY KEY,
  lgu_id TEXT NOT NULL REFERENCES lgus(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lgu_id, setting_key)
);

CREATE INDEX idx_lgu_settings_lgu ON lgu_settings(lgu_id);
ALTER TABLE lgu_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to lgu_settings" ON lgu_settings FOR SELECT USING (true);
CREATE POLICY "Allow service role full access to lgu_settings" ON lgu_settings FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: reporting_windows
-- ============================================
CREATE TABLE IF NOT EXISTS reporting_windows (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  period TEXT NOT NULL,  -- Format: YYYY-MM
  status TEXT NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('OPEN', 'REMIND', 'WARN', 'RENOTIFY', 'SUBMITTED', 'CLOSED')),
  opened_at TIMESTAMPTZ,
  opened_by TEXT,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  message TEXT,
  scope TEXT DEFAULT 'ENTERPRISE' CHECK (scope IN ('ALL', 'ENTERPRISE')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, period)
);

CREATE INDEX idx_reporting_windows_enterprise ON reporting_windows(enterprise_id);
CREATE INDEX idx_reporting_windows_period ON reporting_windows(period);
CREATE INDEX idx_reporting_windows_status ON reporting_windows(status);
ALTER TABLE reporting_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to reporting_windows" ON reporting_windows FOR SELECT USING (true);
CREATE POLICY "Allow insert to reporting_windows" ON reporting_windows FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to reporting_windows" ON reporting_windows FOR UPDATE USING (true);
CREATE POLICY "Allow service role full access to reporting_windows" ON reporting_windows FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: report_submissions
-- ============================================
CREATE TABLE IF NOT EXISTS report_submissions (
  id TEXT PRIMARY KEY,  -- Format: rpt_{enterprise_id}_{period}
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  linked_lgu_id TEXT REFERENCES lgus(id) ON DELETE SET NULL,
  period TEXT NOT NULL,  -- Format: YYYY-MM
  enterprise_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_by TEXT,
  
  -- KPI Summary
  total_visitors INTEGER DEFAULT 0,
  total_tourists INTEGER DEFAULT 0,
  total_residents INTEGER DEFAULT 0,
  male_count INTEGER DEFAULT 0,
  female_count INTEGER DEFAULT 0,
  unknown_count INTEGER DEFAULT 0,
  avg_dwell_minutes INTEGER DEFAULT 0,
  peak_hours JSONB DEFAULT '[]',
  
  -- Raw data payload (camera logs)
  payload JSONB,
  
  -- Metadata
  row_count INTEGER DEFAULT 0,
  source TEXT DEFAULT 'enterprise-report-center',
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
CREATE POLICY "Allow read access to report_submissions" ON report_submissions FOR SELECT USING (true);
CREATE POLICY "Allow insert to report_submissions" ON report_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to report_submissions" ON report_submissions FOR UPDATE USING (true);
CREATE POLICY "Allow service role full access to report_submissions" ON report_submissions FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: report_artifacts
-- ============================================
CREATE TABLE IF NOT EXISTS report_artifacts (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('pdf', 'docx', 'csv', 'xlsx', 'json')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,  -- Supabase Storage path
  file_size_bytes BIGINT,
  mime_type TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_artifacts_report ON report_artifacts(report_id);
CREATE INDEX idx_report_artifacts_type ON report_artifacts(artifact_type);
ALTER TABLE report_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to report_artifacts" ON report_artifacts FOR SELECT USING (true);
CREATE POLICY "Allow insert to report_artifacts" ON report_artifacts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role full access to report_artifacts" ON report_artifacts FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: authority_packages
-- ============================================
CREATE TABLE IF NOT EXISTS authority_packages (
  id TEXT PRIMARY KEY,  -- Format: auth_{report_id}_{timestamp}
  report_id TEXT NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  
  classification TEXT DEFAULT 'READY_FOR_HIGHER_AUTHORITY_SUBMISSION',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT,
  
  -- Executive summary data
  executive_summary JSONB NOT NULL DEFAULT '{}',
  compliance_notes JSONB DEFAULT '[]',
  attachments JSONB DEFAULT '[]',
  
  -- Artifact references
  pdf_artifact_id TEXT REFERENCES report_artifacts(id) ON DELETE SET NULL,
  docx_artifact_id TEXT REFERENCES report_artifacts(id) ON DELETE SET NULL,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_authority_packages_report ON authority_packages(report_id);
CREATE INDEX idx_authority_packages_enterprise ON authority_packages(enterprise_id);
CREATE INDEX idx_authority_packages_period ON authority_packages(period);
ALTER TABLE authority_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to authority_packages" ON authority_packages FOR SELECT USING (true);
CREATE POLICY "Allow insert to authority_packages" ON authority_packages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to authority_packages" ON authority_packages FOR UPDATE USING (true);
CREATE POLICY "Allow service role full access to authority_packages" ON authority_packages FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: enterprise_action_tickets
-- ============================================
CREATE TABLE IF NOT EXISTS enterprise_action_tickets (
  id TEXT PRIMARY KEY,  -- Format: {type}_{timestamp}
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('maintenance', 'manual-log-correction', 'support', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'cancelled')),
  message TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enterprise_action_tickets_enterprise ON enterprise_action_tickets(enterprise_id);
CREATE INDEX idx_enterprise_action_tickets_type ON enterprise_action_tickets(ticket_type);
CREATE INDEX idx_enterprise_action_tickets_status ON enterprise_action_tickets(status);
ALTER TABLE enterprise_action_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to enterprise_action_tickets" ON enterprise_action_tickets FOR SELECT USING (true);
CREATE POLICY "Allow insert to enterprise_action_tickets" ON enterprise_action_tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to enterprise_action_tickets" ON enterprise_action_tickets FOR UPDATE USING (true);
CREATE POLICY "Allow service role full access to enterprise_action_tickets" ON enterprise_action_tickets FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: enterprise_compliance_actions
-- ============================================
CREATE TABLE IF NOT EXISTS enterprise_compliance_actions (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  lgu_id TEXT NOT NULL REFERENCES lgus(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('OPEN', 'REMIND', 'WARN', 'RENOTIFY', 'CLOSE')),
  message TEXT,
  triggered_by TEXT NOT NULL,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  scope TEXT DEFAULT 'ENTERPRISE' CHECK (scope IN ('ALL', 'ENTERPRISE')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enterprise_compliance_actions_enterprise ON enterprise_compliance_actions(enterprise_id);
CREATE INDEX idx_enterprise_compliance_actions_lgu ON enterprise_compliance_actions(lgu_id);
CREATE INDEX idx_enterprise_compliance_actions_period ON enterprise_compliance_actions(period);
ALTER TABLE enterprise_compliance_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to enterprise_compliance_actions" ON enterprise_compliance_actions FOR SELECT USING (true);
CREATE POLICY "Allow insert to enterprise_compliance_actions" ON enterprise_compliance_actions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role full access to enterprise_compliance_actions" ON enterprise_compliance_actions FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: enterprise_infractions
-- ============================================
CREATE TABLE IF NOT EXISTS enterprise_infractions (
  id TEXT PRIMARY KEY,  -- Format: {period}::{type}::{date}
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
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enterprise_infractions_enterprise ON enterprise_infractions(enterprise_id);
CREATE INDEX idx_enterprise_infractions_lgu ON enterprise_infractions(lgu_id);
CREATE INDEX idx_enterprise_infractions_period ON enterprise_infractions(period);
CREATE INDEX idx_enterprise_infractions_severity ON enterprise_infractions(severity);
ALTER TABLE enterprise_infractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to enterprise_infractions" ON enterprise_infractions FOR SELECT USING (true);
CREATE POLICY "Allow insert to enterprise_infractions" ON enterprise_infractions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to enterprise_infractions" ON enterprise_infractions FOR UPDATE USING (true);
CREATE POLICY "Allow service role full access to enterprise_infractions" ON enterprise_infractions FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: audit_logs
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,  -- e.g., 'enterprise', 'report', 'reporting_window'
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- e.g., 'create', 'update', 'delete', 'submit'
  actor_id TEXT,
  actor_type TEXT,  -- e.g., 'lgu_admin', 'enterprise_user', 'system'
  old_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to audit_logs" ON audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow insert to audit_logs" ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role full access to audit_logs" ON audit_logs FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: camera_source_config (extended camera configuration)
-- ============================================
CREATE TABLE IF NOT EXISTS camera_source_config (
  id BIGSERIAL PRIMARY KEY,
  camera_id TEXT NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('rtsp', 'http', 'webcam', 'file')),
  source_url TEXT,
  username TEXT,
  password_encrypted TEXT,  -- Store encrypted passwords
  fps_target INTEGER DEFAULT 30,
  resolution_width INTEGER,
  resolution_height INTEGER,
  detection_enabled BOOLEAN DEFAULT TRUE,
  detection_model TEXT DEFAULT 'yolov8',
  detection_confidence_threshold REAL DEFAULT 0.5,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(camera_id)
);

CREATE INDEX idx_camera_source_config_camera ON camera_source_config(camera_id);
ALTER TABLE camera_source_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to camera_source_config" ON camera_source_config FOR SELECT USING (true);
CREATE POLICY "Allow insert to camera_source_config" ON camera_source_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to camera_source_config" ON camera_source_config FOR UPDATE USING (true);
CREATE POLICY "Allow service role full access to camera_source_config" ON camera_source_config FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Table: unified_detections (aggregated detection view)
-- ============================================
CREATE TABLE IF NOT EXISTS unified_detections (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  camera_id TEXT REFERENCES cameras(id) ON DELETE SET NULL,
  detection_date DATE NOT NULL,
  hour INTEGER CHECK (hour >= 0 AND hour <= 23),
  
  -- Aggregated counts
  total_count INTEGER DEFAULT 0,
  male_count INTEGER DEFAULT 0,
  female_count INTEGER DEFAULT 0,
  unknown_count INTEGER DEFAULT 0,
  
  -- Classification counts (tourist vs resident)
  tourist_count INTEGER DEFAULT 0,
  visitor_count INTEGER DEFAULT 0,
  resident_count INTEGER DEFAULT 0,
  
  -- Dwell metrics
  avg_dwell_seconds INTEGER DEFAULT 0,
  max_dwell_seconds INTEGER DEFAULT 0,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, camera_id, detection_date, hour)
);

CREATE INDEX idx_unified_detections_enterprise ON unified_detections(enterprise_id);
CREATE INDEX idx_unified_detections_date ON unified_detections(detection_date DESC);
CREATE INDEX idx_unified_detections_camera ON unified_detections(camera_id);
ALTER TABLE unified_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to unified_detections" ON unified_detections FOR SELECT USING (true);
CREATE POLICY "Allow insert to unified_detections" ON unified_detections FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to unified_detections" ON unified_detections FOR UPDATE USING (true);
CREATE POLICY "Allow service role full access to unified_detections" ON unified_detections FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- Add linked_lgu_id to enterprises table
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'enterprises' AND column_name = 'linked_lgu_id'
  ) THEN
    ALTER TABLE enterprises ADD COLUMN linked_lgu_id TEXT REFERENCES lgus(id) ON DELETE SET NULL;
    CREATE INDEX idx_enterprises_lgu ON enterprises(linked_lgu_id);
  END IF;
END $$;

-- ============================================
-- Update triggers for new tables
-- ============================================
CREATE TRIGGER update_lgus_updated_at BEFORE UPDATE ON lgus 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enterprise_profiles_updated_at BEFORE UPDATE ON enterprise_profiles 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lgu_settings_updated_at BEFORE UPDATE ON lgu_settings 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reporting_windows_updated_at BEFORE UPDATE ON reporting_windows 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_report_submissions_updated_at BEFORE UPDATE ON report_submissions 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_authority_packages_updated_at BEFORE UPDATE ON authority_packages 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enterprise_action_tickets_updated_at BEFORE UPDATE ON enterprise_action_tickets 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enterprise_infractions_updated_at BEFORE UPDATE ON enterprise_infractions 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_camera_source_config_updated_at BEFORE UPDATE ON camera_source_config 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_unified_detections_updated_at BEFORE UPDATE ON unified_detections 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Enable Realtime for key tables
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE reporting_windows;
ALTER PUBLICATION supabase_realtime ADD TABLE report_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE enterprise_action_tickets;

-- ============================================
-- Create Storage bucket for report artifacts
-- ============================================
-- Note: Run this separately in the Supabase dashboard or via API
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('report-artifacts', 'report-artifacts', false)
-- ON CONFLICT (id) DO NOTHING;
