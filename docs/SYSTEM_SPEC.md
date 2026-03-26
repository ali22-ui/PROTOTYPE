# Multi-Tenant AI Video Analytics Platform Spec

## Implemented Modules

- **Enterprise Portal (Tier 1):** `/enterprise/login` -> `/enterprise/dashboard`
- **LGU Central Portal (Tier 2):** `/login` -> `/app/*`
- **Mock API:** `backend/main.py`

## Separation Model

- Enterprise users authenticate with `enterprise-auth` and access only `/enterprise/*` routes.
- LGU users authenticate with `lgu-auth` and access only `/app/*` routes.
- Enterprise reporting submits to shared backend LGU endpoints, so systems are separate but connected.

## Backend Endpoints

### Enterprise

- `GET /api/enterprise/profile`
- `GET /api/enterprise/dashboard`
- `GET /api/enterprise/reporting-window-status`
- `POST /api/enterprise/export/csv`
- `POST /api/enterprise/export/pdf`
- `POST /api/enterprise/reports/submit`

### LGU

- `GET /api/lgu/overview`
- `GET /api/lgu/reports`
- `GET /api/lgu/reports/{report_id}`
- `POST /api/lgu/reporting-window/open`
- `POST /api/lgu/reporting-window/close`

## State Rules

- Submit Reports to LGU is enabled only when reporting window status is `OPEN`.
- Submission changes status to `SUBMITTED`.
- LGU can open/close windows per enterprise + period.

## Mock Contracts

Located in `backend/mock_data/`:

- `enterprise_profile_archies.json`
- `live_ai_detections_archies.json`
- `enterprise_dashboard_daily_archies.json`
- `lgu_report_pack_archies_2026_03.json`
