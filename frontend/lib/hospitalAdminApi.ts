import { API_BASE_URL, getAuthToken, type ApiResponse } from '@/lib/api';
import type { Appointment, Department, Doctor, HospitalProfile, HospitalPhoto, AppointmentStatus } from '@/types/hospital';

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function authHeadersForBody(body?: BodyInit | null): HeadersInit {
  if (body instanceof FormData) {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  return authHeaders();
}

async function parseJson<T>(response: Response): Promise<ApiResponse<T>> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : null) || `Request failed (${response.status})`;
    return { error, status: response.status, errorDetails: payload };
  }
  return { data: payload as T, status: response.status };
}

function normalizeList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown[] }).results)) {
    return (payload as { results: T[] }).results;
  }
  return [];
}

export const hospitalAdminApi = {
  // ─── Profile ───────────────────────────────────────────────────────────────

  async getProfile(): Promise<ApiResponse<HospitalProfile>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/profile/profile/`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    return parseJson<HospitalProfile>(response);
  },

  async updateProfile(payload: Partial<HospitalProfile> | FormData): Promise<ApiResponse<HospitalProfile>> {
    const isFormData = payload instanceof FormData;
    
    // For FormData, do not set Content-Type so the browser sets it with the boundary
    const headers: HeadersInit = isFormData 
        ? { ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) }
        : authHeaders();

    const response = await fetch(`${API_BASE_URL}/hospital/admin/profile/profile/`, {
      method: 'PATCH',
      headers,
      body: isFormData ? payload : JSON.stringify(payload),
      cache: 'no-store',
    });
    return parseJson<HospitalProfile>(response);
  },

  // ─── Doctors ───────────────────────────────────────────────────────────────

  async listDoctors(): Promise<ApiResponse<Doctor[]>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/doctors/`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    const parsed = await parseJson<unknown>(response);
    if (!parsed.data) return { error: parsed.error, status: parsed.status, errorDetails: parsed.errorDetails };
    return { data: normalizeList<Doctor>(parsed.data), status: parsed.status };
  },

  async createDoctor(payload: FormData | {
    name: string;
    specialty: string;
    bio?: string;
    department: string;
    image_url?: string;
    is_active?: boolean;
  }): Promise<ApiResponse<Doctor>> {
    const isFormData = payload instanceof FormData;
    if (isFormData && !payload.has('is_active')) {
      payload.append('is_active', 'true');
    }
    const response = await fetch(`${API_BASE_URL}/hospital/admin/doctors/`, {
      method: 'POST',
      headers: authHeadersForBody(isFormData ? payload : null),
      body: isFormData ? payload : JSON.stringify({ is_active: true, ...payload }),
      cache: 'no-store',
    });
    return parseJson<Doctor>(response);
  },

  async updateDoctor(
    id: string,
    payload: FormData | Partial<{
      name: string;
      specialty: string;
      bio: string;
      department: string;
      image_url: string;
      is_active: boolean;
    }>,
  ): Promise<ApiResponse<Doctor>> {
    const isFormData = payload instanceof FormData;
    const response = await fetch(`${API_BASE_URL}/hospital/admin/doctors/${id}/`, {
      method: 'PATCH',
      headers: authHeadersForBody(isFormData ? payload : null),
      body: isFormData ? payload : JSON.stringify(payload),
      cache: 'no-store',
    });
    return parseJson<Doctor>(response);
  },

  async deleteDoctor(id: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/doctors/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
      cache: 'no-store',
    });
    return parseJson<void>(response);
  },

  // ─── Departments ───────────────────────────────────────────────────────────

  async listDepartments(): Promise<ApiResponse<Department[]>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/departments/`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    const parsed = await parseJson<unknown>(response);
    if (!parsed.data) return { error: parsed.error, status: parsed.status, errorDetails: parsed.errorDetails };
    return { data: normalizeList<Department>(parsed.data), status: parsed.status };
  },

  async createDepartment(payload: { name: string; description?: string }): Promise<ApiResponse<Department>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/departments/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    return parseJson<Department>(response);
  },

  async updateDepartment(id: string, payload: { name?: string; description?: string }): Promise<ApiResponse<Department>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/departments/${id}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    return parseJson<Department>(response);
  },

  async deleteDepartment(id: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/departments/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (response.status === 204) {
      return { data: undefined, status: 204 };
    }
    return parseJson<void>(response);
  },

  // ─── Appointments ──────────────────────────────────────────────────────────

  async listAppointments(status?: AppointmentStatus): Promise<ApiResponse<Appointment[]>> {
    const query = status ? `?status=${status}` : '';
    const response = await fetch(`${API_BASE_URL}/hospital/admin/appointments/${query}`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    const parsed = await parseJson<unknown>(response);
    if (!parsed.data) return { error: parsed.error, status: parsed.status, errorDetails: parsed.errorDetails };
    return { data: normalizeList<Appointment>(parsed.data), status: parsed.status };
  },

  async updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<ApiResponse<Appointment>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/appointments/${id}/`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
      cache: 'no-store',
    });
    return parseJson<Appointment>(response);
  },

  async deleteAppointment(id: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/appointments/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (response.status === 204) {
      return { data: undefined, status: 204 };
    }
    return parseJson<void>(response);
  },

  // ─── Schedules ─────────────────────────────────────────────────────────────

  /** Creates Mon–Fri 09:00–17:00 (30 min slots) for a newly created doctor */
  async createDefaultSchedules(doctorId: string): Promise<void> {
    const hdrs = authHeaders();
    const requests: Promise<Response>[] = [];
    for (let day = 0; day <= 4; day++) {
      requests.push(
        fetch(`${API_BASE_URL}/hospital/admin/schedules/`, {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({
            doctor: doctorId,
            day_of_week: day,
            start_time: '09:00:00',
            end_time: '17:00:00',
            slot_duration_minutes: 30,
          }),
          cache: 'no-store',
        }),
      );
    }
    await Promise.allSettled(requests);
  },

  /** Sync schedules for a doctor - creates/updates based on provided schedule array */
  async syncDoctorSchedules(doctorId: string, schedules: { day_of_week: number; start_time: string; end_time: string; slot_duration_minutes: number; enabled: boolean }[]): Promise<void> {
    const hdrs = authHeaders();
    
    // Get existing schedules
    const response = await fetch(`${API_BASE_URL}/hospital/admin/schedules/?doctor=${doctorId}`, {
      headers: hdrs,
      cache: 'no-store',
    });
    
    const payload = response.ok ? await response.json() : null;
    const existing = normalizeList<any>(payload);
    const existingMap = new Map<number, any>(existing.map((s: any) => [s.day_of_week, s]));
    
    // For each day, create or update schedule
    const requests: Promise<Response>[] = [];
    
    for (const schedule of schedules) {
      if (!schedule.enabled) {
        // Delete if exists and not enabled
        const existingSchedule = existingMap.get(schedule.day_of_week);
        if (existingSchedule) {
          requests.push(
            fetch(`${API_BASE_URL}/hospital/admin/schedules/${(existingSchedule as any).id}/`, {
              method: 'DELETE',
              headers: hdrs,
              cache: 'no-store',
            })
          );
        }
        continue;
      }
      
      const existingSchedule = existingMap.get(schedule.day_of_week);
      
      if (existingSchedule) {
        // Update existing
        requests.push(
          fetch(`${API_BASE_URL}/hospital/admin/schedules/${(existingSchedule as any).id}/`, {
            method: 'PATCH',
            headers: hdrs,
            body: JSON.stringify({
              start_time: schedule.start_time + ':00',
              end_time: schedule.end_time + ':00',
              slot_duration_minutes: schedule.slot_duration_minutes,
            }),
            cache: 'no-store',
          })
        );
      } else {
        // Create new
        requests.push(
          fetch(`${API_BASE_URL}/hospital/admin/schedules/`, {
            method: 'POST',
            headers: hdrs,
            body: JSON.stringify({
              doctor: doctorId,
              day_of_week: schedule.day_of_week,
              start_time: schedule.start_time + ':00',
              end_time: schedule.end_time + ':00',
              slot_duration_minutes: schedule.slot_duration_minutes,
            }),
            cache: 'no-store',
          })
        );
      }
    }
    
    await Promise.allSettled(requests);
  },

  async syncDoctorWeeklySchedules(doctorId: string, schedules: { day_of_week: number; start_time: string; end_time: string; slot_duration_minutes: number }[]): Promise<void> {
    const hdrs = authHeaders();

    // Step 1: Fetch ALL existing schedules for this doctor
    const response = await fetch(`${API_BASE_URL}/hospital/admin/schedules/?doctor=${doctorId}`, {
      headers: hdrs,
      cache: 'no-store',
    });
    const payload = response.ok ? await response.json() : null;
    const existing = normalizeList<any>(payload);

    // Step 2: Delete ALL existing weekly (non-specific-date) schedules
    const deleteRequests = existing
      .filter((s: any) => s.specific_date == null)
      .map((s: any) => fetch(`${API_BASE_URL}/hospital/admin/schedules/${s.id}/`, {
        method: 'DELETE',
        headers: hdrs,
        cache: 'no-store',
      }));
    await Promise.allSettled(deleteRequests);

    // Step 3: Create fresh weekly schedules from the desired list
    const createRequests = schedules.map(schedule =>
      fetch(`${API_BASE_URL}/hospital/admin/schedules/`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          doctor: doctorId,
          day_of_week: schedule.day_of_week,
          start_time: schedule.start_time + ':00',
          end_time: schedule.end_time + ':00',
          slot_duration_minutes: schedule.slot_duration_minutes,
        }),
        cache: 'no-store',
      })
    );
    await Promise.allSettled(createRequests);
  },


  /** Sync date-specific availability for a doctor */
  async syncDoctorAvailableDates(doctorId: string, dates: { date: string; start_time: string; end_time: string; slot_duration_minutes: number }[]): Promise<void> {
    const hdrs = authHeaders();
    
    // Get existing schedules
    const response = await fetch(`${API_BASE_URL}/hospital/admin/schedules/?doctor=${doctorId}`, {
      headers: hdrs,
      cache: 'no-store',
    });
    
    const payload = response.ok ? await response.json() : null;
    const existing = normalizeList<any>(payload);
    
    // Delete all existing schedules first
    const deleteRequests = existing.map((s: any) =>
      fetch(`${API_BASE_URL}/hospital/admin/schedules/${s.id}/`, {
        method: 'DELETE',
        headers: hdrs,
        cache: 'no-store',
      })
    );
    await Promise.allSettled(deleteRequests);
    
    // Create new schedules for each specific date
    const createRequests = dates.map(dateSlot => {
      const date = new Date(dateSlot.date);
      const dayOfWeek = date.getDay();
      
      return fetch(`${API_BASE_URL}/hospital/admin/schedules/`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          doctor: doctorId,
          day_of_week: dayOfWeek,
          start_time: dateSlot.start_time + ':00',
          end_time: dateSlot.end_time + ':00',
          slot_duration_minutes: dateSlot.slot_duration_minutes,
          specific_date: dateSlot.date,
        }),
        cache: 'no-store',
      });
    });
    
    await Promise.allSettled(createRequests);
  },

  // ─── Photos ────────────────────────────────────────────────────────────────

  async listPhotos(): Promise<ApiResponse<HospitalPhoto[]>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/photos/`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    });
    const parsed = await parseJson<unknown>(response);
    if (!parsed.data) return { error: parsed.error, status: parsed.status, errorDetails: parsed.errorDetails };
    return { data: normalizeList<HospitalPhoto>(parsed.data), status: parsed.status };
  },

  async uploadPhoto(payload: FormData | {
    image?: File;
    image_url?: string;
    alt_text?: string;
    caption?: string;
    display_order?: number;
  }): Promise<ApiResponse<HospitalPhoto>> {
    const isFormData = payload instanceof FormData;
    
    const headers: HeadersInit = isFormData 
        ? { ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) }
        : authHeaders();

    const response = await fetch(`${API_BASE_URL}/hospital/admin/photos/`, {
      method: 'POST',
      headers,
      body: isFormData ? payload : JSON.stringify(payload),
      cache: 'no-store',
    });
    return parseJson<HospitalPhoto>(response);
  },

  async updatePhoto(photoId: string, payload: FormData | Partial<HospitalPhoto>): Promise<ApiResponse<HospitalPhoto>> {
    const isFormData = payload instanceof FormData;
    
    const headers: HeadersInit = isFormData 
        ? { ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) }
        : authHeaders();

    const response = await fetch(`${API_BASE_URL}/hospital/admin/photos/${photoId}/`, {
      method: 'PATCH',
      headers,
      body: isFormData ? payload : JSON.stringify(payload),
      cache: 'no-store',
    });
    return parseJson<HospitalPhoto>(response);
  },

  async deletePhoto(photoId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/photos/${photoId}/`, {
      method: 'DELETE',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (response.status === 204) {
      return { data: undefined, status: 204 };
    }
    return parseJson<void>(response);
  },

  async updatePhotoOrder(photoIds: string[]): Promise<ApiResponse<HospitalPhoto[]>> {
    const response = await fetch(`${API_BASE_URL}/hospital/admin/photos/update_order/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ photo_ids: photoIds }),
      cache: 'no-store',
    });
    const parsed = await parseJson<unknown>(response);
    if (!parsed.data) return { error: parsed.error, status: parsed.status, errorDetails: parsed.errorDetails };
    return { data: normalizeList<HospitalPhoto>(parsed.data), status: parsed.status };
  },
};
