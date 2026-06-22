'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiFilter,
  FiSearch,
  FiUsers,
  FiX,
  FiStar,
  FiMapPin,
  FiChevronRight,
} from 'react-icons/fi';
import type { Doctor } from '@/types/hospital';
import { normalizeLogoUrl } from '@/lib/storage';

interface DoctorsListClientProps {
  title: string;
  subtitle: string;
  doctors: Doctor[];
  fetchError?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getDoctorSummary = (doc: Doctor) => {
  const bullet = '\u2022';
  const separator = ` ${bullet} `;
  const rawBio = (doc.bio || '').trim();
  if (!rawBio) {
    return {
      title: '',
      experience: '',
      summary: 'Dedicated to patient-first care and clinical excellence.',
    };
  }
  const parts = rawBio.split(separator).map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      title: parts[0] || '',
      experience: parts[1] || '',
      summary: parts.slice(2).join(`${separator}`).trim() || parts[0] || rawBio,
    };
  }
  return { title: '', experience: '', summary: rawBio };
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const toHospitalWeekday = (date: Date) => (date.getDay() + 6) % 7;
const formatTime = (time: string) => (time || '').slice(0, 5);

const sortSchedules = (schedules: Doctor['schedules']) =>
  [...(schedules || [])].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return a.start_time.localeCompare(b.start_time);
  });

const getExperienceYears = (doc: Doctor) => {
  const { experience } = getDoctorSummary(doc);
  const match = experience.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
};

// ─── Doctor Modal ─────────────────────────────────────────────────────────────

