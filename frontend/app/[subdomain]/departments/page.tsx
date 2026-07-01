import React from 'react';
import Link from 'next/link';
import { getHospitalDepartments, getHospitalDoctors } from '@/lib/hospitalApi';
import type { Department, Doctor } from '@/types/hospital';
import { FiChevronLeft, FiChevronRight, FiUsers, FiLayers } from 'react-icons/fi';

interface PageProps {
  params: Promise<{
    subdomain: string;
  }>;
}

export const dynamic = 'force-dynamic';

export default async function DepartmentsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const subdomain = resolvedParams.subdomain;

  let departments: Department[] = [];
  let allDoctors: Doctor[] = [];

  try {
    const [deptsRes, doctorsRes] = await Promise.all([
      getHospitalDepartments(subdomain),
      getHospitalDoctors(subdomain),
    ]);
    departments = deptsRes || [];
    allDoctors = doctorsRes || [];
  } catch (err) {
    console.error('Failed to load departments page data:', err);
  }

  return (
    <main className="min-h-screen py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--hospital-bg)' }}>
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
              <FiLayers size={30} />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--hospital-text)' }}>
                Our Departments
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Explore our specialized medical fields and meet our clinical experts.
              </p>
            </div>
          </div>
        </div>

        {/* Departments Grid */}
        {departments.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-2xl border text-center"
            style={{
              background: 'var(--hospital-surface)',
              borderColor: 'var(--hospital-border)',
              borderRadius: 'var(--hospital-radius)',
            }}
          >
            <span className="text-5xl mb-4">🩺</span>
            <h3 className="text-lg font-bold" style={{ color: 'var(--hospital-text)' }}>No Departments Available</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--hospital-text-muted)' }}>
              There are currently no active departments published for this hospital.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {departments.map((dept, index) => {
              const firstLetter = (dept.name ?? 'D').charAt(0).toUpperCase();
              const description = dept.description || 'Welcome to our department. We provide specialized, premium medical services with our team of professional specialists.';
              const deptDoctors = allDoctors.filter(doc => doc.department === dept.id || (doc as any).department_id === dept.id);
              const doctorCount = deptDoctors.length;

              return (
                <div
                  key={dept.id}
                  className="group/card relative flex flex-col overflow-hidden border transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
                  style={{
                    background: 'var(--hospital-surface)',
                    borderColor: 'var(--hospital-border)',
                    borderRadius: 'var(--hospital-radius)',
                  }}
                >
                  {/* Card Top Accent */}
                  <div
                    className="absolute inset-x-0 top-0 h-1 opacity-60 group-hover/card:opacity-100 transition-opacity"
                    style={{
                      background: 'var(--hospital-btn-primary)',
                    }}
                  />

                  <div className="flex flex-col flex-1 p-6 pt-7">
                    {/* First Letter Badge */}
                    <div
                      className="flex items-center justify-center w-14 h-14 mb-5 text-2xl font-bold select-none"
                      style={{
                        background: 'var(--hospital-primary-soft)',
                        color: 'var(--hospital-primary-strong)',
                        borderRadius: 'var(--hospital-radius)',
                      }}
                    >
                      {firstLetter}
                    </div>

                    {/* Department Name */}
                    <h3
                      className="text-lg font-bold leading-snug mb-2"
                      style={{ color: 'var(--hospital-text)' }}
                    >
                      {dept.name}
                    </h3>

                    {/* Description */}
                    <p
                      className="text-sm leading-relaxed line-clamp-3 flex-1 mb-6"
                      style={{ color: 'var(--hospital-text-muted)' }}
                    >
                      {description}
                    </p>

                    {/* Meta Row */}
                    <div className="flex items-center justify-between gap-2 mt-auto">
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
                        style={{
                          background: 'var(--hospital-surface-alt, var(--hospital-surface))',
                          borderColor: 'var(--hospital-border)',
                          color: 'var(--hospital-text-muted)',
                        }}
                      >
                        <FiUsers size={12} />
                        {doctorCount} {doctorCount === 1 ? 'Specialist' : 'Specialists'}
                      </span>

                      <Link
                        href={`/departments/${dept.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-90 shadow-sm"
                        style={{
                          background: 'var(--hospital-btn-primary)',
                          color: 'var(--hospital-btn-primary-text)',
                          borderRadius: 'var(--hospital-radius)',
                        }}
                      >
                        See Doctors
                        <FiChevronRight size={12} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
