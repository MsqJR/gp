'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { SubdomainPublicInfo } from '@/lib/subdomainApi'
import { setSiteOwnerId, setSiteItem, setPublicSiteItem } from '@/lib/storage'
import { pharmacyApi, pharmacyProductsApi } from '@/lib/pharmacy'
import { getPharmacyThemeCssVariables, normalizePharmacyThemeSettings } from '@/lib/pharmacyTheme'

// Import the layout and templates
import PharmacyTemplate1Page from '@/app/templates/pharmacy/1/page'
import PharmacyTemplate2Page from '@/app/templates/pharmacy/2/page'
import PharmacyTemplate3Page from '@/app/templates/pharmacy/3/page'
import PharmacyTemplate4Page from '@/app/templates/pharmacy/4/page'
import PharmacyTemplate5Page from '@/app/templates/pharmacy/5/page'
import PharmacyTemplate6Page from '@/app/templates/pharmacy/6/page'

interface Props {
  subdomainInfo: SubdomainPublicInfo
}

export default function PharmacySubdomainWrapper({ subdomainInfo }: Props) {
  const [themeSettings, setThemeSettings] = useState(() => normalizePharmacyThemeSettings(null))
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    // 1. Set the owner ID immediately so templates know whose data to fetch
    setSiteOwnerId(subdomainInfo.owner_id)

    const init = async () => {
      try {
        // 2. Fetch public pharmacy profile for theme settings
        const profileRes = await pharmacyApi.getProfile()
        if (profileRes.data?.theme_settings) {
          setThemeSettings(normalizePharmacyThemeSettings(profileRes.data.theme_settings))
        }
      } catch {
        // Ignore profile errors — theme falls back to defaults
      }

      try {
        // 3. Fetch products from the public API so ALL visitors see them,
        //    even without being logged in. Persist to the pharmacySetup key
        //    so loadTemplateProducts() in every template can find them.
        const productsRes = await pharmacyProductsApi.listPublic(subdomainInfo.owner_id, false)
        if (!productsRes.error && productsRes.data?.products) {
          const snapshot = JSON.stringify({
            products: productsRes.data.products.map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              description: p.description,
              price: p.price,
              inStock: p.in_stock,
              stock: p.stock,
              imageUrl: p.image_url_resolved || p.image_url || '',
            })),
          })
          setSiteItem('pharmacySetup', snapshot)
          setPublicSiteItem('pharmacySetup', snapshot)
        }
      } catch {
        // Ignore product fetch errors — templates will show cached or empty state
      }

      setIsInitializing(false)
    }

    void init()
  }, [subdomainInfo])

  const themeVariables = useMemo(
    () => getPharmacyThemeCssVariables(themeSettings),
    [themeSettings],
  )

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center">Loading pharmacy...</div>
  }

  // Render the correct template component
  const renderTemplate = () => {
    switch (subdomainInfo.template_id) {
      case 1: return <PharmacyTemplate1Page />
      case 2: return <PharmacyTemplate2Page />
      case 3: return <PharmacyTemplate3Page />
      case 4: return <PharmacyTemplate4Page />
      case 5: return <PharmacyTemplate5Page />
      case 6: return <PharmacyTemplate6Page />
      default: return <PharmacyTemplate1Page /> // Fallback
    }
  }

  return (
    <div className="pharmacy-theme-root" style={themeVariables as React.CSSProperties}>
      {renderTemplate()}
    </div>
  )
}
