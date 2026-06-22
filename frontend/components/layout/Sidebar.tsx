'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FiHome,
  FiGlobe,
  FiLayers,
  FiLayout,
  FiPackage,
  FiInfo,
  FiMessageSquare,
  FiSettings,
  FiLogOut,
  FiX,
  FiShoppingCart,
} from 'react-icons/fi'
import { BrandLogo } from '@/components/pharmacy/BrandLogo'
import { logoutUser } from '@/lib/auth'
import { getOwnerUnseenPharmacyOrdersCount } from '@/lib/pharmacyOrders'
import { getScopedItem, normalizeLogoUrl } from '@/lib/storage'

interface SidebarItem {
  label: string
  icon: React.ReactNode
  href: string
}

interface SidebarProps {
  userType?: 'hospital' | 'pharmacy'
  isOpen?: boolean
  onClose?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({ userType, isOpen = true, onClose }) => {
  const pathname = usePathname()
  const router = useRouter()
  const [currentUserType, setCurrentUserType] = useState<'hospital' | 'pharmacy'>('hospital')
  const [brandName, setBrandName] = useState('Medify')
  const [brandLogo, setBrandLogo] = useState<string | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [unseenOrdersCount, setUnseenOrdersCount] = useState(0)

  const loadBusinessInfo = useCallback((resolvedUserType: 'hospital' | 'pharmacy') => {
    let resolvedBrandName = 'Medify'
    let resolvedBrandLogo: string | null = null

    const userData = localStorage.getItem('user')
    if (userData) {
      try {
        const user = JSON.parse(userData) as any
        if (resolvedUserType === 'pharmacy') {
          resolvedBrandName = user.name || 'Medify'
          resolvedBrandLogo = normalizeLogoUrl(user.logo_url || user.logo)
        }
      } catch (e) {
        // ignore
      }
    }

    const businessInfoRaw = getScopedItem('businessInfo')
    if (businessInfoRaw) {
      try {
        const businessInfo = JSON.parse(businessInfoRaw) as any
        if (businessInfo.name?.trim()) {
          resolvedBrandName = businessInfo.name.trim()
        }
        const businessLogo = normalizeLogoUrl(businessInfo.logo || businessInfo.logo_url)
        if (businessLogo) {
          resolvedBrandLogo = businessLogo
        }
      } catch {
        // Ignore
      }
    }

    setBrandName(resolvedBrandName)
    setBrandLogo(resolvedBrandLogo)
  }, [])

  useEffect(() => {
    let resolvedUserType: 'hospital' | 'pharmacy' = userType || 'hospital'

    const userData = localStorage.getItem('user')
    if (userData) {
      try {
        const user = JSON.parse(userData) as any
        resolvedUserType = user.businessType || user.business_type || 'hospital'
      } catch (e) {
        resolvedUserType = 'hospital'
      }
    } else if (userType) {
      resolvedUserType = userType
    }

    setCurrentUserType(resolvedUserType)
    loadBusinessInfo(resolvedUserType)

    const handleUpdate = () => loadBusinessInfo(resolvedUserType)
    window.addEventListener('business-info-updated', handleUpdate)
    return () => window.removeEventListener('business-info-updated', handleUpdate)
  }, [userType, loadBusinessInfo])

  const loadUnseenOrdersCount = useCallback(async () => {
    if (currentUserType !== 'pharmacy') {
      setUnseenOrdersCount(0)
      return
    }

    const response = await getOwnerUnseenPharmacyOrdersCount()
    if (response.data !== undefined) {
      setUnseenOrdersCount(response.data)
    }
  }, [currentUserType])

  useEffect(() => {
    void loadUnseenOrdersCount()
  }, [loadUnseenOrdersCount])

  useEffect(() => {
    if (currentUserType !== 'pharmacy') return

    const intervalId = window.setInterval(() => {
      void loadUnseenOrdersCount()
    }, 8000)

    return () => window.clearInterval(intervalId)
  }, [currentUserType, loadUnseenOrdersCount])

  useEffect(() => {
    const handleUnseenOrdersEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ count?: number }>
      const nextCount = Number(customEvent.detail?.count ?? 0)
      setUnseenOrdersCount(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0)
    }

    window.addEventListener('pharmacy-unseen-orders-count', handleUnseenOrdersEvent as EventListener)
    return () => {
      window.removeEventListener('pharmacy-unseen-orders-count', handleUnseenOrdersEvent as EventListener)
    }
  }, [])

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    await logoutUser()
    router.push('/login')
    router.refresh()
    setIsLoggingOut(false)
  }

  const dashboardHref = currentUserType === 'pharmacy' ? '/dashboard/pharmacy' : '/dashboard/hospital'

  const menuItems: SidebarItem[] = [
    { label: 'Dashboard', icon: <FiHome />, href: dashboardHref },
    ...(currentUserType === 'hospital'
      ? [
          { label: 'My Website', icon: <FiGlobe />, href: '/dashboard/business-info' },
          { label: 'Hospital Setup', icon: <FiLayout />, href: '/dashboard/hospital/setup' },
          { label: 'Departments', icon: <FiLayers />, href: '/dashboard/hospital/departments' },
          { label: 'Customization', icon: <FiLayout />, href: '/dashboard/hospital/customization' },
          { label: 'Doctors', icon: <FiLayout />, href: '/dashboard/hospital/doctors' },
          { label: 'Appointments', icon: <FiShoppingCart />, href: '/dashboard/hospital/appointments' },
          { label: 'Patients', icon: <FiInfo />, href: '/dashboard/hospital/patients' },
          { label: 'Queue Management', icon: <FiPackage />, href: '/dashboard/hospital/queue' },
          { label: 'Notifications', icon: <FiMessageSquare />, href: '/dashboard/hospital/notifications' }, 
          { label: 'Settings', icon: <FiSettings />, href: '/dashboard/hospital/settings' },
        ]
      : []),
    ...(currentUserType === 'pharmacy'
      ? [
          { label: 'Create Website', icon: <FiLayout />, href: '/dashboard/pharmacy/setup' },
          { label: 'Products', icon: <FiPackage />, href: '/dashboard/pharmacy/products' },
          { label: 'Templates', icon: <FiLayout />, href: '/dashboard/pharmacy/templates' },
        ]
      : []),
    ...(currentUserType === 'pharmacy'
      ? [{ label: 'Business Info', icon: <FiInfo />, href: '/dashboard/business-info' }]
      : []),
    ...(currentUserType === 'pharmacy'
      ? [
          {
            label: 'Orders',
            icon: <FiShoppingCart />,
            href: '/dashboard/orders',
          },
        ]
      : []),
    // AI Assistant only for pharmacy; hospitals have chatbot on their public site
    ...(currentUserType === 'pharmacy'
      ? [{ label: 'AI Assistant', icon: <FiMessageSquare />, href: '/dashboard/ai-assistant' }]
      : []),
    ...(currentUserType === 'pharmacy' ? [{ label: 'Settings', icon: <FiSettings />, href: '/dashboard/settings' }] : []),
  ]

  const typeLabel = currentUserType === 'pharmacy' ? 'Pharmacy' : 'Hospital'
  const stripHospitalWord = (value: string) =>
    value
      .replace(/\bhospital\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

  // Strip redundant business-type labels from the stored name (e.g. "City Hospital" → "City").
  const cleanBrandName = (
    currentUserType === 'hospital'
      ? stripHospitalWord(brandName)
      : brandName.replace(new RegExp(`\\s*${typeLabel}\\s*$`, 'i'), '').trim()
  ) || brandName

  // The dashboard root must be exact-match so it doesn't match every sub-route.
  // All other sidebar items use prefix-match so sub-pages also highlight the parent.
  const isActive = (href: string) =>
    href === dashboardHref ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      <div className={`w-64 bg-white border-r border-neutral-border h-screen fixed left-0 top-0 flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0`}>
        <div className="p-4 sm:p-6 border-b border-neutral-border flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 sm:gap-3" onClick={onClose}>
            <div className="h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 rounded-full overflow-hidden border border-primary/20 bg-white">
              <BrandLogo
                src={brandLogo || '/mod logo.png'}
                alt={`${brandName} logo`}
                fallbackText={brandName}
                imageClassName="h-full w-full object-cover"
                fallbackClassName="h-full w-full bg-primary flex items-center justify-center text-white font-semibold text-sm"
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xl sm:text-2xl font-bold text-primary">{cleanBrandName}</span>
              <span className="text-xl sm:text-2xl font-bold text-neutral-dark">{typeLabel}</span>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="md:hidden p-2 text-neutral-gray hover:text-neutral-dark"
            aria-label="Close sidebar menu"
          >
            <FiX size={24} />
          </button>
        </div>
      <nav className="flex-1 p-4 overflow-y-auto">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              if (item.href === '/dashboard/orders') {
                setUnseenOrdersCount(0)
                window.dispatchEvent(
                  new CustomEvent('pharmacy-unseen-orders-count', {
                    detail: { count: 0 },
                  }),
                )
              }
              onClose?.()
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
              isActive(item.href)
                ? 'bg-primary-light text-primary font-medium'
                : 'text-neutral-gray hover:bg-neutral-light'
            }`}
          >
            {item.icon}
            <span className="text-sm sm:text-base">{item.label}</span>
            {item.href === '/dashboard/orders' && currentUserType === 'pharmacy' && unseenOrdersCount > 0 ? (
              <span className="ml-auto inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
                {unseenOrdersCount > 99 ? '99+' : unseenOrdersCount}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-neutral-border">
        <button 
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-error hover:bg-neutral-light w-full transition-colors text-sm sm:text-base"
        >
          <FiLogOut />
          <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
        </button>
      </div>
    </div>
    </>
  )
}

