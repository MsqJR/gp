# Website Title Fix Plan

## Problem

There are two separate `name` fields that are not synced:

| Field | Set by | Used by hospital tenant site? |
|---|---|---|
| `BusinessInfo.name` | "My Website" → "Basic Info" form (`/dashboard/business-info`) | ❌ Not used |
| `HospitalProfile.name` | "Hospital" → "Settings" → "Hospital Name" (`/dashboard/hospital/settings`) | ✅ `[subdomain]/layout.tsx:246` renders `profile?.name` |

Additionally, on login, `seedBusinessInfoName()` in `frontend/lib/auth.ts:60-82` seeds the user's signup name as the initial `BusinessInfo.name` in localStorage, which can cause confusion.

## Flow Trace

### Frontend → Backend (Business Name)

- **Form**: `frontend/app/dashboard/business-info/page.tsx:448-454` — "Business Name" input, `formData.name`
- **Save**: `saveBusinessInfoToBackend()` (line 207) sends `name` via `PATCH /api/business-info/` or `POST /api/business-info/`
- **Backend URL**: `core/urls.py:25` → `BusinessInfoViewSet.partial_update` (`core/views/business_info.py:62`)
- **Serializer**: `BusinessInfoCreateUpdateSerializer` — accepts `name` as CharField (`core/serializers/business_serializers.py:27`)
- **Model**: `BusinessInfo.name` (`core/models/business.py:15`) — `CharField(max_length=255)`

### Backend → Frontend (Hospital Tenant Website)

- **API**: `GET /api/hospital/public/profile/?subdomain=...` → `PublicHospitalViewSet.profile` (`backend/hospitals/views.py`)
- **Serializer**: `HospitalProfileSerializer` — returns `HospitalProfile` fields (`name`, `description`, `logo`, etc.) plus a `business_info` sub-object containing only `contact_phone`, `contact_email`, `address`, `working_hours` — **omits `BusinessInfo.name`** (`backend/hospitals/serializers.py`)
- **Frontend fetch**: `getHospitalProfile(subdomain)` (`frontend/lib/hospitalApi.ts:12`)
- **Rendering**: `[subdomain]/layout.tsx:246` — `{profile?.name || resolvedParams.subdomain}` reads `HospitalProfile.name`

## Resolution Plan

### Option A (Recommended) — Sync `HospitalProfile.name` from `BusinessInfo.name` on backend

1. **Backend**: Override `BusinessInfo.save()` or use a `post_save` signal to propagate `name` to the linked `HospitalProfile` when one exists.

2. **Backend**: Update `HospitalProfileSerializer.get_business_info()` in `backend/hospitals/serializers.py` to include `name` from `BusinessInfo`.

3. **Frontend**: Update `[subdomain]/layout.tsx:246` to fall back to `business_info.name` when `profile?.name` is empty.

### Option B — Frontend-only: seed and update both names from Business Info form

1. **Frontend**: On save of the Business Info form, also call the hospital admin API to update `HospitalProfile.name`.

2. **Frontend**: Add a note in the hospital settings page pointing users to the Business Info form for the hospital name.

### Option C — Full unification

1. Remove the "Hospital Name" field from `/dashboard/hospital/settings`.
2. Have `HospitalProfile.name` always sourced from `BusinessInfo.name` on the backend.
3. Update tenant site layout to read from `HospitalProfile.business_info.name`.

## Implementation Order (for Option A)

1. `backend/core/models/business.py` — Add `post_save` signal or override `save()` to sync `name` to `HospitalProfile`
2. `backend/hospitals/serializers.py` — Add `'name'` to `get_business_info()` return dict
3. `frontend/types/hospital.ts` — Update `HospitalProfile` type or `HospitalBusinessInfo` to include `name`
4. `frontend/app/[subdomain]/layout.tsx` — Add fallback to `business_info.name` for the header and footer
