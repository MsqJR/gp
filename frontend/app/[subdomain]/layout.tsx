import React from 'react';
import Link from 'next/link';
import HospitalChatWidget from '@/components/hospital/HospitalChatWidget';
import { getHospitalBusinessInfo, getHospitalProfile } from '@/lib/hospitalApi';
import { normalizeLogoUrl } from '@/lib/storage';

interface LayoutProps {
    children: React.ReactNode;
    params: Promise<{ subdomain: string }>;
}

export default async function HospitalLayout({ children, params }: LayoutProps) {
    const resolvedParams = await params;
    const profile = await getHospitalProfile(resolvedParams.subdomain);
    const businessInfo = await getHospitalBusinessInfo(resolvedParams.subdomain);
    
    const theme = profile?.theme_settings || {};
    const primaryColor = theme.primaryColor || '#2563eb';
    const backgroundColor = theme.backgroundColor || '#f8fafc';
    const surfaceColor = theme.surfaceColor || '#ffffff';
    const surfaceAltColor = theme.surfaceAltColor || '#f1f5f9';
    const textColor = theme.textColor || '#0f172a';
    const mutedTextColor = theme.mutedTextColor || '#475569';
    const borderColor = theme.borderColor || '#e2e8f0';
    const linkColor = theme.linkColor || primaryColor;
    const buttonPrimaryColor = theme.buttonPrimaryColor || primaryColor;
    const buttonPrimaryTextColor = theme.buttonPrimaryTextColor || '#ffffff';
    const buttonPrimaryHoverColor = theme.buttonPrimaryHoverColor || 'color-mix(in srgb, var(--hospital-btn-primary) 82%, black)';
    const buttonSecondaryColor = theme.buttonSecondaryColor || '#ffffff';
    const buttonSecondaryTextColor = theme.buttonSecondaryTextColor || '#1d4ed8';
    const buttonSecondaryBorderColor = theme.buttonSecondaryBorderColor || 'color-mix(in srgb, var(--hospital-btn-secondary-text) 30%, white)';
    const buttonSecondaryHoverColor = theme.buttonSecondaryHoverColor || 'color-mix(in srgb, var(--hospital-btn-secondary-text) 10%, white)';
    const inputBackgroundColor = theme.inputBackgroundColor || '#f8fafc';
    const inputBorderColor = theme.inputBorderColor || '#cbd5e1';
    const inputFocusColor = theme.inputFocusColor || primaryColor;
    const borderRadius = theme.borderRadius || '0.5rem';
    const fontFamily = theme.fontFamily || 'Inter';
    const fontSize = theme.fontSize || '16px';
    const fontStyle = theme.fontStyle || 'normal';
    
    const chatbotName = theme.chatbotName || `${profile?.name || 'Hospital'} Medical AI`;
    const chatbotColor = theme.chatbotColor || primaryColor;
    const emergencyNumber = theme.emergencyNumber || '911';
    const logoUrl = profile?.logo ? normalizeLogoUrl(profile.logo) : null;

    // Load Google Font
    const fontUrl = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`;

    return (
        <>
            <link href={fontUrl} rel="stylesheet" />
            <style dangerouslySetInnerHTML={{__html: `
                :root {
                    --hospital-primary: ${primaryColor};
                    --hospital-bg: ${backgroundColor};
                    --hospital-surface: ${surfaceColor};
                    --hospital-surface-alt: ${surfaceAltColor};
                    --hospital-text: ${textColor};
                    --hospital-text-muted: ${mutedTextColor};
                    --hospital-border: ${borderColor};
                    --hospital-link: ${linkColor};
                    --hospital-btn-primary: ${buttonPrimaryColor};
                    --hospital-btn-primary-text: ${buttonPrimaryTextColor};
                    --hospital-btn-primary-hover: ${buttonPrimaryHoverColor};
                    --hospital-btn-secondary: ${buttonSecondaryColor};
                    --hospital-btn-secondary-text: ${buttonSecondaryTextColor};
                    --hospital-btn-secondary-border: ${buttonSecondaryBorderColor};
                    --hospital-btn-secondary-hover: ${buttonSecondaryHoverColor};
                    --hospital-input-bg: ${inputBackgroundColor};
                    --hospital-input-border: ${inputBorderColor};
                    --hospital-input-focus: ${inputFocusColor};
                    --hospital-radius: ${borderRadius};
                    --hospital-font: '${fontFamily}', sans-serif;
                    --hospital-font-size: ${fontSize};
                    --hospital-font-style: ${fontStyle};
                    --hospital-primary-soft: color-mix(in srgb, var(--hospital-primary) 12%, white);
                    --hospital-primary-strong: color-mix(in srgb, var(--hospital-primary) 82%, black);
                }
                
                html {
                    font-size: var(--hospital-font-size);
                }

                body {
                    background-color: var(--hospital-bg) !important;
                    font-family: var(--hospital-font) !important;
                    font-style: var(--hospital-font-style);
                    color: var(--hospital-text);
                }

                .hospital-theme-root {
                    color: var(--hospital-text);
                }

                .hospital-theme-root a {
                    color: var(--hospital-link);
                }

                .hospital-theme-root input,
                .hospital-theme-root textarea,
                .hospital-theme-root select {
                    background-color: var(--hospital-input-bg) !important;
                    border-color: var(--hospital-input-border) !important;
                    color: var(--hospital-text) !important;
                }

                .hospital-theme-root input:focus,
                .hospital-theme-root textarea:focus,
                .hospital-theme-root select:focus {
                    border-color: var(--hospital-input-focus) !important;
                    box-shadow: 0 0 0 2px color-mix(in srgb, var(--hospital-input-focus) 18%, white) !important;
                }
                
                /* Override default blues in the layout and blocks */
                .from-blue-600.to-teal-500,
                .bg-blue-600,
                .bg-blue-700 {
                    background: var(--hospital-btn-primary) !important;
                    color: var(--hospital-btn-primary-text) !important;
                }
                .text-blue-600, .text-blue-700 {
                    color: var(--hospital-link) !important;
                }
                .bg-blue-50, .bg-blue-100 {
                    background-color: var(--hospital-primary-soft) !important;
                }
                .border-blue-200 {
                    border-color: color-mix(in srgb, var(--hospital-primary) 30%, white) !important;
                }

                .hospital-theme-root button[class*="bg-blue-600"],
                .hospital-theme-root a[class*="bg-blue-600"],
                .hospital-theme-root button[class*="bg-blue-700"],
                .hospital-theme-root a[class*="bg-blue-700"] {
                    background-color: var(--hospital-btn-primary) !important;
                    color: var(--hospital-btn-primary-text) !important;
                }

                .hospital-theme-root button[class*="hover:bg-blue-700"]:hover,
                .hospital-theme-root a[class*="hover:bg-blue-700"]:hover {
                    background-color: var(--hospital-btn-primary-hover) !important;
                }

                .hospital-theme-root button[class*="bg-white"][class*="text-blue"],
                .hospital-theme-root a[class*="bg-white"][class*="text-blue"] {
                    background-color: var(--hospital-btn-secondary) !important;
                    color: var(--hospital-btn-secondary-text) !important;
                    border-color: var(--hospital-btn-secondary-border) !important;
                }

                .hospital-theme-root button[class*="hover:bg-blue-50"]:hover,
                .hospital-theme-root a[class*="hover:bg-blue-50"]:hover,
                .hospital-theme-root button[class*="hover:bg-slate-100"]:hover,
                .hospital-theme-root a[class*="hover:bg-slate-100"]:hover {
                    background-color: var(--hospital-btn-secondary-hover) !important;
                }

                .hospital-theme-root [class*="bg-white"] {
                    background-color: var(--hospital-surface) !important;
                }

                .hospital-theme-root [class*="bg-slate-50"],
                .hospital-theme-root [class*="bg-slate-100"] {
                    background-color: var(--hospital-surface-alt) !important;
                }

                .hospital-theme-root [class*="border-slate-200"],
                .hospital-theme-root [class*="border-slate-300"],
                .hospital-theme-root [class*="border-slate-100"] {
                    border-color: var(--hospital-border) !important;
                }

                .hospital-theme-root [class*="text-slate-900"],
                .hospital-theme-root [class*="text-slate-800"] {
                    color: var(--hospital-text) !important;
                }

                .hospital-theme-root [class*="text-slate-700"],
                .hospital-theme-root [class*="text-slate-600"],
                .hospital-theme-root [class*="text-slate-500"] {
                    color: var(--hospital-text-muted) !important;
                }

                .hospital-theme-root [class*="text-slate-400"],
                .hospital-theme-root [class*="text-slate-300"] {
                    color: color-mix(in srgb, var(--hospital-text-muted) 70%, white) !important;
                }
                
                /* Override corner styles */
                .rounded-xl, .rounded-lg, .rounded-2xl {
                    border-radius: var(--hospital-radius) !important;
                }
                .rounded-full {
                    /* Only apply to buttons/pills, keep actual circles circular */
                    border-radius: ${borderRadius === '1rem' ? '9999px' : 'var(--hospital-radius)'} !important;
                }
                .h-8.w-8.rounded-full, .h-10.w-10.rounded-full, .h-12.w-12.rounded-full {
                    border-radius: 9999px !important;
                }

                @keyframes fade-up {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @keyframes float-slow {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-8px); }
                }

                .animate-fade-up { animation: fade-up 0.7s ease both; }
                .delay-1 { animation-delay: 120ms; }
                .delay-2 { animation-delay: 220ms; }
                .delay-3 { animation-delay: 320ms; }
                .animate-float { animation: float-slow 6s ease-in-out infinite; }

                @media (prefers-reduced-motion: reduce) {
                    .animate-fade-up, .animate-float { animation: none !important; }
                }
            `}} />

            <div className="hospital-theme-root min-h-screen text-slate-900 flex flex-col">
                <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 text-slate-100">
                    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs sm:px-6">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ background: '#dc2626', color: '#ffffff' }}>
                                ⚡ 24/7 Emergency
                            </span>
                            <span className="font-bold text-white">Call {emergencyNumber}</span>
                        </div>
                        <div className="hidden items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 sm:flex">
                            <Link href="/booking" className="hover:text-white">Book Online</Link>
                            <Link href="/#contact" className="hover:text-white">Contact</Link>
                        </div>
                    </div>
                </div>
                <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
                    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                        <Link href="/" className="flex items-center gap-3">
                            {logoUrl ? (
                                <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
                            ) : (
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold">
                                    +
                                </span>
                            )}
                            <span className="text-lg font-bold tracking-tight">{businessInfo?.name || profile?.name || resolvedParams.subdomain}</span>
                        </Link>

                        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
                            <Link href="/" className="hover:text-slate-900">Home</Link>
                            <Link href="/#departments" className="hover:text-slate-900">Departments</Link>
                            <Link href="/#doctors" className="hover:text-slate-900">Doctors</Link>
                            <Link href="/#contact" className="hover:text-slate-900">Contact</Link>
                        </nav>

                        <Link
                            href="/booking"
                            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                        >
                            Book Appointment
                        </Link>
                    </div>
                </header>

                <main className="flex-1">
                    {children}
                </main>

                <footer className="border-t border-slate-200 bg-slate-900 text-slate-200">
                    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
                        <div>
                            <p className="text-lg font-semibold text-white">{profile?.name || resolvedParams.subdomain}</p>
                            <p className="mt-2 text-sm text-slate-400">
                                {profile?.description || 'Compassionate care with modern clinical excellence.'}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white">Quick Links</p>
                            <div className="mt-3 space-y-2 text-sm text-slate-400">
                                <p><Link href="/">Home</Link></p>
                                <p><Link href="/#departments">Departments</Link></p>
                                <p><Link href="/#doctors">Doctors</Link></p>
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white">Services</p>
                            <div className="mt-3 space-y-2 text-sm text-slate-400">
                                <p>General Checkup</p>
                                <p>Emergency Care</p>
                                <p>Lab Diagnostics</p>
                            </div>
                        </div>
                        <div id="contact">
                            <p className="text-sm font-semibold text-white">Contact</p>
                            <div className="mt-3 space-y-2 text-sm text-slate-400">
                                <p>{emergencyNumber}</p>
                                <p>support@medify.com</p>
                                <p>Medical District</p>
                            </div>
                        </div>
                    </div>
                </footer>
            </div>

            <HospitalChatWidget 
                subdomain={resolvedParams.subdomain} 
                hospitalName={chatbotName} 
                hospitalPhone={emergencyNumber}
            />
        </>
    );
}
