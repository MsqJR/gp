'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { FiUpload, FiLayout, FiFileText, FiGlobe, FiMessageSquare, FiDollarSign } from 'react-icons/fi'
import { getScopedItem, setScopedItem } from '@/lib/storage'
import { getPharmacyOrders, getPharmacyOrdersStats } from '@/lib/orders'

type StatEntry = {
  label: string
  value: number
  change: number
}

type PharmacyStats = {
  totalOrders: number
  totalOrdersChange: number
  pendingOrders: number
  pendingOrdersChange: number
  cancelledOrders: number
  cancelledOrdersChange: number
  monthlyOrders: number
  monthlyOrdersChange: number
}

const defaultPharmacyStats: PharmacyStats = {
  totalOrders: 0,
  totalOrdersChange: 0,
  pendingOrders: 0,
  pendingOrdersChange: 0,
  cancelledOrders: 0,
  cancelledOrdersChange: 0,
  monthlyOrders: 0,
  monthlyOrdersChange: 0,
}

const formatChange = (value: number) => `${value > 0 ? '+' : ''}${value}%`

const AnimatedNumber = ({ value, duration = 900 }: { value: number; duration?: number }) => {
  const [displayValue, setDisplayValue] = useState(0)
  const startValueRef = useRef(0)
  const rafRef = useRef<number>()

  useEffect(() => {
    const startValue = startValueRef.current
    const difference = value - startValue
    const startTime = performance.now()

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const nextValue = Math.round(startValue + difference * progress)
      setDisplayValue(nextValue)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        startValueRef.current = value
      }
    }

    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [value, duration])

  useEffect(() => {
    startValueRef.current = 0
    setDisplayValue(0)
  }, [])

  return <>{displayValue.toLocaleString()}</>
}

