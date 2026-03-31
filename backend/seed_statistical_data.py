#!/usr/bin/env python3
"""
Statistical Mock Data Seeder Script

Generates controlled statistical datasets for dashboard/report testing.
This script seeds ONLY statistical/aggregate tables - it does NOT:
- Generate live camera frames or websocket stream data
- Create synthetic detection_events or unified_detections
- Simulate real-time camera behavior

Usage:
    python seed_statistical_data.py --help
    python seed_statistical_data.py --enterprise-id ENT001 --start-date 2026-03-01 --end-date 2026-03-31
    python seed_statistical_data.py --all-enterprises --dry-run
    python seed_statistical_data.py --clear --enterprise-id ENT001

Environment:
    Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
    Run from backend directory: python seed_statistical_data.py

Options:
    --enterprise-id     Target enterprise ID (can specify multiple)
    --all-enterprises   Seed data for all known enterprises
    --start-date        Start date for statistical data (YYYY-MM-DD)
    --end-date          End date for statistical data (YYYY-MM-DD)
    --deterministic     Use deterministic seed for reproducible data (default)
    --randomized        Use randomized generation for broader scenario testing
    --dry-run           Preview what would be generated without writing to database
    --clear             Remove all script-generated records for specified enterprises
    --yes               Skip confirmation prompts

Source Tag:
    All generated records are tagged with source='mock_stats_seed' for easy identification and cleanup.
"""

import argparse
import hashlib
import os
import sys
from datetime import datetime, timedelta
from typing import Optional

# Ensure we can import from app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.supabase import get_supabase_client, is_supabase_available


SOURCE_TAG = "mock_stats_seed"
SEED_VERSION = "1.0.0"


def deterministic_seed(enterprise_id: str, date_str: str, hour: int) -> int:
    """Generate a deterministic seed for reproducible random values."""
    data = f"{enterprise_id}:{date_str}:{hour}:{SEED_VERSION}"
    return int(hashlib.sha256(data.encode()).hexdigest()[:8], 16)


def generate_hourly_statistics(
    enterprise_id: str,
    date_str: str,
    hour: int,
    deterministic: bool = True,
    seed_override: Optional[int] = None,
) -> dict:
    """Generate a single hourly statistics record."""
    import random

    if deterministic:
        seed = seed_override or deterministic_seed(enterprise_id, date_str, hour)
        rng = random.Random(seed)
    else:
        rng = random.Random()

    # Realistic visitor patterns: busier mid-day, quieter early/late
    hour_factor = {
        6: 0.1, 7: 0.2, 8: 0.4, 9: 0.7, 10: 0.9, 11: 1.0,
        12: 0.95, 13: 0.85, 14: 0.9, 15: 0.95, 16: 1.0, 17: 0.9,
        18: 0.7, 19: 0.5, 20: 0.3, 21: 0.15, 22: 0.05,
    }.get(hour, 0.1)

    base_visitors = int(rng.randint(20, 80) * hour_factor)
    male_total = int(base_visitors * rng.uniform(0.45, 0.55))
    female_total = base_visitors - male_total
    unknown_total = rng.randint(0, max(1, int(base_visitors * 0.05)))

    total_tracks = base_visitors + rng.randint(10, 30)
    unique_visitors = base_visitors

    # Re-identification stats
    reid_geometric = rng.randint(5, 15)
    reid_appearance = rng.randint(3, 12)
    reid_face = rng.randint(1, 8)
    reid_total = reid_geometric + reid_appearance + reid_face

    dedup_ratio = 1 - (unique_visitors / total_tracks) if total_tracks > 0 else 0

    return {
        "enterprise_id": enterprise_id,
        "date": date_str,
        "hour": hour,
        "male_total": male_total,
        "female_total": female_total,
        "unknown_total": unknown_total,
        "unique_visitors": unique_visitors,
        "avg_dwell_seconds": rng.randint(60, 900),
        "dedup_stats": {
            "total_tracks": total_tracks,
            "unique_persons": unique_visitors,
            "reid_success_count": reid_total,
            "reid_by_geometric": reid_geometric,
            "reid_by_appearance": reid_appearance,
            "reid_by_face": reid_face,
            "dedup_ratio": round(dedup_ratio, 3),
        },
        "source": SOURCE_TAG,
        "seed_version": SEED_VERSION,
    }


def generate_statistics_for_range(
    enterprise_id: str,
    start_date: datetime,
    end_date: datetime,
    deterministic: bool = True,
) -> list[dict]:
    """Generate statistics records for a date range."""
    records = []
    current_date = start_date

    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")
        # Operating hours: 6 AM to 10 PM
        for hour in range(6, 23):
            record = generate_hourly_statistics(
                enterprise_id=enterprise_id,
                date_str=date_str,
                hour=hour,
                deterministic=deterministic,
            )
            records.append(record)
        current_date += timedelta(days=1)

    return records


def clear_seeded_data(enterprise_ids: list[str], dry_run: bool = False) -> int:
    """Remove all script-generated records for specified enterprises."""
    if not is_supabase_available():
        print("ERROR: Supabase is not configured. Cannot clear data.")
        return 0

    client = get_supabase_client()
    total_deleted = 0

    for enterprise_id in enterprise_ids:
        if dry_run:
            # Count what would be deleted
            result = (
                client.table("visitor_statistics")
                .select("id", count="exact")
                .eq("enterprise_id", enterprise_id)
                .eq("source", SOURCE_TAG)
                .execute()
            )
            count = result.count or 0
            print(f"  Would delete {count} records for {enterprise_id}")
            total_deleted += count
        else:
            result = (
                client.table("visitor_statistics")
                .delete()
                .eq("enterprise_id", enterprise_id)
                .eq("source", SOURCE_TAG)
                .execute()
            )
            deleted = len(result.data) if result.data else 0
            print(f"  Deleted {deleted} records for {enterprise_id}")
            total_deleted += deleted

    return total_deleted


