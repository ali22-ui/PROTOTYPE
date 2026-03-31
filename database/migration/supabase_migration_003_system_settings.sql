-- Supabase Database Migration 003: Global System Settings
-- Adds a singleton table used as cross-portal source of truth.

CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_reporting_window_open BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

INSERT INTO system_settings (id, is_reporting_window_open, updated_at, updated_by)
VALUES (1, FALSE, NOW(), 'system')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_settings'
      AND policyname = 'Allow read access to system_settings'
  ) THEN
    CREATE POLICY "Allow read access to system_settings"
      ON system_settings
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_settings'
      AND policyname = 'Allow update to system_settings'
  ) THEN
    CREATE POLICY "Allow update to system_settings"
      ON system_settings
      FOR UPDATE
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_settings'
      AND policyname = 'Allow service role full access to system_settings'
  ) THEN
    CREATE POLICY "Allow service role full access to system_settings"
      ON system_settings
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_system_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_system_settings_updated_at
      BEFORE UPDATE ON system_settings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
