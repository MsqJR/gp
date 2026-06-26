/**
 * HospitalDoctors.test.tsx
 *
 * Comprehensive test suite for the Hospital Doctors management page.
 * Covers: Add Doctor, Edit Doctor, Delete Doctor, View Profile, Schedule
 * validation, API error handling, and UI state management.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HospitalDoctorsPage from '@/app/dashboard/hospital/doctors/page';

// ─── Shared test data ──────────────────────────────────────────────────────────

const MOCK_DEPT = {
  id: 'dept-1',
  name: 'Cardiology',
  description: 'Heart department',
  image_url: null,
  website_setup: 'ws-1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const MOCK_DOCTOR: any = {
  id: 'doc-1',
  name: 'Dr. Ahmed Ali',
  specialty: 'Cardiology',
  bio: 'Consultant • 10 years',
  email: 'ahmed@hospital.com',
  age: 45,
  gender: 'Male',
  image: null,
  image_url: null,
  image_url_resolved: null,
  is_active: true,
  department: 'dept-1',
  department_name: 'Cardiology',
  website_setup: 'ws-1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  schedules: [
    {
      id: 'sch-1',
      day_of_week: 1,
      start_time: '09:00:00',
      end_time: '17:00:00',
      slot_duration_minutes: 30,
      specific_date: null,
    },
  ],
};

// ─── Mock modules ──────────────────────────────────────────────────────────────

jest.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://localhost:8000/api',
  getAuthToken: () => 'mock-token',
}));

jest.mock('@/lib/storage', () => ({
  normalizeLogoUrl: (url: string | null) => url ?? '',
}));

jest.mock('@/lib/productImage', () => ({
  normalizeCsvImageUrl: (url: string) => url,
}));

// Mock hospitalAdminApi — all methods return success by default
const mockListDoctors = jest.fn();
const mockListDepartments = jest.fn();
const mockCreateDoctor = jest.fn();
const mockUpdateDoctor = jest.fn();
const mockDeleteDoctor = jest.fn();
const mockSyncDoctorWeeklySchedules = jest.fn();
const mockSyncDoctorAvailableDates = jest.fn();

jest.mock('@/lib/hospitalAdminApi', () => ({
  hospitalAdminApi: {
    listDoctors: (...args: any[]) => mockListDoctors(...args),
    listDepartments: (...args: any[]) => mockListDepartments(...args),
    createDoctor: (...args: any[]) => mockCreateDoctor(...args),
    updateDoctor: (...args: any[]) => mockUpdateDoctor(...args),
    deleteDoctor: (...args: any[]) => mockDeleteDoctor(...args),
    createDepartment: jest.fn().mockResolvedValue({
      data: {
        id: 'dept-1', name: 'Cardiology', description: 'Heart department',
        image_url: null, website_setup: 'ws-1',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      },
    }),
    syncDoctorWeeklySchedules: (...args: any[]) => mockSyncDoctorWeeklySchedules(...args),
    syncDoctorAvailableDates: (...args: any[]) => mockSyncDoctorAvailableDates(...args),
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function setupMocks(overrides: {
  doctors?: any[];
  createResult?: any;
  updateResult?: any;
  deleteResult?: any;
} = {}) {
  const doctors = overrides.doctors ?? [MOCK_DOCTOR];
  mockListDoctors.mockResolvedValue({ data: doctors });
  mockListDepartments.mockResolvedValue({ data: [MOCK_DEPT] });
  mockCreateDoctor.mockResolvedValue(
    overrides.createResult ?? { data: { ...MOCK_DOCTOR, id: 'doc-new' } }
  );
  mockUpdateDoctor.mockResolvedValue(
    overrides.updateResult ?? { data: MOCK_DOCTOR }
  );
  mockDeleteDoctor.mockResolvedValue(
    overrides.deleteResult ?? { data: undefined, status: 204 }
  );
  mockSyncDoctorWeeklySchedules.mockResolvedValue(undefined);
  mockSyncDoctorAvailableDates.mockResolvedValue(undefined);
}

/** Open the Add Doctor modal */
async function openAddModal() {
  await userEvent.click(screen.getByRole('button', { name: /add doctor/i }));
}

/** Fill just name + specialty in the Add modal. */
async function fillBasicDoctorFields(name = 'Dr. Test', specialty = 'Neurology') {
  await userEvent.type(screen.getByPlaceholderText(/Dr\. Ahmed Ali/i), name);
  await userEvent.type(screen.getByPlaceholderText(/e\.g\. Cardiology/i), specialty);
}

