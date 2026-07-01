'use client'

import Link from 'next/link'
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  FiArrowLeft,
  FiCheckCircle,
  FiCreditCard,
  FiMinus,
  FiPlus,
  FiShield,
  FiShoppingCart,
} from 'react-icons/fi'

import {
  buildTemplatePath,
  calculateSubtotal,
  formatPrice,
  getDemoState,
  loadBrandInfo,
  readCart,
  submitTemplateOrder,
  syncSiteOwner,
  type TemplateBrand,
  type TemplateCartItem,
  writeCart,
} from '@/lib/pharmacyTemplateRuntime'

type CheckoutForm = {
  fullName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zipCode: string
  deliveryMethod: 'delivery' | 'pickup'
  paymentMethod: 'cash' | 'card'
  notes: string
}

type CardForm = {
  holder: string
  number: string
  expiry: string
  cvc: string
}

const DEMO_BRAND: TemplateBrand = {
  name: 'AuroraCare Pharmacy',
  logo: '/template-1.jpg',
  about: 'Fast and expressive pharmacy shopping designed for high intent users.',
  phone: '+1 (555) 413-8273',
  address: '78 Emerald Avenue, San Francisco',
  openHours: 'Mon-Sun 08:00-22:00',
}

const INITIAL_FORM: CheckoutForm = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  deliveryMethod: 'delivery',
  paymentMethod: 'cash',
  notes: '',
}

const INITIAL_CARD: CardForm = {
  holder: '',
  number: '',
  expiry: '',
  cvc: '',
}

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '')
}

