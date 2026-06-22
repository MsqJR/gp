# AGENTS.md — Medify

Full-stack medical website builder: **Next.js 16** (App Router, Turbopack) frontend + **Django 4.2 / DRF 3.14** backend.

## Commands

```bash
# Frontend (cd frontend)
npm run dev          # dev server :3000
npm run build && npm start   # prod build + serve
npm run lint         # next lint
npx tsc --noEmit     # typecheck (no dedicated script)

# Backend (cd backend)
python manage.py runserver        # :8000
python manage.py test              # all tests
python manage.py test core.tests   # single app
python manage.py test pharmacies.tests.test_views.TestClass.test_method
flake8 .                           # lint (E501 ignored, see setup.cfg)
pyright                            # typecheck
python manage.py makemigrations && python manage.py migrate
```

## Architecture

- **Monorepo**: `frontend/` (Next.js), `backend/` (Django), `myenv/` (ignored Python venv).
- **API**: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api`). JWT auth (access + refresh). Backend uses `rest_framework_simplejwt` with 7d access / 30d refresh, rotate+blacklist.
- **Multi-tenancy**: Frontend middleware rewrites `*.localhost:3000` → `app/[subdomain]/`. Backend CORS allows subdomain regexes.
- **Business types**: `hospital` (CRM features) and `pharmacy` (e-commerce + product catalog).

### Backend apps (`backend/`)

| App | Responsibility |
|---|---|
| `core/` | Shared models (User, WebsiteSetup, BusinessInfo), auth, chatbot API, subdomain routing |
| `hospitals/` | Departments, doctors, schedules, appointments, public/pages API |
| `pharmacies/` | Products, orders, CSV bulk upload, **Google Sheets bidirectional sync** |
| `rag_model/` | RAG service for medical chatbot (sentence-transformers, FAISS, Gemini) |

The old `api/` app has been fully migrated into `core/`, `hospitals/`, `pharmacies/`.

### Frontend layout (`frontend/`)

- `app/[subdomain]/` — public tenant website pages
- `app/dashboard/` — authenticated user dashboard
- `app/templates/` — pharmacy template pages
- `components/ui/` — reusable (Button, Input, Modal, Card, etc.)
- `lib/` — API clients (`api.ts`, `auth.ts`, `pharmacy*.ts`, etc.)
- `contexts/SubscriptionContext.tsx` — subscription state
- Path alias `@/*` → `./*`

## Key workflows

- **Pharmacy templates**: `/templates/pharmacy/1`–`/6`. Purchase/activate/cancel persisted in backend. Owner + visitor preview mirrors in local storage.
- **Pharmacy product sync**: Google Sheets API (service account). Share sheet with service account email as Editor. Config: `GOOGLE_SERVICE_ACCOUNT_FILE` or `GOOGLE_SERVICE_ACCOUNT_JSON`.
- **AI Chatbot**: Chatbot API at `/api/chatbot/` with RAG. Config: `HF_MEDICAL_MODEL_ID` (Phi-3-mini), `GEMINI_API_KEY`, HuggingFace token.
- **Auth flow**: signup → login → JWT → `business-info`, `website-setups`, product/pharmacy endpoints. Full password reset + account deletion implemented.

## Testing quirks

- No frontend test framework installed.
- Backend tests use Django's test runner: `python manage.py test`.
- `backend/tests/qa_test.py` is an end-to-end QA script that requires the dev server running (hits `localhost:8000`).
- Standard library stubs (`backend/tests/test.py`, `test_csv_import.py`) exist but may be unmaintained.

## Env

- **Frontend** `.env`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- **Backend** `.env`: `SECRET_KEY`, `DEBUG`, `DB_ENGINE` (sqlite/postgresql), `FRONTEND_URL`, `HF_MEDICAL_MODEL_ID`, `HUGGINGFACE_API_TOKEN`, `GEMINI_API_KEY`, Google Sheets service account config.

Database: SQLite by default. Switch to PostgreSQL by setting `DB_ENGINE=postgresql` and DB_* vars.

## Existing instruction files

- `backend/.Agents/AGENTS.md` — stale (pre-migration `api/` structure), keep for historical reference only.
- `backend/.Agents/MIGRATION_PLAN.md` — migration was already completed.
- `backend/pharmacies/PHARMACY_GUIDE.md` — detailed pharmacy API usage.
- `backend/pharmacies/IMPLEMENTATION_SUMMARY.md` — pharmacy feature summary.