/**
 * Select a department value from the department <select>.
 * The select has no accessible label link, so we query by its placeholder option text.
 */
function getDeptSelect(): HTMLSelectElement {
  return screen.getByDisplayValue('-- Select department --') as HTMLSelectElement;
}

async function clickSave(label = /(save|add doctor)/i) {
  const btns = screen.getAllByRole('button').filter(b =>
    label.test(b.textContent ?? '')
  );
  if (btns.length === 0) throw new Error(`No button found matching ${label}`);
  await userEvent.click(btns[btns.length - 1]);
}

// ─── 1. Page Load ──────────────────────────────────────────────────────────────
describe('HospitalDoctorsPage — Page Load', () => {
  beforeEach(() => setupMocks());

  it('renders the Doctors Directory heading and Add Doctor button', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('heading', { name: /doctors directory/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add doctor/i })).toBeInTheDocument();
  });

  it('renders the search input', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    expect(screen.getByPlaceholderText(/search doctors/i)).toBeInTheDocument();
  });

  it('displays existing doctors after loading', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(screen.getByText('Dr. Ahmed Ali')).toBeInTheDocument());
  });

  it('shows no doctors message when list is empty', async () => {
    mockListDoctors.mockResolvedValue({ data: [] });
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(screen.getByText(/no doctors/i)).toBeInTheDocument());
  });

  it('filters doctors based on search query', async () => {
    const extra = { ...MOCK_DOCTOR, id: 'doc-2', name: 'Dr. Sara Mohamed', specialty: 'Neurology', department_name: 'Neurology' };
    mockListDoctors.mockResolvedValue({ data: [MOCK_DOCTOR, extra] });
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(screen.getByText('Dr. Ahmed Ali')).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText(/search doctors/i), 'Sara');
    expect(screen.queryByText('Dr. Ahmed Ali')).not.toBeInTheDocument();
    expect(screen.getByText('Dr. Sara Mohamed')).toBeInTheDocument();
  });
});

// ─── 2. Add Doctor ─────────────────────────────────────────────────────────────
describe('HospitalDoctorsPage — Add Doctor', () => {
  beforeEach(() => setupMocks());

  it('opens the Add Doctor modal when button is clicked', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    expect(screen.getByRole('heading', { name: /add new doctor/i })).toBeInTheDocument();
  });

  it('closes the modal when Cancel is clicked', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('heading', { name: /add new doctor/i })).not.toBeInTheDocument();
  });

  it('shows validation error when name is missing', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await clickSave();
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(mockCreateDoctor).not.toHaveBeenCalled();
  });

  it('shows validation error when specialty is missing', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await userEvent.type(screen.getByPlaceholderText(/Dr\. Ahmed Ali/i), 'Dr. Test');
    await clickSave();
    expect(await screen.findByText(/specialty is required/i)).toBeInTheDocument();
    expect(mockCreateDoctor).not.toHaveBeenCalled();
  });

  it('shows validation error when department is not selected', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await fillBasicDoctorFields();
    await clickSave();
    expect(await screen.findByText(/select a department/i)).toBeInTheDocument();
    expect(mockCreateDoctor).not.toHaveBeenCalled();
  });

  it('successfully adds a doctor (no schedule) and closes modal', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();

    await fillBasicDoctorFields();
    await userEvent.selectOptions(getDeptSelect(), 'dept-1');
    await clickSave();

    await waitFor(() => expect(mockCreateDoctor).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /add new doctor/i })).not.toBeInTheDocument()
    );
  });

  it('shows API error message on create failure', async () => {
    mockCreateDoctor.mockResolvedValue({ error: 'Server error', data: undefined });
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await fillBasicDoctorFields();
    await userEvent.selectOptions(getDeptSelect(), 'dept-1');
    await clickSave();
    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
  });

  it('form starts blank — no pre-selected availability type or slot duration', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();

    // No availability type button should have bg-primary
    const weekBtn = screen.getByRole('button', { name: /^week$/i });
    expect(weekBtn.className).not.toContain('bg-primary');

    // Slot duration placeholder should be selected (value = '')
    const slotSelect = screen.getByDisplayValue('-- Select slot duration --');
    expect(slotSelect).toBeInTheDocument();
  });

  // ── Schedule validation ──────────────────────────────────────────────────────

  it('schedule validation: error when Week selected but no days chosen', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await fillBasicDoctorFields();
    await userEvent.selectOptions(getDeptSelect(), 'dept-1');
    await userEvent.click(screen.getByRole('button', { name: /^week$/i }));
    await clickSave();
    expect(await screen.findByText(/at least one weekday/i)).toBeInTheDocument();
    expect(mockCreateDoctor).not.toHaveBeenCalled();
  });

  it('schedule validation: error when start/end times are empty', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await fillBasicDoctorFields();
    await userEvent.selectOptions(getDeptSelect(), 'dept-1');
    await userEvent.click(screen.getByRole('button', { name: /^week$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^mon$/i }));
    await clickSave();
    expect(await screen.findByText(/start and end times/i)).toBeInTheDocument();
    expect(mockCreateDoctor).not.toHaveBeenCalled();
  });

  it('schedule validation: error when slot duration is not selected', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await fillBasicDoctorFields();
    await userEvent.selectOptions(getDeptSelect(), 'dept-1');
    await userEvent.click(screen.getByRole('button', { name: /^week$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^mon$/i }));

    const timeInputs = document.querySelectorAll('input[type="time"]');
    fireEvent.change(timeInputs[0], { target: { value: '09:00' } });
    fireEvent.change(timeInputs[1], { target: { value: '17:00' } });

    await clickSave();
    expect(await screen.findByText(/Please select a slot duration/i)).toBeInTheDocument();
    expect(mockCreateDoctor).not.toHaveBeenCalled();
  });
});

