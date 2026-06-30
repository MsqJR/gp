import React from 'react'
import { notFound } from 'next/navigation'
import { getSubdomainPublicInfo } from '@/lib/subdomainApi'

// Import template pages
import PharmacyTemplate1MedicationsPage from '@/app/templates/pharmacy/1/medications/page'
import PharmacyTemplate2MedicationsPage from '@/app/templates/pharmacy/2/medications/page'
import PharmacyTemplate3MedicationsPage from '@/app/templates/pharmacy/3/medications/page'
import PharmacyTemplate4MedicationsPage from '@/app/templates/pharmacy/4/medications/page'
import PharmacyTemplate5MedicationsPage from '@/app/templates/pharmacy/5/medications/page'
import PharmacyTemplate6MedicationsPage from '@/app/templates/pharmacy/6/medications/page'

interface PageProps {
  params: Promise<{
    subdomain: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function SubdomainMedicationsPage({ params }: PageProps) {
  const resolvedParams = await params
  const subdomain = resolvedParams.subdomain

  const subdomainInfo = await getSubdomainPublicInfo(subdomain)
  if (!subdomainInfo || !subdomainInfo.is_published || subdomainInfo.business_type !== 'pharmacy') {
    notFound()
  }

  const renderPage = () => {
    switch (subdomainInfo.template_id) {
      case 1: return <PharmacyTemplate1MedicationsPage />
      case 2: return <PharmacyTemplate2MedicationsPage />
      case 3: return <PharmacyTemplate3MedicationsPage />
      case 4: return <PharmacyTemplate4MedicationsPage />
      case 5: return <PharmacyTemplate5MedicationsPage />
      case 6: return <PharmacyTemplate6MedicationsPage />
      default: notFound()
    }
  }

  // Load theme settings
  let themeSettings = null
  try {
    const initRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/pharmacy/public/profile/?subdomain=${subdomain}`, {
      cache: 'no-store'
    })
    if (initRes.ok) {
      const profile = await initRes.json()
      themeSettings = profile?.theme_settings || null
    }
  } catch {
    // Ignore fetch error
  }
  
  const { getPharmacyThemeCssVariables, normalizePharmacyThemeSettings } = require('@/lib/pharmacyTheme')
  const themeVariables = getPharmacyThemeCssVariables(normalizePharmacyThemeSettings(themeSettings))

  return (
    <div className="pharmacy-theme-root" style={themeVariables as React.CSSProperties}>
      {renderPage()}
    </div>
  )
}
