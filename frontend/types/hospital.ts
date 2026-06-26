export interface HospitalPage {
    id: string;
    title: string;
    slug: string;
    is_published: boolean;
    is_home: boolean;
    website_setup: string;
    created_at: string;
    updated_at: string;
    blocks: HospitalBlock[];
}

export type BlockType =
    | 'HERO_BLOCK'
    | 'DOCTORS_LIST_BLOCK'
    | 'DEPARTMENTS_BLOCK'
    | 'BOOKING_FORM_BLOCK'
    | 'BOOKING_BUTTON_BLOCK'
    | 'TEXT_BLOCK'
    | 'IMAGE_BLOCK'
    | 'CONTACT_BLOCK';

export interface HospitalBlock {
    id: string;
    page: string;
    type: BlockType;
    order: number;
    settings: any;
    created_at: string;
    updated_at: string;
}

export interface Department {
    id: string;
    name: string;
    description: string;
    image_url: string | null;
    website_setup: string;
    created_at: string;
    updated_at: string;
}

export interface DoctorSchedule {
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_duration_minutes: number;
    specific_date?: string | null; // YYYY-MM-DD format if set
}

export interface Doctor {
    id: string;
    name: string;
    title?: string;
    specialty: string;
    experience?: string;
    bio: string;
    image?: string | null;
    image_url: string | null;
    image_url_resolved?: string | null;
    is_active: boolean;
    age?: number;
    gender?: string;
    email?: string;
    department: string;
    department_name: string;
    website_setup: string;
    created_at: string;
    updated_at: string;
    schedules: DoctorSchedule[];
}

export interface AvailableSlot {
    start_datetime: string;
    end_datetime: string;
}

export interface AvailableSlotsResponse {
    slots: AvailableSlot[];
}

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export interface Appointment {
    id: string;
    patient_name: string;
    patient_email: string;
    patient_phone: string;
    patient_gender?: string;
    patient_age?: number;
    start_datetime: string;
    end_datetime: string;
    status: AppointmentStatus;
    doctor: string;
    doctor_name: string;
    department_name?: string;
    website_setup: string;
    created_at: string;
    updated_at: string;
}

export interface HospitalProfile {
    id: string;
    name: string;
    description: string;
    logo: string | null;
    subdomain: string | null;
    theme_settings: Record<string, any>;
    is_published: boolean;
    timezone: string;
    years_of_excellence: number;
    patients_treated: string;
    business_info?: any;
    allowed_features?: string[];
    created_at: string;
    updated_at: string;
}

export interface HospitalPhoto {
    id: string;
    image?: string | null;
    image_url?: string | null;
    alt_text: string;
    caption: string;
    display_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}
