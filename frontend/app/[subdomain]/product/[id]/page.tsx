import React from 'react'
import { notFound } from 'next/navigation'
import { getSubdomainPublicInfo } from '@/lib/subdomainApi'

// Import template pages
import PharmacyTemplate3ProductPage from '@/app/templates/pharmacy/3/product/[id]/page'
import PharmacyTemplate6ProductPage from '@/app/templates/pharmacy/6/product/[id]/page'

interface PageProps {
  params: Promise<{
    subdomain: string
    id: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function SubdomainProductPage({ params }: PageProps) {
  const resolvedParams = await params
  const subdomain = resolvedParams.subdomain

  const subdomainInfo = await getSubdomainPublicInfo(subdomain)
  if (!subdomainInfo || !subdomainInfo.is_published || subdomainInfo.business_type !== 'pharmacy') {
    notFound()
  }

  const renderPage = () => {
    switch (subdomainInfo.template_id) {
      case 3: return <PharmacyTemplate3ProductPage />
      case 6: return <PharmacyTemplate6ProductPage />
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