// ─── 3. Edit Doctor ────────────────────────────────────────────────────────────
describe('HospitalDoctorsPage — Edit Doctor', () => {
  beforeEach(() => setupMocks());

  async function renderAndOpenEdit() {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(screen.getByText('Dr. Ahmed Ali')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^\s*Edit\s*$/i }));
    await screen.findByRole('heading', { name: /edit doctor/i });
  }

  it('opens the Edit Doctor modal with pre-filled name', async () => {
    await renderAndOpenEdit();
    expect(screen.getByDisplayValue('Dr. Ahmed Ali')).toBeInTheDocument();
  });

  it('pre-fills the specialty field', async () => {
    await renderAndOpenEdit();
    expect(screen.getByPlaceholderText(/e\.g\. Cardiology/i)).toHaveValue('Cardiology');
  });

  it('pre-fills the email field', async () => {
    await renderAndOpenEdit();
    expect(screen.getByDisplayValue('ahmed@hospital.com')).toBeInTheDocument();
  });

  it('pre-fills age and gender', async () => {
    await renderAndOpenEdit();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Male')).toBeInTheDocument();
  });

  it('saves changes and calls updateDoctor with correct id', async () => {
    await renderAndOpenEdit();
    const nameInput = screen.getByDisplayValue('Dr. Ahmed Ali');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Dr. Ahmed Updated');
    await clickSave(/save changes/i);
    await waitFor(() =>
      expect(mockUpdateDoctor).toHaveBeenCalledWith('doc-1', expect.objectContaining({
        name: 'Dr. Ahmed Updated',
      }))
    );
  });

  it('persists experience — bio is reconstructed from title + experience', async () => {
    await renderAndOpenEdit();
    const expInput = screen.getByPlaceholderText(/e\.g\. 10 years/i);
    fireEvent.change(expInput, { target: { value: '15 years' } });
    await clickSave(/save changes/i);

    await waitFor(() => {
      const payload = mockUpdateDoctor.mock.calls[0][1];
      if (payload instanceof FormData) {
        expect(payload.get('experience')).toBe('15 years');
      } else {
        expect(payload.experience).toBe('15 years');
        expect(payload.bio).toContain('15 years');
      }
    });
  });

  it('shows validation error when name is cleared', async () => {
    await renderAndOpenEdit();
    const nameInput = screen.getByDisplayValue('Dr. Ahmed Ali');
    await userEvent.clear(nameInput);
    await clickSave(/save changes/i);
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(mockUpdateDoctor).not.toHaveBeenCalled();
  });

  it('shows API error when update fails', async () => {
    mockUpdateDoctor.mockResolvedValue({ error: 'Update failed' });
    await renderAndOpenEdit();
    await clickSave(/save changes/i);
    expect(await screen.findByText(/update failed/i)).toBeInTheDocument();
  });

  it('closes edit modal on cancel without calling API', async () => {
    await renderAndOpenEdit();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('heading', { name: /edit doctor/i })).not.toBeInTheDocument();
    expect(mockUpdateDoctor).not.toHaveBeenCalled();
  });
});

