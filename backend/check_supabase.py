#!/usr/bin/env python3
"""
Supabase Diagnostic Script
Run this to diagnose connection and permission issues.
"""
import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

from supabase import create_client

def main():
    print("=" * 60)
    print("SUPABASE DIAGNOSTIC SCRIPT")
    print("=" * 60)
    
    # Check environment variables
    url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    
    print("\n[1] ENVIRONMENT VARIABLES")
    print(f"    SUPABASE_URL: {'SET' if url else 'NOT SET'}")
    print(f"    SUPABASE_SERVICE_ROLE_KEY: {'SET' if service_key else 'NOT SET'}")
    print(f"    SUPABASE_ANON_KEY: {'SET' if anon_key else 'NOT SET'}")
    
    if not url or not service_key:
        print("\n[ERROR] Missing required environment variables!")
        return
    
    # Verify JWT structure
    print("\n[2] SERVICE ROLE KEY ANALYSIS")
    try:
        import base64
        import json
        parts = service_key.split(".")
        if len(parts) == 3:
            # Decode payload (second part)
            payload_b64 = parts[1]
            # Add padding if needed
            padding = 4 - len(payload_b64) % 4
            if padding != 4:
                payload_b64 += "=" * padding
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
            print(f"    Role: {payload.get('role', 'UNKNOWN')}")
            print(f"    Issuer: {payload.get('iss', 'UNKNOWN')}")
            print(f"    Ref: {payload.get('ref', 'UNKNOWN')}")
            
            # Check if role is service_role
            if payload.get("role") != "service_role":
                print(f"\n    [WARNING] Key role is '{payload.get('role')}', not 'service_role'!")
                print("    This may cause RLS permission issues.")
        else:
            print("    [ERROR] Invalid JWT format")
    except Exception as e:
        print(f"    [ERROR] Could not decode JWT: {e}")
    
    # Test connection with service role key
    print("\n[3] TESTING SERVICE ROLE CONNECTION")
    try:
        client = create_client(url, service_key)
        print("    Client created successfully")
        
        # List tables we need
        tables_to_check = [
            "reporting_windows",
            "enterprises",
            "detection_summary",
            "camera_settings",
        ]
        
        print("\n[4] TABLE ACCESS TESTS")
        for table in tables_to_check:
            try:
                result = client.table(table).select("*").limit(1).execute()
                count = len(result.data) if result.data else 0
                print(f"    {table}: OK ({count} rows returned)")
            except Exception as e:
                error_str = str(e)
                if "42501" in error_str:
                    print(f"    {table}: PERMISSION DENIED (RLS blocking service_role)")
                elif "42P01" in error_str:
                    print(f"    {table}: TABLE DOES NOT EXIST")
                else:
                    print(f"    {table}: ERROR - {e}")
        
    except Exception as e:
        print(f"    [ERROR] Failed to create client: {e}")
        return
    
    # Additional diagnostics
    print("\n[5] RLS STATUS CHECK")
    print("    To check RLS status, run this SQL in Supabase Dashboard > SQL Editor:")
    print()
    print("    SELECT tablename, rowsecurity")
    print("    FROM pg_tables")
    print("    WHERE schemaname = 'public'")
    print("    AND tablename IN ('reporting_windows', 'enterprises', 'detection_summary');")
    print()
    
    print("\n[6] TO FIX PERMISSION DENIED ERRORS")
    print("    Option A: Disable RLS (for development only)")
    print("    ALTER TABLE reporting_windows DISABLE ROW LEVEL SECURITY;")
    print()
    print("    Option B: Add policy for service role (recommended)")
    print("    CREATE POLICY \"Service role full access\" ON reporting_windows")
    print("      FOR ALL")
    print("      USING (auth.role() = 'service_role');")
    print()
    
    print("=" * 60)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
