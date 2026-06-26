'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { pharmacyApi, pharmacyProductsApi } from '@/lib/pharmacy'
import { startPharmacyProductPolling } from '@/lib/pharmacySheetSync'
import {
  getPharmacyThemeCssVariables,
  getStoredPharmacyThemeSettings,
  normalizePharmacyThemeSettings,
  persistPharmacyThemeSettings,
} from '@/lib/pharmacyTheme'
import { getSiteItem, getSiteOwnerId, getStoredUser, setPublicSiteItem, setSiteItem, setSiteOwnerId } from '@/lib/storage'

type BusinessInfoSnapshot = {
  name?: string
  logo?: string
  about?: string
  address?: string
  contactPhone?: string
  workingHours?: Record<string, unknown>
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export default function PharmacyTemplatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<div className="pharmacy-theme-root">{children}</div>}>
      <PharmacyTemplatesLayoutContent>{children}</PharmacyTemplatesLayoutContent>
    </React.Suspense>
  )
}

function PharmacyTemplatesLayoutContent({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const ownerId = searchParams?.get('owner') || ''
  const isDemo = searchParams?.get('demo') === '1' || searchParams?.get('demo') === 'true'
  // Keep first render deterministic across server/client to avoid hydration mismatches.
  const [themeSettings, setThemeSettings] = useState(() => normalizePharmacyThemeSettings(null))

  useEffect(() => {
    const syncThemeFromStorage = () => {
      setThemeSettings(getStoredPharmacyThemeSettings())
    }

    syncThemeFromStorage()
    window.addEventListener('storage', syncThemeFromStorage)

    if (ownerId) {
      setSiteOwnerId(ownerId)
    }

    if (!isDemo) {
      // Security measure: if accessed directly without demo flag, redirect.
      // Real subdomains should use the [subdomain] route.
      window.location.href = '/dashboard'
      return
    }

    const currentUser = getStoredUser()
    if (!ownerId && currentUser?.id) {
      setSiteOwnerId(currentUser.id)
    }

    if (!isDemo) {
      const cachedInfo = safeJsonParse<BusinessInfoSnapshot>(getSiteItem('businessInfo'))
      const token = localStorage.getItem('access_token')
      const apiBase = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000/api` : 'http://localhost:8000/api')

      if (token) {
        void fetch(`${apiBase}/business-info/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => {
            if (!data?.logo_url) return

            const merged: BusinessInfoSnapshot = {
              ...(cachedInfo || {}),
              name: data.name || cachedInfo?.name || '',
              about: data.about || cachedInfo?.about || '',
              address: data.address || cachedInfo?.address || '',
              contactPhone: data.contact_phone || cachedInfo?.contactPhone || '',
              workingHours: data.working_hours || cachedInfo?.workingHours || {},
              logo: data.logo_url,
            }

            const serialized = JSON.stringify(merged)
            setSiteItem('businessInfo', serialized)
            setPublicSiteItem('businessInfo', serialized)
          })
          .catch(() => {
            // Ignore network errors; pages already support local fallbacks.
          })
      }

      void pharmacyApi
        .getProfile()
        .then((profileRes) => {
          if (!profileRes.data?.theme_settings) return
          const normalized = normalizePharmacyThemeSettings(profileRes.data.theme_settings)
          persistPharmacyThemeSettings(normalized)
          setThemeSettings(normalized)
        })
        .catch(() => {
          // Ignore profile hydration errors and use cached values.
        })
    }

    return () => {
      window.removeEventListener('storage', syncThemeFromStorage)
    }
  }, [isDemo, ownerId])

  useEffect(() => {
    if (isDemo) return

    let stopPolling: (() => void) | undefined
    let active = true

    const startLivePolling = async () => {
      const currentUser = getStoredUser()
      const resolvedOwnerId = ownerId || currentUser?.id || getSiteOwnerId()
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

      let syncEnabled = false
      if (token) {
        const status = await pharmacyProductsApi.getSheetSyncStatus()
        syncEnabled = Boolean(status.data?.google_sheet_sync_enabled)
      } else if (resolvedOwnerId) {
        const publicProducts = await pharmacyProductsApi.listPublic(resolvedOwnerId, false)
        syncEnabled = Boolean(publicProducts.data?.google_sheet_sync_enabled)
      }

      if (!active || !syncEnabled) return

      stopPolling = startPharmacyProductPolling({
        enabled: true,
        authenticated: Boolean(token),
        ownerId: token ? null : resolvedOwnerId,
        onProducts: () => undefined,
      })
    }

    void startLivePolling()

    return () => {
      active = false
      stopPolling?.()
    }
  }, [isDemo, ownerId])

  const themeVariables = useMemo(
    () => getPharmacyThemeCssVariables(themeSettings),
    [themeSettings],
  )

  return (
    <div className="pharmacy-theme-root" style={themeVariables as React.CSSProperties}>
      {children}
    </div>
  )
}
