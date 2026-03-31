-- Supabase Database Migration: Initial Schema
-- Creates tables for the LGU Dashboard camera detection system
-- Run this migration in the Supabase SQL Editor
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- ============================================
-- Table: enterprises
-- ============================================
CREATE TABLE IF NOT EXISTS enterprises (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  barangay TEXT,
  business_type TEXT,
  address TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Enable Row Level Security
ALTER TABLE enterprises ENABLE ROW LEVEL SECURITY;
-- Allow read access for authenticated users
CREATE POLICY "Allow read access to enterprises" ON enterprises FOR
SELECT USING (true);
-- ============================================
-- Table: cameras
-- ============================================
CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ERROR')),
  device_id TEXT,
  resolution TEXT,
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
-- ============================================
-- Table: detection_events
-- ============================================
CREATE TABLE IF NOT EXISTS detection_events (
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
    bbox_x INTEGER,
    bbox_y INTEGER,
    bbox_w INTEGER,
    bbox_h INTEGER,
    dwell_seconds INTEGER DEFAULT 0,
    first_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indexes for common query patterns
CREATE INDEX idx_detection_enterprise_timestamp ON detection_events(enterprise_id, timestamp DESC);
CREATE INDEX idx_detection_track_id ON detection_events(track_id);
CREATE INDEX idx_detection_timestamp ON detection_events(timestamp DESC);
ALTER TABLE detection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to detection_events" ON detection_events FOR
SELECT USING (true);
CREATE POLICY "Allow insert to detection_events" ON detection_events FOR
INSERT WITH CHECK (true);
CREATE POLICY "Allow delete old detection_events" ON detection_events FOR DELETE USING (true);
-- ============================================
-- Table: visitor_statistics
-- ============================================
CREATE TABLE IF NOT EXISTS visitor_statistics (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hour INTEGER CHECK (
    hour >= 0
    AND hour <= 23
  ),
  male_total INTEGER DEFAULT 0,
  female_total INTEGER DEFAULT 0,
  unknown_total INTEGER DEFAULT 0,
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
-- ============================================
-- Table: barangays
-- ============================================
CREATE TABLE IF NOT EXISTS barangays (
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
-- ============================================
-- Trigger: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER update_enterprises_updated_at BEFORE
UPDATE ON enterprises FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cameras_updated_at BEFORE
UPDATE ON cameras FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_visitor_statistics_updated_at BEFORE
UPDATE ON visitor_statistics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- ============================================
-- Seed Data: Sample Enterprise
-- ============================================
INSERT INTO enterprises (id, company_name, barangay, business_type)
VALUES (
    'ent_archies_001',
    'Archies',
    'Pacita 1',
    'Food & Beverage'
  ) ON CONFLICT (id) DO NOTHING;
INSERT INTO cameras (id, enterprise_id, name, status)
VALUES (
    'cam_live_webcam',
    'ent_archies_001',
    'Live Webcam',
    'INACTIVE'
  ) ON CONFLICT (id) DO NOTHING;
-- ============================================
-- Enable Realtime for visitor_statistics
-- ============================================
ALTER PUBLICATION supabase_realtime
ADD TABLE visitor_statistics;