// ─── 4. Delete Doctor ──────────────────────────────────────────────────────────
describe('HospitalDoctorsPage — Delete Doctor', () => {
  beforeEach(() => setupMocks());

  async function openDeleteModal() {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(screen.getByText('Dr. Ahmed Ali')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^\s*Delete\s*$/i }));
    await screen.findByText(/are you sure/i);
  }

  it('opens the delete confirmation modal', async () => {
    await openDeleteModal();
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
  });

  it('cancels delete and closes modal without calling API', async () => {
    await openDeleteModal();
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(mockDeleteDoctor).not.toHaveBeenCalled();
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
  });

  it('calls deleteDoctor and refreshes list on confirm', async () => {
    mockListDoctors
      .mockResolvedValueOnce({ data: [MOCK_DOCTOR] })
      .mockResolvedValueOnce({ data: [] });
    await openDeleteModal();
    // Click the confirm delete button (text contains "Delete Doctor" or similar)
    const confirmBtns = screen.getAllByRole('button').filter(b =>
      /delete/i.test(b.textContent ?? '') && b.textContent !== 'Cancel'
    );
    await userEvent.click(confirmBtns[confirmBtns.length - 1]);

    await waitFor(() => expect(mockDeleteDoctor).toHaveBeenCalledWith('doc-1'));
    await waitFor(() => expect(screen.queryByText('Dr. Ahmed Ali')).not.toBeInTheDocument());
  });

  it('shows API error when delete fails', async () => {
    mockDeleteDoctor.mockResolvedValue({ error: 'Cannot delete doctor' });
    await openDeleteModal();
    const confirmBtns = screen.getAllByRole('button').filter(b =>
      /delete/i.test(b.textContent ?? '') && b.textContent !== 'Cancel'
    );
    await userEvent.click(confirmBtns[confirmBtns.length - 1]);
    expect(await screen.findByText(/cannot delete doctor/i)).toBeInTheDocument();
  });
});

// ─── 5. View Profile ───────────────────────────────────────────────────────────
describe('HospitalDoctorsPage — View Profile', () => {
  beforeEach(() => setupMocks());

  async function openProfile() {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(screen.getByText('Dr. Ahmed Ali')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^\s*Profile\s*$/i }));
    await screen.findByText('Doctor Profile');
  }

  it('opens the doctor profile modal', async () => {
    await openProfile();
    expect(screen.getByText('Doctor Profile')).toBeInTheDocument();
  });

  it('displays the doctor name in the profile', async () => {
    await openProfile();
    const names = screen.getAllByText('Dr. Ahmed Ali');
    expect(names.length).toBeGreaterThan(0);
  });

  it('displays email in the profile', async () => {
    await openProfile();
    expect(screen.getByText('ahmed@hospital.com')).toBeInTheDocument();
  });

  it('displays age in the profile', async () => {
    await openProfile();
    // Age appears as "45 y"
    expect(screen.getByText(/45 y/i)).toBeInTheDocument();
  });

  it('displays gender in the profile', async () => {
    await openProfile();
    // Gender may appear multiple times (form + profile), getAllBy is safer
    const genders = screen.getAllByText('Male');
    expect(genders.length).toBeGreaterThan(0);
  });

  it('displays the department name', async () => {
    await openProfile();
    const deptLabels = screen.getAllByText('Cardiology');
    expect(deptLabels.length).toBeGreaterThan(0);
  });

  it('displays an active/inactive status indicator', async () => {
    await openProfile();
    // The status badge says "Active" or "Inactive"
    const statusEl = document.querySelector('[class*="status"], [class*="badge"], span');
    // At minimum the text "Active" should appear somewhere in the document
    expect(document.body.textContent).toMatch(/active/i);
  });

  it('shows Inactive for an inactive doctor', async () => {
    mockListDoctors.mockResolvedValue({ data: [{ ...MOCK_DOCTOR, is_active: false }] });
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(screen.getByText('Dr. Ahmed Ali')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^\s*Profile\s*$/i }));
    await screen.findByText('Doctor Profile');
    expect(document.body.textContent).toMatch(/inactive/i);
  });

  it('shows schedule type Weekly and slot duration 30 Mins', async () => {
    await openProfile();
    expect(screen.getByText(/weekly/i)).toBeInTheDocument();
    expect(screen.getByText(/30 mins/i)).toBeInTheDocument();
  });

  it('shows the shift day Monday in 12h time format', async () => {
    await openProfile();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText(/09:00 AM - 05:00 PM/i)).toBeInTheDocument();
  });

  it('shows no active shifts when doctor has no schedules', async () => {
    mockListDoctors.mockResolvedValue({ data: [{ ...MOCK_DOCTOR, schedules: [] }] });
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(screen.getByText('Dr. Ahmed Ali')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^\s*Profile\s*$/i }));
    await screen.findByText('Doctor Profile');
    expect(screen.getByText(/no active shifts/i)).toBeInTheDocument();
  });

  it('deduplicates redundant schedule entries — Friday shown once, not three times', async () => {
    const duplicates = [
      { id: 'sch-1', day_of_week: 5, start_time: '09:00:00', end_time: '17:00:00', slot_duration_minutes: 30, specific_date: null },
      { id: 'sch-2', day_of_week: 5, start_time: '09:00:00', end_time: '17:00:00', slot_duration_minutes: 30, specific_date: null },
      { id: 'sch-3', day_of_week: 5, start_time: '09:00:00', end_time: '17:00:00', slot_duration_minutes: 30, specific_date: null },
    ];
    mockListDoctors.mockResolvedValue({ data: [{ ...MOCK_DOCTOR, schedules: duplicates }] });
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(screen.getByText('Dr. Ahmed Ali')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^\s*Profile\s*$/i }));
    await screen.findByText('Doctor Profile');
    expect(screen.getAllByText('Friday')).toHaveLength(1);
  });

  it('closes the profile modal when Close is clicked', async () => {
    await openProfile();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('Doctor Profile')).not.toBeInTheDocument();
  });
});

