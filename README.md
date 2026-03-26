# LGU Dashboard Prototype (San Pedro City, Laguna)

A functional front-end simulation for an LGU Dashboard with:

- **Backend:** FastAPI (mock REST data only)
- **Frontend:** React (Vite SPA)
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Map:** Google Maps JavaScript API via `@react-google-maps/api`

## Features Implemented

### Authentication Flow
- Login page: **"LGU San Pedro City - Portal Access"**
- Sign-up page: **"Create New Account"**
- Route links between login/sign-up and protected dashboard routes

### Dashboard Container + Views
- Persistent left sidebar (Overview, Map View, Enterprises, Reports, Settings)
- Header with dashboard title, search input, and admin profile block
- **Overview** with:
  - Google Map centered on San Pedro City
  - Heatmap overlay from mock data
  - Barangay polygons (Pacita 1 & 2, San Antonio, San Vicente, United Bayanihan, Landayan, Guevara)
  - Analytics metric cards + sparkline trend visuals
  - Peak hour bar chart
  - Recent activities list
- **Map View** with:
  - Large interactive Google Map with clickable barangay polygons
  - Right panel listing enterprises for selected barangay
  - "View Details" navigation to enterprise analytics screen
- **Enterprise Analytics** with:
  - Pie chart (Male vs Female)
  - Bar chart (Residents vs Non-Residents vs Foreign Tourists)
  - Line chart (visitor trends)
  - Report history table
- **Enterprises** with:
  - "Registered Businesses" table
  - Search and business-type filters
- **Reports** with:
  - Date range and business-type controls
  - "Quarterly Visitor Demographics" bar chart
  - "Submitted Reports" status list

## Project Structure

```text
LGU DASHBOARD PROTOTYPE/
├── backend/
│   ├── data/
│   │   └── san_pedro_barangays.geojson
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── .env
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── index.css
│       ├── main.jsx
│       ├── components/
│       │   ├── CityMap.jsx
│       │   ├── DashboardLayout.jsx
│       │   └── MetricCard.jsx
│       ├── services/
│       │   └── api.js
│       └── views/
│           ├── EnterpriseAnalyticsView.jsx
│           ├── EnterprisesView.jsx
│           ├── LoginView.jsx
│           ├── MapView.jsx
│           ├── OverviewView.jsx
│           ├── ReportsView.jsx
│           ├── SettingsView.jsx
│           └── SignUpView.jsx
├── .env
├── .gitignore
└── README.md
```

## Environment Variables

### Frontend (`frontend/.env`)

- `VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE`
- `VITE_API_BASE_URL=http://127.0.0.1:8000`

> Replace the Google Maps key placeholder with a valid key that has Maps JavaScript API enabled.

## Run Instructions

### 1) Backend (FastAPI)

1. Open a terminal in `backend/`
2. Create and activate a virtual environment
3. Install dependencies
4. Run API server

API base URL: `http://127.0.0.1:8000`

Available mock endpoints:
- `GET /api/health`
- `GET /api/overview`
- `GET /api/barangays`
- `GET /api/barangays/{barangay_name}/enterprises`
- `GET /api/enterprises`
- `GET /api/enterprises/{enterprise_id}/analytics`
- `GET /api/reports`
- `GET /api/barangays/geojson`

### 2) Frontend (React + Vite)

1. Open a second terminal in `frontend/`
2. Install dependencies
3. Start dev server
4. Open the local URL shown by Vite (default `http://localhost:5173`)

## Notes

- This is a **prototype state** implementation with hard-coded mock data in the backend.
- No database is required.
- You can place official San Pedro barangay boundaries in `backend/data/san_pedro_barangays.geojson`.
- When that file has valid GeoJSON features, the backend automatically uses those polygons instead of synthetic fallback shapes.
- Expected feature properties: `name` (or `barangay`/`BARANGAY`) with Polygon or MultiPolygon geometry.
