'use client'

import Image from 'next/image'
import Link from 'next/link'
import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FiArrowLeft, FiCheckCircle, FiClock, FiMapPin, FiPhoneCall, FiShoppingCart } from 'react-icons/fi'
import { AIChatbot } from '@/components/pharmacy/AIChatbot'
import { BrandLogo } from '@/components/pharmacy/BrandLogo'
import { submitTemplateOrder } from '@/lib/pharmacyTemplateRuntime'
import { getSiteItem, setSiteItem, removeSiteItem, getStoredUser, getSiteOwnerId, getPrefixForUserId, getItemForUser, setItemForUser, setSiteOwnerId } from '@/lib/storage'

type Product = {
  id: string
  name: string
  category: string
  description?: string
  price: string
  inStock: boolean
  stock?: number
}

type CartItem = {
  product: Product
  quantity: number
}

type DeliveryInfo = {
  fullName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  deliveryMethod: 'pickup' | 'delivery'
  paymentMethod: 'cash' | 'card'
  specialInstructions: string
}

type CardInfo = {
  cardholderName: string
  cardNumber: string
  expiry: string // MM/YY
  cvc: string
}

type BusinessInfo = {
  name?: string
  logo?: string
  contactPhone?: string
  address?: string
}

type PharmacySetup = {
  phone?: string
  address?: string
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function Template2CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isDemo = searchParams?.get('demo') === '1' || searchParams?.get('demo') === 'true'
  const ownerId = searchParams?.get('owner') || ''
  const cartKey = isDemo ? 'pharmacy2_cart_demo' : 'pharmacy2_cart'

  const withDemo = (path: string) => {
    const [base, hash] = path.split('#')
    const [pathname, query = ''] = base.split('?')
    const params = new URLSearchParams(query)
    if (isDemo) params.set('demo', '1')
    if (ownerId) params.set('owner', ownerId)
    const nextQuery = params.toString()
    return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`
  }

  useEffect(() => {
    if (ownerId) {
      setSiteOwnerId(ownerId)
    }
  }, [ownerId])

  const [cart, setCart] = useState<CartItem[]>([])
  const [cartLoaded, setCartLoaded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [orderNumber, setOrderNumber] = useState<string>('')

  const [brand, setBrand] = useState<{ name: string; logo: string | null; phone: string; address: string }>({
    name: isDemo ? 'Classic Pharmacy' : '',
    logo: isDemo ? '/mod logo.png' : null,
    phone: isDemo ? '+1 (555) 234-5678' : '',
    address: isDemo ? '45 Health Avenue, City' : '',
  })

  const [formData, setFormData] = useState<DeliveryInfo>({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    deliveryMethod: 'delivery',
    paymentMethod: 'cash',
    specialInstructions: '',
  })

  const [cardInfo, setCardInfo] = useState<CardInfo>({
    cardholderName: '',
    cardNumber: '',
    expiry: '',
    cvc: '',
  })
  const [paymentError, setPaymentError] = useState('')

  const digitsOnly = (value: string) => value.replace(/\D+/g, '')
  const formatCardNumber = (value: string) => {
    const digits = digitsOnly(value).slice(0, 19)
    return digits.replace(/(.{4})/g, '$1 ').trim()
  }
  const formatExpiry = (value: string) => {
    const digits = digitsOnly(value).slice(0, 4)
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }
  const formatCvc = (value: string) => digitsOnly(value).slice(0, 4)

  useEffect(() => {
    if (isDemo) return
    const businessInfo = safeJsonParse<BusinessInfo>(getSiteItem('businessInfo'))
    const setup = safeJsonParse<PharmacySetup>(getSiteItem('pharmacySetup'))
    setBrand({
      name: businessInfo?.name?.trim() || '',
      logo: businessInfo?.logo || null,
      phone: businessInfo?.contactPhone || setup?.phone || '',
      address: businessInfo?.address || setup?.address || '',
    })
  }, [isDemo])

  useEffect(() => {
    const raw = isDemo ? localStorage.getItem(cartKey) : getSiteItem(cartKey)
    const savedCart = safeJsonParse<CartItem[]>(raw)
    if (savedCart && savedCart.length > 0) setCart(savedCart)
    else setCart([])
    setCartLoaded(true)
  }, [router, cartKey, isDemo])

  useEffect(() => {
    if (!cartLoaded) return
    if (cart.length > 0) {
      if (isDemo) localStorage.setItem(cartKey, JSON.stringify(cart))
      else setSiteItem(cartKey, JSON.stringify(cart))
    } else {
      if (isDemo) localStorage.removeItem(cartKey)
      else removeSiteItem(cartKey)
    }
  }, [cart, cartKey, cartLoaded, isDemo])

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const price = parseFloat(item.product.price.replace('$', '')) || 0
      return sum + price * item.quantity
    }, 0)
  }, [cart])

  const deliveryFee = useMemo(() => (formData.deliveryMethod === 'delivery' ? 5.99 : 0), [formData.deliveryMethod])
  const total = useMemo(() => subtotal + deliveryFee, [subtotal, deliveryFee])

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.product.id === productId)
      if (!item) return prev

      const newQuantity = item.quantity + delta
      if (delta > 0 && item.product.stock !== undefined && newQuantity > item.product.stock) {
        alert(`Sorry, only ${item.product.stock} units of ${item.product.name} are available in stock.`)
        return prev
      }
      const updated =
        newQuantity <= 0
          ? prev.filter((i) => i.product.id !== productId)
          : prev.map((i) => (i.product.id === productId ? { ...i, quantity: newQuantity } : i))

      if (updated.length === 0) {
        setTimeout(() => router.push(withDemo('/templates/pharmacy/2/medications')), 0)
      }
      return updated
    })
  }

  const removeItem = (productId: string) => {
    setCart((prev) => {
      const updated = prev.filter((i) => i.product.id !== productId)
      if (updated.length === 0) {
        setTimeout(() => router.push(withDemo('/templates/pharmacy/2/medications')), 0)
      }
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPaymentError('')

    if (formData.paymentMethod === 'card') {
      const cardNumberDigits = digitsOnly(cardInfo.cardNumber)
      const expiry = cardInfo.expiry.trim()
      const cvc = digitsOnly(cardInfo.cvc)

      const expiryMatch = /^(\d{2})\/(\d{2})$/.exec(expiry)
      const month = expiryMatch ? Number(expiryMatch[1]) : 0
      const year2 = expiryMatch ? Number(expiryMatch[2]) : -1
      const isExpiryValid = Boolean(expiryMatch) && month >= 1 && month <= 12 && year2 >= 0

      const isCardNumberValid = cardNumberDigits.length >= 13 && cardNumberDigits.length <= 19
      const isCvcValid = cvc.length >= 3 && cvc.length <= 4
      const isNameValid = cardInfo.cardholderName.trim().length >= 2

      if (!isNameValid || !isCardNumberValid || !isExpiryValid || !isCvcValid) {
        setPaymentError('Please enter valid card details (name, card number, expiry MM/YY, and CVC).')
        return
      }
    }

    setIsSubmitting(true)

    try {
      const result = await submitTemplateOrder({
        isDemo,
        orderNamespace: 'pharmacy2_order',
        cart,
        total,
        deliveryFee,
        deliveryInfo: formData,
        payment:
          formData.paymentMethod === 'card'
            ? { method: 'card', last4: digitsOnly(cardInfo.cardNumber).slice(-4) }
            : { method: 'cash' },
      })

      setOrderNumber(result.orderNumber)

      if (isDemo) localStorage.removeItem(cartKey)
      else removeSiteItem(cartKey)
      setCart([])
      setOrderPlaced(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not place order. Please try again.'
      setPaymentError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!cartLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-amber-50 flex items-center justify-center p-6">
        <div className="text-neutral-gray">Loading checkout…</div>
      </div>
    )
  }

  if (cart.length === 0 && !orderPlaced) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-amber-50 flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-2xl border border-neutral-border bg-white p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
            <FiShoppingCart className="text-[#7a5c2e]" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-dark">Your cart is empty</h1>
          <p className="mt-2 text-neutral-gray">
            Add products first, then come back to checkout.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={withDemo('/templates/pharmacy/2/medications')}
              className="px-6 py-3 rounded-lg bg-[#7a5c2e] text-white hover:bg-[#624824] transition-colors font-semibold"
            >
              Browse Products
            </Link>
            <Link
              href={withDemo('/templates/pharmacy/2')}
              className="px-6 py-3 rounded-lg border border-neutral-border text-neutral-dark hover:bg-neutral-light transition-colors font-semibold"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-amber-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8 text-center border border-neutral-border">
          <FiCheckCircle className="mx-auto text-success mb-4" size={64} />
          <h1 className="text-3xl font-bold text-neutral-dark mb-2">Order Placed Successfully!</h1>
          <p className="text-neutral-gray mb-6">Thank you for your order. We’ll contact you shortly.</p>
          <div className="bg-neutral-light rounded-lg p-6 mb-6">
            <p className="text-sm text-neutral-gray mb-2">Order Number</p>
            <p className="text-2xl font-bold text-amber-800">{orderNumber}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={withDemo('/templates/pharmacy/2/medications')}
              className="px-6 py-3 rounded-lg border border-neutral-border text-neutral-dark hover:bg-neutral-light transition-colors"
            >
              Continue Shopping
            </Link>
            <Link
              href={withDemo('/templates/pharmacy/2')}
              className="px-6 py-3 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-amber-50">
      {/* Top bar */}
      <div className="bg-neutral-dark text-white">
        <div className="mx-auto max-w-7xl px-4 py-2 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-sm">
          <div className="flex items-center gap-2">
            <FiClock className="text-amber-300" />
            <span>{isDemo ? 'Mon–Sat 09:00–19:00' : ''}</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {brand.phone && (
              <>
                <a className="inline-flex items-center gap-2 hover:text-amber-300 transition-colors" href={`tel:${brand.phone}`}>
                  <FiPhoneCall />
                  <span>{brand.phone}</span>
                </a>
                {brand.address && <span className="hidden sm:inline opacity-60">•</span>}
              </>
            )}
            {brand.address && (
              <div className="inline-flex items-center gap-2">
                <FiMapPin className="text-amber-300" />
                <span className="truncate max-w-[28rem]">{brand.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-neutral-border/50 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-3">
          <Link href={withDemo('/templates/pharmacy/2')} className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center overflow-hidden border border-amber-200">
              {isDemo ? (
                <Image src="/mod logo.png" alt="Logo" width={48} height={48} className="object-cover" />
              ) : (
                <BrandLogo
                  src={brand.logo}
                  alt={`${brand.name || 'Pharmacy'} logo`}
                  fallbackText={brand.name || 'P'}
                  imageClassName="w-full h-full object-cover"
                  fallbackClassName="w-full h-full bg-amber-700 flex items-center justify-center text-white font-bold"
                />
              )}
            </div>
            <div className="leading-tight">
              <div className="font-bold text-neutral-dark text-lg">{brand.name || (isDemo ? 'Classic Pharmacy' : 'Pharmacy')}</div>
              <div className="text-xs text-neutral-gray">Checkout</div>
            </div>
          </Link>
          <Link
            href={withDemo('/templates/pharmacy/2/medications')}
            className="text-sm text-neutral-gray hover:text-amber-700 transition-colors flex items-center gap-2 font-medium"
          >
            <FiArrowLeft />
            <span>Back to Products</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-neutral-dark mb-6">Delivery Information</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-white rounded-2xl border border-neutral-border p-6 space-y-4">
                <h3 className="font-semibold text-neutral-dark">Contact Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-2">Full Name <span className="text-error">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-2">Email <span className="text-error">*</span></label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-2">Phone <span className="text-error">*</span></label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                      placeholder="+1 (555) 234-5678"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-neutral-border p-6 space-y-4">
                <h3 className="font-semibold text-neutral-dark">Delivery Address</h3>
                <div>
                  <label className="block text-sm font-medium text-neutral-dark mb-2">Street Address <span className="text-error">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                    placeholder="123 Main Street"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-2">City <span className="text-error">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-2">State <span className="text-error">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                      placeholder="State"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-2">ZIP Code</label>
                    <input
                      type="text"
                      value={formData.zipCode}
                      onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                      className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-neutral-border p-6 space-y-4">
                <h3 className="font-semibold text-neutral-dark">Delivery & Payment</h3>

                <div>
                  <label className="block text-sm font-medium text-neutral-dark mb-3">Delivery Method <span className="text-error">*</span></label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, deliveryMethod: 'delivery' })}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        formData.deliveryMethod === 'delivery'
                          ? 'border-amber-700 bg-amber-50'
                          : 'border-neutral-border hover:bg-neutral-light'
                      }`}
                    >
                      <div className="font-medium text-neutral-dark">Home Delivery</div>
                      <div className="text-xs text-neutral-gray mt-1">$5.99 delivery fee</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, deliveryMethod: 'pickup' })}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        formData.deliveryMethod === 'pickup'
                          ? 'border-amber-700 bg-amber-50'
                          : 'border-neutral-border hover:bg-neutral-light'
                      }`}
                    >
                      <div className="font-medium text-neutral-dark">Store Pickup</div>
                      <div className="text-xs text-neutral-gray mt-1">Free pickup</div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-dark mb-3">Payment Method <span className="text-error">*</span></label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentError('')
                        setFormData({ ...formData, paymentMethod: 'cash' })
                      }}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        formData.paymentMethod === 'cash'
                          ? 'border-amber-700 bg-amber-50'
                          : 'border-neutral-border hover:bg-neutral-light'
                      }`}
                    >
                      <div className="font-medium text-neutral-dark">Cash on Delivery</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentError('')
                        setFormData({ ...formData, paymentMethod: 'card' })
                      }}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        formData.paymentMethod === 'card'
                          ? 'border-amber-700 bg-amber-50'
                          : 'border-neutral-border hover:bg-neutral-light'
                      }`}
                    >
                      <div className="font-medium text-neutral-dark">Credit/Debit Card</div>
                    </button>
                  </div>
                </div>

                {formData.paymentMethod === 'card' && (
                  <div className="rounded-xl border border-neutral-border bg-neutral-light/40 p-4">
                    <div className="font-semibold text-neutral-dark mb-1">Card Details</div>
                    <div className="text-xs text-neutral-gray mb-4">Enter your card details to complete checkout securely.</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-neutral-dark mb-2">Cardholder Name <span className="text-error">*</span></label>
                        <input
                          type="text"
                          required
                          value={cardInfo.cardholderName}
                          onChange={(e) => {
                            setPaymentError('')
                            setCardInfo({ ...cardInfo, cardholderName: e.target.value })
                          }}
                          className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                          placeholder="Name on card"
                          autoComplete="cc-name"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-neutral-dark mb-2">Card Number <span className="text-error">*</span></label>
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          value={cardInfo.cardNumber}
                          onChange={(e) => {
                            setPaymentError('')
                            setCardInfo({ ...cardInfo, cardNumber: formatCardNumber(e.target.value) })
                          }}
                          className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                          placeholder="1234 5678 9012 3456"
                          autoComplete="cc-number"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-dark mb-2">Expiry (MM/YY) <span className="text-error">*</span></label>
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          value={cardInfo.expiry}
                          onChange={(e) => {
                            setPaymentError('')
                            setCardInfo({ ...cardInfo, expiry: formatExpiry(e.target.value) })
                          }}
                          className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                          placeholder="MM/YY"
                          autoComplete="cc-exp"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-dark mb-2">CVC <span className="text-error">*</span></label>
                        <input
                          type="password"
                          inputMode="numeric"
                          required
                          value={cardInfo.cvc}
                          onChange={(e) => {
                            setPaymentError('')
                            setCardInfo({ ...cardInfo, cvc: formatCvc(e.target.value) })
                          }}
                          className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                          placeholder="123"
                          autoComplete="cc-csc"
                        />
                      </div>
                    </div>
                    {paymentError ? <p className="mt-3 text-sm text-error">{paymentError}</p> : null}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-neutral-dark mb-2">Special Instructions (Optional)</label>
                  <textarea
                    value={formData.specialInstructions}
                    onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
                    className="w-full px-4 py-2 border border-neutral-border rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                    rows={3}
                    placeholder="Any special delivery instructions or notes..."
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-4 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Placing Order...' : `Place Order - $${total.toFixed(2)}`}
              </button>
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-neutral-border p-6 sticky top-4">
              <h3 className="text-xl font-bold text-neutral-dark mb-6">Order Summary</h3>
              <div className="space-y-4 mb-6">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-start justify-between gap-3 pb-4 border-b border-neutral-border last:border-b-0">
                    <div className="flex-1">
                      <div className="font-medium text-neutral-dark text-sm">{item.product.name}</div>
                      <div className="text-xs text-neutral-gray">{item.product.category}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          aria-label="Decrease quantity"
                          className="w-6 h-6 rounded border border-neutral-border flex items-center justify-center text-xs hover:bg-neutral-light"
                        >
                          −
                        </button>
                        <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, 1)}
                          aria-label="Increase quantity"
                          className="w-6 h-6 rounded border border-neutral-border flex items-center justify-center text-xs hover:bg-neutral-light"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.product.id)}
                          className="ml-2 text-xs text-error hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-neutral-dark">
                        ${(parseFloat(item.product.price.replace('$', '')) * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-6 pt-4 border-t border-neutral-border">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-gray">Subtotal</span>
                  <span className="text-neutral-dark">${subtotal.toFixed(2)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-gray">Delivery Fee</span>
                    <span className="text-neutral-dark">${deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-neutral-border">
                  <span className="text-neutral-dark">Total</span>
                  <span className="text-amber-800">${total.toFixed(2)}</span>
                </div>
              </div>

              <Link href={withDemo('/templates/pharmacy/2/medications')} className="block text-center text-sm text-amber-700 hover:underline">
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>

      <AIChatbot pharmacyName={brand.name || (isDemo ? 'Classic Pharmacy' : 'Pharmacy')} pharmacyPhone={brand.phone || ''} />
    </div>
  )
}

export default function Template2CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <Template2CheckoutContent />
    </Suspense>
  )
}