export default function DashboardPage() {
  const router = useRouter()
  const [userType, setUserType] = useState<'hospital' | 'pharmacy'>('hospital')
  const [selectedFeatures, setSelectedFeatures] = useState<any>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null)
  const [templatePurchased, setTemplatePurchased] = useState(false)
  const [totalPrice, setTotalPrice] = useState<number>(0)
  const [pharmacyStats, setPharmacyStats] = useState<PharmacyStats>(defaultPharmacyStats)
  const [hasPharmacySetup, setHasPharmacySetup] = useState(false)
  const [hasBusinessInfo, setHasBusinessInfo] = useState(false)
  const [hasBusinessLogo, setHasBusinessLogo] = useState(false)
  const [isPublished, setIsPublished] = useState(false)
  const [hospitalSubdomain, setHospitalSubdomain] = useState('')
  const [hospitalName, setHospitalName] = useState('')
  const [productStats, setProductStats] = useState({ total: 0, outOfStock: 0, lowStock: 0 })

  useEffect(() => {
    // Get user type from localStorage (auth user, not scoped)
    const userData = localStorage.getItem('user')
    let detectedType: 'hospital' | 'pharmacy' = 'hospital'
    if (userData) {
      const user = JSON.parse(userData)
      detectedType = user.businessType || user.business_type || 'hospital'
      setUserType(detectedType)

      if (detectedType === 'pharmacy') {
        router.replace('/dashboard/pharmacy')
        return
      }
      if (detectedType === 'hospital') {
        router.replace('/dashboard/hospital')
        return
      }
    }

    // Get selected features (for hospital) - user-scoped
    const features = getScopedItem('selectedFeatures')
    if (features) {
      setSelectedFeatures(JSON.parse(features))
    }

    // Get total price - user-scoped
    const price = getScopedItem('totalPrice')
    if (price) {
      setTotalPrice(parseFloat(price))
    }

    // Get selected template (for pharmacy) - user-scoped
    const template = getScopedItem('selectedTemplate')
    if (template) {
      setSelectedTemplate(parseInt(template))
    }

    // Pharmacy: only show price summary after purchase - user-scoped
    const started = getScopedItem('templateSubscriptionStartedAt')
    if (started) {
      setTemplatePurchased(true)
    }

    // Pharmacy: compute stats from actual orders (not stored defaults)
    const user = JSON.parse(userData || '{}')
    if (user.businessType === 'pharmacy' || user.business_type === 'pharmacy') {
      try {
        const orders = getPharmacyOrders()
        const computed = getPharmacyOrdersStats(orders)
        // Always fall back to 0s so we never show NaN/undefined
        setPharmacyStats({ ...defaultPharmacyStats, ...computed })
      } catch (error) {
        console.error('Failed to compute pharmacy stats from orders', error)
        setPharmacyStats(defaultPharmacyStats)
      }
    } else {
      const storedPharmacyStats = getScopedItem('pharmacyStats')
      if (storedPharmacyStats) {
        try {
          const parsedStats = JSON.parse(storedPharmacyStats)
          setPharmacyStats({ ...defaultPharmacyStats, ...parsedStats })
        } catch (error) {
          console.error('Failed to parse pharmacy stats from localStorage', error)
          setPharmacyStats(defaultPharmacyStats)
        }
      } else {
        setPharmacyStats(defaultPharmacyStats)
      }
    }

    const pharmacySetup = getScopedItem('pharmacySetup')
    if (pharmacySetup) {
      try {
        const parsed = JSON.parse(pharmacySetup)
        const hasProducts = parsed?.products?.some?.((p: any) => p?.name?.trim())
        setHasPharmacySetup(Boolean(hasProducts))
        
        // Calculate product statistics
        if (parsed?.products && Array.isArray(parsed.products)) {
          const products = parsed.products.filter((p: any) => p?.name?.trim())
          const total = products.length
          const outOfStock = products.filter((p: any) => 
            (typeof p.stock === 'number' && p.stock === 0) || p.inStock === false
          ).length
          const lowStock = products.filter((p: any) => 
            typeof p.stock === 'number' && p.stock > 0 && p.stock < 5
          ).length
          
          setProductStats({ total, outOfStock, lowStock })
        }
      } catch {
        setHasPharmacySetup(false)
      }
    }

    const businessInfo = getScopedItem('businessInfo')
    if (businessInfo) {
      try {
        const parsed = JSON.parse(businessInfo)
        setHasBusinessInfo(Boolean(parsed?.name?.trim() || parsed?.hasLogo))
        setHasBusinessLogo(Boolean(parsed?.logo || parsed?.logo_url || parsed?.hasLogo))
      } catch {
        setHasBusinessInfo(false)
        setHasBusinessLogo(false)
      }
    } else {
      setHasBusinessLogo(false)
    }

    setIsPublished(getScopedItem('isPublished') === 'true')

    // Also fetch real state from backend for hospital users
    const token = localStorage.getItem('access_token')
    if (token && detectedType === 'hospital') {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 
        (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000/api` : 'http://localhost:8000/api')
      // Fetch subdomain for My Website link
      fetch(`${API_URL}/website-setups/`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const results = data?.results || data
          const setup = Array.isArray(results) ? results[0] : results
          if (setup?.subdomain) setHospitalSubdomain(setup.subdomain)
        })
        .catch(() => {})
      // Check if business info is saved
      fetch(`${API_URL}/business-info/`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.name) {
            setHasBusinessInfo(true)
            setHospitalName(data.name)
          }
          if (data?.is_published) {
            setIsPublished(true)
            setScopedItem('isPublished', 'true')
          }
        })
        .catch(() => {})
      // Check if hospital features setup is done (profile exists)
      fetch(`${API_URL}/hospital/admin/profile/profile/`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.id) {
            // Only set selectedFeatures from backend if localStorage doesn't have it
            // Avoids overwriting the setup form feature flags with raw DB fields
            const existing = getScopedItem('selectedFeatures')
            if (!existing) {
              // Profile exists, but feature flags might not be stored locally on this device.
              // Keep this as an empty object so the UI doesn't render a confusing placeholder chip.
              setSelectedFeatures({})
            } else {
              setSelectedFeatures(JSON.parse(existing))
            }
          }
        })
        .catch(() => {})
    }
  }, [router])

  const hiddenFeatureKeys = new Set([
    'departments',
    'bookingSystem',
    'bookingUrl',
    'phone',
    'email',
    'address',
  ])

  const displaySelectedFeatures: Array<[string, unknown]> =
    userType === 'hospital' && selectedFeatures && typeof selectedFeatures === 'object'
      ? Object.entries(selectedFeatures).filter(([key, value]) => {
          if (!value) return false
          if (hiddenFeatureKeys.has(key)) return false
          // Hide internal/meta keys (e.g. historical placeholders)
          if (key.startsWith('_')) return false
          return true
        })
      : []

  // Refresh pharmacy order stats when page gains focus (e.g. after placing order or visiting Orders page)
  useEffect(() => {
    if (userType !== 'pharmacy') return
    const refreshStats = () => {
      try {
        const orders = getPharmacyOrders()
        const computed = getPharmacyOrdersStats(orders)
        setPharmacyStats({ ...defaultPharmacyStats, ...computed })
      } catch {
        setPharmacyStats(defaultPharmacyStats)
      }
    }
    window.addEventListener('focus', refreshStats)
    return () => window.removeEventListener('focus', refreshStats)
  }, [userType])

  const pharmacyStatEntries: StatEntry[] = [
    {
      label: 'Total Orders',
      value: pharmacyStats.totalOrders,
      change: pharmacyStats.totalOrdersChange,
    },
    {
      label: 'Pending Orders',
      value: pharmacyStats.pendingOrders,
      change: pharmacyStats.pendingOrdersChange,
    },
    {
      label: 'Canceled Orders',
      value: pharmacyStats.cancelledOrders,
      change: pharmacyStats.cancelledOrdersChange,
    },
  ]

  // Pharmacy: Choose Template (1), Fill Website Options (2), Upload Logo (3), Publish (4)
  const setupSteps =
    userType === 'pharmacy'
      ? [
          { label: 'Choose Template', completed: Boolean(selectedTemplate) },
          { label: 'Fill Website Options', completed: hasPharmacySetup },
          { label: 'Upload Logo', completed: hasBusinessInfo },
          { label: 'Publish', completed: isPublished },
        ]
      : [
          { label: 'Upload Logo', completed: hasBusinessLogo },
          { label: 'Hospital Setup', completed: Boolean(selectedFeatures) },
          { label: 'Business Info', completed: hasBusinessInfo },
          { label: 'Publish', completed: isPublished },
        ]

  const currentStep = setupSteps.findIndex((s) => !s.completed)
  const activeStep = currentStep >= 0 ? currentStep : setupSteps.length - 1

  const stats: StatEntry[] = userType === 'hospital' 
    ? [
        { label: 'Total Appointments', value: 0, change: 0 },
        { label: 'Pending Appointments', value: 0, change: 0 },
        { label: 'This Month', value: 0, change: 0 },
      ]
    : pharmacyStatEntries

  const isHospital = userType === 'hospital'
  const isPharmacy = userType === 'pharmacy'
  const templatePurchasedAndSelected = isPharmacy && templatePurchased && !!selectedTemplate
  const showPricingSummary =
    (isHospital && !!selectedFeatures) ||
    isPharmacy
  const safeTotalPrice =
    typeof totalPrice === 'number' && !Number.isNaN(totalPrice) ? totalPrice : 0
  const displayPrice =
    templatePurchasedAndSelected || (isHospital && !!selectedFeatures)
      ? safeTotalPrice
      : 0

  const pricingDescription =
    isHospital
      ? 'Selected features for your website'
      : templatePurchasedAndSelected
        ? `Template #${selectedTemplate} selected`
        : 'No template purchased yet'

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-dark mb-2">Dashboard</h1>
        <p className="text-sm sm:text-base text-neutral-gray">Welcome back! Here's your website setup progress.</p>
      </div>

      {/* Setup Progress */}
      <Card className="p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark mb-4 sm:mb-6">Setup Progress</h2>
        <ProgressBar steps={setupSteps} currentStep={activeStep} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {userType === 'pharmacy' ? (
            <>
              <Link href="/dashboard/pharmacy/templates">
                <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
                  <FiLayout className="mx-auto mb-3 text-primary" size={32} />
                  <h3 className="font-medium text-neutral-dark mb-1">1. Choose Template</h3>
                  <p className="text-sm text-neutral-gray">Select a design</p>
                </Card>
              </Link>
              <Link href="/dashboard/pharmacy/setup">
                <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
                  <FiFileText className="mx-auto mb-3 text-primary" size={32} />
                  <h3 className="font-medium text-neutral-dark mb-1">2. Fill Website Options</h3>
                  <p className="text-sm text-neutral-gray">Add products & info</p>
                </Card>
              </Link>
              <Link href="/dashboard/business-info">
                <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
                  <FiUpload className="mx-auto mb-3 text-primary" size={32} />
                  <h3 className="font-medium text-neutral-dark mb-1">3. Upload Logo</h3>
                  <p className="text-sm text-neutral-gray">Add your logo</p>
                </Card>
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (selectedTemplate) {
                    window.open(`/templates/pharmacy/${selectedTemplate}`, '_blank', 'noopener,noreferrer')
                  } else {
                    window.open('/templates/pharmacy/1?demo=1', '_blank', 'noopener,noreferrer')
                  }
                }}
                className="p-0 m-0 text-left"
              >
                <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
                  <FiGlobe className="mx-auto mb-3 text-primary" size={32} />
                  <h3 className="font-medium text-neutral-dark mb-1">4. Publish</h3>
                  <p className="text-sm text-neutral-gray">
                    {selectedTemplate ? 'View your live website' : 'Preview demo website'}
                  </p>
                </Card>
              </button>
            </>
          ) : (
            <>
          <Link href="/dashboard/business-info">
            <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
              <FiUpload className="mx-auto mb-3 text-primary" size={32} />
              <h3 className="font-medium text-neutral-dark mb-1">Upload Logo</h3>
              <p className="text-sm text-neutral-gray">Add your logo</p>
            </Card>
          </Link>
          <Link href="/dashboard/hospital/setup">
            <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
              <FiLayout className="mx-auto mb-3 text-primary" size={32} />
              <h3 className="font-medium text-neutral-dark mb-1">Hospital Setup</h3>
              <p className="text-sm text-neutral-gray">Configure features</p>
            </Card>
          </Link>
          <Link href="/dashboard/business-info">
            <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
              <FiFileText className="mx-auto mb-3 text-primary" size={32} />
              <h3 className="font-medium text-neutral-dark mb-1">Business Info</h3>
              <p className="text-sm text-neutral-gray">Add business info</p>
            </Card>
          </Link>
          <Link href="/dashboard/business-info">
            <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer">
              <FiGlobe className="mx-auto mb-3 text-primary" size={32} />
              <h3 className="font-medium text-neutral-dark mb-1">Publish</h3>
              <p className="text-sm text-neutral-gray">Go live</p>
            </Card>
          </Link>
            </>
          )}
        </div>
      </Card>

      {/* Pricing Summary - hospital: when features selected; pharmacy: always (0 until purchase) */}
      {showPricingSummary && (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark mb-2">Pricing Summary</h2>
              <p className="text-sm sm:text-base text-neutral-gray">
                {pricingDescription}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-primary-light px-4 sm:px-6 py-3 rounded-lg w-full sm:w-auto">
              <FiDollarSign className="text-primary" size={24} />
              <span className="text-2xl sm:text-3xl font-bold text-primary">
                {displayPrice.toFixed(2)}
              </span>
            </div>
          </div>
          {userType === 'hospital' && displaySelectedFeatures.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-border">
              <p className="text-sm font-medium text-neutral-dark mb-2">Selected Features:</p>
              <div className="flex flex-wrap gap-2">
                {displaySelectedFeatures.map(([key]) => (
                  <span key={key} className="bg-primary-light text-primary px-3 py-1 rounded-full text-sm">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="p-6">
            <p className="text-sm text-neutral-gray mb-2">{stat.label}</p>
            <p className="text-3xl font-bold text-neutral-dark mb-2">
              <AnimatedNumber value={stat.value} />
            </p>
            <p className={`text-sm ${stat.change >= 0 ? 'text-success' : 'text-error'}`}>
              {formatChange(stat.change)} from last month
            </p>
          </Card>
        ))}
      </div>

      {/* Product Inventory Stats (Pharmacy Only) */}
      {userType === 'pharmacy' && productStats.total > 0 && (
        <Card className="p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark mb-4">Product Inventory</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900 font-medium mb-1">Total Products</p>
              <p className="text-3xl font-bold text-blue-700">{productStats.total}</p>
            </div>
            {productStats.outOfStock > 0 && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-sm text-red-900 font-medium mb-1">Out of Stock</p>
                <p className="text-3xl font-bold text-red-700">{productStats.outOfStock}</p>
                <p className="text-xs text-red-600 mt-1">⚠️ Needs restocking</p>
              </div>
            )}
            {productStats.lowStock > 0 && (
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <p className="text-sm text-orange-900 font-medium mb-1">Low Stock</p>
                <p className="text-3xl font-bold text-orange-700">{productStats.lowStock}</p>
                <p className="text-xs text-orange-600 mt-1">⚠️ Stock below 5 units</p>
              </div>
            )}
          </div>
          <Link href="/dashboard/pharmacy/setup" className="inline-block mt-4">
            <Button variant="ghost" className="text-sm">
              Manage Products →
            </Button>
          </Link>
        </Card>
      )}

      {/* My Website Section — Hospital */}
      {userType === 'hospital' && (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark mb-1">My Hospital Website</h2>
              <p className="text-sm text-neutral-gray">
                {isPublished
                  ? `${hospitalName || 'Your hospital'} is live!`
                  : 'Publish your website to go live.'}
              </p>
              {hospitalSubdomain && (
                <p className="text-xs text-neutral-gray mt-1">
                  <strong>URL: </strong>
                  <span className="font-mono text-primary">
                    {hospitalSubdomain}.localhost:3000
                  </span>
                  <span className="ml-2 text-gray-400">(subdomain routing)</span>
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {hospitalSubdomain && isPublished && (
                <Button
                  variant="primary"
                  onClick={() => window.open(`http://${hospitalSubdomain}.localhost:3000`, '_blank', 'noopener,noreferrer')}
                  className="whitespace-nowrap"
                >
                  <FiGlobe className="mr-2" size={16} />
                  Visit My Website
                </Button>
              )}
              <Link href="/dashboard/business-info">
                <Button variant="secondary" className="whitespace-nowrap">
                  {isPublished ? 'Edit & Republish' : 'Publish Website'}
                </Button>
              </Link>
            </div>
          </div>
          {/* Quick stats */}
          <div className="mt-4 pt-4 border-t border-neutral-border grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Setup', done: Boolean(selectedFeatures) },
              { label: 'Business Info', done: hasBusinessInfo },
              { label: 'Published', done: isPublished },
              { label: 'Website Live', done: isPublished && Boolean(hospitalSubdomain) },
            ].map(item => (
              <div key={item.label} className={`rounded-lg p-3 text-center text-sm font-medium ${item.done ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-400 border border-gray-200'}`}>
                <span className="mr-1">{item.done ? '✅' : '○'}</span>
                {item.label}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* My Website Section — Pharmacy */}
      {userType === 'pharmacy' && (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark mb-2">My Website</h2>
              <p className="text-sm sm:text-base text-neutral-gray">
                {selectedTemplate && templatePurchased
                  ? `Your pharmacy website is live with Template #${selectedTemplate}`
                  : 'Complete the setup steps above to publish your website'}
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                if (selectedTemplate && templatePurchased) {
                  window.open(`/templates/pharmacy/${selectedTemplate}`, '_blank', 'noopener,noreferrer')
                } else {
                  window.open('/templates/pharmacy/1?demo=1', '_blank', 'noopener,noreferrer')
                }
              }}
              className="w-full sm:w-auto whitespace-nowrap"
            >
              <FiGlobe className="mr-2" size={18} />
              {selectedTemplate && templatePurchased ? 'See My Website' : 'Preview Demo'}
            </Button>
          </div>
        </Card>
      )}

      {/* AI Assistant Preview — Pharmacy only (hospitals have chatbot on their public site) */}
      {userType === 'pharmacy' && (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark">AI Assistant</h2>
            <Link href="/dashboard/ai-assistant">
              <Button variant="ghost" className="text-sm sm:text-base">View All</Button>
            </Link>
          </div>
          <div className="bg-neutral-light rounded-lg p-4 sm:p-6 h-40 sm:h-48 flex items-center justify-center">
            <div className="text-center">
              <FiMessageSquare className="mx-auto mb-3 text-ai" size={40} />
              <p className="text-neutral-gray mb-4">Get help with your website</p>
              <Link href="/dashboard/ai-assistant">
                <Button variant="primary">Open AI Assistant</Button>
              </Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

