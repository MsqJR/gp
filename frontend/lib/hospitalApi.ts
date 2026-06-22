import {
    HospitalPage,
    Doctor,
    Department,
    AvailableSlotsResponse,
    Appointment,
    HospitalProfile
} from '@/types/hospital';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export async function getHospitalProfile(subdomain: string): Promise<HospitalProfile | null> {
    const res = await fetch(`${API_BASE}/api/hospital/public/profile/?subdomain=${subdomain}`, {
        next: { revalidate: 60 }
    });
    if (!res.ok) {
        return null;
    }
    return res.json();
}

export interface HospitalBusinessInfo {
    name?: string | null;
    contact_phone: string;
    contact_email: string;
    address: string;
    working_hours: Record<string, { open: string; close: string; closed: boolean }>;
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
    const res = await fetch(`${API_BASE}/api/hospital/public/pages/?subdomain=${subdomain}`, {
        next: { revalidate: 60 } // Cache for 60 seconds
    });
    if (!res.ok) {
        if (res.status === 404 || res.status === 400) return [];
        throw new Error('Failed to fetch pages');
    }
    return res.json();
}

export async function getHospitalDoctors(subdomain: string): Promise<Doctor[]> {
    const res = await fetch(`${API_BASE}/api/hospital/public/doctors/?subdomain=${subdomain}`, {
        next: { revalidate: 60 }
    });
    if (!res.ok) {
        if (res.status === 404 || res.status === 400) return [];
        throw new Error('Failed to fetch doctors');
    }
    return res.json();
}

export async function getHospitalDepartments(subdomain: string): Promise<Department[]> {
    const res = await fetch(`${API_BASE}/api/hospital/public/departments/?subdomain=${subdomain}`, {
        next: { revalidate: 60 }
    });
    if (!res.ok) {
        if (res.status === 404 || res.status === 400) return [];
        throw new Error('Failed to fetch departments');
    }
    return res.json();
}

export async function getAvailableSlots(doctorId: string, date: string): Promise<AvailableSlotsResponse> {
    const res = await fetch(`${API_BASE}/api/hospital/booking/available_slots/?doctor_id=${doctorId}&date=${date}`, {
        cache: 'no-store' // Slots must be real-time
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
}): Promise<Appointment | { error: string; status: number }> {
    const res = await fetch(`${API_BASE}/api/hospital/booking/create_appointment/`, {
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
