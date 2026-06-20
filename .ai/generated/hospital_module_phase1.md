# Medify Hospital Module (Phase 1)

## 1. System Overview
The Hospital Module introduces a new multi-tenant SaaS application within the Medify ecosystem. It provides hospitals with a website builder and an appointment booking engine specifically tailored to guest users. The architecture aligns seamlessly with the existing Pharmacy module.

## 2. Architecture Design
The architecture is tightly coupled with Medify's existing multi-tenant structure using the `WebsiteSetup` model:
- `HospitalProfile` has a strict 1-to-1 relationship with `WebsiteSetup`.
- All hospital-specific entities (`Department`, `Doctor`, `Appointment`, `Page`, `Block`) are linked directly to `WebsiteSetup` to ensure robust data isolation between tenants.

## 3. Data Models
- **`HospitalProfile`**: Contains high-level configurations like timezone, theme settings, and publishing status. Linked 1:1 with `WebsiteSetup`.
- **`Department`**: Represents hospital departments (e.g., Cardiology, Neurology). Linked to `WebsiteSetup`.
- **`Doctor`**: Represents medical professionals, linked to both `WebsiteSetup` and `Department`. Includes an `is_active` field for soft deletion.
- **`DoctorSchedule`**: Defines a doctor's weekly working hours (day of week, start time, end time, and slot duration).
- **`Appointment`**: Represents guest patient bookings. Uses `start_datetime` and `end_datetime` to eliminate timezone ambiguities and simplify overlap calculations.
- **`Page` and `Block`**: Comprise the structured website builder. Blocks include specific types and a `settings` JSON field for configuration.

## 4. API Endpoints
### Admin APIs (Protected)
- `/api/hospital/admin/profile/`: CRUD for the tenant's `HospitalProfile` (and triggers default template generation on creation).
- `/api/hospital/admin/departments/`: CRUD for `Department` models.
- `/api/hospital/admin/doctors/`: CRUD for `Doctor` models.
- `/api/hospital/admin/schedules/`: CRUD for `DoctorSchedule` models.

### Public APIs (Guest Access)
- `/api/hospital/public/pages/`: Read-only endpoints fetching published pages and blocks.
- `/api/hospital/public/departments/`: Read-only endpoint for departments.
- `/api/hospital/public/doctors/`: Read-only endpoint for active doctors.
- `/api/hospital/booking/available_slots/` (GET): Fetches open slots for a specific doctor on a given date.
- `/api/hospital/booking/create_appointment/` (POST): Submits a guest booking and creates an appointment if the slot is still available.

## 5. Booking Engine Explanation
The booking engine dynamically computes available slots on-the-fly rather than storing them in the database:
1. It retrieves the `DoctorSchedule` for the target day of the week.
2. It fetches all existing, non-cancelled `Appointment`s for that day.
3. It iterates over the schedule using the `slot_duration_minutes` to generate potential slots.
4. It evaluates overlap using explicit bounds: `existing.start < new_end AND existing.end > new_start`. Slots that don't overlap are yielded as available.

## 6. Block System
The website builder uses a strict block-based structure (no drag-and-drop canvas):
- A `Page` acts as a container. `is_home` distinguishes the main landing page.
- `Block` elements are vertically stacked using an `order` integer.
- Strict block types (`HERO_BLOCK`, `DOCTORS_LIST_BLOCK`, `DEPARTMENTS_BLOCK`, etc.) enforce consistent design.
- Block configurations are stored in a `settings` JSONField, ensuring flexibility without modifying the database schema.

## 7. Template System
To streamline onboarding, the `template_service.py` script automatically scaffolds a fully functional website when a new `HospitalProfile` is created. It generates a Home Page with a Hero block, Departments block, and Doctors block, alongside a separate Booking Page with a Booking Form block—all pre-configured with standard `settings`.

## 8. Testing Section
Thorough testing was conducted using Django's built-in `TestCase` and the `APIClient`. All tests executed successfully in 3.843s.

### Test Scenarios & Results
1. **Slot Generation Test**: Created a doctor schedule and fetched slots. 
   - *Expected*: Returns exactly the non-overlapping slots as defined by the duration. 
   - *Actual*: Correctly generated 4 slots for a 2-hour window. (Passed)
2. **Booking Test**: Booked a valid slot and verified DB creation. 
   - *Expected*: The slot is deducted from the available pool. 
   - *Actual*: Available slots reduced from 4 to 3. (Passed)
3. **Double Booking Test**: Attempted to book an already occupied slot. 
   - *Expected*: System raises an `IntegrityError` due to DB constraints. 
   - *Actual*: Error correctly raised and caught. (Passed)
4. **Schedule Conflict Test**: Attempted to fetch slots on a non-working day. 
   - *Expected*: Returns 0 slots. 
   - *Actual*: Returned an empty list. (Passed)
5. **Multi-slot Day Test**: Doctor with two separate schedule blocks on the same day (morning and evening). 
   - *Expected*: Slots generated accurately for both periods. 
   - *Actual*: Correctly returned all 6 combined slots. (Passed)
6. **Concurrency Test**: Simulated two concurrent booking requests for the exact same slot using explicit overlap checks inside an atomic transaction. 
   - *Expected*: The first succeeds (201 Created), the second fails (409 Conflict). 
   - *Actual*: First response 201, second response 409. (Passed)

**Validation Conclusion**: The system meets all functional and concurrency requirements for Phase 1.

## 9. Edge Cases Handled
- **Double Booking**: Mitigated via a combination of atomic transactions with explicit overlap queries (`existing.start < new_end AND existing.end > new_start`) and a database-level `unique_together` constraint on `(doctor, start_datetime)`.
- **Timezone Consistency**: Handled via storing all times using Django's timezone-aware datetime objects (`DateTimeField`), defaulting to UTC. A `timezone` field was added to the `HospitalProfile` for localized rendering in future frontend phases.
- **Schedule Gaps/Breaks**: Supported natively since `DoctorSchedule` allows defining multiple discrete working blocks (e.g., 09:00-12:00 and 13:00-17:00) for a single day.
- **Invalid Booking Times**: Addressed by strictly validating the requested `start_datetime` and `end_datetime` against dynamic slot generation logic.

## 10. How to Run / Integrate
The code is fully integrated into the backend. 
1. The app `hospitals` is registered in `INSTALLED_APPS` inside `backend/medify_backend/settings.py`.
2. Migrations have been generated and applied to the database.
3. The routing is wired up in `backend/medify_backend/urls.py` under the `/api/hospital/` prefix.
4. To test, use `python manage.py test hospitals`.
5. Frontend clients can begin integrating against the endpoints documented in section 4.

## 11. Future Improvements (Suggestions Only)
- Implementing a caching layer (e.g., Redis) for the `get_available_slots` endpoint to reduce database reads on high-traffic days.
- Adding a notification service to email the guest and doctor upon successful booking.
- Supporting recurring doctor schedules across different weeks or months (e.g., alternating weekends).
- Expanding the template engine to support multiple predefined themes.
