import {
  getItemForUser,
  getPrefixForUserId,
  getSiteItem,
  getSiteOwnerId,
  getStoredUser,
  removeSiteItem,
  setItemForUser,
  setSiteItem,
  setSiteOwnerId,
} from '@/lib/storage'
import { normalizeRenderableProductImageUrl } from '@/lib/productImage'
import { placePharmacyOrder, type PharmacyOrder } from '@/lib/pharmacyOrders'
import { PHARMACY_PRODUCTS_SYNC_EVENT } from '@/lib/pharmacySheetSync'

export type TemplateDemoState = {
  isDemo: boolean
  ownerId: string
}

export type TemplateProduct = {
  id: string
  name: string
  category: string
  description?: string
  price: string
  inStock: boolean
  stock?: number
  imageUrl?: string
}

export type TemplateCartItem = {
  product: TemplateProduct
  quantity: number
}

export type TemplateBrand = {
  name: string
  logo: string | null
  about: string
  phone: string
  address: string
  openHours: string
}

type SearchParamsLike = {
  get: (key: string) => string | null
} | null | undefined

type PaymentSnapshot =
  | { method: 'cash' }
  | {
      method: 'card'
      last4: string
    }

type OrderRecordParams = {
  isDemo: boolean
  orderNamespace: string
  orderNumber: string
  cart: TemplateCartItem[]
  total: number
  deliveryInfo: Record<string, unknown>
  payment: PaymentSnapshot
}

type SubmitTemplateOrderParams = {
  isDemo: boolean
  orderNamespace: string
  cart: TemplateCartItem[]
  total: number
  deliveryFee?: number
  deliveryInfo: Record<string, unknown>
  payment: PaymentSnapshot
}

type SubmitTemplateOrderResult = {
  orderNumber: string
  duplicate?: boolean
  order?: PharmacyOrder
}

type ProductApiResult = {
  id?: string | number
  name?: string
  category?: string
  description?: string
  price?: string | number
  stock?: number | string | null
  in_stock?: boolean
  image_url?: string
  image_url_resolved?: string
}

type BusinessInfoLike = {
  name?: string
  logo?: string
  about?: string
  address?: string
  contactPhone?: string
  contact_phone?: string
  logo_url?: string
  workingHours?: Record<string, { open?: string; close?: string; closed?: boolean }>
  working_hours?: Record<string, { open?: string; close?: string; closed?: boolean }>
}

type PharmacySetupLike = {
  phone?: string
  address?: string
  products?: Array<{
    id?: string
    name?: string
    category?: string
    description?: string
    price?: string
    inStock?: boolean
    stock?: number | string | null
    imageUrl?: string
    image_url?: string
  }>
}

export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function toBooleanDemo(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized === '1' || normalized === 'true'
}

export function getDemoState(searchParams: SearchParamsLike): TemplateDemoState {
  return {
    isDemo: toBooleanDemo(searchParams?.get('demo')),
    ownerId: (searchParams?.get('owner') || '').trim(),
  }
}

