'use client'

import Link from 'next/link'
import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FiArrowLeft, FiCheckCircle, FiShoppingCart } from 'react-icons/fi'
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

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function Template3CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isDemo = searchParams?.get('demo') === '1' || searchParams?.get('demo') === 'true'
  const ownerId = searchParams?.get('owner') || ''
  const cartKey = isDemo ? 'pharmacy3_cart_demo' : 'pharmacy3_cart'

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

  const total = subtotal

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
          : prev.map((i) =>
              i.product.id === productId ? { ...i, quantity: newQuantity } : i,
            )

      if (updated.length === 0) {
        setTimeout(() => router.push(withDemo('/templates/pharmacy/3/medications')), 0)
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
        orderNamespace: 'pharmacy3_order',
        cart,
        total,
        deliveryFee: 0,
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
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-neutral-gray">Loading checkout…</div>
      </div>
    )
  }

  if (cart.length === 0 && !orderPlaced) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-lg border border-neutral-border bg-white p-8 text-center">
          <div className="mx-auto w-10 h-10 rounded-full border border-neutral-border flex items-center justify-center mb-4">
            <FiShoppingCart className="text-neutral-gray" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-dark">Your cart is empty</h1>
          <p className="mt-2 text-neutral-gray text-sm">
            Add products first, then come back to checkout.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={withDemo('/templates/pharmacy/3/medications')}
              className="px-6 py-3 rounded-full bg-neutral-dark text-white hover:bg-black transition-colors text-sm font-medium"
            >
              Browse Products
            </Link>
            <Link
              href={withDemo('/templates/pharmacy/3')}
              className="px-6 py-3 rounded-full border border-neutral-border text-neutral-dark hover:bg-neutral-light transition-colors text-sm font-medium"
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
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-neutral-border p-8 text-center">
          <FiCheckCircle className="mx-auto text-success mb-4" size={48} />
          <h1 className="text-2xl font-bold text-neutral-dark mb-2">Order placed</h1>
          <p className="text-neutral-gray text-sm mb-4">
            Thank you for your order. We&apos;ll contact you soon to confirm the details.
          </p>
          <div className="rounded-md bg-neutral-light py-3 px-4 mb-6 text-sm">
            <div className="text-neutral-gray">Order number</div>
            <div className="mt-1 font-mono text-neutral-dark">{orderNumber}</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={withDemo('/templates/pharmacy/3/medications')}
              className="px-6 py-3 rounded-full border border-neutral-border text-neutral-dark hover:bg-neutral-light transition-colors text-sm font-medium"
            >
              Continue Shopping
            </Link>
            <Link
              href={withDemo('/templates/pharmacy/3')}
              className="px-6 py-3 rounded-full bg-neutral-dark text-white hover:bg-black transition-colors text-sm font-medium"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-border bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-3">
          <Link href={withDemo('/templates/pharmacy/3')} className="flex items-center gap-2 text-sm font-medium text-neutral-dark">
            <FiArrowLeft />
            <span>Back to products</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-neutral-gray">
            <FiShoppingCart />
            <span>{cart.length} items</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-neutral-dark mb-4">
              Delivery & payment information
            </h1>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-white border border-neutral-border rounded-lg p-5 space-y-4">
                <h2 className="text-sm font-semibold text-neutral-dark">Contact details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-2">
                      Full name <span className="text-error">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-2">
                      Email <span className="text-error">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-dark mb-2">
                      Phone <span className="text-error">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-neutral-dark mb-2">
                      Address <span className="text-error">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Street, building, floor, apartment"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:col-span-2">
                    <div>
                      <label className="block text-sm font-medium text-neutral-dark mb-2">
                        City <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-dark mb-2">
                        State <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="State"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-dark mb-2">
                        ZIP code
                      </label>
                      <input
                        type="text"
                        value={formData.zipCode}
                        onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-neutral-border rounded-lg p-5 space-y-4">
                <h2 className="text-sm font-semibold text-neutral-dark">Delivery method</h2>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, deliveryMethod: 'delivery' })}
                    className={`p-3 rounded-md border text-sm text-left transition-colors ${
                      formData.deliveryMethod === 'delivery'
                        ? 'border-primary bg-primary-light/30'
                        : 'border-neutral-border hover:bg-neutral-light'
                    }`}
                  >
                    <div className="font-medium text-neutral-dark">Home delivery</div>
                    <div className="text-xs text-neutral-gray mt-1">Standard delivery</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, deliveryMethod: 'pickup' })}
                    className={`p-3 rounded-md border text-sm text-left transition-colors ${
                      formData.deliveryMethod === 'pickup'
                        ? 'border-primary bg-primary-light/30'
                        : 'border-neutral-border hover:bg-neutral-light'
                    }`}
                  >
                    <div className="font-medium text-neutral-dark">Store pickup</div>
                    <div className="text-xs text-neutral-gray mt-1">Pick up from pharmacy</div>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-neutral-border rounded-lg p-5 space-y-4">
                <h2 className="text-sm font-semibold text-neutral-dark">Payment method</h2>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentError('')
                      setFormData({ ...formData, paymentMethod: 'cash' })
                    }}
                    className={`p-3 rounded-md border text-sm text-left transition-colors ${
                      formData.paymentMethod === 'cash'
                        ? 'border-primary bg-primary-light/30'
                        : 'border-neutral-border hover:bg-neutral-light'
                    }`}
                  >
                    <div className="font-medium text-neutral-dark">Cash on delivery</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentError('')
                      setFormData({ ...formData, paymentMethod: 'card' })
                    }}
                    className={`p-3 rounded-md border text-sm text-left transition-colors ${
                      formData.paymentMethod === 'card'
                        ? 'border-primary bg-primary-light/30'
                        : 'border-neutral-border hover:bg-neutral-light'
                    }`}
                  >
                    <div className="font-medium text-neutral-dark">Credit / debit card</div>
                  </button>
                </div>

                {formData.paymentMethod === 'card' && (
                  <div className="mt-3 space-y-3 border-t border-neutral-border pt-3">
                    <p className="text-xs text-neutral-gray">
                      Enter your card details to complete checkout securely.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-neutral-dark mb-2">
                          Cardholder name <span className="text-error">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={cardInfo.cardholderName}
                          onChange={(e) => {
                            setPaymentError('')
                            setCardInfo({ ...cardInfo, cardholderName: e.target.value })
                          }}
                          className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Name on card"
                          autoComplete="cc-name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-dark mb-2">
                          Card number <span className="text-error">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          value={cardInfo.cardNumber}
                          onChange={(e) => {
                            setPaymentError('')
                            setCardInfo({ ...cardInfo, cardNumber: formatCardNumber(e.target.value) })
                          }}
                          className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="1234 5678 9012 3456"
                          autoComplete="cc-number"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-neutral-dark mb-2">
                            Expiry (MM/YY) <span className="text-error">*</span>
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            required
                            value={cardInfo.expiry}
                            onChange={(e) => {
                              setPaymentError('')
                              setCardInfo({ ...cardInfo, expiry: formatExpiry(e.target.value) })
                            }}
                            className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="MM/YY"
                            autoComplete="cc-exp"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-neutral-dark mb-2">
                            CVC <span className="text-error">*</span>
                          </label>
                          <input
                            type="password"
                            inputMode="numeric"
                            required
                            value={cardInfo.cvc}
                            onChange={(e) => {
                              setPaymentError('')
                              setCardInfo({ ...cardInfo, cvc: formatCvc(e.target.value) })
                            }}
                            className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="123"
                            autoComplete="cc-csc"
                          />
                        </div>
                      </div>
                    </div>
                    {paymentError ? <p className="text-sm text-error">{paymentError}</p> : null}
                  </div>
                )}
              </div>

              <div className="bg-white border border-neutral-border rounded-lg p-5">
                <label className="block text-sm font-medium text-neutral-dark mb-2">
                  Special instructions (optional)
                </label>
                <textarea
                  value={formData.specialInstructions}
                  onChange={(e) =>
                    setFormData({ ...formData, specialInstructions: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-neutral-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                  rows={3}
                  placeholder="Any notes for the courier or pharmacy team..."
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 rounded-full bg-neutral-dark text-white hover:bg-black transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Placing order…' : `Place order - $${total.toFixed(2)}`}
              </button>
            </form>
          </div>

          {/* Summary */}
          <div>
            <div className="bg-white border border-neutral-border rounded-lg p-5 sticky top-4">
              <h2 className="text-lg font-semibold text-neutral-dark mb-4">Order summary</h2>
              <div className="space-y-3 mb-4">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-neutral-dark">
                        {item.product.name}
                      </div>
                      <div className="text-xs text-neutral-gray">
                        {item.product.category}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-gray">
                        x{item.quantity}
                      </div>
                      <div className="font-semibold text-neutral-dark">
                        $
                        {(
                          (parseFloat(item.product.price.replace('$', '')) || 0) *
                          item.quantity
                        ).toFixed(2)}
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="w-5 h-5 rounded-full border border-neutral-border text-[10px] flex items-center justify-center hover:bg-neutral-light"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="w-5 h-5 rounded-full border border-neutral-border text-[10px] flex items-center justify-center hover:bg-neutral-light"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-neutral-border pt-3 mt-2 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-gray">Subtotal</span>
                  <span className="text-neutral-dark">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold mt-2">
                  <span className="text-neutral-dark">Total</span>
                  <span className="text-neutral-dark">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function Template3CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <Template3CheckoutContent />
    </Suspense>
  )
}

