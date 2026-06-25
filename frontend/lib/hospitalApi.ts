import { API_BASE_URL } from '@/lib/api'
import {
    HospitalPage,
    Doctor,
    Department,
    AvailableSlotsResponse,
    Appointment,
    HospitalProfile,
    HospitalPhoto
} from '@/types/hospital';

export interface HospitalBusinessInfo {
    name?: string | null;
    contact_phone: string;
    contact_email: string;
    address: string;
    working_hours: Record<string, { open: string; close: string; closed: boolean }>;
    years_of_experience?: number | null;
}

interface ApiResponse<T> {
  data?: T
  error?: string
  status?: number
}

async function parseJson<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    if (response.status === 204) {
      return { data: undefined as T, status: 204 }
    }
    const data = await response.json()
    if (!response.ok) {
      return { 
        error: data.detail || data.error || `Request failed with status ${response.status}`, 
        status: response.status 
      }
    }
    return { data, status: response.status }
  } catch (error) {
    return { 
      error: error instanceof Error ? error.message : 'An unexpected error occurred', 
      status: response.status 
    }
  }
}

function normalizeList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && 'results' in data && Array.isArray((data as any).results)) {
    return (data as any).results as T[]
  }
  return []
}

// ─── Named Exports for booking/profile ──────────────────────────────────────────

export async function getHospitalProfile(subdomain: string): Promise<HospitalProfile | null> {
    const res = await fetch(`${API_BASE_URL}/hospital/public/profile/?subdomain=${encodeURIComponent(subdomain)}`, {
        cache: 'no-store'
    });
    if (!res.ok) {
        return null;
    }
    return res.json();
}

export async function getHospitalBusinessInfo(subdomain: string): Promise<HospitalBusinessInfo | null> {
    try {
        const profile = await getHospitalProfile(subdomain);
        if (!profile) return null;
        const bi = (profile as any).business_info;
        if (!bi) return null;
        return bi as HospitalBusinessInfo;
    } catch {
        return null;
    }
}

export async function getHospitalPages(subdomain: string): Promise<HospitalPage[]> {
    const res = await fetch(`${API_BASE_URL}/hospital/public/pages/?subdomain=${encodeURIComponent(subdomain)}`, {
        cache: 'no-store'
    });
    if (!res.ok) {
        if (res.status === 404 || res.status === 400) return [];
        throw new Error('Failed to fetch pages');
    }
    return res.json();
}

export async function getHospitalDoctors(subdomain: string): Promise<Doctor[]> {
    const res = await fetch(`${API_BASE_URL}/hospital/public/doctors/?subdomain=${encodeURIComponent(subdomain)}`, {
        cache: 'no-store'
    });
    if (!res.ok) {
        if (res.status === 404 || res.status === 400) return [];
        throw new Error('Failed to fetch doctors');
    }
    const data = await res.json();
    return normalizeList<Doctor>(data);
}

export async function getHospitalDepartments(subdomain: string): Promise<Department[]> {
    const res = await fetch(`${API_BASE_URL}/hospital/public/departments/?subdomain=${encodeURIComponent(subdomain)}`, {
        cache: 'no-store'
    });
    if (!res.ok) {
        if (res.status === 404 || res.status === 400) return [];
        throw new Error('Failed to fetch departments');
    }
    const data = await res.json();
    return normalizeList<Department>(data);
}

export async function getAvailableSlots(doctorId: string, date: string): Promise<AvailableSlotsResponse> {
    const res = await fetch(`${API_BASE_URL}/hospital/booking/available_slots/?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`, {
        cache: 'no-store'
    });
    if (!res.ok) {
        if (res.status === 404 || res.status === 400) return { slots: [] };
        throw new Error('Failed to fetch available slots');
    }
    return res.json();
}

export async function createAppointment(data: {
    doctor_id: string;
    start_datetime: string;
    end_datetime: string;
    patient_name: string;
    patient_email: string;
    patient_phone: string;
    patient_gender?: string;
    patient_age?: number | string;
}): Promise<Appointment | { error: string; status: number }> {
    const res = await fetch(`${API_BASE_URL}/hospital/booking/create_appointment/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
        cache: 'no-store'
    });
    
    if (!res.ok) {
        if (res.status === 409) {
            return { error: 'This slot was just taken.', status: 409 };
        }
        return { error: 'An error occurred during booking.', status: res.status };
    }
    
    return res.json();
}

// ─── Default object export containing ApiResponse types for newer components ────

export const hospitalApi = {
  async getProfile(subdomain: string): Promise<ApiResponse<HospitalProfile>> {
    const response = await fetch(`${API_BASE_URL}/hospital/public/profile/?subdomain=${encodeURIComponent(subdomain)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    return parseJson<HospitalProfile>(response);
  },

  async getDepartments(subdomain: string): Promise<ApiResponse<Department[]>> {
    const response = await fetch(`${API_BASE_URL}/hospital/public/departments/?subdomain=${encodeURIComponent(subdomain)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const parsed = await parseJson<unknown>(response);
    if (!parsed.data) return { error: parsed.error, status: parsed.status };
    return { data: normalizeList<Department>(parsed.data), status: parsed.status };
  },

  async getDoctors(subdomain: string): Promise<ApiResponse<Doctor[]>> {
    const response = await fetch(`${API_BASE_URL}/hospital/public/doctors/?subdomain=${encodeURIComponent(subdomain)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const parsed = await parseJson<unknown>(response);
    if (!parsed.data) return { error: parsed.error, status: parsed.status };
    return { data: normalizeList<Doctor>(parsed.data), status: parsed.status };
  },

  async getPhotos(subdomain: string): Promise<ApiResponse<HospitalPhoto[]>> {
    const response = await fetch(`${API_BASE_URL}/hospital/public/photos/?subdomain=${encodeURIComponent(subdomain)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const parsed = await parseJson<unknown>(response);
    if (!parsed.data) return { error: parsed.error, status: parsed.status };
    return { data: normalizeList<HospitalPhoto>(parsed.data), status: parsed.status };
  },
}