-- ==============================================================
-- SUPABASE FIX: Permission Issues for reporting_windows table
-- ==============================================================
-- Run this SQL in Supabase Dashboard > SQL Editor
-- ==============================================================

-- STEP 1: Check current RLS status
SELECT 
    schemaname,
    tablename, 
    rowsecurity as "RLS Enabled"
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'reporting_windows', 
    'enterprises', 
    'detection_summary',
    'camera_settings'
);

-- STEP 2: Check existing RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public';

-- ==============================================================
-- OPTION A: DISABLE RLS (Quick fix for development)
-- Uncomment and run if you want to disable RLS completely
-- ==============================================================

-- ALTER TABLE public.reporting_windows DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.enterprises DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.detection_summary DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.camera_settings DISABLE ROW LEVEL SECURITY;

-- ==============================================================
-- OPTION B: ADD SERVICE ROLE POLICY (Recommended for production)
-- This allows service_role key to bypass RLS while keeping RLS
-- enabled for other users
-- ==============================================================

-- First, ensure RLS is enabled (it should be)
-- ALTER TABLE public.reporting_windows ENABLE ROW LEVEL SECURITY;

-- Then add a policy that allows service_role full access
-- Note: service_role should already bypass RLS, but this ensures it

-- DROP POLICY IF EXISTS "service_role_full_access" ON public.reporting_windows;
-- CREATE POLICY "service_role_full_access" ON public.reporting_windows
--     FOR ALL
--     TO authenticated, service_role
--     USING (true)
--     WITH CHECK (true);

-- ==============================================================
-- OPTION C: Check if table exists and has correct grants
-- ==============================================================

-- Check table ownership
SELECT 
    tableowner,
    tablename
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'reporting_windows';

-- Check grants
SELECT 
    grantee, 
    privilege_type
FROM information_schema.table_privileges 
WHERE table_name = 'reporting_windows';

-- ==============================================================
-- OPTION D: Grant permissions to all roles (if missing)
-- ==============================================================

-- GRANT ALL ON public.reporting_windows TO authenticated;
-- GRANT ALL ON public.reporting_windows TO anon;
-- GRANT ALL ON public.reporting_windows TO service_role;

-- ==============================================================
-- VERIFICATION: Run after applying fixes
-- ==============================================================

-- This should return data (or empty set if no data)
SELECT * FROM public.reporting_windows LIMIT 5;
