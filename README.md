# Fieldnotes

Fieldnotes is a small shared research log for the SIH26083 Extreme Heatwave Early Warning prototype. The repository contains the React/Vite frontend in `frontend/` and the Express/SQLite API in `backend/`.

## Backend locally

```sh
cd backend
cp .env.example .env
npm install
npm run dev
```

The API runs on `http://localhost:3000`. The local database is created at `backend/data/fieldnotes.db`. Set `DATABASE_PATH` to another path when needed.

Available routes:

- `GET /api/findings?phase=scoping`
- `POST /api/findings`
- `GET /api/roles`
- `POST /api/roles`
- `PUT /api/roles/:id`
- `GET /health`

Finding phases are `scoping`, `wbgt-utci`, `ml-model`, `backend-postgis`, `dashboard`, `alert-api`, and `integration`.

Example request:

```sh
curl -X POST http://localhost:3000/api/findings \
  -H 'Content-Type: application/json' \
  -d '{"phase":"scoping","contributor":"Kunal","title":"Station coverage","body":"IMD exposes 764 stations.","tags":["IMD","data"]}'
```

## Deploy to Railway

1. Push this repository to GitHub and create a new Railway project from the repository.
2. Create a service for the repository and set its **Root Directory** to `backend`.
3. Add a Railway Volume to that service with mount path `/data`.
4. Set these variables in the backend service:
   - `DATABASE_PATH=/data/fieldnotes.db`
   - `FRONTEND_URL=https://your-frontend-domain.example`
   - `PORT` is injected by Railway; do not hard-code it.
5. Deploy. Railway uses `backend/railway.json` or the `npm start` script automatically.
6. Copy the generated public backend URL, for example `https://fieldnotes-api-production.up.railway.app`, and set `VITE_API_URL` in the frontend deployment to that URL.

The volume is important: Railway's container filesystem is ephemeral, while `/data/fieldnotes.db` survives redeploys when the volume remains attached.

## Frontend API calls

Use the backend URL from a Vite environment variable instead of keeping findings and roles only in React state:

```js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export async function getFindings(phase) {
  const query = phase ? `?phase=${encodeURIComponent(phase)}` : ''
  const response = await fetch(`${API_URL}/api/findings${query}`)
  if (!response.ok) throw new Error('Could not load findings')
  return response.json()
}

export async function createFinding(finding) {
  const response = await fetch(`${API_URL}/api/findings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(finding),
  })
  if (!response.ok) throw new Error('Could not create finding')
  return response.json()
}

export async function getRoles() {
  const response = await fetch(`${API_URL}/api/roles`)
  if (!response.ok) throw new Error('Could not load roles')
  return response.json()
}
```

The UI's display labels should be mapped to API phase slugs before calling the API, for example `Scoping & Data Recon` to `scoping`.
