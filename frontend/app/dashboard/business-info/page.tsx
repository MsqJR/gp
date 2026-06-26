'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { FileUpload } from '@/components/ui/FileUpload'
import { FiMapPin, FiCheckCircle, FiGlobe } from 'react-icons/fi'
import { getScopedItem, normalizeLogoUrl, setPublicSiteItem, setScopedItem } from '@/lib/storage'
import { businessInfoApi } from '@/lib/api'
import { useToast } from '@/components/ui/ToastProvider'
import { pharmacyApi } from '@/lib/pharmacy'
import { HospitalPhotosSection } from '@/components/hospital/HospitalPhotosSection'
import dynamic from 'next/dynamic'

const LocationMapPicker = dynamic(() => import('@/components/LocationMapPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-64 bg-neutral-light rounded-lg animate-pulse flex items-center justify-center text-neutral-gray text-sm">
      Loading map...
    </div>
  ),
})

function compressImage(dataUrl: string, maxWidth: number, maxHeight: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUrl); return }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function toBackendWebsite(raw: string): string {
  const value = (raw || '').trim()
  if (!value) return ''

  if (/^https?:\/\//i.test(value)) {
    return value
  }

  return `https://${value}`
}

function validatePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  if (!/^01\d{9}$/.test(digits)) {
    return 'Phone must be 11 digits and start with 01'
  }
  return null
}

