#!/usr/bin/env python3
"""
Supabase diagnostic utility.

Usage:
    python scripts/tools/check_supabase.py

Exit codes:
    0 - Diagnostics succeeded
    1 - Missing required environment variables
    2 - Invalid service-role key format
    3 - Supabase client initialization failed
"""

import base64
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


def _resolve_backend_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "backend"


def _decode_jwt_payload(token: str) -> dict[str, object]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")

    payload_b64 = parts[1]
    padding = (4 - len(payload_b64) % 4) % 4
    payload_b64 += "=" * padding

    decoded = base64.urlsafe_b64decode(payload_b64)
    payload = json.loads(decoded)
    if not isinstance(payload, dict):
        raise ValueError("JWT payload is not an object")
    return payload


def main() -> int:
    backend_dir = _resolve_backend_dir()
    load_dotenv(backend_dir / ".env")

    print("=" * 60)
    print("SUPABASE DIAGNOSTIC SCRIPT")
    print("=" * 60)

    url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    anon_key = os.getenv("SUPABASE_ANON_KEY")

    print("\n[1] ENVIRONMENT VARIABLES")
    print(f"    SUPABASE_URL: {'SET' if url else 'NOT SET'}")
    print(f"    SUPABASE_SERVICE_ROLE_KEY: {'SET' if service_key else 'NOT SET'}")
    print(f"    SUPABASE_ANON_KEY: {'SET' if anon_key else 'NOT SET'}")

    if not url or not service_key:
        print("\n[ERROR] Missing required environment variables.")
        return 1

    print("\n[2] SERVICE ROLE KEY ANALYSIS")
    try:
        payload = _decode_jwt_payload(service_key)
        role = payload.get("role")
        print(f"    Role: {role or 'UNKNOWN'}")
        print(f"    Issuer: {payload.get('iss', 'UNKNOWN')}")
        print(f"    Ref: {payload.get('ref', 'UNKNOWN')}")
        if role != "service_role":
            print(f"\n[ERROR] Expected role 'service_role', got '{role}'.")
            return 2
    except Exception as exc:
        print(f"    [ERROR] Could not decode JWT: {exc}")
        return 2

    print("\n[3] TESTING SERVICE ROLE CONNECTION")
    try:
        client = create_client(url, service_key)
        print("    Client created successfully")
    except Exception as exc:
        print(f"    [ERROR] Failed to create client: {exc}")
        return 3

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
        except Exception as exc:
            error_str = str(exc)
            if "42501" in error_str:
                print(f"    {table}: PERMISSION DENIED (RLS blocking service_role)")
            elif "42P01" in error_str:
                print(f"    {table}: TABLE DOES NOT EXIST")
            else:
                print(f"    {table}: ERROR - {exc}")

    print("\n[5] RLS STATUS CHECK")
    print("    Run this SQL in Supabase Dashboard > SQL Editor:")
    print()
    print("    SELECT tablename, rowsecurity")
    print("    FROM pg_tables")
    print("    WHERE schemaname = 'public'")
    print("    AND tablename IN ('reporting_windows', 'enterprises', 'detection_summary');")
    print()

    print("\n[6] TO FIX PERMISSION DENIED ERRORS")
    print("    Option A: Disable RLS (development only)")
    print("    ALTER TABLE reporting_windows DISABLE ROW LEVEL SECURITY;")
    print()
    print("    Option B: Add policy for service role")
    print("    CREATE POLICY \"Service role full access\" ON reporting_windows")
    print("      FOR ALL")
    print("      USING (auth.role() = 'service_role');")
    print()

    print("=" * 60)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())