export function buildTemplatePath(path: string, state: TemplateDemoState): string {
  const [base, hash] = path.split('#')
  const [pathname, query = ''] = base.split('?')
  const params = new URLSearchParams(query)

  if (state.isDemo) params.set('demo', '1')
  if (state.ownerId) params.set('owner', state.ownerId)

  const nextQuery = params.toString()
  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`
}

export function syncSiteOwner(ownerId: string): void {
  if (ownerId) {
    setSiteOwnerId(ownerId)
  }
}

export function parsePriceToNumber(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatPrice(value: string | number | null | undefined): string {
  const parsed = Number.parseFloat(String(value ?? 0))
  const safe = Number.isFinite(parsed) ? parsed : 0
  return `$${safe.toFixed(2)}`
}

export function resolveOpenHours(info: BusinessInfoLike): string {
  const hours = info.workingHours || info.working_hours
  if (!hours) return ''

  const DAY_LABELS: Record<string, string> = {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun',
  }

  const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  
  const openDays = order
    .map((day) => {
      const v = hours[day]
      if (!v || v.closed || !v.open || !v.close) return null
      return {
        day,
        label: DAY_LABELS[day] ?? day,
        open: v.open,
        close: v.close,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (openDays.length === 0) return ''

  // Group consecutive days with same hours into ranges
  const groups: { days: string[]; open: string; close: string }[] = []
  for (const d of openDays) {
    const last = groups[groups.length - 1]
    if (last && last.open === d.open && last.close === d.close) {
      last.days.push(d.label)
    } else {
      groups.push({ days: [d.label], open: d.open, close: d.close })
    }
  }

  return groups
    .map((g) => {
      const dayRange =
        g.days.length > 1 ? `${g.days[0]}–${g.days[g.days.length - 1]}` : g.days[0]
      const fmt = (t: string) => {
        const [hStr, mStr] = t.split(':')
        const h = parseInt(hStr, 10)
        if (isNaN(h)) return t
        const m = mStr || '00'
        const ampm = h >= 12 ? 'PM' : 'AM'
        const h12 = h % 12 || 12
        return `${h12}:${m} ${ampm}`
      }
      return `${dayRange}: ${fmt(g.open)} – ${fmt(g.close)}`
    })
    .join(' | ')
}

export function loadBrandInfo(isDemo: boolean, demoBrand: TemplateBrand): TemplateBrand {
  const business = safeJsonParse<BusinessInfoLike>(getSiteItem('businessInfo'))
  const setup = safeJsonParse<PharmacySetupLike>(getSiteItem('pharmacySetup'))

  const hasCustomInfo = Boolean(business?.name || setup?.phone || setup?.address)

  if (isDemo && !hasCustomInfo) {
    return demoBrand
  }

  return {
    name: (business?.name || (isDemo ? demoBrand.name : '')).trim(),
    logo: business?.logo || business?.logo_url || (isDemo ? demoBrand.logo : null),
    about: (business?.about || (isDemo ? demoBrand.about : '')).trim(),
    phone: business?.contactPhone || business?.contact_phone || setup?.phone || (isDemo ? demoBrand.phone : ''),
    address: business?.address || setup?.address || (isDemo ? demoBrand.address : ''),
    openHours: business ? resolveOpenHours(business) || (isDemo ? demoBrand.openHours : '') : (isDemo ? demoBrand.openHours : ''),
  }
}

function normalizeStockValue(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  return 0
}

function mapApiProduct(product: ProductApiResult, index: number): TemplateProduct {
  const stock = normalizeStockValue(product.stock)
  const imageUrl = normalizeRenderableProductImageUrl(product.image_url_resolved || product.image_url || '')
  return {
    id: String(product.id ?? `api-${index}`),
    name: (product.name || 'Unnamed Product').trim(),
    category: (product.category || 'General').trim(),
    description: product.description || '',
    price: formatPrice(product.price),
    inStock: product.in_stock !== false && stock > 0,
    stock,
    imageUrl,
  }
}

function mapLocalProduct(product: NonNullable<PharmacySetupLike['products']>[number], index: number): TemplateProduct {
  const stock = normalizeStockValue(product.stock)
  const productName = (product.name || '').trim()
  const imageUrl = normalizeRenderableProductImageUrl(product.imageUrl || product.image_url || '')

  return {
    id: String(product.id || `user-${index}`),
    name: productName,
    category: (product.category || 'General').trim(),
    description: product.description || '',
    price: formatPrice(product.price),
    inStock: product.inStock !== false && stock > 0,
    stock,
    imageUrl,
  }
}

export async function loadTemplateProducts(
  isDemo: boolean,
  demoProducts: TemplateProduct[],
): Promise<TemplateProduct[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  const setup = safeJsonParse<PharmacySetupLike>(getSiteItem('pharmacySetup'))
  const localProducts = (setup?.products || []).filter((item) => (item.name || '').trim())

  if (isDemo && !token && localProducts.length === 0) {
    return demoProducts
  }

  try {
    if (token) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
      const response = await fetch(`${apiUrl}/pharmacy/products/?sync=1`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const payload = await response.json()
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.results)
            ? payload.results
            : []

        if (list.length > 0) {
          return list.map((item: ProductApiResult, index: number) => mapApiProduct(item, index))
        }
      }
    }
  } catch {
    // Fallback to local storage below
  }

  if (localProducts.length > 0) {
    return localProducts.map((item, index) => mapLocalProduct(item, index))
  }

  return isDemo ? demoProducts : []
}

export function subscribePharmacyProductSync(onSync: () => void) {
  if (typeof window === 'undefined') return () => undefined

  const handler = () => onSync()
  window.addEventListener(PHARMACY_PRODUCTS_SYNC_EVENT, handler)
  return () => window.removeEventListener(PHARMACY_PRODUCTS_SYNC_EVENT, handler)
}

export function loadProductsFromSiteCache(demoProducts: TemplateProduct[]): TemplateProduct[] {
  const setup = safeJsonParse<PharmacySetupLike>(getSiteItem('pharmacySetup'))
  const localProducts = (setup?.products || [])
    .filter((item) => (item.name || '').trim())
    .map((item, index) => mapLocalProduct(item, index))

  return localProducts.length > 0 ? localProducts : demoProducts
}

export function readCart(cartKey: string, isDemo: boolean): TemplateCartItem[] {
  const raw = isDemo ? localStorage.getItem(cartKey) : getSiteItem(cartKey)
  return safeJsonParse<TemplateCartItem[]>(raw) || []
}

export function writeCart(cartKey: string, isDemo: boolean, cart: TemplateCartItem[]): void {
  if (cart.length === 0) {
    if (isDemo) localStorage.removeItem(cartKey)
    else removeSiteItem(cartKey)
    return
  }

  const serialized = JSON.stringify(cart)
  if (isDemo) localStorage.setItem(cartKey, serialized)
  else setSiteItem(cartKey, serialized)
}

export function countCartItems(cart: TemplateCartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0)
}

export function calculateSubtotal(cart: TemplateCartItem[]): number {
  return cart.reduce((sum, item) => {
    return sum + parsePriceToNumber(item.product.price) * item.quantity
  }, 0)
}

export function recordOrderLocally(params: OrderRecordParams): void {
  const { isDemo, orderNamespace, orderNumber, cart, total, deliveryInfo, payment } = params

  const payload = {
    orderNumber,
    items: cart,
    deliveryInfo,
    payment,
    total,
    placedAt: new Date().toISOString(),
  }

  if (isDemo) {
    localStorage.setItem(`${orderNamespace}_${orderNumber}`, JSON.stringify(payload))
    return
  }

  const ownerId = getStoredUser()?.id || getSiteOwnerId()
  if (!ownerId) {
    localStorage.setItem(`${orderNamespace}_${orderNumber}`, JSON.stringify(payload))
    return
  }

  const prefix = getPrefixForUserId(ownerId)
  localStorage.setItem(`${prefix}${orderNamespace}_${orderNumber}`, JSON.stringify(payload))

  try {
    const listRaw = getItemForUser(ownerId, 'pharmacyOrders')
    const list = safeJsonParse<any[]>(listRaw) || []
    list.push({
      id: orderNumber,
      customerName: String(deliveryInfo.fullName || 'Customer').trim() || 'Customer',
      customerEmail: String(deliveryInfo.email || '').trim(),
      total,
      status: 'pending',
      createdAt: payload.placedAt,
      items: cart.map((item) => `${item.product.name}${item.quantity > 1 ? ` x ${item.quantity}` : ''}`),
    })
    setItemForUser(ownerId, 'pharmacyOrders', JSON.stringify(list))
  } catch {
    // Ignore list merge issues; order payload is already persisted.
  }
}

const UUID_V4_OR_ANY_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5]?[0-9a-f]{3}-[89ab]?[0-9a-f]{3}-[0-9a-f]{12}$/i

const readText = (value: unknown): string => String(value || '').trim()

const resolveDeliveryMethod = (value: unknown): 'delivery' | 'pickup' => {
  return String(value || '').toLowerCase() === 'pickup' ? 'pickup' : 'delivery'
}

export async function submitTemplateOrder(params: SubmitTemplateOrderParams): Promise<SubmitTemplateOrderResult> {
  const {
    isDemo,
    orderNamespace,
    cart,
    total,
    deliveryFee = 0,
    deliveryInfo,
    payment,
  } = params

  if (cart.length === 0) {
    throw new Error('Your cart is empty.')
  }

  const generatedOrderNumber = `${orderNamespace.toUpperCase().slice(0, 4)}-${Date.now().toString().slice(-8)}`

  if (isDemo) {
    recordOrderLocally({
      isDemo,
      orderNamespace,
      orderNumber: generatedOrderNumber,
      cart,
      total,
      deliveryInfo,
      payment,
    })

    return { orderNumber: generatedOrderNumber }
  }

  const ownerId = getStoredUser()?.id || getSiteOwnerId()
  if (!ownerId) {
    throw new Error('Could not identify the pharmacy owner. Please refresh and try again.')
  }

  const invalidProductId = cart.find((item) => !UUID_V4_OR_ANY_REGEX.test(item.product.id))
  if (invalidProductId) {
    // When templates are previewed with locally-stored products (e.g. "user-0"),
    // we can't place a backend order that requires UUID product IDs. Fall back to local persistence.
    recordOrderLocally({
      isDemo,
      orderNamespace,
      orderNumber: generatedOrderNumber,
      cart,
      total,
      deliveryInfo,
      payment,
    })

    return { orderNumber: generatedOrderNumber }
  }

  const clientRequestId = `${orderNamespace}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const response = await placePharmacyOrder({
    owner_id: ownerId,
    client_request_id: clientRequestId,
    full_name: readText(deliveryInfo.fullName),
    email: readText(deliveryInfo.email),
    phone: readText(deliveryInfo.phone),
    address: readText(deliveryInfo.address),
    city: readText(deliveryInfo.city),
    state: readText(deliveryInfo.state),
    zip_code: readText(deliveryInfo.zipCode || deliveryInfo.zip_code),
    delivery_method: resolveDeliveryMethod(deliveryInfo.deliveryMethod || deliveryInfo.delivery_method),
    payment_method: payment.method === 'card' ? 'card' : 'cash',
    payment_last4: payment.method === 'card' ? readText(payment.last4).slice(-4) : '',
    notes: readText(deliveryInfo.notes || deliveryInfo.specialInstructions),
    delivery_fee: deliveryFee,
    items: cart.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
    })),
  })

  if (response.error || !response.data?.order) {
    throw new Error(response.error || 'Could not place order. Please try again.')
  }

  const placed = response.data.order
  recordOrderLocally({
    isDemo,
    orderNamespace,
    orderNumber: placed.order_number,
    cart,
    total,
    deliveryInfo,
    payment,
  })

  return {
    orderNumber: placed.order_number,
    duplicate: response.data.duplicate,
    order: placed,
  }
}

export function resolvePharmacyPath(path: string, isDemo?: boolean): string {
  if (typeof window !== 'undefined' && !isDemo) {
    const hostname = window.location.hostname
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000'
    const cleanRoot = rootDomain.replace(':3000', '')
    const isSubdomain = hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== cleanRoot && hostname.includes('.')
    if (isSubdomain) {
      return path.replace(/^\/templates\/pharmacy\/\d+/, '') || '/'
    }
  }
  return path
}
