# Medify - Medical Website Builder

A modern, professional SaaS platform for building medical websites for Hospitals and Pharmacies. Built with Next.js 16, TypeScript, and Tailwind CSS.

## Overview

Medify is a full-stack application (Next.js frontend + Django REST API backend) that enables medical facilities to create professional websites through an intuitive interface. The platform offers two distinct workflows:

- **🏥 Hospital Websites** - Feature-based website creation with customizable modules
- **💊 Pharmacy Websites** - Template-based website creation with pre-designed layouts
- **🤖 AI Assistant** -  Chatbot for patins and rag model 

## Project Structure

```
.
├── frontend/            # Next.js 16 application (UI)
│   ├── app/             # Next.js app directory (App Router)
│   ├── components/      # Reusable React components
│   ├── public/          # Static assets
│   └── package.json     # Frontend dependencies & scripts
└── backend/             # Django REST API
    ├── medify_backend/  # Django project settings & URLs
    ├── api/             # Core API app (models, serializers, views)
    ├── manage.py        # Django management script
    └── requirements.txt # Backend dependencies
```

## Features

- **Landing Page** - Marketing page with features, pricing, and testimonials
- **User Authentication** - Signup, login, logout, forgot password, password reset, and account deletion
- **Dashboard** - Comprehensive dashboard with setup progress tracking
- **Hospital Setup** - Feature selection and configuration for hospitals
- **Pharmacy Setup** - Purchase, activation, cancellation, and customization for pharmacy templates
- **Business Info Forms** - Collect and manage business information
- **AI Assistant** - Chat interface for website management assistance
- **Settings** - Account and website configuration
- **Payment Integration** - Payment modal for Visa and Fawry (UI ready)
- **Responsive Design** - Mobile-first design that works on all devices

## Tech Stack

- **Frontend Framework**: Next.js 16 (App Router)
- **Frontend Language**: TypeScript 5.5+
- **Styling**: Tailwind CSS
- **Icons**: React Icons
- **Frontend Architecture**: Component-based, reusable UI components
- **Backend Framework**: Django 4 + Django REST Framework
- **Backend Language**: Python 3.10+
- **Database**: SQLite (default) or PostgreSQL
- **Authentication**: JWT (via `rest_framework_simplejwt`)

## Getting Started

### Prerequisites

- Node.js 20.9.0 or later
- Python 3.10 or later
- npm or yarn
- (Optional) PostgreSQL 14+ if you don't want to use the default SQLite database

### 1. Backend (Django API)

```bash
cd backend

# (first time) create & activate virtualenv
# from backend/ (venv active or not)
deactivate  # if the venv is active

Remove-Item -Recurse -Force venv

# create venv with a supported Python (pick one you have installed)
py -3.11 -m venv venv
# or: py -3.10 -m venv venv

venv\Scripts\Activate.ps1

# source venv/bin/activate      # Mac/Linux

# install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# copy environment template and adjust if needed
copy .env.example .env          # Windows
# cp .env.example .env          # Mac/Linux

# apply migrations
python manage.py migrate

# run server
python manage.py runserver
```

The backend API will be available at `http://localhost:8000/api/`.

### 2. Frontend (Next.js app)

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

### 3. Environment Variables

- **Backend**: Configure `backend/.env` (see `.env.example`) for `SECRET_KEY`, `DEBUG`, database settings (`DB_ENGINE`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`), and `FRONTEND_URL`.
- **Frontend**: Set the API base URL via Next.js env vars (for example: `NEXT_PUBLIC_API_URL=http://localhost:8000/api`).

## Authentication Flows (Implemented)

The authentication system now includes full account lifecycle flows in both backend and frontend.

- `POST /api/auth/logout/`
    - Revokes refresh tokens via JWT blacklist.
    - Payload supports:
        - `refresh` (single-session logout)
        - `all_devices` (logout from all sessions)
- `POST /api/auth/delete-account/`
    - Requires authenticated user plus explicit confirmation:
        - account email
        - current password
        - `confirmation_text: "DELETE"`
    - Permanently removes the account and related data.
- `POST /api/auth/forgot-password/`
    - Sends password reset email with secure Django token.
    - Uses non-enumerating response text for security.
- `POST /api/auth/password-reset/validate/`
    - Validates `uid` and `token` before showing reset form.
- `POST /api/auth/password-reset/confirm/`
    - Sets new password after token validation.
    - Revokes existing refresh tokens for the user.

### Backend Auth Environment Variables

Add these to `backend/.env` for production-ready password reset email flow:

- `DEFAULT_FROM_EMAIL`
- `EMAIL_BACKEND`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `EMAIL_USE_TLS`
- `EMAIL_USE_SSL`
- `FRONTEND_PASSWORD_RESET_PATH` (default: `/reset-password`)
- `PASSWORD_RESET_TIMEOUT` (seconds; default: `3600`)

Notes:

- Ensure migrations are applied (`python manage.py migrate`) so `token_blacklist` tables exist.
- Frontend reset pages are available at `/forgot-password` and `/reset-password`.

## Project Status

- **Frontend**: Integrated with backend APIs for auth, pharmacy profile, product catalog, and template purchase lifecycle.
- **Backend**: Django REST API implemented for authentication, website setup, business info, pharmacy products, and template purchase/cancel persistence.
- **Persistence**: SQLite is used by default for local development; PostgreSQL configuration is available for production (see backend docs).

## Pharmacy Template Workflow

- Pharmacy templates are available under `/templates/pharmacy/1` through `/templates/pharmacy/6`.
- Template purchases are persisted in backend records and surfaced in `/dashboard/pharmacy/templates`.
- Activation requires an active purchase.
- Cancellation marks purchase history as cancelled and clears active selection when applicable.
- Preview/publish flows use backend state with local/public mirrors to keep owner and visitor pages in sync.

## Documentation

For detailed documentation about the frontend application, including:
- Complete feature list
- Component documentation
- Page structure
- Color palette
- Development guidelines

See [frontend/README.md](./frontend/README.md).

For backend API setup, endpoints, and PostgreSQL configuration, see:
- [backend/README.md](./backend/README.md)
- [backend/POSTGRESQL_SETUP.md](./backend/POSTGRESQL_SETUP.md)

## License

This project is part of a full-stack development task.

Set-ExecutionPolicy -Scope CurrentUser RemoteSigned