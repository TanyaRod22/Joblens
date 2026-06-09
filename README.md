# Joblens

Browser extension that scans job postings on LinkedIn, Greenhouse, Lever, Workday, Ashby, and other careers pages, then uses OpenAI to generate interview prep: role requirements, technical skills, why this role/company, cold email talking points, and questions to ask.

## Project structure

```
Joblens/
├── backend/          # FastAPI service (OpenAI proxy)
└── my-extension/     # Chrome MV3 extension
```

## Backend setup

### 1. Create environment file

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set your OpenAI API key:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID,http://localhost:8006
RATE_LIMIT_PER_MINUTE=10
PORT=8006
```

### 2. Install dependencies and run

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8006
```

Verify the API is up:

```bash
curl http://localhost:8006/health
```

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | — |
| `OPENAI_MODEL` | Model for analysis | `gpt-4o-mini` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `*` |
| `RATE_LIMIT_PER_MINUTE` | Max requests per IP per minute | `10` |
| `PORT` | Local dev port (documentation only) | `8006` |

## Extension setup

### 1. Configure API URL

Edit [`my-extension/config.js`](my-extension/config.js):

```js
const JOBSCRAPPER_CONFIG = {
  apiUrl: "http://localhost:8006/analyze-job",
};
```

For production, change `apiUrl` to your deployed backend (e.g. `https://api.yourdomain.com/analyze-job`).

### 2. Add production host permission

When using a remote API, add your backend URL to [`my-extension/manifest.json`](my-extension/manifest.json) under `host_permissions`:

```json
"host_permissions": [
  "https://api.yourdomain.com/*",
  ...
]
```

Also add the same origin to `ALLOWED_ORIGINS` in the backend `.env`.

### 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `my-extension/` folder
4. Copy the extension ID and add it to backend `ALLOWED_ORIGINS`:
   ```
   ALLOWED_ORIGINS=chrome-extension://abcdefghijklmnop,http://localhost:8006
   ```

### 4. Use the extension

1. Open a job posting (LinkedIn, Greenhouse, Lever, etc.)
2. Click the JobScrapper icon or floating tab on the right edge
3. Click **Scan Job**
4. If the page scrape is low confidence, paste the job description manually and click **Analyze**

## Production deployment

1. Deploy the FastAPI backend (Railway, Render, Fly.io, etc.)
2. Set environment variables on the host (`OPENAI_API_KEY`, `ALLOWED_ORIGINS`, `RATE_LIMIT_PER_MINUTE`)
3. Update `config.js` with the production `apiUrl`
4. Add the production URL to `manifest.json` `host_permissions`
5. Reload the extension in Chrome

## API

### `GET /health`

Returns `{ "status": "ok" }`.

### `POST /analyze-job`

**Request body:**

```json
{
  "title": "Software Engineer",
  "company": "Acme Inc.",
  "location": "Remote",
  "description": "Full job description text...",
  "url": "https://..."
}
```

**Response:**

```json
{
  "role_requirements": ["..."],
  "technical_skills": ["React", "TypeScript"],
  "why_role": "...",
  "why_company": "...",
  "cold_email_points": ["..."],
  "questions_to_ask": ["..."]
}
```

**Error codes:**

- `400` — description too short
- `429` — rate limit exceeded
- `500` — OpenAI or server error

## Notes

- The OpenAI API key lives only on the backend, never in the extension.
- Job text is sent to your backend and then to OpenAI for analysis.
- LinkedIn and Workday pages vary; use the manual paste fallback when scraping is unreliable.
