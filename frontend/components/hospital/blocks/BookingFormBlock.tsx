'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Doctor, AvailableSlot } from '@/types/hospital';
import { getHospitalDoctors, getAvailableSlots, createAppointment } from '@/lib/hospitalApi';
import { normalizeLogoUrl } from '@/lib/storage';
import {
  FiUser,
  FiCalendar,
  FiClock,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiSearch,
  FiCheckCircle,
  FiAlertCircle,
  FiArrowRight,
} from 'react-icons/fi';

interface BookingFormBlockProps {
  settings: {
    title?: string;
    success_message?: string;
  };
  subdomain: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function formatDisplayDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Cairo',
  });
}

function getDoctorSummary(doc: Doctor) {
  const bullet = '\u2022';
  const sep = ` ${bullet} `;
  const rawBio = (doc.bio || '').trim();
  if (!rawBio) return { summary: 'Dedicated to patient-first care.', experience: '' };
  const parts = rawBio.split(sep).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { summary: parts.slice(2).join(sep) || parts[0] || rawBio, experience: parts[1] || '' };
  return { summary: rawBio, experience: '' };
}

const STEP_LABELS = ['Select Doctor', 'Pick Date', 'Choose Time', 'Your Details'];

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-center gap-0">
        {Array.from({ length: total }).map((_, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-300"
                  style={
                    done
                      ? { backgroundColor: 'var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary-text)' }
                      : active
                        ? { 
                            backgroundColor: 'color-mix(in srgb, var(--hospital-btn-primary) 10%, transparent)', 
                            color: 'var(--hospital-btn-primary)', 
                            border: '2px solid var(--hospital-btn-primary)' 
                          }
                        : { backgroundColor: 'var(--hospital-surface-alt)', color: 'var(--hospital-text-muted)' }
                  }
                >
                  {done ? <FiCheck size={16} /> : i + 1}
                </div>
                <span
                  className="mt-1.5 hidden text-[11px] font-semibold sm:block"
                  style={{ color: active || done ? 'var(--hospital-btn-primary)' : 'var(--hospital-text-muted)' }}
                >
                  {STEP_LABELS[i]}
                </span>
              </div>
              {i < total - 1 && (
                <div
                  className="mb-4 h-0.5 w-10 sm:w-16 transition-all duration-300"
                  style={{ backgroundColor: i < current ? 'var(--hospital-btn-primary)' : 'var(--hospital-border)' }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Doctor card (compact selection) ─────────────────────────────────────────

function DoctorCard({ doc, selected, onClick }: { doc: Doctor; selected: boolean; onClick: () => void }) {
  const imageUrl = normalizeLogoUrl(doc.image_url_resolved || doc.image_url) || '';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all"
      style={
        selected
          ? { borderColor: 'var(--hospital-btn-primary)', backgroundColor: 'var(--hospital-primary-soft)' }
          : { borderColor: 'var(--hospital-border)', backgroundColor: 'var(--hospital-surface)' }
      }
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-bold"
        style={{ backgroundColor: 'var(--hospital-primary-soft)', color: 'var(--hospital-primary-strong)' }}
      >
        {imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={imageUrl} alt={doc.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          : doc.name.charAt(0)
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-bold" style={{ color: 'var(--hospital-text)' }}>{doc.name}</p>
        <p className="truncate text-xs" style={{ color: selected ? 'var(--hospital-primary-strong)' : 'var(--hospital-text-muted)' }}>{doc.specialty}</p>
        <p className="truncate text-[11px]" style={{ color: 'var(--hospital-text-muted)' }}>{doc.department_name || 'General'}</p>
      </div>
      {selected && (
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary-text)' }}
        >
          <FiCheck size={12} />
        </div>
      )}
    </button>
  );
}

// ─── Calendar picker ──────────────────────────────────────────────────────────

function CalendarPicker({
  selectedDate,
  onDateSelect,
  workDays,
  availableDates,
}: {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  workDays: Set<number>;
  availableDates?: Set<string>;
}) {
  const today = new Date();
  const todayCairo = new Date(today.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const [year, setYear] = useState(todayCairo.getFullYear());
  const [month, setMonth] = useState(todayCairo.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

  const goBack = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const goForward = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Don't go to past months
  const canGoBack = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--hospital-border)', backgroundColor: 'var(--hospital-surface)' }}
    >
      {/* Month header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: 'var(--hospital-surface-alt)', borderBottom: '1px solid var(--hospital-border)' }}
      >
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack}
          className="flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-30"
          style={{ color: 'var(--hospital-text-muted)' }}
        >
          <FiChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold" style={{ color: 'var(--hospital-text)' }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={goForward}
          className="flex h-8 w-8 items-center justify-center rounded-full transition"
          style={{ color: 'var(--hospital-text-muted)' }}
        >
          <FiChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--hospital-border)' }}>
        {DAY_ABBR.map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--hospital-text-muted)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 p-2 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isPast = dateStr < todayStr;
          const hospitalDay = new Date(year, month, day).getDay();
          
          // Check if date is available: either in specific dates or matches workDays
          let isWorkDay = false;
          if (availableDates && availableDates.size > 0) {
            isWorkDay = availableDates.has(dateStr);
          } else {
            isWorkDay = workDays.size === 0 || workDays.has(hospitalDay);
          }
          
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          const isDisabled = isPast || !isWorkDay;

          return (
            <button
              key={i}
              type="button"
              onClick={() => !isDisabled && onDateSelect(dateStr)}
              disabled={isDisabled}
              className="aspect-square rounded-lg text-sm font-medium transition-all"
              style={
                isSelected
                  ? { backgroundColor: 'var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary-text)' }
                  : isToday && !isSelected
                    ? { outline: '2px solid var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary)', fontWeight: 700 }
                    : isDisabled
                      ? { opacity: 0.3, cursor: 'not-allowed', color: 'var(--hospital-text-muted)' }
                      : { color: 'var(--hospital-text)' }
              }
              onMouseEnter={e => { if (!isDisabled && !isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hospital-primary-soft)'; }}
              onMouseLeave={e => { if (!isDisabled && !isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''; }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 text-[11px]" style={{ borderTop: '1px solid var(--hospital-border)', color: 'var(--hospital-text-muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: 'var(--hospital-btn-primary)' }} /> Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm opacity-30" style={{ backgroundColor: 'var(--hospital-text-muted)' }} /> Unavailable
        </span>
      </div>
    </div>
  );
}

// ─── Booking Summary Card ─────────────────────────────────────────────────────

function BookingSummary({
  doctor,
  date,
  slot,
}: {
  doctor: Doctor | null;
  date: string;
  slot: AvailableSlot | null;
}) {
  if (!doctor && !date && !slot) return null;
  return (
    <div
      className="rounded-2xl p-5 space-y-3"
      style={{
        backgroundColor: 'var(--hospital-primary-soft)',
        border: '1px solid color-mix(in srgb, var(--hospital-btn-primary) 30%, transparent)',
      }}
    >
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--hospital-primary-strong)' }}>
        Booking Summary
      </p>
      {doctor && (
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full font-bold"
            style={{ backgroundColor: 'var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary-text)' }}
          >
            {(() => {
              const img = normalizeLogoUrl(doctor.image_url_resolved || doctor.image_url);
              return img
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={img} alt={doctor.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                : doctor.name.charAt(0);
            })()}
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--hospital-text)' }}>{doctor.name}</p>
            <p className="text-xs" style={{ color: 'var(--hospital-text-muted)' }}>{doctor.specialty}</p>
          </div>
        </div>
      )}
      {date && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--hospital-text)' }}>
          <FiCalendar size={14} style={{ color: 'var(--hospital-primary-strong)' }} />
          <span>{formatDisplayDate(date)}</span>
        </div>
      )}
      {slot && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--hospital-text)' }}>
          <FiClock size={14} style={{ color: 'var(--hospital-primary-strong)' }} />
          <span>{formatTime(slot.start_datetime)} – {formatTime(slot.end_datetime)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BookingFormBlock({ settings, subdomain }: BookingFormBlockProps) {
  const title = settings.title || 'Book an Appointment';
  const successMessage = settings.success_message || 'Your appointment has been successfully booked!';

  const [step, setStep] = useState(0);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([]);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  // Patient details
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [patientAge, setPatientAge] = useState('');

  const [isLoadingDoctors, setIsLoadingDoctors] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Load doctors + handle URL params
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const docs = await getHospitalDoctors(subdomain);
        setAllDoctors(docs);
        setFilteredDoctors(docs);

        const params = new URLSearchParams(window.location.search);
        const deptId = params.get('department_id');
        const docId = params.get('doctor_id');

        if (deptId) {
          const filtered = docs.filter(d => d.department === deptId || (d as any).department_id === deptId);
          setFilteredDoctors(filtered.length > 0 ? filtered : docs);
        }
        if (docId) {
          const found = docs.find(d => d.id === docId);
          if (found) { setSelectedDoctor(found); setStep(1); }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingDoctors(false);
      }
    };
    fetchDocs();
  }, [subdomain]);

  // Filter doctors by search
  useEffect(() => {
    const q = doctorSearch.trim().toLowerCase();
    if (!q) { setFilteredDoctors(allDoctors); return; }
    setFilteredDoctors(
      allDoctors.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.specialty.toLowerCase().includes(q) ||
        (d.department_name || '').toLowerCase().includes(q),
      ),
    );
  }, [doctorSearch, allDoctors]);

  // Fetch slots
  const fetchSlots = useCallback(async () => {
    if (!selectedDoctor || !selectedDate) { setSlots([]); setSelectedSlot(null); return; }
    setIsLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const res = await getAvailableSlots(selectedDoctor.id, selectedDate);
      setSlots(res.slots || []);
    } catch { setSlots([]); } finally { setIsLoadingSlots(false); }
  }, [selectedDoctor, selectedDate]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // Get available dates: if doctor has specific_date schedules, use those; otherwise use day_of_week
  const availableDates = new Set<string>();
  const workDays = new Set<number>();
  
  if (selectedDoctor?.schedules) {
    const hasSpecificDates = selectedDoctor.schedules.some(s => s.specific_date);
    
    if (hasSpecificDates) {
      // Use specific dates
      selectedDoctor.schedules.forEach(s => {
        if (s.specific_date) {
          availableDates.add(s.specific_date);
        }
      });
    } else {
      // Fall back to day_of_week for backward compatibility
      selectedDoctor.schedules.forEach(s => {
        workDays.add(s.day_of_week);
      });
    }
  }

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor || !selectedSlot) return;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const result = await createAppointment({
        doctor_id: selectedDoctor.id,
        start_datetime: selectedSlot.start_datetime,
        end_datetime: selectedSlot.end_datetime,
        patient_name: patientName,
        patient_email: patientEmail,
        patient_phone: patientPhone,
        patient_gender: patientGender || undefined,
        patient_age: patientAge ? parseInt(patientAge, 10) : undefined,
      });
      if ('error' in result) {
        setErrorMsg(result.error);
        if (result.status === 409) await fetchSlots();
      } else {
        // Immediately mark the booked slot as reserved in our local state to reflect it without reload
        setSlots(prevSlots => 
          prevSlots.map(s => 
            s.start_datetime === selectedSlot.start_datetime 
              ? { ...s, status: 'reserved' } 
              : s
          )
        );
        setIsSuccess(true);
      }
    } catch { setErrorMsg('An unexpected error occurred. Please try again.'); }
    finally { setIsSubmitting(false); }
  };

  // ── Success screen ──────────────────────────────────────────────────────────

  if (isSuccess) {
    return (
      <section className="py-20" style={{ backgroundColor: 'var(--hospital-bg)' }}>
        <div className="mx-auto max-w-lg px-4 text-center sm:px-6">
          <div
            className="rounded-3xl p-10 shadow-lg"
            style={{ backgroundColor: 'var(--hospital-surface)', border: '1px solid var(--hospital-border)' }}
          >
            <div
              className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full"
              style={{ backgroundColor: '#ecfdf5' }}
            >
              <FiCheckCircle size={40} style={{ color: '#059669' }} />
            </div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--hospital-text)' }}>Appointment Confirmed!</h2>
            <p className="mt-3 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>{successMessage}</p>

            {selectedDoctor && (
              <div
                className="mt-6 rounded-2xl p-4 text-left space-y-2"
                style={{ backgroundColor: 'var(--hospital-surface-alt)' }}
              >
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--hospital-text)' }}>
                  <FiUser size={14} style={{ color: 'var(--hospital-primary-strong)' }} />
                  <span className="font-semibold">{selectedDoctor.name}</span>
                  <span style={{ color: 'var(--hospital-text-muted)' }}>— {selectedDoctor.specialty}</span>
                </div>
                {selectedDate && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--hospital-text)' }}>
                    <FiCalendar size={14} style={{ color: 'var(--hospital-primary-strong)' }} />
                    {formatDisplayDate(selectedDate)}
                  </div>
                )}
                {selectedSlot && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--hospital-text)' }}>
                    <FiClock size={14} style={{ color: 'var(--hospital-primary-strong)' }} />
                    {formatTime(selectedSlot.start_datetime)} – {formatTime(selectedSlot.end_datetime)}
                  </div>
                )}
              </div>
            )}

            <p className="mt-4 text-xs" style={{ color: 'var(--hospital-text-muted)' }}>
              A confirmation will be sent to <strong>{patientEmail}</strong>
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => {
                  setIsSuccess(false); setStep(0); setSelectedDoctor(null);
                  setSelectedDate(''); setSelectedSlot(null);
                  setPatientName(''); setPatientEmail(''); setPatientPhone('');
                  setPatientGender(''); setPatientAge('');
                }}
                className="w-full rounded-full py-3 text-sm font-semibold transition hover:opacity-90"
                style={{ backgroundColor: 'var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary-text)', borderRadius: 'var(--hospital-radius)' }}
              >
                Book Another Appointment
              </button>
              <Link
                href="/"
                className="text-sm font-medium underline underline-offset-2"
                style={{ color: 'var(--hospital-link)' }}
              >
                Return to Home
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────

  return (
    <section id="booking-form" className="py-16" style={{ backgroundColor: 'var(--hospital-bg)' }}>
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--hospital-primary-strong)' }}>
            Online Booking
          </p>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl" style={{ color: 'var(--hospital-text)' }}>{title}</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>
            Schedule your visit in 4 simple steps — it only takes 2 minutes.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Left: main form panel */}
          <div
            className="rounded-3xl p-6 shadow-sm md:p-8"
            style={{ backgroundColor: 'var(--hospital-surface)', border: '1px solid var(--hospital-border)' }}
          >
            <StepIndicator current={step} total={4} />

            {/* ── Step 0: Select Doctor ── */}
            {step === 0 && (
              <div className="animate-fade-up">
                <h3 className="mb-4 text-lg font-bold" style={{ color: 'var(--hospital-text)' }}>
                  Choose a Specialist
                </h3>

                {/* Search */}
                <div className="relative mb-4">
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--hospital-text-muted)' }} />
                  <input
                    type="text"
                    value={doctorSearch}
                    onChange={e => setDoctorSearch(e.target.value)}
                    placeholder="Search by name, specialty or department…"
                    className="w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none transition"
                    style={{
                      border: '1px solid var(--hospital-border)',
                      backgroundColor: 'var(--hospital-input-bg)',
                      color: 'var(--hospital-text)',
                    }}
                  />
                </div>

                {isLoadingDoctors ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-20 animate-pulse rounded-xl" style={{ backgroundColor: 'var(--hospital-surface-alt)' }} />
                    ))}
                  </div>
                ) : filteredDoctors.length === 0 ? (
                  <div className="rounded-xl py-10 text-center" style={{ backgroundColor: 'var(--hospital-surface-alt)' }}>
                    <p className="text-2xl">👨‍⚕️</p>
                    <p className="mt-2 font-semibold" style={{ color: 'var(--hospital-text)' }}>No doctors found</p>
                    <p className="mt-1 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>Try a different search term</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 max-h-80 overflow-y-auto pr-1">
                    {filteredDoctors.map(doc => (
                      <DoctorCard
                        key={doc.id}
                        doc={doc}
                        selected={selectedDoctor?.id === doc.id}
                        onClick={() => setSelectedDoctor(doc)}
                      />
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!selectedDoctor}
                  onClick={() => setStep(1)}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold transition disabled:opacity-40"
                  style={{ backgroundColor: 'var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary-text)', borderRadius: 'var(--hospital-radius)' }}
                >
                  Continue <FiArrowRight size={15} />
                </button>
              </div>
            )}

            {/* ── Step 1: Pick Date ── */}
            {step === 1 && (
              <div className="animate-fade-up">
                <h3 className="mb-4 text-lg font-bold" style={{ color: 'var(--hospital-text)' }}>
                  Choose an Appointment Date
                </h3>
                {selectedDoctor && (
                  <p className="mb-4 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>
                    Only dates when <strong style={{ color: 'var(--hospital-text)' }}>{selectedDoctor.name}</strong> is available are highlighted.
                  </p>
                )}
                
                {/* Warning when doctor has no available dates */}
                {selectedDoctor && availableDates.size === 0 && workDays.size === 0 && (
                  <div
                    className="mb-4 flex items-start gap-3 rounded-xl p-4"
                    style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', color: '#92400e' }}
                  >
                    <FiAlertCircle size={18} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">No Available Dates</p>
                      <p className="text-sm mt-1">
                        This doctor currently has no available appointment dates configured. 
                        Please contact the hospital directly or try booking with another doctor.
                      </p>
                    </div>
                  </div>
                )}
                
                <CalendarPicker
                  selectedDate={selectedDate}
                  onDateSelect={setSelectedDate}
                  workDays={workDays}
                  availableDates={availableDates}
                />
                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="flex items-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold transition"
                    style={{ border: '1px solid var(--hospital-border)', backgroundColor: 'var(--hospital-surface)', color: 'var(--hospital-text)' }}
                  >
                    <FiChevronLeft size={15} /> Back
                  </button>
                  <button
                    type="button"
                    disabled={!selectedDate}
                    onClick={() => setStep(2)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-bold transition disabled:opacity-40"
                    style={{ backgroundColor: 'var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary-text)', borderRadius: 'var(--hospital-radius)' }}
                  >
                    Continue <FiArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Choose Slot ── */}
            {step === 2 && (
              <div className="animate-fade-up">
                <h3 className="mb-1 text-lg font-bold" style={{ color: 'var(--hospital-text)' }}>
                  Select a Time Slot
                </h3>
                {selectedDate && (
                  <p className="mb-4 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>
                    {formatDisplayDate(selectedDate)}
                  </p>
                )}

                {isLoadingSlots ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="h-12 animate-pulse rounded-xl" style={{ backgroundColor: 'var(--hospital-surface-alt)' }} />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl py-10 text-center" style={{ backgroundColor: 'var(--hospital-surface-alt)' }}>
                    <FiCalendar size={36} className="mb-3" style={{ color: 'var(--hospital-text-muted)' }} />
                    <p className="font-semibold" style={{ color: 'var(--hospital-text)' }}>No Available Slots</p>
                    <p className="mt-1 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>There are no open slots on this date. Try another date.</p>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="mt-4 text-sm font-semibold underline underline-offset-2"
                      style={{ color: 'var(--hospital-link)' }}
                    >
                      Pick a different date
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 max-h-80 overflow-y-auto pr-1">
                      {slots.map((slot, idx) => {
                        const isSelected = selectedSlot?.start_datetime === slot.start_datetime;
                        const isReserved = slot.status === 'reserved' || slot.status === 'unavailable';
                        return (
                          <div key={idx}>
                            <button
                              type="button"
                              disabled={isReserved}
                              onClick={() => setSelectedSlot(slot)}
                              className="w-full rounded-xl py-3.5 text-sm font-bold transition-all relative overflow-hidden"
                              style={
                                isReserved
                                  ? {
                                      border: '1px solid var(--hospital-border)',
                                      backgroundColor: 'var(--hospital-surface)',
                                      color: 'var(--hospital-text-muted)',
                                      cursor: 'not-allowed',
                                      opacity: 0.6,
                                      background: 'linear-gradient(to top right, transparent calc(50% - 1px), var(--hospital-border) calc(50% - 1px), var(--hospital-border) calc(50% + 1px), transparent calc(50% + 1px))',
                                      textDecoration: 'line-through'
                                    }
                                  : isSelected
                                    ? {
                                        backgroundColor: 'var(--hospital-btn-primary)',
                                        color: 'var(--hospital-btn-primary-text)',
                                        border: '1px solid var(--hospital-btn-primary)',
                                        transform: 'scale(1.02)',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                                      }
                                    : {
                                        border: '1px solid var(--hospital-btn-primary)',
                                        backgroundColor: 'white',
                                        color: 'var(--hospital-text)',
                                      }
                              }
                            >
                              {formatTime(slot.start_datetime)}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Mockup Legend */}
                    <div className="mt-5 flex flex-wrap items-center gap-5 text-xs font-semibold" style={{ color: 'var(--hospital-text-muted)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-8 rounded border border-neutral-300 bg-white" style={{ borderColor: 'var(--hospital-btn-primary)' }} />
                        <span>Available</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-5 w-8 rounded border border-neutral-300"
                          style={{
                            borderColor: 'var(--hospital-border)',
                            background: 'linear-gradient(to top right, transparent calc(50% - 1px), var(--hospital-border) calc(50% - 1px), var(--hospital-border) calc(50% + 1px), transparent calc(50% + 1px))'
                          }}
                        />
                        <span>Reserved</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-8 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-xl px-6 py-3.5 text-sm font-bold border transition hover:bg-neutral-50 shrink-0"
                    style={{
                      borderColor: 'var(--hospital-border)',
                      backgroundColor: 'var(--hospital-surface)',
                      color: 'var(--hospital-text)',
                      borderRadius: 'var(--hospital-radius)'
                    }}
                  >
                    &lt; Back
                  </button>
                  <button
                    type="button"
                    disabled={!selectedSlot}
                    onClick={() => setStep(3)}
                    className="flex-1 rounded-xl py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--hospital-btn-primary)',
                      color: 'var(--hospital-btn-primary-text)',
                      borderRadius: 'var(--hospital-radius)'
                    }}
                  >
                    Continue &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Patient Details ── */}
            {step === 3 && (
              <div className="animate-fade-up">
                <h3 className="mb-4 text-lg font-bold" style={{ color: 'var(--hospital-text)' }}>Your Details</h3>

                {errorMsg && (
                  <div
                    className="mb-4 flex items-start gap-3 rounded-xl p-4"
                    style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}
                  >
                    <FiAlertCircle size={18} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Booking Error</p>
                      <p className="text-sm">{errorMsg}</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold" style={{ color: 'var(--hospital-text)' }}>
                        Full Name <span style={{ color: '#e11d48' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={patientName}
                        onChange={e => setPatientName(e.target.value)}
                        required
                        placeholder="John Smith"
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
                        style={{
                          border: '1px solid var(--hospital-input-border)',
                          backgroundColor: 'var(--hospital-input-bg)',
                          color: 'var(--hospital-text)',
                          borderRadius: 'var(--hospital-radius)',
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold" style={{ color: 'var(--hospital-text)' }}>
                        Phone Number <span style={{ color: '#e11d48' }}>*</span>
                      </label>
                      <input
                        type="tel"
                        value={patientPhone}
                        onChange={e => setPatientPhone(e.target.value)}
                        required
                        placeholder="+1 (555) 000-0000"
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
                        style={{
                          border: '1px solid var(--hospital-input-border)',
                          backgroundColor: 'var(--hospital-input-bg)',
                          color: 'var(--hospital-text)',
                          borderRadius: 'var(--hospital-radius)',
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold" style={{ color: 'var(--hospital-text)' }}>
                        Gender
                      </label>
                      <select
                        value={patientGender}
                        onChange={e => setPatientGender(e.target.value)}
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
                        style={{
                          border: '1px solid var(--hospital-input-border)',
                          backgroundColor: 'var(--hospital-input-bg)',
                          color: 'var(--hospital-text)',
                          borderRadius: 'var(--hospital-radius)',
                        }}
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold" style={{ color: 'var(--hospital-text)' }}>
                        Age
                      </label>
                      <input
                        type="number"
                        value={patientAge}
                        onChange={e => setPatientAge(e.target.value)}
                        placeholder="Years"
                        min="0"
                        max="120"
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
                        style={{
                          border: '1px solid var(--hospital-input-border)',
                          backgroundColor: 'var(--hospital-input-bg)',
                          color: 'var(--hospital-text)',
                          borderRadius: 'var(--hospital-radius)',
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold" style={{ color: 'var(--hospital-text)' }}>
                      Email Address <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <input
                      type="email"
                      value={patientEmail}
                      onChange={e => setPatientEmail(e.target.value)}
                      required
                      placeholder="john@example.com"
                      className="w-full rounded-xl px-4 py-3 text-sm outline-none transition"
                      style={{
                        border: '1px solid var(--hospital-input-border)',
                        backgroundColor: 'var(--hospital-input-bg)',
                        color: 'var(--hospital-text)',
                        borderRadius: 'var(--hospital-radius)',
                      }}
                    />
                    <p className="mt-1 text-xs" style={{ color: 'var(--hospital-text-muted)' }}>
                      Confirmation will be sent to this address
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="flex items-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold transition"
                      style={{ border: '1px solid var(--hospital-border)', backgroundColor: 'var(--hospital-surface)', color: 'var(--hospital-text)' }}
                    >
                      <FiChevronLeft size={15} /> Back
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-bold shadow-sm transition disabled:opacity-60 hover:opacity-90"
                      style={{ backgroundColor: 'var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary-text)', borderRadius: 'var(--hospital-radius)' }}
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Confirming Booking…
                        </>
                      ) : (
                        <>
                          <FiCheckCircle size={15} />
                          {selectedSlot ? `Confirm for ${formatTime(selectedSlot.start_datetime)}` : 'Confirm Appointment'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Right: booking summary sidebar */}
          <div className="space-y-4">
            <BookingSummary
              doctor={selectedDoctor}
              date={selectedDate}
              slot={selectedSlot}
            />

            {/* Help card */}
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--hospital-surface)', border: '1px solid var(--hospital-border)' }}
            >
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--hospital-text-muted)' }}>Need Help?</p>
              <p className="mt-2 text-sm" style={{ color: 'var(--hospital-text)' }}>
                If you have trouble booking online, call us directly.
              </p>
              <a
                href="tel:+1-800-000-0000"
                className="mt-3 flex items-center gap-2 text-sm font-bold"
                style={{ color: 'var(--hospital-btn-primary)' }}
              >
                📞 Call Reception <FiArrowRight size={13} />
              </a>
            </div>

            {/* What to expect */}
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: 'var(--hospital-surface)', border: '1px solid var(--hospital-border)' }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--hospital-text-muted)' }}>What to Expect</p>
              <ul className="space-y-2.5 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>
                {[
                  'Confirmation sent to your email',
                  'Arrive 10 minutes early',
                  'Bring any prior test results',
                  'Free cancellation up to 24h before',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <FiCheckCircle size={14} className="mt-0.5 shrink-0" style={{ color: '#059669' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
