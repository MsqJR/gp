'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { hospitalAdminApi } from '@/lib/hospitalAdminApi';
import { normalizeCsvImageUrl } from '@/lib/productImage';
import { normalizeLogoUrl } from '@/lib/storage';
import type { Department, Doctor } from '@/types/hospital';
import { FiPlus, FiEdit2, FiTrash2, FiChevronDown, FiChevronRight, FiUpload, FiX, FiCheck, FiAlertCircle, FiUser } from 'react-icons/fi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DoctorFormData {
  name: string;
  title: string;
  specialty: string;
  bio: string;
  email: string;
  experience: string;
  department: string;   // department id
  newDeptName: string;  // if creating new dept
  is_active: boolean;
  age: string;
  gender: string;
  image: File | null;
  image_url: string;
  imagePreview: string;
  availabilityType: 'week' | 'month' | 'year' | '';
  weeklyDays: number[];
  monthlyMonth: string;
  monthlyDayNumbers: number[];
  availabilityStartTime: string;
  availabilityEndTime: string;
  availabilitySlotDurationMinutes: number;
  availableDates: {
    date: string; // YYYY-MM-DD format
    start_time: string;
    end_time: string;
    slot_duration_minutes: number;
  }[];
}

interface ImportRow {
  name: string;
  title: string;
  specialty: string;
  email: string;
  experience: string;
  department: string;
  bio: string;
  photo: string;
}