function formatCardNumber(value: string): string {
  const compact = digitsOnly(value).slice(0, 19)
  return compact.replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(value: string): string {
  const compact = digitsOnly(value).slice(0, 4)
  if (compact.length <= 2) return compact
  return `${compact.slice(0, 2)}/${compact.slice(2)}`
}

function isValidCardForm(card: CardForm): boolean {
  const numberLen = digitsOnly(card.number).length
  const cvcLen = digitsOnly(card.cvc).length
  const expiryMatch = /^(\d{2})\/(\d{2})$/.exec(card.expiry)
  if (!expiryMatch) return false

  const month = Number(expiryMatch[1])
  return (
    card.holder.trim().length >= 2 &&
    numberLen >= 13 &&
    numberLen <= 19 &&
    month >= 1 &&
    month <= 12 &&
    cvcLen >= 3 &&
    cvcLen <= 4
  )
}

function TemplateFourCheckoutContent() {
  const searchParams = useSearchParams()
  const demoState = useMemo(() => getDemoState(searchParams), [searchParams])
  const cartKey = demoState.isDemo ? 'pharmacy4_cart_demo' : 'pharmacy4_cart'

  const withDemo = useCallback(
    (path: string) => buildTemplatePath(path, demoState),
    [demoState],
  )

  const [brand, setBrand] = useState<TemplateBrand>(DEMO_BRAND)
  const [cart, setCart] = useState<TemplateCartItem[]>([])
  const [form, setForm] = useState<CheckoutForm>(INITIAL_FORM)
  const [card, setCard] = useState<CardForm>(INITIAL_CARD)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    syncSiteOwner(demoState.ownerId)
  }, [demoState.ownerId])

  useEffect(() => {
    setBrand(loadBrandInfo(demoState.isDemo, DEMO_BRAND))
  }, [demoState.isDemo])

  useEffect(() => {
    setCart(readCart(cartKey, demoState.isDemo))
  }, [cartKey, demoState.isDemo])

  useEffect(() => {
    writeCart(cartKey, demoState.isDemo, cart)
  }, [cart, cartKey, demoState.isDemo])

  const subtotal = useMemo(() => calculateSubtotal(cart), [cart])
  const deliveryFee = form.deliveryMethod === 'delivery' ? 4.5 : 0
  const total = subtotal + deliveryFee

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const current = prev.find((item) => item.product.id === productId)
      if (!current) return prev

      const nextQty = current.quantity + delta
      if (nextQty <= 0) return prev.filter((item) => item.product.id !== productId)
      if (delta > 0 && current.product.stock !== undefined && nextQty > current.product.stock) {
        alert(`Sorry, only ${current.product.stock} units of ${current.product.name} are available in stock.`)
        return prev
      }

      return prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: nextQty } : item,
      )
    })
  }

  const handlePlaceOrder = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError('')

    if (form.paymentMethod === 'card' && !isValidCardForm(card)) {
      setFormError('Please complete valid card details before placing this order.')
      return
    }

    if (cart.length === 0) {
      setFormError('Your cart is empty.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await submitTemplateOrder({
        isDemo: demoState.isDemo,
        orderNamespace: 'pharmacy4_order',
        cart,
        total,
        deliveryFee,
        deliveryInfo: form,
        payment:
          form.paymentMethod === 'card'
            ? { method: 'card', last4: digitsOnly(card.number).slice(-4) }
            : { method: 'cash' },
      })

      setOrderNumber(result.orderNumber)
      setOrderPlaced(true)
      setCart([])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not place order. Please try again.'
      setFormError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (orderPlaced) {
    return (
      <div className="min-h-screen grid place-items-center bg-[radial-gradient(circle_at_top,_#e9fff8_0%,_#f4fbff_45%,_#ffffff_100%)] px-4">
        <div className="w-full max-w-xl animate-soft-rise rounded-3xl border border-white/70 bg-white/90 p-8 text-center shadow-2xl shadow-primary/15 backdrop-blur">
          <FiCheckCircle className="mx-auto text-emerald-500" size={56} />
          <h1 className="mt-4 text-3xl font-bold text-slate-900">Order confirmed</h1>
          <p className="mt-2 text-slate-600">Thanks for choosing {brand.name || 'AuroraCare Pharmacy'}.</p>
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            Confirmation number: <span className="text-primary">{orderNumber}</span>
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={withDemo('/templates/pharmacy/4/medications')} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Continue shopping
            </Link>
            <Link href={withDemo('/templates/pharmacy/4')} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e9fff8_0%,_#f4fbff_45%,_#ffffff_100%)] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href={withDemo('/templates/pharmacy/4/medications')} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-primary">
            <FiArrowLeft /> Back to catalog
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-light px-3 py-1 text-xs font-semibold text-primary">
            <FiShield /> Secure checkout
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
        <form onSubmit={handlePlaceOrder} className="animate-soft-rise space-y-5 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-100 backdrop-blur">
          <h1 className="text-2xl font-bold text-slate-900">Checkout details</h1>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Full name
              <input
                required
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                placeholder="Alex Morgan"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Email
              <input
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                placeholder="alex@example.com"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Phone
              <input
                required
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                placeholder="+1 555 222 0001"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Address
              <input
                required
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                placeholder="Street, building, unit"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              City
              <input
                required
                value={form.city}
                onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              State
              <input
                required
                value={form.state}
                onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Zip code
              <input
                value={form.zipCode}
                onChange={(event) => setForm((prev) => ({ ...prev, zipCode: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, deliveryMethod: 'delivery' }))}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                form.deliveryMethod === 'delivery'
                  ? 'border-primary/35 bg-white text-primary'
                  : 'border-slate-200 text-slate-600 hover:border-primary/20'
              }`}
            >
              Home delivery (+$4.50)
            </button>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, deliveryMethod: 'pickup' }))}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                form.deliveryMethod === 'pickup'
                  ? 'border-primary/35 bg-white text-primary'
                  : 'border-slate-200 text-slate-600 hover:border-primary/20'
              }`}
            >
              Store pickup
            </button>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, paymentMethod: 'cash' }))}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  form.paymentMethod === 'cash'
                    ? 'border-primary/35 bg-white text-primary'
                    : 'border-slate-200 text-slate-600 hover:border-primary/20'
                }`}
              >
                Cash on delivery
              </button>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, paymentMethod: 'card' }))}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  form.paymentMethod === 'card'
                    ? 'border-primary/35 bg-white text-primary'
                    : 'border-slate-200 text-slate-600 hover:border-primary/20'
                }`}
              >
                Card payment
              </button>
            </div>

            {form.paymentMethod === 'card' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Cardholder name
                  <input
                    required
                    value={card.holder}
                    onChange={(event) => setCard((prev) => ({ ...prev, holder: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                    placeholder="Name on card"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Card number
                  <input
                    required
                    value={card.number}
                    onChange={(event) => setCard((prev) => ({ ...prev, number: formatCardNumber(event.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                    placeholder="1234 5678 9012 3456"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Expiry
                  <input
                    required
                    value={card.expiry}
                    onChange={(event) => setCard((prev) => ({ ...prev, expiry: formatExpiry(event.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                    placeholder="MM/YY"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  CVC
                  <input
                    required
                    value={card.cvc}
                    onChange={(event) => setCard((prev) => ({ ...prev, cvc: digitsOnly(event.target.value).slice(0, 4) }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
                    placeholder="123"
                  />
                </label>
                <p className="sm:col-span-2 text-xs text-slate-500 inline-flex items-center gap-1.5"><FiCreditCard /> Demo payment simulation only.</p>
              </div>
            ) : null}
          </div>

          <label className="text-sm font-medium text-slate-700">
            Delivery notes
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              placeholder="Add landmarks or handling instructions"
            />
          </label>

          {formError ? <p className="text-sm font-medium text-rose-500">{formError}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting || cart.length === 0}
            className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? 'Placing order...' : `Place order · ${formatPrice(total)}`}
          </button>
        </form>

        <aside className="animate-soft-rise [animation-delay:120ms] rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-100 backdrop-blur">
          <h2 className="text-lg font-bold text-slate-900">Order summary</h2>
          <p className="mt-1 text-sm text-slate-500">{brand.name || 'AuroraCare Pharmacy'}</p>

          {cart.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Your cart is empty.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {cart.map((item) => (
                <div key={item.product.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.product.name}</p>
                      <p className="text-xs text-slate-500">{item.product.category}</p>
                    </div>
                    <p className="text-sm font-semibold text-primary">{formatPrice(calculateSubtotal([{ ...item }]))}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQty(item.product.id, -1)}
                      className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-primary/30 hover:text-primary"
                    >
                      <FiMinus size={13} />
                    </button>
                    <span className="min-w-[2rem] text-center text-sm font-semibold text-slate-800">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.product.id, 1)}
                      disabled={(item.product.stock || 0) <= item.quantity}
                      className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-primary/30 hover:text-primary disabled:opacity-50"
                    >
                      <FiPlus size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Delivery</span>
              <span>{formatPrice(deliveryFee)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default function TemplateFourCheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center">Loading...</div>}>
      <TemplateFourCheckoutContent />
    </Suspense>
  )
}