export default function BusinessInfoPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isPublished, setIsPublished] = useState(false)
  const [userType, setUserType] = useState<'hospital' | 'pharmacy'>('hospital')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [logoUrlForStorage, setLogoUrlForStorage] = useState<string | null>(null)
  const normalizedLogoPreview = useMemo(() => normalizeLogoUrl(logoPreview), [logoPreview])
  const [formData, setFormData] = useState({
    name: '',
    logo: null as File | null,
    about: '',
    address: '',
    workingHours: {
      monday: { open: '09:00', close: '17:00', closed: false },
      tuesday: { open: '09:00', close: '17:00', closed: false },
      wednesday: { open: '09:00', close: '17:00', closed: false },
      thursday: { open: '09:00', close: '17:00', closed: false },
      friday: { open: '09:00', close: '17:00', closed: false },
      saturday: { open: '09:00', close: '13:00', closed: false },
      sunday: { open: '', close: '', closed: true },
    },
    contactPhone: '',
    contactEmail: '',
    website: '',
    yearsOfExperience: '',
  })


  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      try {
        const user = JSON.parse(userData)
        const businessType = user.businessType || user.business_type || 'hospital'
        setUserType(businessType)
      } catch {
        setUserType('hospital')
      }
    }
  }, [])

  // Load saved business info when page mounts so data persists on refresh (user-scoped)
  useEffect(() => {
    const loadBusinessInfo = async () => {
      try {
        const token = localStorage.getItem('access_token')
        if (token) {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000/api` : 'http://localhost:8000/api')
          const response = await fetch(`${API_URL}/business-info/`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          })
          
          if (response.ok) {
            const data = await response.json()
            setFormData((prev) => ({
              ...prev,
              name: data.name || prev.name,
              about: data.about || prev.about,
              address: data.address || prev.address,
              contactPhone: data.contact_phone || prev.contactPhone,
              contactEmail: data.contact_email || prev.contactEmail,
              website: data.website || prev.website,
              yearsOfExperience: data.years_of_experience !== undefined && data.years_of_experience !== null ? String(data.years_of_experience) : '',
              workingHours: {
                ...prev.workingHours,
                ...(data.working_hours || {}),
              },
            }))
            
            // Set logo preview if exists
            if (data.logo_url) {
              setLogoPreview(data.logo_url)
                setLogoUrlForStorage(data.logo_url)
              }
            
            return // Successfully loaded from API
          }
        }
      } catch (error) {
        console.error('Failed to load business info from API:', error)
      }
      
      // Fallback to localStorage if API fails or no token
      try {
        const saved = getScopedItem('businessInfo')
        if (saved) {
          const parsed = JSON.parse(saved)
          setFormData((prev) => ({
            ...prev,
            name: parsed.name || prev.name,
            about: parsed.about || prev.about,
            address: parsed.address || prev.address,
            contactPhone: parsed.contactPhone || prev.contactPhone,
            contactEmail: parsed.contactEmail || prev.contactEmail,
            website: parsed.website || prev.website,
            yearsOfExperience: parsed.yearsOfExperience || '',
            // Never restore logo from localStorage - it's too large
            logo: null,
            workingHours: {
              ...prev.workingHours,
              ...(parsed.workingHours || {}),
            },
          }))
          // Restore logo if previously saved
          if (parsed.logo) {
            setLogoPreview(parsed.logo)
            setLogoUrlForStorage(parsed.logo)
          }
        }
      } catch (error) {
        console.error('Failed to load saved business info:', error)
        // Ignore parse errors and keep defaults
      }
    }
    
    loadBusinessInfo()
  }, [])

  // Auto-save business info draft whenever the user types (user-scoped)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const { logo, ...rest } = formData
        const toSave = logoUrlForStorage ? { ...rest, logo: logoUrlForStorage } : rest
        setScopedItem('businessInfo', JSON.stringify(toSave))
        setPublicSiteItem('businessInfo', JSON.stringify(toSave))
        window.dispatchEvent(new CustomEvent('business-info-updated'))
      } catch {
        // Ignore storage write errors
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [formData, logoUrlForStorage])

  const saveBusinessInfoToBackend = async (): Promise<string | null> => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      throw new Error('Missing auth token.')
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000/api` : 'http://localhost:8000/api')

    const formDataToSend = new FormData()
    // Always send name (required for create)
    formDataToSend.append('name', formData.name || 'My Hospital')
    if (formData.logo) {
      formDataToSend.append('logo', formData.logo)
    }
    formDataToSend.append('about', formData.about)
    formDataToSend.append('address', formData.address)
    formDataToSend.append('contact_phone', formData.contactPhone)
    formDataToSend.append('contact_email', formData.contactEmail)
    if (formData.yearsOfExperience !== '') {
      formDataToSend.append('years_of_experience', String(parseInt(formData.yearsOfExperience) || 0))
    }
    // Only send website if non-empty to avoid Django URLField validation error
    const websiteValue = toBackendWebsite(formData.website)
    if (websiteValue) {
      formDataToSend.append('website', websiteValue)
    }
    formDataToSend.append('working_hours', JSON.stringify(formData.workingHours))

    const response = await fetch(`${API_URL}/business-info/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formDataToSend,
    })

    if (response.ok) {
      const respData = await response.json()
      return respData?.logo_url || null
    }

    // On 404, record doesn't exist yet — create it instead
    if (response.status === 404) {
      const createResp = await fetch(`${API_URL}/business-info/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formDataToSend,
      })
      if (createResp.ok) {
        const createData = await createResp.json()
        return createData?.logo_url || null
      }
      const createErrData = await createResp.json().catch(() => ({}))
      throw new Error(`Create failed: ${JSON.stringify(createErrData)}`)
    }

    const errData = await response.json().catch(() => ({}))
    throw new Error(`Could not save business info: ${JSON.stringify(errData)}`)
  }

  const handleSaveDraft = async () => {
    if (isSavingDraft) return
    const phoneValidationError = validatePhone(formData.contactPhone)
    if (phoneValidationError) {
      setPhoneError(phoneValidationError)
      return
    }

    setIsSavingDraft(true)

    let latestLogoUrl = logoUrlForStorage
    try {
      latestLogoUrl = (await saveBusinessInfoToBackend()) || latestLogoUrl
      if (latestLogoUrl) {
        setLogoUrlForStorage(latestLogoUrl)
      }

      const snapshot = {
        name: formData.name,
        about: formData.about,
        address: formData.address,
        workingHours: formData.workingHours,
        contactPhone: formData.contactPhone,
        contactEmail: formData.contactEmail,
        website: formData.website,
        yearsOfExperience: formData.yearsOfExperience,
        ...(latestLogoUrl ? { logo: latestLogoUrl } : {}),
      }
      setScopedItem('businessInfo', JSON.stringify(snapshot))
      setPublicSiteItem('businessInfo', JSON.stringify(snapshot))
    } catch (error) {
      console.error('Draft save failed:', error)
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const phoneValidationError = validatePhone(formData.contactPhone)
    if (phoneValidationError) {
      setPhoneError(phoneValidationError)
      return
    }

    setIsPublishing(true)
    let latestLogoUrl = logoUrlForStorage

    try {
      // Save to backend API first
      const token = localStorage.getItem('access_token')
      if (token) {
        latestLogoUrl = (await saveBusinessInfoToBackend()) || latestLogoUrl
        if (latestLogoUrl) {
          setLogoUrlForStorage(latestLogoUrl)
        }
      }
      const publishRes = await businessInfoApi.publish()
      if (publishRes.error) {
        showToast({
          type: 'error',
          title: 'Publish failed',
          message: publishRes.error,
        })
        setIsPublishing(false)
        return
      }
      const businessInfoSnapshot = {
        name: formData.name,
        about: formData.about,
        address: formData.address,
        workingHours: formData.workingHours,
        contactPhone: formData.contactPhone,
        contactEmail: formData.contactEmail,
        website: formData.website,
        yearsOfExperience: formData.yearsOfExperience,
        ...(latestLogoUrl ? { logo: latestLogoUrl } : {}),
      }
      setScopedItem('businessInfo', JSON.stringify(businessInfoSnapshot))
      setPublicSiteItem('businessInfo', JSON.stringify(businessInfoSnapshot))

      setScopedItem('isPublished', 'true')
      setPublicSiteItem('isPublished', 'true')
    } catch (error) {
      console.error('Failed to save business info to backend:', error)
      showToast({
        type: 'error',
        title: 'Publish failed',
        message: 'Unable to publish right now. Please try again.',
      })
      // Only save to localStorage if backend fails (without logo to avoid quota)
      try {
        const businessInfoToSave = {
          name: formData.name,
          about: formData.about,
          address: formData.address,
          workingHours: formData.workingHours,
          contactPhone: formData.contactPhone,
          contactEmail: formData.contactEmail,
          website: formData.website,
        }
        const fallbackSnapshot = logoUrlForStorage
          ? { ...businessInfoToSave, logo: logoUrlForStorage }
          : businessInfoToSave
        setScopedItem('businessInfo', JSON.stringify(fallbackSnapshot))
        setPublicSiteItem('businessInfo', JSON.stringify(fallbackSnapshot))
      } catch (storageError) {
        console.error('Failed to save business info to localStorage:', storageError)
        // Continue anyway - user can retry
      }
      setIsPublishing(false)
      return
    }

    setIsPublishing(false)
    setIsPublished(true)

    // After publishing, navigate to the appropriate destination
    setTimeout(() => {
      void (async () => {
        if (userType === 'pharmacy') {
          router.push('/dashboard/pharmacy')
          return
        }

        // Hospital users: always redirect to the dashboard.
        // The subdomain URL is shown as a copyable link in the success card.
        router.push('/dashboard/hospital')
      })()
    }, 3000)
  }

  // Fetch subdomain for the success card link
  const [publishedSubdomain, setPublishedSubdomain] = useState<string | null>(null)

  // After publish succeeds, resolve the subdomain to show as a copyable URL
  useEffect(() => {
    if (!isPublished) return
    const fetchSubdomain = async () => {
      try {
        if (userType === 'pharmacy') {
          const profileRes = await pharmacyApi.getProfile()
          if (profileRes.data?.subdomain) {
            setPublishedSubdomain(profileRes.data.subdomain)
          }
        } else if (userType === 'hospital') {
          const token = localStorage.getItem('access_token')
          if (!token) return
          const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000/api` : 'http://localhost:8000/api')
          const res = await fetch(`${API_URL}/hospital/admin/profile/profile/`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            const data = await res.json()
            const subdomain = data.subdomain || data.website_setup?.subdomain
            if (subdomain) setPublishedSubdomain(subdomain)
          }
        }
      } catch {
        // ignore
      }
    }
    void fetchSubdomain()
  }, [isPublished, userType])

  const days = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' },
  ]

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-dark mb-2">Business Information</h1>
        <p className="text-sm sm:text-base text-neutral-gray">Add your business details to complete your website</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Basic Info */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark mb-4 sm:mb-6">Basic Information</h2>
            <div className="space-y-4">
              <Input
                label="Business Name"
                placeholder="Your Hospital or Pharmacy Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <FileUpload
                label="Logo"
                accept="image/*"
                onChange={(file) => {
                  setFormData({ ...formData, logo: file })
                  if (file) {
                    const reader = new FileReader()
                    reader.onloadend = () => {
                      const dataUrl = reader.result as string
                      setLogoPreview(dataUrl)
                        compressImage(dataUrl, 250, 250, 0.75).then((compressed) => {
                          setLogoUrlForStorage(compressed)
                        }).catch(() => {
                          setLogoUrlForStorage(dataUrl)
                        })
                    }
                    reader.readAsDataURL(file)
                  } else {
                    setLogoPreview(null)
                      setLogoUrlForStorage(null)
                  }
                }}
              />
              {normalizedLogoPreview && (
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-sm text-neutral-gray">Logo preview:</span>
                  <div className="h-12 w-12 rounded-md border border-neutral-border overflow-hidden flex items-center justify-center bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={normalizedLogoPreview} alt="Logo preview" className="h-full w-full object-contain" />
                  </div>
                </div>
              )}
              {userType === 'hospital' && (
                <Input
                  label="Years of Experience"
                  type="number"
                  placeholder="e.g. 5"
                  value={formData.yearsOfExperience}
                  onChange={(e) => setFormData({ ...formData, yearsOfExperience: e.target.value })}
                />
              )}
              <Textarea
                label="About"
                placeholder="Tell us about your business..."
                value={formData.about}
                onChange={(e) => setFormData({ ...formData, about: e.target.value })}
                rows={5}
              />
            </div>
          </Card>

          {/* Address & Map */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark mb-4 sm:mb-6">Location</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FiMapPin className="text-primary" />
                <span className="font-medium text-neutral-dark">Address</span>
              </div>
              <Textarea
                placeholder="123 Medical Street, City, State, ZIP Code"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={3}
              />
              {/* Google Map picker */}
              <LocationMapPicker formData={formData} setFormData={setFormData} />
            </div>
          </Card>

          {/* Working Hours */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark mb-4 sm:mb-6">Working Hours</h2>
            <div className="space-y-3 sm:space-y-4">
              {days.map((day) => {
                const dayData = formData.workingHours[day.key as keyof typeof formData.workingHours]
                return (
                  <div key={day.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pb-3 sm:pb-0 border-b border-neutral-border sm:border-b-0 last:border-b-0">
                    <div className="w-full sm:w-24 flex-shrink-0">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!dayData.closed}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              workingHours: {
                                ...formData.workingHours,
                                [day.key]: {
                                  ...dayData,
                                  closed: !e.target.checked,
                                },
                              },
                            })
                          }}
                          className="rounded"
                        />
                        <span className="text-sm font-medium text-neutral-dark">{day.label}</span>
                      </label>
                    </div>
                    {!dayData.closed ? (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 w-full">
                        <Input
                          type="time"
                          value={dayData.open}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              workingHours: {
                                ...formData.workingHours,
                                [day.key]: { ...dayData, open: e.target.value },
                              },
                            })
                          }}
                          className="w-full sm:flex-1"
                        />
                        <span className="text-neutral-gray text-center sm:text-left hidden sm:inline">to</span>
                        <Input
                          type="time"
                          value={dayData.close}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              workingHours: {
                                ...formData.workingHours,
                                [day.key]: { ...dayData, close: e.target.value },
                              },
                            })
                          }}
                          className="w-full sm:flex-1"
                        />
                      </div>
                    ) : (
                      <span className="text-neutral-gray text-sm sm:text-base">Closed</span>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Contact Information */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark mb-4 sm:mb-6">Contact Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Phone"
                type="tel"
                placeholder="01XXXXXXXXX"
                value={formData.contactPhone}
                error={phoneError || undefined}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '')
                  setFormData({ ...formData, contactPhone: value })
                  setPhoneError(validatePhone(value))
                }}
              />
              <Input
                label="Email"
                type="email"
                placeholder="contact@business.com"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              />
            </div>
          </Card>

          {/* Hospital Photos - Only for hospital users */}
          {userType === 'hospital' && (
            <HospitalPhotosSection />
          )}

          {/* Actions */}
          {isPublished ? (
            <Card className="p-8 text-center">
              <FiCheckCircle className="mx-auto text-success mb-4" size={64} />
              <h3 className="text-2xl font-semibold text-neutral-dark mb-2">
                Website Published Successfully!
              </h3>
              <p className="text-neutral-gray mb-4">
                Your website is now live and accessible at:
              </p>
              {publishedSubdomain ? (
                <div className="mb-6 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 bg-primary-light border border-primary/20 rounded-lg px-4 py-2">
                    <FiGlobe className="text-primary flex-shrink-0" />
                    <span className="text-primary font-mono text-sm break-all">
                      {`${window.location.protocol}//${publishedSubdomain}.${
                        window.location.host.startsWith('localhost')
                          ? window.location.host
                          : window.location.host.split('.').slice(1).join('.')
                      }`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.protocol}//${publishedSubdomain}.${
                          window.location.host.startsWith('localhost')
                            ? window.location.host
                            : window.location.host.split('.').slice(1).join('.')
                        }`
                        void navigator.clipboard.writeText(url)
                      }}
                      className="ml-2 text-xs text-primary underline hover:no-underline flex-shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-neutral-gray">Share this URL with patients to access your hospital website.</p>
                </div>
              ) : (
                <p className="text-neutral-gray mb-6">Redirecting to dashboard in a moment...</p>
              )}
            </Card>
          ) : (
            <div className="flex justify-end gap-4">
              <Button variant="secondary" type="button" onClick={handleSaveDraft} disabled={isSavingDraft}>
                {isSavingDraft ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button variant="primary" type="submit" disabled={isPublishing}>
                {isPublishing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Publishing...
                  </>
                ) : (
                  <>
                    <FiGlobe className="mr-2" />
                    Publish Website
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}

