'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  FiSave,
  FiSettings,
  FiLayout,
  FiMessageSquare,
  FiCheckCircle,
  FiRefreshCw,
  FiEye,
  FiType,
  FiDroplet,
  FiSquare,
  FiSliders,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi'
import { hospitalAdminApi } from '@/lib/hospitalAdminApi'
import { normalizeLogoUrl } from '@/lib/storage'
import { SubscriptionProvider, useSubscription } from '@/contexts/SubscriptionContext'
import { LockedFeature } from '@/components/subscription/LockedFeature'
import { PLAN_LABELS, PLAN_BADGE_CLASSES } from '@/lib/subscriptionApi'
import type { HospitalProfile } from '@/types/hospital'

// ── Types ────────────────────────────────────────────────────────────────────

interface ThemeSettings {
  primaryColor?: string
  backgroundColor?: string
  surfaceColor?: string
  surfaceAltColor?: string
  textColor?: string
  mutedTextColor?: string
  borderColor?: string
  linkColor?: string
  buttonPrimaryColor?: string
  buttonPrimaryTextColor?: string
  buttonPrimaryHoverColor?: string
  buttonSecondaryColor?: string
  buttonSecondaryTextColor?: string
  buttonSecondaryBorderColor?: string
  buttonSecondaryHoverColor?: string
  inputBackgroundColor?: string
  inputBorderColor?: string
  inputFocusColor?: string
  fontFamily?: string
  fontSize?: string
  fontStyle?: 'normal' | 'italic'
  chatbotName?: string
  chatbotColor?: string
  borderRadius?: string
  emergencyNumber?: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_THEME: ThemeSettings = {
  primaryColor: '#2563eb',
  backgroundColor: '#f8fafc',
  surfaceColor: '#ffffff',
  surfaceAltColor: '#f1f5f9',
  textColor: '#0f172a',
  mutedTextColor: '#475569',
  borderColor: '#e2e8f0',
  linkColor: '#2563eb',
  buttonPrimaryColor: '#2563eb',
  buttonPrimaryTextColor: '#ffffff',
  buttonPrimaryHoverColor: '#1d4ed8',
  buttonSecondaryColor: '#ffffff',
  buttonSecondaryTextColor: '#1d4ed8',
  buttonSecondaryBorderColor: '#bfdbfe',
  buttonSecondaryHoverColor: '#eff6ff',
  inputBackgroundColor: '#f8fafc',
  inputBorderColor: '#cbd5e1',
  inputFocusColor: '#2563eb',
  fontFamily: 'Inter',
  fontSize: '16px',
  fontStyle: 'normal',
  chatbotName: 'Hospital Medical AI',
  chatbotColor: '#2563eb',
  borderRadius: '0.5rem',
  emergencyNumber: '911',
}

const AVAILABLE_FONTS = [
  // ── Sans-serif (Modern & Clean) ──
  { value: 'Inter', label: 'Inter', description: 'Clean & Modern' },
  { value: 'Roboto', label: 'Roboto', description: 'Professional' },
  { value: 'Outfit', label: 'Outfit', description: 'Friendly & Rounded' },
  { value: 'Nunito', label: 'Nunito', description: 'Soft & Approachable' },
  { value: 'Poppins', label: 'Poppins', description: 'Geometric & Bold' },
  { value: 'Lato', label: 'Lato', description: 'Warm & Humanist' },
  { value: 'Montserrat', label: 'Montserrat', description: 'Strong & Contemporary' },
  { value: 'Open Sans', label: 'Open Sans', description: 'Neutral & Readable' },
  { value: 'Source Sans 3', label: 'Source Sans 3', description: 'Versatile & Clear' },
  { value: 'DM Sans', label: 'DM Sans', description: 'Minimal & Crisp' },
  { value: 'Manrope', label: 'Manrope', description: 'Technical & Sharp' },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', description: 'Modern & Balanced' },
  { value: 'Figtree', label: 'Figtree', description: 'Fresh & Clean' },
  // ── Serif (Elegant & Traditional) ──
  { value: 'Playfair Display', label: 'Playfair Display', description: 'Elegant & Serif' },
  { value: 'Merriweather', label: 'Merriweather', description: 'Readable & Classic' },
  { value: 'Lora', label: 'Lora', description: 'Literary & Refined' },
  { value: 'Cormorant Garamond', label: 'Cormorant Garamond', description: 'Luxury & Timeless' },
  { value: 'EB Garamond', label: 'EB Garamond', description: 'Classic & Editorial' },
  // ── Monospace ──
  { value: 'JetBrains Mono', label: 'JetBrains Mono', description: 'Technical & Precise' },
  { value: 'Fira Code', label: 'Fira Code', description: 'Modern & Structured' },
]

const FONT_SIZES = [
  { value: '13px', label: 'XSmall (13px)' },
  { value: '14px', label: 'Small (14px)' },
  { value: '16px', label: 'Normal (16px)' },
  { value: '18px', label: 'Large (18px)' },
  { value: '20px', label: 'XLarge (20px)' },
]

const BORDER_RADIUS_OPTIONS = [
  { value: '0rem', label: 'Sharp', description: '0px – No rounding' },
  { value: '0.25rem', label: 'Subtle', description: '4px – Slight rounding' },
  { value: '0.5rem', label: 'Rounded', description: '8px – Standard' },
  { value: '0.75rem', label: 'Smooth', description: '12px – Softer feel' },
  { value: '1rem', label: 'Pill', description: '16px – Very rounded' },
]

const PRESET_THEMES: { name: string; emoji: string; theme: Partial<ThemeSettings> }[] = [
  {
    name: 'Ocean Blue',
    emoji: '🌊',
    theme: {
      primaryColor: '#2563eb',
      backgroundColor: '#f8fafc',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#eff6ff',
      textColor: '#0f172a',
      mutedTextColor: '#475569',
      borderColor: '#bfdbfe',
      linkColor: '#2563eb',
      buttonPrimaryColor: '#2563eb',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#1d4ed8',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#1d4ed8',
      buttonSecondaryBorderColor: '#bfdbfe',
      buttonSecondaryHoverColor: '#eff6ff',
    },
  },
  {
    name: 'Emerald Health',
    emoji: '🌿',
    theme: {
      primaryColor: '#059669',
      backgroundColor: '#f0fdf4',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#dcfce7',
      textColor: '#052e16',
      mutedTextColor: '#4b5563',
      borderColor: '#a7f3d0',
      linkColor: '#059669',
      buttonPrimaryColor: '#059669',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#047857',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#047857',
      buttonSecondaryBorderColor: '#a7f3d0',
      buttonSecondaryHoverColor: '#ecfdf5',
    },
  },
  {
    name: 'Midnight Dark',
    emoji: '🌙',
    theme: {
      primaryColor: '#6366f1',
      backgroundColor: '#0f172a',
      surfaceColor: '#1e293b',
      surfaceAltColor: '#334155',
      textColor: '#f1f5f9',
      mutedTextColor: '#94a3b8',
      borderColor: '#334155',
      linkColor: '#818cf8',
      buttonPrimaryColor: '#6366f1',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#4f46e5',
      buttonSecondaryColor: '#1e293b',
      buttonSecondaryTextColor: '#818cf8',
      buttonSecondaryBorderColor: '#4f46e5',
      buttonSecondaryHoverColor: '#312e81',
    },
  },
  {
    name: 'Rose Medical',
    emoji: '🌸',
    theme: {
      primaryColor: '#e11d48',
      backgroundColor: '#fff1f2',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#ffe4e6',
      textColor: '#1f1f1f',
      mutedTextColor: '#6b7280',
      borderColor: '#fecdd3',
      linkColor: '#e11d48',
      buttonPrimaryColor: '#e11d48',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#be123c',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#be123c',
      buttonSecondaryBorderColor: '#fecdd3',
      buttonSecondaryHoverColor: '#fff1f2',
    },
  },
  {
    name: 'Amber Warm',
    emoji: '☀️',
    theme: {
      primaryColor: '#d97706',
      backgroundColor: '#fffbeb',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#fef3c7',
      textColor: '#1c1917',
      mutedTextColor: '#78716c',
      borderColor: '#fde68a',
      linkColor: '#d97706',
      buttonPrimaryColor: '#d97706',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#b45309',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#b45309',
      buttonSecondaryBorderColor: '#fde68a',
      buttonSecondaryHoverColor: '#fffbeb',
    },
  },
  {
    name: 'Purple Care',
    emoji: '💜',
    theme: {
      primaryColor: '#7c3aed',
      backgroundColor: '#faf5ff',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#f3e8ff',
      textColor: '#1e1b4b',
      mutedTextColor: '#6b7280',
      borderColor: '#ddd6fe',
      linkColor: '#7c3aed',
      buttonPrimaryColor: '#7c3aed',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#6d28d9',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#6d28d9',
      buttonSecondaryBorderColor: '#ddd6fe',
      buttonSecondaryHoverColor: '#f5f3ff',
    },
  },
  {
    name: 'Coral Sunset',
    emoji: '🌅',
    theme: {
      primaryColor: '#f97316',
      backgroundColor: '#fff7ed',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#ffedd5',
      textColor: '#1c1917',
      mutedTextColor: '#78716c',
      borderColor: '#fed7aa',
      linkColor: '#ea580c',
      buttonPrimaryColor: '#f97316',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#ea580c',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#ea580c',
      buttonSecondaryBorderColor: '#fed7aa',
      buttonSecondaryHoverColor: '#fff7ed',
    },
  },
  {
    name: 'Sky Clinic',
    emoji: '🩵',
    theme: {
      primaryColor: '#0ea5e9',
      backgroundColor: '#f0f9ff',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#e0f2fe',
      textColor: '#0c1a2e',
      mutedTextColor: '#4b6280',
      borderColor: '#bae6fd',
      linkColor: '#0284c7',
      buttonPrimaryColor: '#0ea5e9',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#0284c7',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#0284c7',
      buttonSecondaryBorderColor: '#bae6fd',
      buttonSecondaryHoverColor: '#f0f9ff',
    },
  },
  {
    name: 'Forest Pine',
    emoji: '🌲',
    theme: {
      primaryColor: '#16a34a',
      backgroundColor: '#f7fdf9',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#dcfce7',
      textColor: '#14532d',
      mutedTextColor: '#4b7260',
      borderColor: '#86efac',
      linkColor: '#15803d',
      buttonPrimaryColor: '#16a34a',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#15803d',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#15803d',
      buttonSecondaryBorderColor: '#86efac',
      buttonSecondaryHoverColor: '#f0fdf4',
    },
  },
  {
    name: 'Slate Pro',
    emoji: '🩶',
    theme: {
      primaryColor: '#475569',
      backgroundColor: '#f8fafc',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#f1f5f9',
      textColor: '#0f172a',
      mutedTextColor: '#64748b',
      borderColor: '#cbd5e1',
      linkColor: '#334155',
      buttonPrimaryColor: '#334155',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#1e293b',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#334155',
      buttonSecondaryBorderColor: '#cbd5e1',
      buttonSecondaryHoverColor: '#f1f5f9',
    },
  },
  {
    name: 'Lavender Calm',
    emoji: '🪻',
    theme: {
      primaryColor: '#a855f7',
      backgroundColor: '#fdf4ff',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#fae8ff',
      textColor: '#2d1a47',
      mutedTextColor: '#7c5fa0',
      borderColor: '#e9d5ff',
      linkColor: '#9333ea',
      buttonPrimaryColor: '#a855f7',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#9333ea',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#9333ea',
      buttonSecondaryBorderColor: '#e9d5ff',
      buttonSecondaryHoverColor: '#fdf4ff',
    },
  },
  {
    name: 'Crimson Care',
    emoji: '❤️‍🩹',
    theme: {
      primaryColor: '#dc2626',
      backgroundColor: '#fef2f2',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#fee2e2',
      textColor: '#1c0a0a',
      mutedTextColor: '#7f3232',
      borderColor: '#fca5a5',
      linkColor: '#b91c1c',
      buttonPrimaryColor: '#dc2626',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#b91c1c',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#b91c1c',
      buttonSecondaryBorderColor: '#fca5a5',
      buttonSecondaryHoverColor: '#fef2f2',
    },
  },
  {
    name: 'Teal Wellness',
    emoji: '🩺',
    theme: {
      primaryColor: '#0d9488',
      backgroundColor: '#f0fdfa',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#ccfbf1',
      textColor: '#0f2823',
      mutedTextColor: '#4a7e78',
      borderColor: '#99f6e4',
      linkColor: '#0f766e',
      buttonPrimaryColor: '#0d9488',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#0f766e',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#0f766e',
      buttonSecondaryBorderColor: '#99f6e4',
      buttonSecondaryHoverColor: '#f0fdfa',
    },
  },
  {
    name: 'Golden Hour',
    emoji: '🌟',
    theme: {
      primaryColor: '#ca8a04',
      backgroundColor: '#fefce8',
      surfaceColor: '#ffffff',
      surfaceAltColor: '#fef9c3',
      textColor: '#1a1500',
      mutedTextColor: '#7a6a20',
      borderColor: '#fde047',
      linkColor: '#a16207',
      buttonPrimaryColor: '#ca8a04',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#a16207',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#a16207',
      buttonSecondaryBorderColor: '#fde047',
      buttonSecondaryHoverColor: '#fefce8',
    },
  },
  {
    name: 'Arctic White',
    emoji: '🏔️',
    theme: {
      primaryColor: '#1e40af',
      backgroundColor: '#ffffff',
      surfaceColor: '#f8fafc',
      surfaceAltColor: '#e2e8f0',
      textColor: '#0f172a',
      mutedTextColor: '#64748b',
      borderColor: '#e2e8f0',
      linkColor: '#1d4ed8',
      buttonPrimaryColor: '#1e40af',
      buttonPrimaryTextColor: '#ffffff',
      buttonPrimaryHoverColor: '#1e3a8a',
      buttonSecondaryColor: '#ffffff',
      buttonSecondaryTextColor: '#1e40af',
      buttonSecondaryBorderColor: '#bfdbfe',
      buttonSecondaryHoverColor: '#eff6ff',
    },
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function isValidHex(val: string) {
  return HEX_RE.test(val)
}

// ── ColorField ───────────────────────────────────────────────────────────────

function ColorField({
  label,
  value = '#000000',
  onChange,
  disabled,
  hint,
}: {
  label: string
  value?: string
  onChange: (v: string) => void
  disabled?: boolean
  hint?: string
}) {
  const [text, setText] = useState(value)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setText(value)
    setHasError(false)
  }, [value])

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setText(v)
    if (isValidHex(v)) {
      setHasError(false)
      onChange(v)
    } else {
      setHasError(true)
    }
  }

