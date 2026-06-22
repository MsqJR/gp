'use client'

import React, { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { FiBell, FiSearch, FiMenu } from 'react-icons/fi'
import { BrandLogo } from '@/components/pharmacy/BrandLogo'
import { getScopedItem, normalizeLogoUrl, setScopedItem } from '@/lib/storage'

interface TopbarProps {
  onMenuClick?: () => void
}

type NotificationItem = {
  id: string
  message: string
  timestamp: string
  read: boolean
}

type SearchItem = {
  label: string
  description: string
  keywords: string[]
  userTypes?: Array<'hospital' | 'pharmacy'>
  href?: string
  getHref?: (userType: 'hospital' | 'pharmacy') => string
}

const fallbackNotifications: NotificationItem[] = [
  {
    id: '1',
    message: 'New order received for 12 prescription items.',
    timestamp: '5m ago',
    read: false,
  },
  {
    id: '2',
    message: 'Template activated successfully.',
    timestamp: '1h ago',
    read: false,
  },
  {
    id: '3',
    message: 'Your subscription renews in 3 days.',
    timestamp: 'Yesterday',
    read: true,
  },
]

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const router = useRouter()
  const pathname = usePathname()
  const [userName, setUserName] = useState('User')
  const [userLogo, setUserLogo] = useState<string | null>(null)
  const [currentUserType, setCurrentUserType] = useState<'hospital' | 'pharmacy'>('hospital')
  const [notifications, setNotifications] = useState<NotificationItem[]>(fallbackNotifications)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownMenuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchDropdownRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchItem[]>([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchDropdownRect, setSearchDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const searchItems: SearchItem[] = [
    {
      label: 'Dashboard',
      description: 'Overview of your workspace',
      getHref: (userType) => (userType === 'hospital' ? '/dashboard/hospital' : '/dashboard/pharmacy'),
      keywords: ['home', 'overview', 'progress', 'setup progress', 'stats'],
    },
    ...(currentUserType === 'hospital'
      ? [{
          label: 'My Website',
          description: 'Open your website setup',
          keywords: ['my website', 'website', 'setup', 'live site'],
          href: '/dashboard/hospital/setup',
        }]
      : []),
    {
      label: 'Business Info',
      description: 'Update business details',
      href: '/dashboard/business-info',
      keywords: ['info', 'details', 'profile', 'contact'],
    },
    {
      label: 'Hospital Setup',
      description: 'Configure hospital website',
      href: '/dashboard/hospital/setup',
      keywords: ['hospital', 'setup', 'departments', 'services'],
      userTypes: ['hospital'],
    },
    {
      label: 'Appointments',
      description: 'Manage patient appointments',
      href: '/dashboard/hospital/appointments',
      keywords: ['hospital appointments', 'schedule', 'bookings'],
      userTypes: ['hospital'],
    },
    {
      label: 'Doctors',
      description: 'View doctors directory',
      href: '/dashboard/hospital/doctors',
      keywords: ['doctors', 'specialists', 'directory'],
      userTypes: ['hospital'],
    },
    {
      label: 'Departments',
      description: 'Manage hospital departments',
      href: '/dashboard/hospital/departments',
      keywords: ['departments', 'specialties', 'units', 'clinical areas'],
      userTypes: ['hospital'],
    },
    {
      label: 'Hospital Settings',
      description: 'Hospital branding and notifications',
      href: '/dashboard/hospital/settings',
      keywords: ['hospital settings', 'appearance', 'notifications'],
      userTypes: ['hospital'],
    },
    {
      label: 'UI Theme & Customization',
      description: 'Customize colors, fonts, and layout of your public hospital website',
      href: '/dashboard/hospital/customization',
      keywords: ['theme', 'colors', 'font', 'ui', 'design', 'customization', 'branding', 'style', 'background', 'button', 'text color', 'font size', 'preset'],
      userTypes: ['hospital'],
    },
    {
      label: 'Pharmacy Setup',
      description: 'Create pharmacy website',
      href: '/dashboard/pharmacy/setup',
      keywords: ['pharmacy', 'setup', 'launch', 'website builder'],
      userTypes: ['pharmacy'],
    },
    {
      label: 'Pharmacy Products',
      description: 'CSV import and product catalog',
      href: '/dashboard/pharmacy/products',
      keywords: ['products', 'csv', 'inventory', 'stock'],
      userTypes: ['pharmacy'],
    },
    {
      label: 'Templates',
      description: 'Choose pharmacy templates',
      href: '/dashboard/pharmacy/templates',
      keywords: ['templates', 'design', 'themes'],
      userTypes: ['pharmacy'],
    },
    { label: 'AI Assistant', description: 'Get AI help', href: '/dashboard/ai-assistant', keywords: ['assistant', 'chatbot'] },
    {
      label: 'Settings',
      description: 'Manage preferences',
      href: '/dashboard/settings',
      keywords: ['settings', 'preferences', 'account'],
    },
  ]

  useEffect(() => {
    let resolvedUserName = 'User'
    let resolvedUserType: 'hospital' | 'pharmacy' = 'hospital'
    let resolvedUserLogo: string | null = null

    // Get user name and type from localStorage
    const userData = localStorage.getItem('user')
    if (userData) {
      try {
        const user = JSON.parse(userData) as {
          name?: string
          businessType?: 'hospital' | 'pharmacy'
          business_type?: 'hospital' | 'pharmacy'
          logo?: string
          logo_url?: string
        }
        resolvedUserName = user.name || 'User'
        resolvedUserType = user.businessType || user.business_type || 'hospital'
        resolvedUserLogo = normalizeLogoUrl(user.logo_url || user.logo)
      } catch (e) {
        // Handle error
      }
    }

    const businessInfoRaw = getScopedItem('businessInfo')
    if (businessInfoRaw) {
      try {
        const businessInfo = JSON.parse(businessInfoRaw) as {
          name?: string
          logo?: string
          logo_url?: string
        }
        const businessLogo = normalizeLogoUrl(businessInfo.logo || businessInfo.logo_url)
        if (businessLogo) {
          resolvedUserLogo = businessLogo
        }
        if (resolvedUserName === 'User' && businessInfo.name?.trim()) {
          resolvedUserName = businessInfo.name.trim()
        }
      } catch {
        // Ignore malformed local business info payload
      }
    }

    setUserName(resolvedUserName)
    setCurrentUserType(resolvedUserType)
    setUserLogo(resolvedUserLogo)
  }, [pathname])

  useEffect(() => {
    const storedNotifications = getScopedItem('notifications')
    if (storedNotifications) {
      try {
        const parsed = JSON.parse(storedNotifications)
        if (Array.isArray(parsed) && parsed.length) {
          setNotifications(parsed)
        }
      } catch {
        // ignore parse errors, fallback data already set
      }
    }
  }, [])

  useEffect(() => {
    setScopedItem('notifications', JSON.stringify(notifications))
  }, [notifications])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node
      const clickedInsideTrigger = dropdownRef.current?.contains(targetNode)
      const clickedInsideMenu = dropdownMenuRef.current?.contains(targetNode)
      if (!clickedInsideTrigger && !clickedInsideMenu) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    } else {
      document.removeEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  useLayoutEffect(() => {
    if (!isSearchOpen || !searchRef.current) {
      setSearchDropdownRect(null)
      return
    }
    const rect = searchRef.current.getBoundingClientRect()
    setSearchDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [isSearchOpen, searchQuery])

  useEffect(() => {
    const handleSearchClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node
      const insideInput = searchRef.current?.contains(targetNode)
      const insideDropdown = searchDropdownRef.current?.contains(targetNode)
      if (!insideInput && !insideDropdown) {
        setIsSearchOpen(false)
      }
    }

    if (isSearchOpen) {
      document.addEventListener('mousedown', handleSearchClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleSearchClickOutside)
    }
  }, [isSearchOpen])

  const unreadCount = notifications.filter((notification) => !notification.read).length


  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev)
  }

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    )
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
  }

  const clearNotifications = () => {
    setNotifications([])
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setSearchQuery(value)
    if (!value.trim()) {
      setSearchResults([])
      setIsSearchOpen(false)
      return
    }

    const normalized = value.toLowerCase()
    const filtered = searchItems.filter((item) => {
      const matchesUserType = !item.userTypes || item.userTypes.includes(currentUserType)
      if (!matchesUserType) return false

      const labelMatch = item.label.toLowerCase().includes(normalized)
      const descriptionMatch = item.description.toLowerCase().includes(normalized)
      const keywordMatch = item.keywords.some((keyword) => keyword.toLowerCase().includes(normalized))

      return labelMatch || descriptionMatch || keywordMatch
    })

    setSearchResults(filtered)
    setIsSearchOpen(true)
  }

  const resolveHref = (item: SearchItem) => (item.getHref ? item.getHref(currentUserType) : item.href)

  const handleSearchSelect = (item: SearchItem) => {
    const href = resolveHref(item)
    if (!href) return
    router.push(href)
    setIsSearchOpen(false)
    setSearchQuery('')
  }

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!searchQuery.trim() || searchResults.length === 0) return
    handleSearchSelect(searchResults[0])
  }

  const searchDropdownEl =
    isSearchOpen && searchDropdownRect && typeof document !== 'undefined' ? (
      <div
        ref={searchDropdownRef}
        className="fixed bg-white border border-neutral-border rounded-lg shadow-lg z-50 max-h-[min(16rem,60vh)] overflow-y-auto"
        style={{
          top: searchDropdownRect.top,
          left: searchDropdownRect.left,
          width: searchDropdownRect.width,
        }}
      >
        {searchResults.length === 0 ? (
          <p className="text-sm text-neutral-gray px-4 py-3">No matches found.</p>
        ) : (
          searchResults.map((result) => {
            const key = `${resolveHref(result) || result.label}-${result.label}`
            return (
              <button
                type="button"
                key={key}
                onClick={() => handleSearchSelect(result)}
                className="w-full text-left px-4 py-3 hover:bg-neutral-light transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <p className="text-sm text-neutral-dark font-medium">{result.label}</p>
                <p className="text-xs text-neutral-gray">{result.description}</p>
              </button>
            )
          })
        )}
      </div>
    ) : null

  return (
    <>
      {searchDropdownEl}
      <div className="h-16 shrink-0 bg-white border-b border-neutral-border flex items-center justify-between px-4 sm:px-6 overflow-hidden w-full max-w-full">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 text-neutral-gray hover:text-neutral-dark transition-colors mr-2 shrink-0"
          aria-label="Open sidebar menu"
          title="Open menu"
        >
          <FiMenu size={24} />
        </button>
        <div className="flex-1 min-w-0 max-w-md hidden sm:block" ref={searchRef}>
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-gray pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => searchQuery.trim() && setIsSearchOpen(true)}
                placeholder="Search pages, actions..."
                className="w-full pl-10 pr-4 py-2 border border-neutral-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </form>
        </div>
      <div className="flex items-center gap-2 sm:gap-4 ml-auto shrink-0">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={toggleDropdown}
            className="relative p-2 text-neutral-gray hover:text-neutral-dark transition-colors"
            aria-label="Notifications"
          >
            <FiBell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"></span>
            )}
          </button>
          {isDropdownOpen && (
            <div
              ref={dropdownMenuRef}
              className="fixed top-16 right-4 w-72 bg-white border border-neutral-border rounded-lg shadow-lg z-50"
            >
              <div className="flex items-center justify-between p-3 border-b border-neutral-border">
                <div>
                  <p className="text-sm font-semibold text-neutral-dark">Notifications</p>
                  <p className="text-xs text-neutral-gray">
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                  </p>
                </div>
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-primary hover:underline"
                  disabled={unreadCount === 0}
                >
                  Mark all read
                </button>
              </div>
              <div>
                {notifications.length === 0 ? (
                  <p className="text-sm text-center text-neutral-gray py-6">No notifications yet.</p>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => markAsRead(notification.id)}
                      className={`w-full text-left px-4 py-3 text-sm border-b border-neutral-border last:border-b-0 transition-colors ${
                        notification.read ? 'bg-white' : 'bg-neutral-light/60'
                      }`}
                    >
                      <p className="text-neutral-dark">{notification.message}</p>
                      <span className="text-xs text-neutral-gray">{notification.timestamp}</span>
                    </button>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <button
                  onClick={clearNotifications}
                  className="w-full text-xs text-error py-2 border-t border-neutral-border hover:bg-neutral-light transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden">
            <BrandLogo
              src={userLogo}
              alt={`${userName} logo`}
              fallbackText={userName}
              imageClassName="h-full w-full object-cover"
              fallbackClassName="h-full w-full bg-primary flex items-center justify-center text-white font-semibold text-sm sm:text-base"
            />
          </div>
          <span className="text-neutral-dark font-medium text-sm sm:text-base hidden sm:inline">{userName}</span>
        </div>
      </div>
    </div>
    </>
  )
}

