# Demo Deployment Guide (GitHub + Cloud)

This project is deployed as two services:

- **Backend (FastAPI)** on Render
- **Frontend (Vite/React)** on Vercel

---

## 1) Backend deploy (Render)

1. Go to Render dashboard and click **New +** → **Blueprint**.
2. Connect GitHub and select repository: `ali22-ui/PROTOTYPE`.
3. Render will detect `render.yaml` and create service:
   - `lgu-dashboard-backend`
4. Click **Apply** / **Deploy**.
5. After deploy, copy backend URL:
   - Example: `https://lgu-dashboard-backend.onrender.com`

Health check URL:

- `https://<your-backend-domain>/api/health`

---

## 2) Frontend deploy (Vercel)

1. Go to Vercel dashboard and click **Add New** → **Project**.
2. Import repository: `ali22-ui/PROTOTYPE`.
3. Set **Root Directory** to `frontend`.
4. Add environment variables:
   - `VITE_API_BASE_URL=https://<your-render-backend-domain>`
   - `VITE_GOOGLE_MAPS_API_KEY=<your-key>`
5. Deploy.

Vercel config (`frontend/vercel.json`) already handles SPA route rewrites.

---

## 3) Share links to groupmates

After both deployments are done, share:

- Frontend: `https://<your-vercel-project>.vercel.app`
- Backend health: `https://<your-render-backend-domain>/api/health`

---

## Notes

- WebSocket camera stream should use `wss://` automatically when frontend is on HTTPS.
- CORS is currently open (`*`) for demo.
- Data is in-memory mock data; backend restart resets runtime state.