  const handleColorPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setText(v)
    setHasError(false)
    onChange(v)
  }

  const safeValue = isValidHex(value) ? value : '#000000'

  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-gray uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {hint && <p className="text-xs text-neutral-gray mb-1.5 -mt-1">{hint}</p>}
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <input
            type="color"
            value={safeValue}
            onChange={handleColorPick}
            disabled={disabled}
            className="h-10 w-10 cursor-pointer rounded-lg border-2 border-neutral-border p-0.5 bg-white disabled:cursor-not-allowed disabled:opacity-50 transition-all hover:border-primary"
            style={{ appearance: 'none' }}
          />
        </div>
        <input
          type="text"
          value={text}
          onChange={handleTextChange}
          disabled={disabled}
          placeholder="#000000"
          maxLength={7}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-mono transition-all outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${
            hasError
              ? 'border-error bg-red-50 focus:ring-error'
              : 'border-neutral-border bg-white focus:border-primary'
          }`}
        />
        <div
          className="h-10 w-10 rounded-lg border border-neutral-border shrink-0 shadow-inner"
          style={{ backgroundColor: safeValue }}
        />
      </div>
      {hasError && (
        <p className="mt-1 text-xs text-error">Enter a valid hex color (e.g. #2563eb)</p>
      )}
    </div>
  )
}

// ── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  subtitle,
  expanded,
  onToggle,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 text-left group"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary text-lg transition-colors group-hover:bg-primary/20">
          {icon}
        </span>
        <div>
          <p className="font-semibold text-neutral-dark text-sm">{title}</p>
          {subtitle && <p className="text-xs text-neutral-gray">{subtitle}</p>}
        </div>
      </div>
      <span className="text-neutral-gray transition-transform">
        {expanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
      </span>
    </button>
  )
}

// ── ThemePreview ─────────────────────────────────────────────────────────────

function ThemePreview({ theme, hospitalName }: { theme: ThemeSettings; hospitalName: string }) {
  const fontUrl = theme.fontFamily
    ? `https://fonts.googleapis.com/css2?family=${theme.fontFamily.replace(/ /g, '+')}:wght@400;600;700&display=swap`
    : null

  const safeRadius = theme.borderRadius || '0.5rem'
  const safeFontSize = theme.fontSize || '16px'
  const safeFontStyle = theme.fontStyle || 'normal'

  return (
    <div
      className="rounded-xl overflow-hidden border border-neutral-border shadow-lg text-sm"
      style={{
        backgroundColor: theme.backgroundColor || '#f8fafc',
        fontFamily: `'${theme.fontFamily || 'Inter'}', sans-serif`,
        fontSize: safeFontSize,
        fontStyle: safeFontStyle,
        color: theme.textColor || '#0f172a',
      }}
    >
      {fontUrl && <link href={fontUrl} rel="stylesheet" />}

      {/* Header bar */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: theme.surfaceColor || '#ffffff', borderBottom: `1px solid ${theme.borderColor || '#e2e8f0'}` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: theme.buttonPrimaryColor || '#2563eb', color: theme.buttonPrimaryTextColor || '#ffffff', borderRadius: '9999px' }}
          >
            {(hospitalName || 'H')[0].toUpperCase()}
          </div>
          <span className="font-bold text-xs" style={{ color: theme.textColor }}>{hospitalName || 'My Hospital'}</span>
        </div>
        <nav className="flex items-center gap-3 text-[10px]">
          {['Home', 'Doctors', 'Contact'].map((item) => (
            <span key={item} className="cursor-pointer" style={{ color: theme.mutedTextColor }}>{item}</span>
          ))}
          <span
            className="px-2.5 py-1 text-[10px] font-semibold"
            style={{
              backgroundColor: theme.buttonPrimaryColor || '#2563eb',
              color: theme.buttonPrimaryTextColor || '#ffffff',
              borderRadius: safeRadius,
            }}
          >
            Book
          </span>
        </nav>
      </div>

      {/* Hero section */}
      <div
        className="px-4 py-5"
        style={{ backgroundColor: theme.surfaceAltColor || '#f1f5f9' }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: theme.linkColor || theme.primaryColor || '#2563eb' }}
        >
          Welcome
        </div>
        <h1
          className="text-base font-bold leading-snug mb-2"
          style={{ color: theme.textColor, fontFamily: `'${theme.fontFamily || 'Inter'}', sans-serif` }}
        >
          Expert Medical Care
        </h1>
        <p className="text-[11px] leading-relaxed mb-3" style={{ color: theme.mutedTextColor }}>
          Compassionate care with modern clinical excellence. Book your appointment today.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-[10px] font-semibold transition-colors"
            style={{
              backgroundColor: theme.buttonPrimaryColor || '#2563eb',
              color: theme.buttonPrimaryTextColor || '#ffffff',
              borderRadius: safeRadius,
            }}
          >
            Book Appointment
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-[10px] font-semibold border transition-colors"
            style={{
              backgroundColor: theme.buttonSecondaryColor || '#ffffff',
              color: theme.buttonSecondaryTextColor || '#1d4ed8',
              borderColor: theme.buttonSecondaryBorderColor || '#bfdbfe',
              borderRadius: safeRadius,
            }}
          >
            Our Doctors
          </button>
        </div>
      </div>

      {/* Cards row */}
      <div className="px-4 py-4 grid grid-cols-3 gap-2">
        {['Cardiology', 'Neurology', 'Orthopedics'].map((dept) => (
          <div
            key={dept}
            className="p-2.5 rounded text-center"
            style={{
              backgroundColor: theme.surfaceColor || '#ffffff',
              border: `1px solid ${theme.borderColor || '#e2e8f0'}`,
              borderRadius: safeRadius,
            }}
          >
            <div className="text-[10px] font-semibold mb-0.5" style={{ color: theme.textColor }}>{dept}</div>
            <div className="text-[9px]" style={{ color: theme.mutedTextColor }}>Specialists</div>
          </div>
        ))}
      </div>

      {/* Input preview */}
      <div className="px-4 pb-4">
        <input
          type="text"
          readOnly
          placeholder="Search for a doctor..."
          className="w-full text-[10px] px-3 py-2 outline-none"
          style={{
            backgroundColor: theme.inputBackgroundColor || '#f8fafc',
            border: `1px solid ${theme.inputBorderColor || '#cbd5e1'}`,
            color: theme.textColor,
            borderRadius: safeRadius,
          }}
        />
      </div>

      {/* Footer strip */}
      <div
        className="px-4 py-2 text-[9px] text-center"
        style={{ backgroundColor: '#0f172a', color: '#94a3b8' }}
      >
        © {new Date().getFullYear()} {hospitalName || 'My Hospital'} · All rights reserved
      </div>
    </div>
  )
}

