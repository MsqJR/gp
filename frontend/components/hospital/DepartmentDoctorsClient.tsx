'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FiChevronLeft,
  FiCalendar,
  FiBriefcase,
  FiCheckCircle,
  FiClock,
  FiX,
  FiChevronRight,
} from 'react-icons/fi';
import type { Doctor, Department } from '@/types/hospital';
import { normalizeLogoUrl } from '@/lib/storage';

interface Props {
  department: Department;
  doctors: Doctor[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getDoctorSummary = (doc: Doctor) => {
  const bullet = '\u2022';
  const separator = ` ${bullet} `;
  if (doc.title || doc.experience) {
    return {
      title: doc.title || '',
      experience: doc.experience || '',
      summary: (doc.bio || '').trim() || 'Dedicated to patient-first care and clinical excellence.',
    };
  }
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
    const extraBio = parts.slice(2).join(separator).trim();
    return {
      title: parts[0] || '',
      experience: parts[1] || '',
      summary: extraBio || 'Dedicated to patient-first care and clinical excellence.',
    };
  }
  return { title: '', experience: '', summary: rawBio };
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toHospitalWeekday = (date: Date) => date.getDay();
const formatTime = (time: string) => (time || '').slice(0, 5);

const sortSchedules = (schedules: Doctor['schedules']) =>
  [...(schedules || [])].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return a.start_time.localeCompare(b.start_time);
  });

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
                <img src={imageUrl} alt={doc.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
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
                  Years of experience: {experience}
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

export default function DepartmentDoctorsClient({ department, doctors }: Props) {
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const todayIndex = toHospitalWeekday(new Date());

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--hospital-bg)' }}>
      <div className="max-w-6xl mx-auto">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold mb-8 hover:underline"
          style={{ color: 'var(--hospital-link)' }}
        >
          <FiChevronLeft size={16} />
          Back to Homepage
        </Link>

        {/* Header Section */}
        <div className="mb-12 border-b pb-8" style={{ borderColor: 'var(--hospital-border)' }}>
          <div className="flex items-center gap-4 mb-4">
            <div
              className="flex items-center justify-center w-16 h-16 text-3xl font-bold flex-shrink-0"
              style={{
                background: 'var(--hospital-primary-soft)',
                color: 'var(--hospital-primary-strong)',
                borderRadius: 'var(--hospital-radius)',
              }}
            >
              {department.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--hospital-text)' }}>
                {department.name} Department
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {doctors.length} Specialist{doctors.length !== 1 ? 's' : ''} Available
              </p>
            </div>
          </div>
          <p className="text-base sm:text-lg max-w-3xl leading-relaxed" style={{ color: 'var(--hospital-text-muted)' }}>
            {department.description || 'Welcome to our department. We provide specialized, premium medical services with our team of professional specialists.'}
          </p>
        </div>

        {/* Doctors Grid */}
        {doctors.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-2xl border text-center"
            style={{
              background: 'var(--hospital-surface)',
              borderColor: 'var(--hospital-border)',
              borderRadius: 'var(--hospital-radius)',
            }}
          >
            <span className="text-5xl mb-4">🩺</span>
            <h3 className="text-lg font-bold" style={{ color: 'var(--hospital-text)' }}>No Doctors Available</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--hospital-text-muted)' }}>
              There are currently no active doctors assigned to this department.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {doctors.map((doc, index) => {
              const { title, experience, summary } = getDoctorSummary(doc);
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
                  className="group flex h-full flex-col overflow-hidden shadow-md transition hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
                  style={{
                    backgroundColor: 'var(--hospital-surface)',
                    border: '1px solid var(--hospital-border)',
                    borderRadius: 'var(--hospital-radius)',
                  }}
                  onClick={() => setSelectedDoctor(doc)}
                >
                  {/* Photo */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent z-10" />
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={doc.name} className="h-48 w-full object-cover" referrerPolicy="no-referrer" />
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
                      {title ? <p className="mt-0.5 text-sm font-medium" style={{ color: 'var(--hospital-text-muted)' }}>{title}</p> : null}
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
                        <span className="font-semibold" style={{ color: 'var(--hospital-text)' }}>{doc.department_name || department.name}</span>
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
                          Years of experience: {experience}
                        </div>
                      ) : null}
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm" style={{ color: 'var(--hospital-text-muted)' }}>
                      {title && experience ? `${title} \u2022 ${experience}` : summary}
                    </p>

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
        )}
      </div>

      {/* Doctor Detail Modal */}
      {selectedDoctor && (
        <DoctorModal doc={selectedDoctor} onClose={() => setSelectedDoctor(null)} />
      )}
    </div>
  );
}