function DoctorModal({ doc, onClose }: { doc: Doctor; onClose: () => void }) {
  const { title, experience, summary } = getDoctorSummary(doc);
  const imageUrl = normalizeLogoUrl(doc.image_url_resolved || doc.image_url) || '';
  const schedules = sortSchedules(doc.schedules);
  const todayIndex = toHospitalWeekday(new Date());

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full sm:max-w-xl max-h-[90vh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 sm:p-8"
        style={{ backgroundColor: 'var(--hospital-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-light/50 transition-colors"
          style={{ color: 'var(--hospital-text-muted)' }}
          aria-label="Close"
        >
          <FiX size={20} />
        </button>

        {/* Modal Content Layout */}
        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start pt-2">
          {/* Left Column: Photo & Availability */}
          <div className="flex-shrink-0 flex flex-col items-center gap-3">
            <div className="w-32 h-40 sm:w-36 sm:h-44 rounded-2xl overflow-hidden bg-neutral-light border border-neutral-border shadow-sm">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={doc.name} className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-5xl font-bold"
                  style={{ backgroundColor: 'var(--hospital-primary-soft)', color: 'var(--hospital-primary-strong)' }}
                >
                  {doc.name.charAt(0)}
                </div>
              )}
            </div>

            {/* Availability Badge */}
            {doc.schedules?.some(s => s.day_of_week === todayIndex) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                <FiCheckCircle size={12} /> Available today
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-light border border-neutral-border px-3 py-1 text-xs font-semibold text-neutral-gray">
                <FiClock size={12} /> Has schedule
              </span>
            )}
          </div>

          {/* Right Column: Name, Bio & Tags */}
          <div className="flex-1 w-full text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--hospital-text-muted)' }}>Doctor</p>
            <h2 className="mt-1 text-2xl font-bold leading-tight" style={{ color: 'var(--hospital-text)' }}>{doc.name}</h2>
            {title && <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--hospital-text-muted)' }}>{title}</p>}

            {/* Tags */}
            <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: 'var(--hospital-primary-soft)', color: 'var(--hospital-primary-strong)' }}
              >
                {doc.specialty}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: 'var(--hospital-surface-alt)', color: 'var(--hospital-text-muted)' }}
              >
                <FiBriefcase size={11} /> {doc.department_name || 'General'}
              </span>
              {experience && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--hospital-surface-alt)', color: 'var(--hospital-text-muted)' }}
                >
                  <FiStar size={11} /> {experience}
                </span>
              )}
            </div>

            {/* Bio */}
            <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--hospital-text-muted)' }}>{summary}</p>
          </div>
        </div>

        {/* Weekly Schedule & Booking Section */}
        <div className="mt-6 border-t border-neutral-light pt-6">
          {/* Schedule */}
          {schedules.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--hospital-text-muted)' }}>
                Weekly Schedule
              </p>
              <div className="space-y-2">
                {schedules.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl px-4 py-2.5 text-sm"
                    style={{
                      backgroundColor: s.day_of_week === todayIndex ? 'var(--hospital-primary-soft)' : 'var(--hospital-surface-alt)',
                      color: s.day_of_week === todayIndex ? 'var(--hospital-primary-strong)' : 'var(--hospital-text)',
                    }}
                  >
                    <span className="font-semibold">{DAYS[s.day_of_week]}</span>
                    <span>{formatTime(s.start_time)} – {formatTime(s.end_time)}</span>
                    {s.day_of_week === todayIndex && (
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--hospital-primary-strong)' }}>Today</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <Link
            href={`/booking?doctor_id=${doc.id}`}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold shadow-sm transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'var(--hospital-btn-primary)',
              color: 'var(--hospital-btn-primary-text)',
              borderRadius: 'var(--hospital-radius)',
            }}
          >
            <FiCalendar size={15} />
            Book Appointment with {doc.name.split(' ')[1] || doc.name}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DoctorsListClient({ title, subtitle, doctors, fetchError }: DoctorsListClientProps) {
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'today'>('all');
  const [sortBy, setSortBy] = useState<'recommended' | 'experience' | 'name'>('recommended');
  const [showAll, setShowAll] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const todayIndex = toHospitalWeekday(new Date());

  const departments = useMemo(() => {
    const unique = new Set<string>();
    doctors.forEach(doc => {
      const deptName = (doc.department_name || 'General').trim();
      if (deptName) unique.add(deptName);
    });
    return ['All', ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [doctors]);

  const availableTodayCount = useMemo(
    () => doctors.filter(doc => doc.schedules?.some(s => s.day_of_week === todayIndex)).length,
    [doctors, todayIndex],
  );

  const filteredDoctors = useMemo(() => {
    let result = doctors;
    if (normalizedQuery) {
      result = result.filter(doc => {
        const name = doc.name.toLowerCase();
        const specialty = doc.specialty.toLowerCase();
        const department = (doc.department_name || '').toLowerCase();
        const bio = (doc.bio || '').toLowerCase();
        return name.includes(normalizedQuery) || specialty.includes(normalizedQuery) || department.includes(normalizedQuery) || bio.includes(normalizedQuery);
      });
    }
    if (departmentFilter !== 'All') {
      result = result.filter(doc => (doc.department_name || 'General') === departmentFilter);
    }
    if (availabilityFilter === 'today') {
      result = result.filter(doc => doc.schedules?.some(s => s.day_of_week === todayIndex));
    }
    if (sortBy === 'experience') {
      result = [...result].sort((a, b) => getExperienceYears(b) - getExperienceYears(a));
    }
    if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [doctors, normalizedQuery, departmentFilter, availabilityFilter, sortBy, todayIndex]);

  const hasDoctors = filteredDoctors.length > 0;
  const visibleDoctors = showAll || normalizedQuery ? filteredDoctors : filteredDoctors.slice(0, 6);
  const canShowAll = !normalizedQuery && filteredDoctors.length > 6;
  const emptyMessage = fetchError
    ? fetchError
    : normalizedQuery
      ? 'No doctors match your search.'
      : 'No doctors published yet. Add doctors in your dashboard.';

  return (
    <section id="doctors" className="relative overflow-hidden py-16" style={{ backgroundColor: 'var(--hospital-bg)' }}>
      {/* Glow blobs */}
      <div className="pointer-events-none absolute -left-40 top-10 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: 'var(--hospital-primary-soft)' }} />
      <div className="pointer-events-none absolute -right-20 -top-10 h-64 w-64 rounded-full bg-sky-100/40 blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Heading */}
        <div className="mb-10 text-center">
          <div
            className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm"
            style={{ backgroundColor: 'var(--hospital-surface)', color: 'var(--hospital-primary-strong)' }}
          >
            <FiUsers className="h-5 w-5" />
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl" style={{ color: 'var(--hospital-text)' }}>{title}</h2>
          <p className="mt-3 text-sm sm:text-base" style={{ color: 'var(--hospital-text-muted)' }}>{subtitle}</p>
        </div>

        {/* Filter bar */}
        <div
          className="mb-8 rounded-2xl p-4 shadow-sm"
          style={{
            backgroundColor: 'var(--hospital-surface)',
            border: '1px solid var(--hospital-border)',
            borderRadius: 'var(--hospital-radius)',
          }}
        >
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            {/* Search + department filters */}
            <div>
              <div className="relative">
                <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--hospital-text-muted)' }} />
                <input
                  type="text"
                  value={query}
                  onChange={event => { setQuery(event.target.value); setShowAll(true); }}
                  placeholder="Search doctors, specialties, or departments…"
                  className="w-full rounded-full px-12 py-3 text-sm shadow-sm outline-none transition"
                  style={{
                    border: '1px solid var(--hospital-border)',
                    backgroundColor: 'var(--hospital-input-bg)',
                    color: 'var(--hospital-text)',
                  }}
                  aria-label="Search doctors"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setShowAll(false); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--hospital-text-muted)' }}
                  >
                    <FiX size={16} />
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <div
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold"
                  style={{ backgroundColor: 'var(--hospital-surface-alt)', color: 'var(--hospital-text-muted)' }}
                >
                  <FiFilter className="h-3.5 w-3.5" /> Filters
                </div>
                {departments.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => { setDepartmentFilter(dept); setShowAll(true); }}
                    className="rounded-full px-3 py-1 font-semibold transition"
                    style={
                      departmentFilter === dept
                        ? { backgroundColor: 'var(--hospital-btn-primary)', color: 'var(--hospital-btn-primary-text)' }
                        : { backgroundColor: 'var(--hospital-surface-alt)', color: 'var(--hospital-text-muted)' }
                    }
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            {/* Availability + sort */}
            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAvailabilityFilter('all')}
                  className="rounded-full px-3 py-1 text-xs font-semibold transition"
                  style={
                    availabilityFilter === 'all'
                      ? { backgroundColor: 'var(--hospital-text)', color: 'var(--hospital-surface)' }
                      : { backgroundColor: 'var(--hospital-surface-alt)', color: 'var(--hospital-text-muted)' }
                  }
                >
                  All availability
                </button>
                <button
                  type="button"
                  onClick={() => setAvailabilityFilter('today')}
                  className="rounded-full px-3 py-1 text-xs font-semibold transition"
                  style={
                    availabilityFilter === 'today'
                      ? { backgroundColor: '#059669', color: '#fff' }
                      : { backgroundColor: '#ecfdf5', color: '#059669' }
                  }
                >
                  Available today ({availableTodayCount})
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--hospital-text-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--hospital-text)' }}>{filteredDoctors.length}</span> doctors matched
                <span style={{ color: 'var(--hospital-border)' }}>|</span>
                <label className="inline-flex items-center gap-2">
                  <span className="font-semibold" style={{ color: 'var(--hospital-text)' }}>Sort</span>
                  <select
                    value={sortBy}
                    onChange={event => setSortBy(event.target.value as typeof sortBy)}
                    className="rounded-full px-3 py-1 text-xs font-semibold outline-none"
                    style={{
                      border: '1px solid var(--hospital-border)',
                      backgroundColor: 'var(--hospital-surface)',
                      color: 'var(--hospital-text)',
                    }}
                  >
                    <option value="recommended">Recommended</option>
                    <option value="experience">Most experienced</option>
                    <option value="name">Name A-Z</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="mt-2">
          {hasDoctors ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visibleDoctors.map((doc, index) => {
                const { title: docTitle, experience, summary } = getDoctorSummary(doc);
                const imageUrl = normalizeLogoUrl(doc.image_url_resolved || doc.image_url) || '';
                const schedules = sortSchedules(doc.schedules);
                const todaySchedule = schedules.find(s => s.day_of_week === todayIndex);
                const nextSchedule = schedules.find(s => s.day_of_week >= todayIndex) || schedules[0];
                const availabilityLabel = todaySchedule
                  ? `Today ${formatTime(todaySchedule.start_time)}–${formatTime(todaySchedule.end_time)}`
                  : nextSchedule
                    ? `${DAYS[nextSchedule.day_of_week]} ${formatTime(nextSchedule.start_time)}–${formatTime(nextSchedule.end_time)}`
                    : 'Schedule pending';

                return (
                  <div
                    key={doc.id}
                    className="group flex h-full flex-col overflow-hidden shadow-md transition hover:-translate-y-0.5 hover:shadow-lg animate-fade-up cursor-pointer"
                    style={{
                      backgroundColor: 'var(--hospital-surface)',
                      border: '1px solid var(--hospital-border)',
                      borderRadius: 'var(--hospital-radius)',
                      animationDelay: `${index * 60}ms`,
                    }}
                    onClick={() => setSelectedDoctor(doc)}
                  >
                    {/* Photo */}
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent z-10" />
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt={doc.name} className="h-48 w-full object-cover" />
                      ) : (
                        <div
                          className="flex h-48 items-center justify-center text-4xl font-semibold"
                          style={{ backgroundColor: 'var(--hospital-primary-soft)', color: 'var(--hospital-primary-strong)' }}
                        >
                          {doc.name.charAt(0) || '?'}
                        </div>
                      )}
                      {/* Today badge */}
                      <div className="absolute left-3 top-3 z-20">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold backdrop-blur-sm"
                          style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: todaySchedule ? '#059669' : 'var(--hospital-text-muted)' }}
                        >
                          <FiCheckCircle className="h-3 w-3" style={{ color: todaySchedule ? '#059669' : 'var(--hospital-text-muted)' }} />
                          {todaySchedule ? 'Available today' : 'Next available'}
                        </span>
                      </div>
                      {/* View details hint */}
                      <div className="absolute right-3 top-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold"
                          style={{ color: 'var(--hospital-btn-primary)' }}>
                          View details <FiChevronRight size={10} />
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--hospital-text-muted)' }}>Doctor</p>
                        <h3 className="mt-1.5 text-lg font-bold" style={{ color: 'var(--hospital-text)' }}>{doc.name}</h3>
                        {docTitle ? <p className="mt-0.5 text-sm font-medium" style={{ color: 'var(--hospital-text-muted)' }}>{docTitle}</p> : null}
                        <span
                          className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{ backgroundColor: 'var(--hospital-primary-soft)', color: 'var(--hospital-primary-strong)' }}
                        >
                          {doc.specialty}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>
                        <div className="flex items-center gap-2">
                          <FiBriefcase className="h-4 w-4 shrink-0" />
                          <span className="font-semibold" style={{ color: 'var(--hospital-text)' }}>{doc.department_name || 'General'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <FiClock className="h-4 w-4 shrink-0" />
                          <span>{availabilityLabel}</span>
                        </div>
                        {experience ? (
                          <div
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                            style={{ backgroundColor: 'var(--hospital-primary-soft)', color: 'var(--hospital-primary-strong)' }}
                          >
                            <FiStar className="h-3.5 w-3.5" /> {experience}
                          </div>
                        ) : null}
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>{summary}</p>

                      {/* Actions */}
                      <div className="mt-5 flex flex-col gap-2">
                        <Link
                          href={`/booking?doctor_id=${doc.id}`}
                          onClick={e => e.stopPropagation()}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold shadow-sm transition hover:opacity-90"
                          style={{
                            backgroundColor: 'var(--hospital-btn-primary)',
                            color: 'var(--hospital-btn-primary-text)',
                            borderRadius: 'var(--hospital-radius)',
                          }}
                        >
                          <FiCalendar className="h-4 w-4" />
                          Book Appointment
                        </Link>
                        <button
                          type="button"
                          className="text-xs font-semibold underline underline-offset-2 transition hover:no-underline"
                          style={{ color: 'var(--hospital-link)' }}
                        >
                          View full profile →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="w-full rounded-2xl border-2 border-dashed py-12 text-center text-sm"
              style={{ borderColor: 'var(--hospital-border)', backgroundColor: 'var(--hospital-surface)', color: 'var(--hospital-text-muted)' }}
            >
              {emptyMessage}
            </div>
          )}
        </div>

        {/* Show more */}
        {hasDoctors && canShowAll && (
          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={() => setShowAll(prev => !prev)}
              className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold shadow-sm transition hover:opacity-80"
              style={{
                border: '1px solid var(--hospital-border)',
                backgroundColor: 'var(--hospital-surface)',
                color: 'var(--hospital-text)',
              }}
            >
              {showAll ? 'Show fewer doctors' : `View all ${filteredDoctors.length} doctors`}
            </button>
          </div>
        )}
      </div>

      {/* Doctor Detail Modal */}
      {selectedDoctor && (
        <DoctorModal doc={selectedDoctor} onClose={() => setSelectedDoctor(null)} />
      )}
    </section>
  );
}
