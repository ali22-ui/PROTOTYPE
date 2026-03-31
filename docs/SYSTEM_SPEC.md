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
- `GET /api/enterprise/settings`
- `PUT /api/enterprise/settings`
- `GET /api/enterprise/profile/extended`
- `PUT /api/enterprise/profile/extended`
- `GET /api/enterprise/preferences`
- `PUT /api/enterprise/preferences`
- `POST /api/enterprise/password/change`
- `POST /api/enterprise/export/csv`
- `POST /api/enterprise/export/pdf`
- `POST /api/enterprise/reports/submit`
- `GET /api/enterprise/reports/history`

Compatibility routes maintained for one release cycle:

- `GET /api/enterprise/account/settings`
- `POST /api/enterprise/account/settings/profile`
- `POST /api/enterprise/account/settings/password`
- `POST /api/enterprise/account/settings/preferences`

### LGU

- `GET /api/lgu/overview`
- `GET /api/lgu/reports`
- `GET /api/lgu/reports/{report_id}`
- `POST /api/lgu/reports/{report_id}/generate-authority-package`
- `POST /api/lgu/reports/{report_id}/authority-package/pdf`
- `POST /api/lgu/reports/{report_id}/authority-package/docx`
- `POST /api/lgu/reporting-window/open`
- `POST /api/lgu/reporting-window/close`
- `POST /api/lgu/reporting-window/open-all`
- `POST /api/lgu/reporting-window/close-all`
- `GET /api/lgu/enterprise-accounts`
- `POST /api/lgu/enterprise-accounts`
- `PUT /api/lgu/enterprise-accounts/{enterprise_id}`
- `DELETE /api/lgu/enterprise-accounts/{enterprise_id}`
- `GET /api/lgu/settings`
- `GET /api/lgu/settings/{setting_key}`
- `PUT /api/lgu/settings`
- `POST /api/lgu/compliance-actions`
- `GET /api/lgu/compliance-actions`
- `GET /api/lgu/infractions`
- `GET /api/lgu/infractions/{enterprise_id}`
- `POST /api/lgu/infractions`
- `POST /api/lgu/infractions/{infraction_id}/resolve`

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