def seed_statistics(
    enterprise_ids: list[str],
    start_date: datetime,
    end_date: datetime,
    deterministic: bool = True,
    dry_run: bool = False,
) -> int:
    """Seed statistical data for enterprises."""
    if not is_supabase_available():
        print("ERROR: Supabase is not configured. Cannot seed data.")
        return 0

    client = get_supabase_client()
    total_inserted = 0

    for enterprise_id in enterprise_ids:
        records = generate_statistics_for_range(
            enterprise_id=enterprise_id,
            start_date=start_date,
            end_date=end_date,
            deterministic=deterministic,
        )

        if dry_run:
            print(f"  Would insert {len(records)} records for {enterprise_id}")
            total_inserted += len(records)
        else:
            # Upsert to handle re-runs
            try:
                for record in records:
                    # Check if record exists
                    existing = (
                        client.table("visitor_statistics")
                        .select("id")
                        .eq("enterprise_id", record["enterprise_id"])
                        .eq("date", record["date"])
                        .eq("hour", record["hour"])
                        .execute()
                    )

                    if existing.data:
                        # Update existing
                        record["updated_at"] = datetime.now().isoformat()
                        client.table("visitor_statistics").update(record).eq(
                            "id", existing.data[0]["id"]
                        ).execute()
                    else:
                        # Insert new
                        client.table("visitor_statistics").insert(record).execute()

                    total_inserted += 1

                print(f"  Inserted/updated {len(records)} records for {enterprise_id}")
            except Exception as e:
                print(f"  ERROR seeding {enterprise_id}: {e}")

    return total_inserted


def get_known_enterprise_ids() -> list[str]:
    """Get list of known enterprise IDs from database or fallback to defaults."""
    if is_supabase_available():
        try:
            client = get_supabase_client()
            result = client.table("enterprises").select("id").execute()
            if result.data:
                return [row["id"] for row in result.data]
        except Exception:
            pass

    # Fallback to common test enterprise IDs
    return ["ENT001", "ENT002", "ENT003"]


def main():
    parser = argparse.ArgumentParser(
        description="Statistical Mock Data Seeder - generates controlled test data for dashboards and reports"
    )
    parser.add_argument(
        "--enterprise-id",
        action="append",
        dest="enterprise_ids",
        help="Target enterprise ID (can specify multiple times)",
    )
    parser.add_argument(
        "--all-enterprises",
        action="store_true",
        help="Seed data for all known enterprises",
    )
    parser.add_argument(
        "--start-date",
        type=str,
        default=(datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
        help="Start date (YYYY-MM-DD), default: 30 days ago",
    )
    parser.add_argument(
        "--end-date",
        type=str,
        default=datetime.now().strftime("%Y-%m-%d"),
        help="End date (YYYY-MM-DD), default: today",
    )
    parser.add_argument(
        "--deterministic",
        action="store_true",
        default=True,
        help="Use deterministic seed for reproducible data (default)",
    )
    parser.add_argument(
        "--randomized",
        action="store_true",
        help="Use randomized generation for broader scenario testing",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be generated without writing to database",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Remove all script-generated records for specified enterprises",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompts",
    )

    args = parser.parse_args()

    # Determine enterprise IDs
    if args.all_enterprises:
        enterprise_ids = get_known_enterprise_ids()
    elif args.enterprise_ids:
        enterprise_ids = args.enterprise_ids
    else:
        print("ERROR: Must specify --enterprise-id or --all-enterprises")
        sys.exit(1)

    # Parse dates
    try:
        start_date = datetime.strptime(args.start_date, "%Y-%m-%d")
        end_date = datetime.strptime(args.end_date, "%Y-%m-%d")
    except ValueError as e:
        print(f"ERROR: Invalid date format: {e}")
        sys.exit(1)

    # Determine mode
    deterministic = not args.randomized
    mode_str = "deterministic" if deterministic else "randomized"

    print("=" * 60)
    print("Statistical Mock Data Seeder")
    print("=" * 60)
    print(f"Mode: {mode_str}")
    print(f"Enterprises: {', '.join(enterprise_ids)}")
    print(f"Date range: {args.start_date} to {args.end_date}")
    print(f"Source tag: {SOURCE_TAG}")
    print(f"Dry run: {args.dry_run}")
    print()

    if args.clear:
        print("Action: CLEAR existing seeded data")
        if not args.yes and not args.dry_run:
            confirm = input("Proceed with clearing data? [y/N]: ")
            if confirm.lower() != "y":
                print("Aborted.")
                sys.exit(0)

        total = clear_seeded_data(enterprise_ids, dry_run=args.dry_run)
        print(f"\nTotal records {'would be deleted' if args.dry_run else 'deleted'}: {total}")
    else:
        print("Action: SEED statistical data")
        if not args.yes and not args.dry_run:
            confirm = input("Proceed with seeding data? [y/N]: ")
            if confirm.lower() != "y":
                print("Aborted.")
                sys.exit(0)

        total = seed_statistics(
            enterprise_ids=enterprise_ids,
            start_date=start_date,
            end_date=end_date,
            deterministic=deterministic,
            dry_run=args.dry_run,
        )
        print(f"\nTotal records {'would be created' if args.dry_run else 'created/updated'}: {total}")

    print("\nDone.")


if __name__ == "__main__":
    main()