const EMPTY_FORM: DoctorFormData = {
  name: '', title: '', specialty: '', bio: '', email: '',
  experience: '', department: '', newDeptName: '', is_active: true,
  age: '', gender: '',
  image: null, image_url: '', imagePreview: '',
  availabilityType: '',
  weeklyDays: [],
  monthlyMonth: new Date().toISOString().slice(0, 7),
  monthlyDayNumbers: [],
  availabilityStartTime: '',
  availabilityEndTime: '',
  availabilitySlotDurationMinutes: 0,
  availableDates: [],
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

const formatTime12h = (time: string) => {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hours = parseInt(h, 10);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12.toString().padStart(2, '0')}:${m} ${suffix}`;
};

const WEEKDAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function parseDoctorDetails(doc: Doctor) {
  if (doc.title || doc.experience) {
    return {
      title: doc.title || '',
      experience: doc.experience || '',
      bio: doc.bio || '',
    };
  }
  const parts = (doc.bio ?? '').split(' • ').map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      title: parts[0] || '',
      experience: parts[1] || '',
      bio: parts.slice(2).join(' • ').trim(),
    };
  }
  return { title: '', experience: '', bio: doc.bio ?? '' };
}

function buildDoctorBio(form: DoctorFormData): string {
  const extraBio = form.bio.trim();
  if (extraBio) return extraBio;
  return [form.title.trim(), form.experience.trim()].filter(Boolean).join(' • ');
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-dark mb-1">
        {label}{required && <span className="text-error ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT = 'w-full px-3 py-2 border border-neutral-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none';

function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="min-h-screen flex items-center justify-center p-4">
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ─── Doctor Form Modal ────────────────────────────────────────────────────────

interface DoctorModalProps {
  mode: 'add' | 'edit';
  initialData: DoctorFormData;
  departments: Department[];
  onClose: () => void;
  onSave: (data: DoctorFormData) => Promise<void>;
  saving: boolean;
  error: string | null;
}

function DoctorModal({ mode, initialData, departments, onClose, onSave, saving, error }: DoctorModalProps) {
  const [form, setForm] = useState<DoctorFormData>(initialData);
  const set = (k: keyof DoctorFormData, v: string | number | boolean | File | null) => setForm(f => ({ ...f, [k]: v }));
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = form.imagePreview || form.image_url;

  const toggleWeeklyDay = (day: number) => {
    setForm(prev => {
      const days = prev.weeklyDays.includes(day)
        ? prev.weeklyDays.filter(d => d !== day)
        : [...prev.weeklyDays, day].sort((a, b) => a - b);
      return { ...prev, weeklyDays: days };
    });
  };

  const toggleMonthlyDay = (day: number) => {
    setForm(prev => {
      const days = prev.monthlyDayNumbers.includes(day)
        ? prev.monthlyDayNumbers.filter(d => d !== day)
        : [...prev.monthlyDayNumbers, day].sort((a, b) => a - b);
      return { ...prev, monthlyDayNumbers: days };
    });
  };

  const renderAvailabilityInputs = () => {
    if (!form.availabilityType) {
      return (
        <p className="text-sm text-neutral-400 italic">Select an availability type above to continue.</p>
      );
    }
    if (form.availabilityType === 'week') {
      return (
        <>
          <p className="text-sm text-neutral-gray mb-3">
            Select which weekdays the doctor is available, then choose a daily time window.
          </p>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {WEEKDAYS.map(day => (
              <button
                key={day.day}
                type="button"
                onClick={() => toggleWeeklyDay(day.day)}
                className={`rounded-xl border px-2 py-2 text-sm font-medium transition ${form.weeklyDays.includes(day.day)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-neutral-dark border-neutral-border hover:border-neutral-border/80'
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </>
      );
    }

    if (form.availabilityType === 'month') {
      const [year, month] = form.monthlyMonth.split('-').map(Number);
      const daysInMonth = getDaysInMonth(year, month);
      const dayButtons = Array.from({ length: Math.min(daysInMonth, 31) }, (_, idx) => idx + 1);
      return (
        <>
          <p className="text-sm text-neutral-gray mb-3">
            Choose the days of the month when the doctor is available, then set the time range.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-1">Month</label>
              <input
                type="month"
                value={form.monthlyMonth}
                onChange={e => set('monthlyMonth', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-1">Selected days</label>
              <div className="text-sm text-neutral-gray">
                {form.monthlyDayNumbers.length > 0 ? form.monthlyDayNumbers.join(', ') : 'None selected'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4 max-h-44 overflow-y-auto border border-neutral-border rounded-lg p-3 bg-white">
            {dayButtons.map(day => (
              <button
                key={day}
                type="button"
                onClick={() => toggleMonthlyDay(day)}
                className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${form.monthlyDayNumbers.includes(day)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-neutral-light text-neutral-dark border-neutral-border hover:border-neutral-border/80'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </>
      );
    }

    return (
      <>
        <p className="text-sm text-neutral-gray mb-3">
          Add specific dates for availability. Each selected date will be saved as a date-specific schedule.
        </p>
        <div className="bg-neutral-light/50 rounded-lg p-3 mb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-xs font-medium text-neutral-gray mb-1">Date</label>
              <input
                type="date"
                id="new-date"
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-2 py-1.5 border border-neutral-border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-gray mb-1">Slot Duration</label>
              <select
                id="new-slot-duration"
                defaultValue="30"
                className="w-full px-2 py-1.5 border border-neutral-border rounded text-sm"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-xs font-medium text-neutral-gray mb-1">Start Time</label>
              <input
                type="time"
                id="new-start-time"
                defaultValue="09:00"
                className="w-full px-2 py-1.5 border border-neutral-border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-gray mb-1">End Time</label>
              <input
                type="time"
                id="new-end-time"
                defaultValue="17:00"
                className="w-full px-2 py-1.5 border border-neutral-border rounded text-sm"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const dateInput = document.getElementById('new-date') as HTMLInputElement;
              const startInput = document.getElementById('new-start-time') as HTMLInputElement;
              const endInput = document.getElementById('new-end-time') as HTMLInputElement;
              const slotInput = document.getElementById('new-slot-duration') as HTMLSelectElement;

              if (!dateInput.value) {
                alert('Please select a date');
                return;
              }

              const newDate = {
                date: dateInput.value,
                start_time: startInput.value,
                end_time: endInput.value,
                slot_duration_minutes: Number(slotInput.value),
              };

              if (form.availableDates.some(d => d.date === newDate.date)) {
                alert('This date is already added');
                return;
              }

              setForm({
                ...form,
                availableDates: [...form.availableDates, newDate].sort((a, b) => a.date.localeCompare(b.date)),
              });

              dateInput.value = '';
              startInput.value = '09:00';
              endInput.value = '17:00';
              slotInput.value = '30';
            }}
          >
            <FiPlus className="mr-1" /> Add Date
          </Button>
        </div>

        {form.availableDates.length === 0 ? (
          <p className="text-sm text-neutral-gray italic py-3 text-center border border-dashed border-neutral-border rounded-lg">
            No available dates added yet. Add dates above.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {form.availableDates.map((dateSlot, idx) => {
              const dateObj = new Date(dateSlot.date);
              const formattedDate = dateObj.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
              return (
                <div key={idx} className="flex items-center justify-between bg-white border border-neutral-border rounded-lg p-3">
                  <div className="flex-1">
                    <p className="font-medium text-neutral-dark text-sm">{formattedDate}</p>
                    <p className="text-xs text-neutral-gray mt-0.5">
                      {dateSlot.start_time} - {dateSlot.end_time} • {dateSlot.slot_duration_minutes} min slots
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      availableDates: form.availableDates.filter((_, i) => i !== idx),
                    })}
                    className="text-error hover:text-error/80 p-2"
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <ModalPortal>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-neutral-border">
          <h2 className="text-xl font-semibold text-neutral-dark">
            {mode === 'add' ? 'Add New Doctor' : 'Edit Doctor'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-light text-neutral-gray">
            <FiX size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <FiAlertCircle className="flex-shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            <div className="space-y-4 rounded-3xl border border-neutral-border bg-neutral-light/60 p-4">
              <h3 className="text-base font-semibold text-neutral-dark">Department & Availability</h3>

              <Field label="Department" required>
                <select className={INPUT} value={form.department} onChange={e => set('department', e.target.value)}>
                  <option value="">-- Select department --</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                  <option value="__new__">+ Create new department…</option>
                </select>
              </Field>

              {form.department === '__new__' && (
                <Field label="New Department Name" required>
                  <input className={INPUT} value={form.newDeptName} placeholder="e.g. Neurology"
                    onChange={e => set('newDeptName', e.target.value)} />
                </Field>
              )}

              <Field label="Availability type" required>
                <div className="grid grid-cols-3 gap-2">
                  {(['week', 'month', 'year'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => set('availabilityType', type)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${form.availabilityType === type
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-neutral-dark border-neutral-border hover:border-neutral-border/80'
                      }`}
                    >
                      {type === 'week' ? 'Week' : type === 'month' ? 'Month' : 'Year'}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Availability window" required>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-1">Start time</label>
                    <input
                      type="time"
                      value={form.availabilityStartTime}
                      onChange={e => set('availabilityStartTime', e.target.value)}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-1">End time</label>
                    <input
                      type="time"
                      value={form.availabilityEndTime}
                      onChange={e => set('availabilityEndTime', e.target.value)}
                      className={INPUT}
                    />
                  </div>
                </div>
              </Field>

              <Field label="Slot duration" required>
                <select
                  value={String(form.availabilitySlotDurationMinutes || '')}
                  onChange={e => set('availabilitySlotDurationMinutes', Number(e.target.value))}
                  className={INPUT}
                >
                  <option value="">-- Select slot duration --</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </Field>

              <div className="rounded-2xl border border-neutral-border bg-white p-4">
                {renderAvailabilityInputs()}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Full Name" required>
                  <input className={INPUT} value={form.name} placeholder="Dr. Ahmed Ali"
                    onChange={e => set('name', e.target.value)} />
                </Field>
                <Field label="Title">
                  <input className={INPUT} value={form.title} placeholder="Consultant Cardiologist"
                    onChange={e => set('title', e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Specialty" required>
                  <input className={INPUT} value={form.specialty} placeholder="e.g. Cardiology"
                    onChange={e => set('specialty', e.target.value)} />
                </Field>
                <Field label="Experience">
                  <input className={INPUT} value={form.experience} placeholder="e.g. 10 years"
                    onChange={e => set('experience', e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Age">
                  <input className={INPUT} type="number" value={form.age} placeholder="e.g. 45"
                    onChange={e => set('age', e.target.value)} />
                </Field>
                <Field label="Gender">
                  <select className={INPUT} value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">-- Select gender --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </Field>
              </div>

              <Field label="Email">
                <input className={INPUT} type="email" value={form.email} placeholder="doctor@hospital.com"
                  onChange={e => set('email', e.target.value)} />
              </Field>

              <Field label="Bio">
                <textarea className={INPUT + ' resize-none'} rows={3} value={form.bio}
                  placeholder="Brief biography..."
                  onChange={e => set('bio', e.target.value)} />
              </Field>

              <Field label="Photo">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 overflow-hidden rounded-xl border border-neutral-border bg-neutral-light flex items-center justify-center">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="Doctor" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-neutral-gray">No photo</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setForm((prev) => ({
                          ...prev,
                          image: file,
                          imagePreview: file ? URL.createObjectURL(file) : '',
                          image_url: file ? '' : prev.image_url,
                        }));
                      }}
                    />
                    <Button type="button" variant="secondary" onClick={() => imageInputRef.current?.click()}>
                      <FiUpload className="mr-2" /> Import Photo
                    </Button>
                    {previewUrl ? (
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, image: null, imagePreview: '', image_url: '' }))}
                        className="text-xs text-error hover:underline text-left"
                      >
                        Remove photo
                      </button>
                    ) : null}
                  </div>
                </div>
              </Field>

              <Field label="Photo URL">
                <input
                  className={INPUT}
                  value={form.image_url}
                  placeholder="https://example.com/doctor.jpg"
                  onChange={(event) => {
                    const nextUrl = event.target.value;
                    setForm((prev) => ({
                      ...prev,
                      image_url: nextUrl,
                      image: null,
                      imagePreview: nextUrl.trim(),
                    }));
                  }}
                />
              </Field>

              {mode === 'edit' && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => set('is_active', e.target.checked)}
                    className="w-4 h-4 rounded accent-primary" />
                  <span className="text-sm font-medium text-neutral-dark">Active (visible on website)</span>
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-6 border-t border-neutral-border sm:flex-row sm:items-center sm:justify-end">
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={() => onSave(form)} disabled={saving}>
              {saving ? 'Saving…' : mode === 'add' ? 'Add Doctor' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ─── Import Preview Modal ─────────────────────────────────────────────────────

function ImportModal({ rows, departments, onClose, onConfirm, importing }: {
  rows: ImportRow[];
  departments: Department[];
  onClose: () => void;
  onConfirm: () => Promise<void>;
  importing: boolean;
}) {
  return (
    <ModalPortal>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-neutral-border">
          <div>
            <h2 className="text-xl font-semibold text-neutral-dark">Import Preview</h2>
            <p className="text-sm text-neutral-gray mt-0.5">{rows.length} doctor(s) found. Review before importing.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-light text-neutral-gray"><FiX size={20} /></button>
        </div>
        <div className="overflow-auto flex-1 p-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-border text-left text-neutral-gray">
                {['Photo','Name','Title','Specialty','Email','Experience','Department','Bio'].map(h => (
                  <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-neutral-border/60 hover:bg-neutral-light/40">
                  <td className="px-3 py-2">
                    {r.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.photo}
                        alt=""
                        className="h-8 w-8 rounded-full border border-neutral-border object-cover"
                      />
                    ) : (
                      <span className="text-neutral-gray">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-neutral-dark">{r.name || <span className="text-error">Missing</span>}</td>
                  <td className="px-3 py-2 text-neutral-gray">{r.title}</td>
                  <td className="px-3 py-2 text-neutral-gray">{r.specialty}</td>
                  <td className="px-3 py-2 text-neutral-gray">{r.email}</td>
                  <td className="px-3 py-2 text-neutral-gray">{r.experience}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      departments.some(d => d.name.toLowerCase() === r.department.toLowerCase())
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {r.department || 'General'}{' '}
                      {!departments.some(d => d.name.toLowerCase() === r.department.toLowerCase()) && '(new)'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-neutral-gray max-w-[200px] truncate">{r.bio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-neutral-border">
          <Button variant="secondary" onClick={onClose} disabled={importing}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={importing}>
            {importing ? 'Importing…' : `Import ${rows.length} Doctor(s)`}
          </Button>
        </div>
      </div>
    </ModalPortal>
  );
}

// ─── Delete Confirm Modal ───────────────────────────────────────────────────

function DeleteConfirmModal({ doctor, onCancel, onConfirm, deleting, error }: {
  doctor: Doctor;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  deleting: boolean;
  error: string | null;
}) {
  return (
    <ModalPortal>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-start gap-4 p-6 border-b border-neutral-border">
          <div className="h-11 w-11 rounded-full bg-red-50 text-error flex items-center justify-center">
            <FiTrash2 size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-neutral-dark">Delete doctor</h2>
            <p className="text-sm text-neutral-gray mt-1">
              Are you sure you want to delete <span className="font-semibold text-neutral-dark">{doctor.name}</span>? This cannot be undone.
            </p>
          </div>
        </div>

        {error && (
          <div className="px-6 pt-4">
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <FiAlertCircle className="flex-shrink-0" /> {error}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 p-6">
          <Button variant="secondary" onClick={onCancel} disabled={deleting}>Cancel</Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 text-white hover:bg-red-700"
          >
            {deleting ? 'Deleting...' : 'Delete Doctor'}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HospitalDoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [openDepts, setOpenDepts] = useState<Set<string>>(new Set());

  // Modal state
  const [addOpen, setAddOpen] = useState(false);
  const [editDoctor, setEditDoctor] = useState<Doctor | null>(null);
  const [viewDoctor, setViewDoctor] = useState<Doctor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalDeleting, setModalDeleting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Import state
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  // Success toast for add/edit/delete
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showSuccessToast = (message: string) => {
    setSuccessToast(message);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (updatedDoctorId?: string): Promise<boolean> => {
    setLoadError(null);
    const [docRes, deptRes] = await Promise.all([
      hospitalAdminApi.listDoctors(),
      hospitalAdminApi.listDepartments(),
    ]);
    let hasError = false;
    if (docRes.error) {
      hasError = true;
      setLoadError(`Failed to load doctors: ${docRes.error}`);
    }
    if (deptRes.error && !docRes.error) {
      hasError = true;
      setLoadError(`Failed to load departments: ${deptRes.error}`);
    }

    if (docRes.data) {
      setDoctors(docRes.data);
      if (updatedDoctorId) {
        const fresh = docRes.data.find(d => d.id === updatedDoctorId);
        if (fresh) setViewDoctor(fresh);
      }
    }
    if (deptRes.data) {
      setDepartments(deptRes.data);
      setOpenDepts(new Set(deptRes.data.map(d => d.id)));
    }
    setLoading(false);
    return !hasError;
  };

  useEffect(() => { void load(); }, []);


  // ── Filtered doctors grouped by department ─────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? doctors.filter(d =>
          d.name.toLowerCase().includes(q) ||
          d.specialty.toLowerCase().includes(q) ||
          d.department_name.toLowerCase().includes(q),
        )
      : doctors;
  }, [doctors, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { dept: { id: string; name: string }; docs: Doctor[] }>();
    for (const doc of filtered) {
      const key = doc.department || 'unknown';
      if (!map.has(key)) map.set(key, { dept: { id: key, name: doc.department_name || 'Unknown' }, docs: [] });
      map.get(key)!.docs.push(doc);
    }
    return [...map.values()].sort((a, b) => a.dept.name.localeCompare(b.dept.name));
  }, [filtered]);

  const toggleDept = (id: string) => {
    setOpenDepts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Resolve or create department ───────────────────────────────────────────
  const resolveDepartment = async (form: DoctorFormData): Promise<string | null> => {
    if (form.department === '__new__') {
      if (!form.newDeptName.trim()) { setModalError('Please enter a department name.'); return null; }
      const res = await hospitalAdminApi.createDepartment({ name: form.newDeptName.trim() });
      if (res.error || !res.data) { setModalError(res.error ?? 'Failed to create department.'); return null; }
      setDepartments(prev => [...prev, res.data!]);
      return res.data.id;
    }
    if (!form.department) { setModalError('Please select a department.'); return null; }
    return form.department;
  };

  const validateAvailability = (form: DoctorFormData): boolean => {
    if (!form.availabilityType) return true;

    if (form.availabilityType === 'week') {
      if (form.weeklyDays.length === 0) {
        setModalError('Please choose at least one weekday.');
        return false;
      }
      if (!form.availabilityStartTime || !form.availabilityEndTime) {
        setModalError('Please set the availability start and end times.');
        return false;
      }
      if (!form.availabilitySlotDurationMinutes) {
        setModalError('Please select a slot duration.');
        return false;
      }
      return true;
    }

    if (form.availabilityType === 'month') {
      if (form.monthlyDayNumbers.length === 0) {
        setModalError('Please choose at least one day of the month.');
        return false;
      }
      if (!form.availabilityStartTime || !form.availabilityEndTime) {
        setModalError('Please set the availability start and end times.');
        return false;
      }
      if (!form.availabilitySlotDurationMinutes) {
        setModalError('Please select a slot duration.');
        return false;
      }
      return true;
    }

    return true;
  };

  const syncDoctorAvailability = async (doctorId: string, form: DoctorFormData): Promise<boolean> => {
    // If no availability type selected, skip syncing schedules (no-op)
    if (!form.availabilityType) return true;

    if (form.availabilityType === 'week') {
      await hospitalAdminApi.syncDoctorWeeklySchedules(doctorId, form.weeklyDays.map(day => ({
        day_of_week: day,
        start_time: form.availabilityStartTime,
        end_time: form.availabilityEndTime,
        slot_duration_minutes: form.availabilitySlotDurationMinutes,
      })));
      return true;
    }

    if (form.availabilityType === 'month') {
      if (form.monthlyDayNumbers.length === 0) {
        setModalError('Please choose at least one day of the month.');
        return false;
      }
      if (!form.availabilityStartTime || !form.availabilityEndTime) {
        setModalError('Please set the availability start and end times.');
        return false;
      }
      if (!form.availabilitySlotDurationMinutes) {
        setModalError('Please select a slot duration.');
        return false;
      }
      const [year, month] = form.monthlyMonth.split('-').map(Number);
      const daysInMonth = getDaysInMonth(year, month);
      const dates = form.monthlyDayNumbers
        .filter(day => day >= 1 && day <= daysInMonth)
        .map(day => ({
          date: `${year}-${pad2(month)}-${pad2(day)}`,
          start_time: form.availabilityStartTime,
          end_time: form.availabilityEndTime,
          slot_duration_minutes: form.availabilitySlotDurationMinutes,
        }));
      await hospitalAdminApi.syncDoctorAvailableDates(doctorId, dates);
      return true;
    }

    if (form.availableDates.length > 0) {
      await hospitalAdminApi.syncDoctorAvailableDates(doctorId, form.availableDates);
    }
    return true;
  };

  const buildDoctorPayload = (
    form: DoctorFormData,
    deptId: string,
    bio: string,
    includeActive: boolean,
  ): FormData | {
    name: string;
    title?: string;
    specialty: string;
    experience?: string;
    bio: string;
    department: string;
    image_url?: string;
    is_active?: boolean;
    age?: number;
    gender?: string;
    email?: string;
  } => {
    const shared = {
      name: form.name.trim(),
      specialty: form.specialty.trim(),
      bio,
      department: deptId,
      title: form.title.trim(),
      experience: form.experience.trim(),
      email: form.email.trim(),
      gender: form.gender,
      ...(form.age ? { age: Number(form.age) } : { age: null }),
      ...(includeActive ? { is_active: form.is_active } : {}),
    };

    if (form.image) {
      const payload = new FormData();
      Object.entries(shared).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          payload.append(key, String(value));
        }
      });
      payload.append('image', form.image);
      return payload;
    }

    const imageUrl = form.image_url.trim();
    return {
      ...shared,
      ...(imageUrl.startsWith('http://') || imageUrl.startsWith('https://') ? { image_url: imageUrl } : {}),
    };
  };

  // ── Add doctor ─────────────────────────────────────────────────────────────
  const handleAdd = async (form: DoctorFormData) => {
    if (!form.name.trim()) { setModalError('Name is required.'); return; }
    if (!form.specialty.trim()) { setModalError('Specialty is required.'); return; }
    setModalSaving(true);
    setModalError(null);
    if (!validateAvailability(form)) { setModalSaving(false); return; }
    const deptId = await resolveDepartment(form);
    if (!deptId) { setModalSaving(false); return; }
    const bio = buildDoctorBio(form);
    const payload = buildDoctorPayload(form, deptId, bio, false);

    const res = await hospitalAdminApi.createDoctor(payload);
    if (res.error || !res.data) {
      setModalError(res.error ?? 'Failed to create doctor.');
      setModalSaving(false);
      return;
    }
    const synced = await syncDoctorAvailability(res.data.id, form);
    if (!synced) { setModalSaving(false); return; }
    const refreshed = await load();
    if (!refreshed) {
      setModalError('Doctor was saved but the list could not be refreshed. Please reload the page.');
      setModalSaving(false);
      return;
    }
    setAddOpen(false);
    setModalSaving(false);
    showSuccessToast(`${/^dr\.?\s/i.test(form.name.trim()) ? '' : 'Dr. '}${form.name.trim()} has been added successfully.`);
  };

  // ── Edit doctor ────────────────────────────────────────────────────────────
  const handleEdit = async (form: DoctorFormData) => {
    const editId = editDoctor?.id;
    if (!editId) return;
    if (!form.name.trim()) { setModalError('Name is required.'); return; }
    setModalSaving(true);
    setModalError(null);
    if (!validateAvailability(form)) { setModalSaving(false); return; }
    const deptId = await resolveDepartment(form);
    if (!deptId) { setModalSaving(false); return; }
    const bio = buildDoctorBio(form);
    const payload = buildDoctorPayload(form, deptId, bio, true);

    const res = await hospitalAdminApi.updateDoctor(editId, payload);
    if (res.error) {
      setModalError(res.error);
      setModalSaving(false);
      return;
    }
    const synced = await syncDoctorAvailability(editId, form);
    if (!synced) { setModalSaving(false); return; }
    const refreshed = await load(editId);
    if (!refreshed) {
      setModalError('Doctor was updated but the list could not be refreshed. Please reload the page.');
      setModalSaving(false);
      return;
    }
    setEditDoctor(null);
    setModalSaving(false);
    showSuccessToast(`${/^dr\.?\s/i.test(form.name.trim()) ? '' : 'Dr. '}${form.name.trim()} has been updated successfully.`);
  };

  const handleDelete = async (doc: Doctor) => {
    setModalDeleting(true);
    setModalError(null);
    const res = await hospitalAdminApi.deleteDoctor(doc.id);
    if (res.error) {
      setModalError(res.error);
      setModalDeleting(false);
      return;
    }
    const refreshed = await load();
    if (!refreshed) {
      setModalError('Doctor was deleted but the list could not be refreshed. Please reload the page.');
      setModalDeleting(false);
      return;
    }
    setDeleteTarget(null);
    if (editDoctor?.id === doc.id) {
      setEditDoctor(null);
    }
    setModalDeleting(false);
    showSuccessToast(`${doc.name} has been removed from the directory.`);
  };

  // ── Excel/CSV import ───────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
    const rows: ImportRow[] = raw.map(r => ({
      name: String(r['Name'] ?? r['name'] ?? '').trim(),
      title: String(r['Title'] ?? r['title'] ?? '').trim(),
      specialty: String(r['Specialty'] ?? r['specialty'] ?? r['Specialization'] ?? '').trim(),
      email: String(r['Email'] ?? r['email'] ?? '').trim(),
      experience: String(r['Experience'] ?? r['experience'] ?? '').trim(),
      department: String(r['Department'] ?? r['department'] ?? '').trim(),
      bio: String(r['Bio'] ?? r['bio'] ?? '').trim(),
      photo: normalizeCsvImageUrl(String(
        r['Photo'] ??
        r['photo'] ??
        r['Photo URL'] ??
        r['photo_url'] ??
        r['Image'] ??
        r['image'] ??
        r['image_url'] ??
        r['Image URL'] ??
        ''
      )),
    })).filter(r => r.name);
    if (rows.length === 0) { alert('No valid rows found. Make sure your file has a "Name" column.'); return; }
    setImportRows(rows);
  };

  const handleImportConfirm = async () => {
    if (!importRows) return;
    setImporting(true);
    let created = 0;
    // Build dept name → id map (case-insensitive)
    const deptMap = new Map<string, string>(departments.map(d => [d.name.toLowerCase(), d.id]));

    for (const row of importRows) {
      try {
        const deptKey = (row.department || 'General').toLowerCase();
        let deptId = deptMap.get(deptKey);
        if (!deptId) {
          const res = await hospitalAdminApi.createDepartment({ name: row.department || 'General' });
          if (res.data) { deptId = res.data.id; deptMap.set(deptKey, deptId); setDepartments(p => [...p, res.data!]); }
        }
        if (!deptId) continue;
        const bio = row.bio || [row.title, row.experience].filter(Boolean).join(' • ');
        const docRes = await hospitalAdminApi.createDoctor({
          name: row.name,
          title: row.title || undefined,
          specialty: row.specialty || 'General',
          experience: row.experience || undefined,
          bio,
          department: deptId,
          image_url: row.photo || undefined,
          email: row.email || undefined,
        });
        if (docRes.data) { await hospitalAdminApi.createDefaultSchedules(docRes.data.id); created++; }
      } catch { /* skip bad rows */ }
    }

    await load();
    setImportRows(null);
    setImporting(false);
    setImportSuccess(`Successfully imported ${created} doctor(s).`);
    setTimeout(() => setImportSuccess(null), 5000);
  };

  // ── Build edit initial form ─────────────────────────────────────────────────
  const editInitial = (doc: Doctor): DoctorFormData => {
    const { title, experience, bio } = parseDoctorDetails(doc);
    const resolvedImage = normalizeLogoUrl(doc.image_url_resolved || doc.image_url) || '';
    
    // Convert existing schedules to available dates format
    // Note: This assumes schedules have a specific_date field from the backend
    const availableDates = (doc.schedules || []).map(s => ({
      date: (s as any).specific_date || new Date().toISOString().split('T')[0],
      start_time: s.start_time.substring(0, 5), // HH:MM
      end_time: s.end_time.substring(0, 5),
      slot_duration_minutes: s.slot_duration_minutes,
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    const specificDates = (doc.schedules || [])
      .filter((s: any) => s.specific_date)
      .map((s: any) => ({
        date: s.specific_date,
        start_time: s.start_time.substring(0, 5),
        end_time: s.end_time.substring(0, 5),
        slot_duration_minutes: s.slot_duration_minutes,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const weeklyDays = (doc.schedules || [])
      .filter((s: any) => !s.specific_date)
      .map((s: any) => s.day_of_week)
      .filter((value: number, index: number, self: number[]) => self.indexOf(value) === index)
      .sort((a: number, b: number) => a - b);

    const availabilityType = weeklyDays.length > 0 ? 'week' : specificDates.length > 0 ? 'year' : 'week';
    const availabilityStartTime = specificDates[0]?.start_time || doc.schedules?.[0]?.start_time?.substring(0, 5) || '09:00';
    const availabilityEndTime = specificDates[0]?.end_time || doc.schedules?.[0]?.end_time?.substring(0, 5) || '17:00';
    const availabilitySlotDurationMinutes = specificDates[0]?.slot_duration_minutes || doc.schedules?.[0]?.slot_duration_minutes || 30;

    const monthlyMonth = new Date().toISOString().slice(0, 7);

    return {
      name: doc.name,
      title,
      specialty: doc.specialty,
      bio,
      email: doc.email || '',
      experience,
      department: String(doc.department || ''),
      newDeptName: '',
      is_active: doc.is_active ?? true,
      age: doc.age ? String(doc.age) : '',
      gender: doc.gender || '',
      image: null,
      image_url: doc.image_url ?? '',
      imagePreview: resolvedImage,
      availabilityType,
      weeklyDays: weeklyDays.length > 0 ? weeklyDays : [1, 2, 3, 4, 5],
      monthlyMonth,
      monthlyDayNumbers: specificDates.map(d => Number(d.date.split('-')[2])).filter(Boolean),
      availabilityStartTime,
      availabilityEndTime,
      availabilitySlotDurationMinutes,
      availableDates: specificDates,
    };
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-dark">Doctors Directory</h1>
          <p className="mt-1 text-neutral-gray">Manage your medical staff, grouped by department.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <FiUpload className="mr-2" /> Import Excel / CSV
          </Button>
          <Button variant="primary" onClick={() => { setModalError(null); setAddOpen(true); }}>
            <FiPlus className="mr-2" /> Add Doctor
          </Button>
        </div>
      </div>

      {/* Load error banner */}
      {loadError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium">
          <FiAlertCircle className="flex-shrink-0 text-red-600" /> {loadError}
          <button onClick={() => void load()} className="ml-auto underline hover:text-red-900">Retry</button>
        </div>
      )}

      {/* Success toast — add/edit/delete */}

      {successToast && (
        <div className="fixed bottom-6 right-6 z-[10000] flex items-center gap-3 px-5 py-3.5 bg-emerald-600 text-white rounded-2xl shadow-2xl text-sm font-semibold animate-fade-in max-w-sm">
          <FiCheck className="flex-shrink-0" size={18} />
          <span>{successToast}</span>
          <button onClick={() => setSuccessToast(null)} className="ml-auto text-white/70 hover:text-white">
            <FiX size={16} />
          </button>
        </div>
      )}

      {/* Success banner — CSV import */}
      {importSuccess && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-medium">
          <FiCheck className="flex-shrink-0" /> {importSuccess}
        </div>
      )}

      {/* Search */}
      <Card className="p-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search doctors by name, specialty, or department…"
          className="input-field w-full md:max-w-lg"
        />
      </Card>

      {/* Import tip */}
      <div className="text-xs text-neutral-gray bg-neutral-light border border-neutral-border rounded-lg px-4 py-2">
        📋 <strong>Excel import columns:</strong> Photo (URL), Name, Title, Specialty, Email, Experience, Department, Bio
        — departments are created automatically if they don&apos;t exist yet.
      </div>

      {/* Content */}
      {loading ? (
        <Card className="p-6 text-sm text-neutral-gray">Loading doctors…</Card>
      ) : grouped.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-neutral-gray mb-4">{search ? 'No doctors match your search.' : 'No doctors yet.'}</p>
          {!search && (
            <Button variant="primary" onClick={() => { setModalError(null); setAddOpen(true); }}>
              <FiPlus className="mr-2" /> Add your first doctor
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ dept, docs }) => {
            const isOpen = openDepts.has(dept.id);
            return (
              <Card key={dept.id} className="overflow-hidden">
                {/* Department header — clickable to expand/collapse */}
                <button
                  type="button"
                  onClick={() => toggleDept(dept.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-light/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? <FiChevronDown className="text-primary" size={18} /> : <FiChevronRight className="text-neutral-gray" size={18} />}
                    <span className="font-semibold text-neutral-dark text-lg">{dept.name}</span>
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-primary-light text-primary text-xs font-semibold">
                      {docs.length} doctor{docs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>

                {/* Doctor rows */}
                {isOpen && (
                  <div className="border-t border-neutral-border divide-y divide-neutral-border/60">
                    {docs.map(doc => {
                      const avatarUrl = normalizeLogoUrl(doc.image_url_resolved || doc.image_url) || '';
                      return (
                        <div key={doc.id} className="flex items-center gap-4 px-5 py-3 hover:bg-neutral-light/30 transition-colors">
                          {/* Avatar */}
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-primary-light text-primary text-sm font-bold flex items-center justify-center">
                            {avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={avatarUrl} alt={doc.name} className="h-full w-full object-cover" />
                            ) : (
                              initials(doc.name)
                            )}
                          </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3">
                          <p className="font-medium text-neutral-dark truncate">{doc.name}</p>
                          <p className="text-sm text-primary truncate">{doc.specialty}</p>
                          <div>
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              doc.is_active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {doc.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => { setViewDoctor(doc); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-border text-sm text-neutral-gray hover:bg-primary-light hover:text-primary hover:border-primary/30 transition-colors"
                          >
                            <FiUser size={14} /> Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => { setModalError(null); setModalDeleting(false); setEditDoctor(doc); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-border text-sm text-neutral-gray hover:bg-primary-light hover:text-primary hover:border-primary/30 transition-colors"
                          >
                            <FiEdit2 size={14} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { setModalError(null); setModalDeleting(false); setDeleteTarget(doc); }}
                            disabled={modalDeleting}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm text-error hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <FiTrash2 size={14} /> Delete
                          </button>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Doctor Modal */}
      {addOpen && (
        <DoctorModal
          mode="add"
          initialData={EMPTY_FORM}
          departments={departments}
          onClose={() => setAddOpen(false)}
          onSave={handleAdd}
          saving={modalSaving}
          error={modalError}
        />
      )}

      {/* Edit Doctor Modal */}
      {editDoctor && (
        <DoctorModal
          mode="edit"
          initialData={editInitial(editDoctor)}
          departments={departments}
          onClose={() => { setEditDoctor(null); setModalDeleting(false); }}
          onSave={handleEdit}
          saving={modalSaving}
          error={modalError}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          doctor={deleteTarget}
          onCancel={() => { setDeleteTarget(null); setModalError(null); setModalDeleting(false); }}
          onConfirm={() => handleDelete(deleteTarget)}
          deleting={modalDeleting}
          error={modalError}
        />
      )}

      {/* Import Preview Modal */}
      {importRows && (
        <ImportModal
          rows={importRows}
          departments={departments}
          onClose={() => setImportRows(null)}
          onConfirm={handleImportConfirm}
          importing={importing}
        />
      )}

      {/* View Doctor Modal */}
      {viewDoctor && (() => {
        const profile = parseDoctorDetails(viewDoctor);
        return (
        <ModalPortal>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-neutral-border bg-gradient-to-r from-primary/10 to-transparent">
              <h2 className="text-xl font-semibold text-neutral-dark flex items-center gap-2">
                <FiUser className="text-primary" /> Doctor Profile
              </h2>
              <button onClick={() => setViewDoctor(null)} className="p-2 rounded-lg hover:bg-white/50 text-neutral-gray transition-colors">
                <FiX size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* Left Column: Basic Info */}
                <div className="md:col-span-1 flex flex-col items-center text-center space-y-5">
                  <div className="h-36 w-36 overflow-hidden rounded-full shadow-xl border-4 border-white ring-4 ring-primary/20 bg-primary-light flex items-center justify-center text-5xl font-bold text-primary">
                    {viewDoctor.image_url_resolved || viewDoctor.image_url ? (
                      <img src={normalizeLogoUrl(viewDoctor.image_url_resolved || viewDoctor.image_url) || ''} alt={viewDoctor.name} className="h-full w-full object-cover" />
                    ) : (
                      initials(viewDoctor.name)
                    )}
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-neutral-dark tracking-tight leading-tight">{viewDoctor.name}</h3>
                    {profile.title ? (
                      <p className="text-sm text-neutral-gray font-medium mt-1">{profile.title}</p>
                    ) : null}
                    <p className="text-base text-primary font-semibold mt-1.5">{viewDoctor.specialty}</p>
                    <p className="text-sm text-neutral-gray mt-1">{viewDoctor.department_name || '—'}</p>
                    <div className="mt-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold shadow-sm ${
                        viewDoctor.is_active 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${viewDoctor.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                        {viewDoctor.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-neutral-50/80 rounded-2xl p-4 border border-neutral-200/60 shadow-sm space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500 font-bold uppercase tracking-wider text-xs">Experience</span>
                      <span className="font-bold text-neutral-dark">{profile.experience || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500 font-bold uppercase tracking-wider text-xs">Age</span>
                      <span className="font-bold text-neutral-dark">{viewDoctor.age ? `${viewDoctor.age} y` : '—'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-neutral-500 font-bold uppercase tracking-wider text-xs">Gender</span>
                      <span className="font-bold text-neutral-dark">{viewDoctor.gender || '—'}</span>
                    </div>
                    <div className="flex flex-col items-start text-sm pt-2 border-t border-neutral-200/60 mt-2">
                      <span className="text-neutral-500 font-bold uppercase tracking-wider text-xs mb-1">Email</span>
                      <span className="font-bold text-neutral-dark truncate w-full text-left" title={viewDoctor.email || ''}>{viewDoctor.email || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Bio & Schedule */}
                <div className="md:col-span-2 flex flex-col bg-neutral-50 rounded-2xl p-6 border border-neutral-200 shadow-sm">
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-3">Biography</h4>
                    <p className="text-base text-neutral-700 leading-relaxed whitespace-pre-wrap">
                      {profile.bio || <span className="text-neutral-400 italic">No biography available.</span>}
                    </p>
                  </div>

                  <div className="border-t border-neutral-200/80 pt-5 mt-6">
                    <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-4">Schedule Information</h4>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-sm flex flex-col justify-center">
                        <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider mb-1">Type</p>
                        <p className="text-sm font-bold text-neutral-dark capitalize">
                          {viewDoctor.schedules && viewDoctor.schedules.length > 0
                            ? (viewDoctor.schedules[0].specific_date ? 'Specific Dates' : 'Weekly')
                            : 'Not Set'}
                        </p>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-sm flex flex-col justify-center">
                        <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider mb-1">Slot Duration</p>
                        <p className="text-sm font-bold text-neutral-dark">
                          {viewDoctor.schedules && viewDoctor.schedules.length > 0 ? `${viewDoctor.schedules[0].slot_duration_minutes} Mins` : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                      <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider mb-3">Active Shifts</p>
                      {viewDoctor.schedules && viewDoctor.schedules.length > 0 ? (
                        <div className="max-h-[140px] overflow-y-auto pr-2">
                          <ul className="space-y-2.5">
                            {viewDoctor.schedules.filter((s, idx, arr) => 
                              idx === arr.findIndex(t => 
                                t.specific_date === s.specific_date && 
                                t.day_of_week === s.day_of_week && 
                                t.start_time === s.start_time && 
                                t.end_time === s.end_time
                              )
                            ).map((schedule, idx) => (
                              <li key={idx} className="flex justify-between items-center text-sm text-neutral-800 border-b border-neutral-100 pb-2.5 last:border-0 last:pb-0">
                                <span className="font-bold text-neutral-dark">
                                  {schedule.specific_date 
                                    ? schedule.specific_date 
                                    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][schedule.day_of_week]}
                                </span>
                                <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-extrabold text-xs tracking-wide">
                                  {formatTime12h(schedule.start_time.substring(0, 5))} - {formatTime12h(schedule.end_time.substring(0, 5))}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-sm italic text-neutral-400">No active shifts scheduled.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-neutral-border bg-neutral-50 flex justify-end">
              <Button variant="secondary" onClick={() => setViewDoctor(null)}>Close</Button>
            </div>
          </div>
        </ModalPortal>
        );
      })()}
    </div>
  );
}
