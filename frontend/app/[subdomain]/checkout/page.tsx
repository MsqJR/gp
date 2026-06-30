import React from 'react'
import { notFound } from 'next/navigation'
import { getSubdomainPublicInfo } from '@/lib/subdomainApi'

// Import template pages
import PharmacyTemplate1CheckoutPage from '@/app/templates/pharmacy/1/checkout/page'
import PharmacyTemplate2CheckoutPage from '@/app/templates/pharmacy/2/checkout/page'
import PharmacyTemplate3CheckoutPage from '@/app/templates/pharmacy/3/checkout/page'
import PharmacyTemplate4CheckoutPage from '@/app/templates/pharmacy/4/checkout/page'
import PharmacyTemplate5CheckoutPage from '@/app/templates/pharmacy/5/checkout/page'
import PharmacyTemplate6CheckoutPage from '@/app/templates/pharmacy/6/checkout/page'

interface PageProps {
  params: Promise<{
    subdomain: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function SubdomainCheckoutPage({ params }: PageProps) {
  const resolvedParams = await params
  const subdomain = resolvedParams.subdomain

  const subdomainInfo = await getSubdomainPublicInfo(subdomain)
  if (!subdomainInfo || !subdomainInfo.is_published || subdomainInfo.business_type !== 'pharmacy') {
    notFound()
  }

  const renderPage = () => {
    switch (subdomainInfo.template_id) {
      case 1: return <PharmacyTemplate1CheckoutPage />
      case 2: return <PharmacyTemplate2CheckoutPage />
      case 3: return <PharmacyTemplate3CheckoutPage />
      case 4: return <PharmacyTemplate4CheckoutPage />
      case 5: return <PharmacyTemplate5CheckoutPage />
      case 6: return <PharmacyTemplate6CheckoutPage />
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
