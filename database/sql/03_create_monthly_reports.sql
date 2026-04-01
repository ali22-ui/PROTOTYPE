-- Monthly reports compatibility table for direct portal submit/read flow.
-- Note: enterprises.id is TEXT in this codebase, so enterprise_id is TEXT here.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.monthly_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    enterprise_id TEXT REFERENCES public.enterprises(id),
    enterprise_name TEXT NOT NULL,
    barangay TEXT NOT NULL,
    report_name TEXT NOT NULL,
    reporting_period TEXT NOT NULL,
    total_visitors INTEGER DEFAULT 0,
    demographics JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'Submitted',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_submitted_at
    ON public.monthly_reports (submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_reporting_period
    ON public.monthly_reports (reporting_period);

-- Temporary diagnostic mode: disable RLS to validate end-to-end inserts/reads quickly.
ALTER TABLE public.monthly_reports DISABLE ROW LEVEL SECURITY;

-- Force PostgREST (Supabase API) to reload schema cache immediately.
NOTIFY pgrst, 'reload schema';

-- Optional: quick verification query.
SELECT COUNT(*) AS monthly_reports_count FROM public.monthly_reports;
