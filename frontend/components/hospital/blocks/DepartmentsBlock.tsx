import Link from "next/link";
import { getHospitalDepartments } from "@/lib/hospitalApi";
import DepartmentsCarousel from "./DepartmentsCarousel";

interface DepartmentsBlockProps {
  settings: {
    title?: string;
    show_count?: number;
  };
  subdomain: string;
}



export default async function DepartmentsBlock({
  settings,
  subdomain,
}: DepartmentsBlockProps) {
  const title = settings.title ?? "Our Departments & Specialties";
  const showCount = settings.show_count ?? 8;

  let departments: any[] = [];
  try {
    const data = await getHospitalDepartments(subdomain);
    departments = Array.isArray(data) ? data : [];
  } catch {
    departments = [];
  }

  const visible = departments.slice(0, showCount);
  const total = departments.length;

  return (
    <section id="departments" className="relative w-full overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
      {/* Glow Blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl opacity-30"
        style={{ background: "var(--hospital-primary-soft)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-32 w-[420px] h-[420px] rounded-full blur-3xl opacity-20"
        style={{ background: "var(--hospital-primary-soft)" }}
      />

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* ── Section Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-14">
          <div className="max-w-2xl">
            {/* Specialties count badge */}
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border mb-4"
              style={{
                background: "var(--hospital-surface)",
                borderColor: "var(--hospital-border)",
                color: "var(--hospital-text-muted)",
              }}
            >
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.5 2a.5.5 0 000 1H11v1.07A7.001 7.001 0 0012 18a7 7 0 001-13.93V3h1.5a.5.5 0 000-1h-5z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18v3m-3 0h6"
                />
              </svg>
              {total} Specialties Available
            </span>

            <h2
              className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight"
              style={{ color: "var(--hospital-text)" }}
            >
              {title}
            </h2>
            <p
              className="mt-3 text-base sm:text-lg leading-relaxed"
              style={{ color: "var(--hospital-text-muted)" }}
            >
              World-class care across a wide spectrum of medical fields —
              delivered by experienced specialists dedicated to your well-being.
            </p>
          </div>

          {/* View All Button (desktop) */}
          {total > showCount && (
            <div className="hidden sm:block flex-shrink-0">
              <Link
                href={`/#departments`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                style={{
                  background: "var(--hospital-btn-primary)",
                  color: "var(--hospital-btn-primary-text)",
                  borderRadius: "var(--hospital-radius)",
                }}
              >
                View All Specialties
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
            </div>
          )}
        </div>

        {/* ── Department Cards Grid ── */}
        {visible.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-24 rounded-2xl border"
            style={{
              background: "var(--hospital-surface)",
              borderColor: "var(--hospital-border)",
              borderRadius: "var(--hospital-radius)",
            }}
          >
            <span className="text-5xl mb-4">🏥</span>
            <p
              className="text-lg font-medium"
              style={{ color: "var(--hospital-text-muted)" }}
            >
              No departments found at the moment.
            </p>
          </div>
        ) : (
          <DepartmentsCarousel departments={visible} />
        )}

        {/* View All Button (mobile) */}
        {total > showCount && (
          <div className="mt-10 flex sm:hidden justify-center">
            <Link
              href={`/#departments`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                background: "var(--hospital-btn-primary)",
                color: "var(--hospital-btn-primary-text)",
                borderRadius: "var(--hospital-radius)",
              }}
            >
              View All Specialties
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Link>
          </div>
        )}

        {/* ── CTA Banner ── */}
        <div
          className="relative mt-20 overflow-hidden rounded-3xl px-8 py-12 sm:px-14 sm:py-16"
          style={{
            background:
              "linear-gradient(135deg, var(--hospital-btn-primary) 0%, var(--hospital-primary-strong, var(--hospital-btn-primary)) 100%)",
            borderRadius: "var(--hospital-radius)",
          }}
        >
          {/* Decorative blobs inside CTA */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full blur-3xl opacity-20"
            style={{ background: "#ffffff" }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-12 -left-12 w-40 h-40 rounded-full blur-2xl opacity-15"
            style={{ background: "#ffffff" }}
          />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            {/* CTA Text */}
            <div className="max-w-xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">🩺</span>
                <span className="text-xs font-bold uppercase tracking-widest text-white/70">
                  Ready to get started?
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-2">
                Your Health Journey Begins Here
              </h3>
              <p className="text-sm sm:text-base text-white/80 leading-relaxed">
                Browse our specialties, choose your preferred doctor, and book
                your appointment in minutes — no long waits, no hassle.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
              <Link
                href="/booking"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-lg"
                style={{
                  background: "var(--hospital-surface)",
                  color: "var(--hospital-btn-primary)",
                  borderRadius: "var(--hospital-radius)",
                }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Start Booking
              </Link>
              <Link
                href="/#departments"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold border border-white/30 text-white transition-all hover:bg-white/10"
                style={{ borderRadius: "var(--hospital-radius)" }}
              >
                Explore All Departments
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