// ── Main inner component ──────────────────────────────────────────────────────

function CustomizationContent() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [profile, setProfile] = useState<HospitalProfile | null>(null)
  const [theme, setTheme] = useState<ThemeSettings>(DEFAULT_THEME)

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Section expand/collapse
  const [expandedSections, setExpandedSections] = useState({
    brand: true,
    typography: true,
    colors: true,
    buttons: false,
    inputs: false,
    corners: false,
    chatbot: false,
  })

  const [showPreview, setShowPreview] = useState(true)

  // Trial chatbot preview states
  const [previewMessages, setPreviewMessages] = useState<Array<{ id: number; type: 'ai' | 'user'; content: string }>>([])
  const [previewInput, setPreviewInput] = useState('')
  const [previewTyping, setPreviewTyping] = useState(false)

  useEffect(() => {
    setPreviewMessages([
      {
        id: 1,
        type: 'ai',
        content: `Hello! I'm ${theme.chatbotName || 'Hospital Medical AI'}. I'm here to help patients with questions about our medical services, appointments, or specialties. How can I assist you today?`,
      },
    ])
  }, [theme.chatbotName])

  const handleSendPreview = () => {
    if (!previewInput.trim() || previewTyping) return

    const userMsg = {
      id: Date.now(),
      type: 'user' as const,
      content: previewInput.trim(),
    }

    setPreviewMessages((prev) => [...prev, userMsg])
    const messageText = previewInput.trim()
    setPreviewInput('')
    setPreviewTyping(true)

    setTimeout(() => {
      let aiContent = 'Thank you for your question. I can help you with information about appointments, departments, and finding the right specialist for your needs.'
      const lowerMessage = messageText.toLowerCase()

      if (lowerMessage.includes('pain') || lowerMessage.includes('hurt') || lowerMessage.includes('ache')) {
        if (lowerMessage.includes('chest') || lowerMessage.includes('heart')) {
          aiContent = 'Based on your chest pain symptoms, I recommend seeing a Cardiologist immediately. They specialize in heart and cardiovascular conditions. Would you like me to help you schedule an appointment?'
        } else if (lowerMessage.includes('head') || lowerMessage.includes('migraine')) {
          aiContent = 'For headaches and migraines, I suggest consulting with a Neurologist. They can properly diagnose and treat various types of headaches. Shall I check available appointments?'
        } else if (lowerMessage.includes('stomach') || lowerMessage.includes('abdomen')) {
          aiContent = 'Stomach pain could require a Gastroenterologist consultation. They specialize in digestive system issues. Would you like to book an appointment?'
        }
      } else if (lowerMessage.includes('skin') || lowerMessage.includes('rash') || lowerMessage.includes('acne')) {
        aiContent = 'For skin concerns, I recommend seeing a Dermatologist. They can help with various skin conditions. Would you like me to check their availability?'
      } else if (lowerMessage.includes('eye') || lowerMessage.includes('vision')) {
        aiContent = 'For eye or vision problems, an Ophthalmologist would be the right specialist to see. They can examine and treat eye conditions. Shall I help you schedule?'
      } else if (lowerMessage.includes('appointment') || lowerMessage.includes('book') || lowerMessage.includes('schedule')) {
        aiContent = 'I can help you book an appointment! We have specialists in Cardiology, Neurology, Gastroenterology, Dermatology, and Ophthalmology. Which department do you need?'
      } else if (lowerMessage.includes('hours') || lowerMessage.includes('open') || lowerMessage.includes('time')) {
        aiContent = 'Our hospital is open 24/7 for emergency care. Regular outpatient department clinics operate Monday through Saturday from 9:00 AM to 8:00 PM.'
      }

      setPreviewMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          type: 'ai' as const,
          content: aiContent,
        },
      ])
      setPreviewTyping(false)
    }, 1000)
  }

  const { planType, isActive, loading: subLoading } = useSubscription()

  // "Premium Plan" in the UI maps to backend key 'STANDARD'
  const canCustomize = isActive && planType === 'STANDARD'

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    setLoading(true)
    const res = await hospitalAdminApi.getProfile()
    if (res.data) {
      setProfile(res.data)
      if (res.data.theme_settings && Object.keys(res.data.theme_settings).length > 0) {
        setTheme({ ...DEFAULT_THEME, ...res.data.theme_settings })
      }
      if (res.data.logo) {
        setLogoPreview(normalizeLogoUrl(res.data.logo))
      }
    } else {
      setError('Failed to load profile')
    }
    setLoading(false)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => setLogoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleThemeChange = useCallback((key: keyof ThemeSettings, value: string) => {
    setTheme((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handlePresetApply = (preset: Partial<ThemeSettings>) => {
    setTheme((prev) => ({ ...prev, ...preset }))
  }

  const handleReset = () => {
    setTheme(DEFAULT_THEME)
  }

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const formData = new FormData()
      formData.append('theme_settings', JSON.stringify(theme))
      if (logoFile) formData.append('logo', logoFile)
      const res = await hospitalAdminApi.updateProfile(formData)
      if (res.error) {
        setError(res.error)
      } else {
        setSuccess('Website customization saved successfully!')
        if (res.data) {
          setProfile(res.data)
          if (res.data.logo) setLogoPreview(normalizeLogoUrl(res.data.logo))
        }
      }
    } catch {
      setError('An unexpected error occurred while saving.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const hospitalName = profile?.name || 'My Hospital'

  return (
    <div className="pb-12">
      {/* ── Page header ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-dark">Website Customization</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-neutral-gray text-sm">Design your hospital's public website and AI chatbot.</p>
            {!subLoading && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PLAN_BADGE_CLASSES[planType]}`}>
                {PLAN_LABELS[planType]}{isActive ? ' · Active' : ' · Inactive'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className="flex items-center gap-2 rounded-lg border border-neutral-border bg-white px-3 py-2 text-sm text-neutral-gray hover:text-neutral-dark hover:border-neutral-gray transition-colors"
          >
            <FiEye size={14} />
            {showPreview ? 'Hide' : 'Show'} Preview
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 rounded-lg border border-neutral-border bg-white px-3 py-2 text-sm text-neutral-gray hover:text-neutral-dark hover:border-neutral-gray transition-colors"
          >
            <FiRefreshCw size={14} />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <FiSave size={14} />
            }
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">{error}</div>
      )}
      {success && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700 border border-emerald-200">
          <FiCheckCircle className="shrink-0" />
          {success}
        </div>
      )}

      {/* ── Plan access banner ── */}
      {!subLoading && !canCustomize && !isActive && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5">🔒</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Premium Plan Required</p>
            <p className="text-xs text-amber-700 mt-0.5">
              You don&apos;t have an active subscription. Purchase the <strong>Premium Plan</strong> to unlock full customization of your hospital&apos;s public website and AI chatbot.
            </p>
          </div>
        </div>
      )}
      {!subLoading && !canCustomize && isActive && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5">🔒</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Premium Plan Required</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your current plan doesn&apos;t include website customization. Upgrade to the <strong>Premium Plan</strong> to unlock full customization of your hospital&apos;s public website and AI chatbot.
            </p>
          </div>
        </div>
      )}
      {!subLoading && canCustomize && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-3 flex items-center gap-2">
          <span className="text-green-600">✓</span>
          <p className="text-xs font-semibold text-green-700">All customization features are unlocked with your active Premium plan.</p>
        </div>
      )}

      {/* ── Two-column layout: editor + preview ── */}
      <div className={`flex gap-6 items-start ${showPreview ? 'flex-col lg:flex-row' : ''}`}>
        {/* Editor column */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── PRESET THEMES ── */}
          <LockedFeature locked={!canCustomize} featureName="Website Customization">
            <div className="rounded-xl border border-neutral-border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FiDroplet size={16} />
                </span>
                <div>
                  <p className="font-semibold text-neutral-dark text-sm">Quick Presets</p>
                  <p className="text-xs text-neutral-gray">Apply a ready-made color scheme</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRESET_THEMES.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handlePresetApply(preset.theme)}
                    disabled={!canCustomize}
                    className="group flex items-center gap-2.5 rounded-lg border border-neutral-border px-3 py-2.5 text-left hover:border-primary hover:bg-primary/5 transition-all disabled:cursor-not-allowed"
                  >
                    <div className="flex -space-x-1 shrink-0">
                      {[preset.theme.buttonPrimaryColor, preset.theme.backgroundColor, preset.theme.surfaceAltColor].map((c, i) => (
                        <div
                          key={i}
                          className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
                          style={{ backgroundColor: c || '#ccc', zIndex: 3 - i }}
                        />
                      ))}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-neutral-dark group-hover:text-primary transition-colors">
                        {preset.emoji} {preset.name}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </LockedFeature>



          {/* ── TYPOGRAPHY ── */}
          <LockedFeature locked={!canCustomize} featureName="Website Customization">
            <div className="rounded-xl border border-neutral-border bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<FiType size={16} />}
                title="Typography"
                subtitle="Font family, size, and style"
                expanded={expandedSections.typography}
                onToggle={() => toggleSection('typography')}
              />
              {expandedSections.typography && (
                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Font Family */}
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-semibold text-neutral-gray uppercase tracking-wide mb-2">
                      Font Family
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {AVAILABLE_FONTS.map((font) => (
                        <button
                          key={font.value}
                          type="button"
                          onClick={() => handleThemeChange('fontFamily', font.value)}
                          disabled={!canCustomize}
                          className={`rounded-lg border-2 px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed ${
                            theme.fontFamily === font.value
                              ? 'border-primary bg-primary/5'
                              : 'border-neutral-border hover:border-primary/50'
                          }`}
                          style={{ fontFamily: `'${font.value}', sans-serif` }}
                        >
                          <div className={`text-sm font-semibold ${theme.fontFamily === font.value ? 'text-primary' : 'text-neutral-dark'}`}>
                            {font.label}
                          </div>
                          <div className="text-xs text-neutral-gray">{font.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-gray uppercase tracking-wide mb-2">
                      Base Font Size
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {FONT_SIZES.map((size) => (
                        <button
                          key={size.value}
                          type="button"
                          onClick={() => handleThemeChange('fontSize', size.value)}
                          disabled={!canCustomize}
                          className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all disabled:cursor-not-allowed ${
                            theme.fontSize === size.value
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-neutral-border text-neutral-gray hover:border-primary/50'
                          }`}
                        >
                          {size.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Style */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-gray uppercase tracking-wide mb-2">
                      Font Style
                    </label>
                    <div className="flex gap-2">
                      {(['normal', 'italic'] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => handleThemeChange('fontStyle', style)}
                          disabled={!canCustomize}
                          className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all disabled:cursor-not-allowed capitalize ${
                            theme.fontStyle === style
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-neutral-border text-neutral-gray hover:border-primary/50'
                          }`}
                          style={style === 'italic' ? { fontStyle: 'italic' } : {}}
                        >
                          {style === 'normal' ? 'Normal' : 'Italic'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </LockedFeature>

          {/* ── COLORS ── */}
          <LockedFeature locked={!canCustomize} featureName="Website Customization">
            <div className="rounded-xl border border-neutral-border bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<FiDroplet size={16} />}
                title="Colors"
                subtitle="Background, text, and brand colors"
                expanded={expandedSections.colors}
                onToggle={() => toggleSection('colors')}
              />
              {expandedSections.colors && (
                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <ColorField
                    label="Primary (Brand) Color"
                    value={theme.primaryColor}
                    onChange={(v) => handleThemeChange('primaryColor', v)}
                    disabled={!canCustomize}
                    hint="Main accent color used across the site"
                  />
                  <ColorField
                    label="Page Background Color"
                    value={theme.backgroundColor}
                    onChange={(v) => handleThemeChange('backgroundColor', v)}
                    disabled={!canCustomize}
                    hint="Overall page background"
                  />
                  <ColorField
                    label="Card / Surface Color"
                    value={theme.surfaceColor}
                    onChange={(v) => handleThemeChange('surfaceColor', v)}
                    disabled={!canCustomize}
                    hint="Background of cards and panels"
                  />
                  <ColorField
                    label="Section Background Color"
                    value={theme.surfaceAltColor}
                    onChange={(v) => handleThemeChange('surfaceAltColor', v)}
                    disabled={!canCustomize}
                    hint="Alternate section backgrounds"
                  />
                  <ColorField
                    label="Primary Text Color"
                    value={theme.textColor}
                    onChange={(v) => handleThemeChange('textColor', v)}
                    disabled={!canCustomize}
                    hint="Main body and heading text"
                  />
                  <ColorField
                    label="Muted / Secondary Text Color"
                    value={theme.mutedTextColor}
                    onChange={(v) => handleThemeChange('mutedTextColor', v)}
                    disabled={!canCustomize}
                    hint="Descriptions and helper text"
                  />
                  <ColorField
                    label="Link Color"
                    value={theme.linkColor}
                    onChange={(v) => handleThemeChange('linkColor', v)}
                    disabled={!canCustomize}
                    hint="Hyperlinks and interactive text"
                  />
                  <ColorField
                    label="Border / Divider Color"
                    value={theme.borderColor}
                    onChange={(v) => handleThemeChange('borderColor', v)}
                    disabled={!canCustomize}
                    hint="Card borders and dividers"
                  />
                </div>
              )}
            </div>
          </LockedFeature>

          {/* ── BUTTON COLORS ── */}
          <LockedFeature locked={!canCustomize} featureName="Website Customization">
            <div className="rounded-xl border border-neutral-border bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<FiSquare size={16} />}
                title="Button Colors"
                subtitle="Primary and secondary button styles"
                expanded={expandedSections.buttons}
                onToggle={() => toggleSection('buttons')}
              />
              {expandedSections.buttons && (
                <div className="mt-5">
                  {/* Live preview of buttons */}
                  <div className="mb-5 flex flex-wrap items-center gap-3 p-4 rounded-lg border border-neutral-border"
                    style={{ backgroundColor: theme.backgroundColor || '#f8fafc' }}
                  >
                    <span className="text-xs text-neutral-gray font-medium">Preview:</span>
                    <button
                      type="button"
                      className="px-4 py-2 text-sm font-semibold transition-colors rounded-lg"
                      style={{
                        backgroundColor: theme.buttonPrimaryColor,
                        color: theme.buttonPrimaryTextColor,
                        borderRadius: theme.borderRadius,
                      }}
                    >
                      Primary Button
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 text-sm font-semibold border transition-colors rounded-lg"
                      style={{
                        backgroundColor: theme.buttonSecondaryColor,
                        color: theme.buttonSecondaryTextColor,
                        borderColor: theme.buttonSecondaryBorderColor,
                        borderRadius: theme.borderRadius,
                      }}
                    >
                      Secondary Button
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div className="space-y-5">
                      <h3 className="text-xs font-bold text-neutral-dark uppercase tracking-wider">Primary Button</h3>
                      <ColorField
                        label="Background Color"
                        value={theme.buttonPrimaryColor}
                        onChange={(v) => handleThemeChange('buttonPrimaryColor', v)}
                        disabled={!canCustomize}
                      />
                      <ColorField
                        label="Text Color"
                        value={theme.buttonPrimaryTextColor}
                        onChange={(v) => handleThemeChange('buttonPrimaryTextColor', v)}
                        disabled={!canCustomize}
                      />
                      <ColorField
                        label="Hover Background Color"
                        value={theme.buttonPrimaryHoverColor}
                        onChange={(v) => handleThemeChange('buttonPrimaryHoverColor', v)}
                        disabled={!canCustomize}
                        hint="Color when mouse hovers over button"
                      />
                    </div>
                    <div className="space-y-5">
                      <h3 className="text-xs font-bold text-neutral-dark uppercase tracking-wider">Secondary Button</h3>
                      <ColorField
                        label="Background Color"
                        value={theme.buttonSecondaryColor}
                        onChange={(v) => handleThemeChange('buttonSecondaryColor', v)}
                        disabled={!canCustomize}
                      />
                      <ColorField
                        label="Text Color"
                        value={theme.buttonSecondaryTextColor}
                        onChange={(v) => handleThemeChange('buttonSecondaryTextColor', v)}
                        disabled={!canCustomize}
                      />
                      <ColorField
                        label="Border Color"
                        value={theme.buttonSecondaryBorderColor}
                        onChange={(v) => handleThemeChange('buttonSecondaryBorderColor', v)}
                        disabled={!canCustomize}
                      />
                      <ColorField
                        label="Hover Background Color"
                        value={theme.buttonSecondaryHoverColor}
                        onChange={(v) => handleThemeChange('buttonSecondaryHoverColor', v)}
                        disabled={!canCustomize}
                        hint="Color when mouse hovers over button"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </LockedFeature>

          {/* ── INPUT COLORS ── */}
          <LockedFeature locked={!canCustomize} featureName="Website Customization">
            <div className="rounded-xl border border-neutral-border bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<FiSliders size={16} />}
                title="Form Input Colors"
                subtitle="Text fields and form element styling"
                expanded={expandedSections.inputs}
                onToggle={() => toggleSection('inputs')}
              />
              {expandedSections.inputs && (
                <div className="mt-5">
                  {/* Input preview */}
                  <div className="mb-5 p-4 rounded-lg border border-neutral-border"
                    style={{ backgroundColor: theme.backgroundColor }}
                  >
                    <span className="text-xs text-neutral-gray font-medium block mb-2">Preview:</span>
                    <input
                      type="text"
                      readOnly
                      placeholder="Example input field..."
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none border transition-all"
                      style={{
                        backgroundColor: theme.inputBackgroundColor,
                        borderColor: theme.inputBorderColor,
                        color: theme.textColor,
                        borderRadius: theme.borderRadius,
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <ColorField
                      label="Input Background Color"
                      value={theme.inputBackgroundColor}
                      onChange={(v) => handleThemeChange('inputBackgroundColor', v)}
                      disabled={!canCustomize}
                    />
                    <ColorField
                      label="Input Border Color"
                      value={theme.inputBorderColor}
                      onChange={(v) => handleThemeChange('inputBorderColor', v)}
                      disabled={!canCustomize}
                    />
                    <ColorField
                      label="Input Focus / Active Color"
                      value={theme.inputFocusColor}
                      onChange={(v) => handleThemeChange('inputFocusColor', v)}
                      disabled={!canCustomize}
                      hint="Border color when a field is focused"
                    />
                  </div>
                </div>
              )}
            </div>
          </LockedFeature>

          {/* ── CORNER STYLE ── */}
          <LockedFeature locked={!canCustomize} featureName="Website Customization">
            <div className="rounded-xl border border-neutral-border bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<FiLayout size={16} />}
                title="Corner Style"
                subtitle="Border radius for cards, buttons, and inputs"
                expanded={expandedSections.corners}
                onToggle={() => toggleSection('corners')}
              />
              {expandedSections.corners && (
                <div className="mt-5">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {BORDER_RADIUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleThemeChange('borderRadius', opt.value)}
                        disabled={!canCustomize}
                        className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all disabled:cursor-not-allowed ${
                          theme.borderRadius === opt.value
                            ? 'border-primary bg-primary/5'
                            : 'border-neutral-border hover:border-primary/50'
                        }`}
                      >
                        <div
                          className="h-10 w-full border-2 transition-all"
                          style={{
                            borderRadius: opt.value,
                            borderColor: theme.borderRadius === opt.value
                              ? theme.buttonPrimaryColor || '#2563eb'
                              : '#cbd5e1',
                            backgroundColor: theme.borderRadius === opt.value
                              ? `${theme.buttonPrimaryColor || '#2563eb'}18`
                              : '#f8fafc',
                          }}
                        />
                        <div>
                          <div className={`text-xs font-semibold text-center ${theme.borderRadius === opt.value ? 'text-primary' : 'text-neutral-dark'}`}>
                            {opt.label}
                          </div>
                          <div className="text-[10px] text-neutral-gray text-center">{opt.description.split('–')[0].trim()}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </LockedFeature>

          {/* ── AI CHATBOT ── */}
          <LockedFeature locked={!canCustomize} featureName="Website Customization">
            <div className="rounded-xl border border-neutral-border bg-white p-5 shadow-sm">
              <SectionHeader
                icon={<FiMessageSquare size={16} />}
                title="AI Chatbot Settings"
                subtitle="Customize your embedded chatbot"
                expanded={expandedSections.chatbot}
                onToggle={() => toggleSection('chatbot')}
              />
              {expandedSections.chatbot && (
                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-gray uppercase tracking-wide mb-1.5">
                      Chatbot Display Name
                    </label>
                    <input
                      type="text"
                      value={theme.chatbotName}
                      onChange={(e) => handleThemeChange('chatbotName', e.target.value)}
                      placeholder="e.g. St. Jude Assistant"
                      className="w-full rounded-lg border border-neutral-border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50"
                      disabled={!canCustomize}
                    />
                    <p className="mt-1 text-xs text-neutral-gray">Name shown in the chat widget header</p>
                  </div>
                  <ColorField
                    label="Chatbot Accent Color"
                    value={theme.chatbotColor}
                    onChange={(v) => handleThemeChange('chatbotColor', v)}
                    disabled={!canCustomize}
                    hint="Color of the chatbot bubble and header"
                  />
                  <div className="sm:col-span-2 border-t border-neutral-border pt-5 mt-2">
                    <label className="block text-xs font-semibold text-neutral-gray uppercase tracking-wide mb-1.5">
                      Try the AI Chatbot
                    </label>
                    <p className="text-xs text-neutral-gray mb-3 -mt-1">
                      Test how the chatbot behaves using the display name and accent color configured above.
                    </p>
                    <div className="rounded-xl border border-neutral-border bg-neutral-light/50 overflow-hidden shadow-inner">
                      {/* Chat header */}
                      <div
                        className="px-4 py-3 flex items-center justify-between text-white text-xs font-semibold"
                        style={{ backgroundColor: theme.chatbotColor || '#2563eb' }}
                      >
                        <span>{theme.chatbotName || 'Hospital Medical AI'}</span>
                        <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">Test Mode</span>
                      </div>
                      
                      {/* Messages list */}
                      <div className="h-64 p-4 overflow-y-auto space-y-3 bg-white text-xs">
                        {previewMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                                msg.type === 'user'
                                  ? 'text-white shadow-sm'
                                  : 'bg-neutral-light border border-neutral-border text-neutral-dark'
                              }`}
                              style={msg.type === 'user' ? { backgroundColor: theme.chatbotColor || '#2563eb' } : {}}
                            >
                              <p className="leading-relaxed whitespace-pre-line">{msg.content}</p>
                            </div>
                          </div>
                        ))}
                        {previewTyping && (
                          <div className="flex justify-start">
                            <div className="bg-neutral-light border border-neutral-border rounded-xl px-4 py-2.5 text-neutral-gray flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-neutral-gray animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-neutral-gray animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-neutral-gray animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Input area */}
                      <div className="p-3 border-t border-neutral-border bg-white flex gap-2">
                        <input
                          type="text"
                          value={previewInput}
                          onChange={(e) => setPreviewInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleSendPreview()
                            }
                          }}
                          placeholder="Ask a medical question (e.g. 'I have chest pain')..."
                          className="flex-1 rounded-lg border border-neutral-border px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                        />
                        <button
                          type="button"
                          onClick={handleSendPreview}
                          className="px-4 py-2 rounded-lg text-white text-xs font-semibold transition-colors shrink-0"
                          style={{ backgroundColor: theme.chatbotColor || '#2563eb' }}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </LockedFeature>

          {/* Save button bottom */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <FiSave size={14} />
              }
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* ── Live Preview column ── */}
        {showPreview && (
          <div className="lg:w-80 lg:shrink-0 space-y-3 lg:sticky lg:top-20 lg:z-10 self-start h-fit">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-neutral-dark">Live Preview</p>
                <p className="text-xs text-neutral-gray">Updates as you change settings</p>
              </div>
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <ThemePreview theme={theme} hospitalName={hospitalName} />
            <p className="mt-2 text-center text-xs text-neutral-gray">
              Simplified preview — actual site may vary slightly
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

export default function CustomizationPage() {
  return (
    <SubscriptionProvider>
      <CustomizationContent />
    </SubscriptionProvider>
  )
}