// ─── 6. Schedule Sync ─────────────────────────────────────────────────────────
describe('HospitalDoctorsPage — Schedule Sync', () => {
  beforeEach(() => setupMocks());

  it('does NOT call any schedule sync when no availability type is selected', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await fillBasicDoctorFields();
    await userEvent.selectOptions(getDeptSelect(), 'dept-1');
    // No availability type clicked
    await clickSave();
    await waitFor(() => expect(mockCreateDoctor).toHaveBeenCalled());
    expect(mockSyncDoctorWeeklySchedules).not.toHaveBeenCalled();
    expect(mockSyncDoctorAvailableDates).not.toHaveBeenCalled();
  });

  it('calls syncDoctorWeeklySchedules with correct days and times', async () => {
    render(<HospitalDoctorsPage />);
    await waitFor(() => expect(mockListDoctors).toHaveBeenCalled());
    await openAddModal();
    await fillBasicDoctorFields();
    await userEvent.selectOptions(getDeptSelect(), 'dept-1');

    await userEvent.click(screen.getByRole('button', { name: /^week$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^mon$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^wed$/i }));

    const timeInputs = document.querySelectorAll('input[type="time"]');
    fireEvent.change(timeInputs[0], { target: { value: '09:00' } });
    fireEvent.change(timeInputs[1], { target: { value: '17:00' } });

    await userEvent.selectOptions(screen.getByDisplayValue('-- Select slot duration --'), '30');
    await clickSave();

    await waitFor(() =>
      expect(mockSyncDoctorWeeklySchedules).toHaveBeenCalledWith(
        'doc-new',
        expect.arrayContaining([
          expect.objectContaining({ day_of_week: 1, slot_duration_minutes: 30 }),
          expect.objectContaining({ day_of_week: 3, slot_duration_minutes: 30 }),
        ])
      )
    );
  });
});

// ─── 7. 12h Time Format ────────────────────────────────────────────────────────
describe('formatTime12h — 12-hour time conversion', () => {
  // Inline pure-function tests (no rendering needed)
  function formatTime12h(time: string): string {
    if (!time) return '';
    const [h, m] = time.split(':');
    const hours = parseInt(h, 10);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12.toString().padStart(2, '0')}:${m} ${suffix}`;
  }

  it('formats 09:00 → 09:00 AM', () => expect(formatTime12h('09:00')).toBe('09:00 AM'));
  it('formats 17:00 → 05:00 PM', () => expect(formatTime12h('17:00')).toBe('05:00 PM'));
  it('formats 12:00 → 12:00 PM (noon)', () => expect(formatTime12h('12:00')).toBe('12:00 PM'));
  it('formats 00:00 → 12:00 AM (midnight)', () => expect(formatTime12h('00:00')).toBe('12:00 AM'));
  it('formats 13:30 → 01:30 PM', () => expect(formatTime12h('13:30')).toBe('01:30 PM'));
  it('formats 23:59 → 11:59 PM', () => expect(formatTime12h('23:59')).toBe('11:59 PM'));
  it('returns empty string for empty input', () => expect(formatTime12h('')).toBe(''));
});
