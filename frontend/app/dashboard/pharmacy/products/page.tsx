'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FiEdit2,
  FiGrid,
  FiList,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiUploadCloud,
  FiLink,
  FiX,
} from 'react-icons/fi'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/ToastProvider'
import { ProductImage } from '@/components/pharmacy/ProductImage'
import {
  pharmacyProductsApi,
  type BulkUploadFailure,
  type PharmacyProduct,
  type PharmacyProductPayload,
  SHEET_SYNC_INTERVAL_MS,
} from '@/lib/pharmacy'
import { persistProductSnapshot, startPharmacyProductPolling } from '@/lib/pharmacySheetSync'
import { setPublicSiteItem, setScopedItem } from '@/lib/storage'
import { FiPackage, FiAlertTriangle } from 'react-icons/fi'

type ConfirmDialog = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
}

type SheetPreviewRow = {
  name: string
  price: number
  category: string
  description: string
  stock?: number
}

type ProductForm = {
  id?: string
  name: string
  price: string
  category: string
  description: string
  stock: string
  image: File | null
  imagePreview: string
  image_url: string
}

const emptyForm: ProductForm = {
  name: '',
  price: '',
  category: '',
  description: '',
  stock: '0',
  image: null,
  imagePreview: '',
  image_url: '',
}

const priceLabel = (value: string) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return numeric.toFixed(2)
}

const normalizeKeyToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')

const getFailureCell = (data: Record<string, string>, aliases: string[]) => {
  for (const alias of aliases) {
    const direct = data[alias]
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim()
    }
  }

  const normalizedAliases = aliases.map((alias) => normalizeKeyToken(alias))
  for (const [key, value] of Object.entries(data || {})) {
    if (normalizedAliases.includes(normalizeKeyToken(key)) && value?.trim()) {
      return value.trim()
    }
  }

  return '-'
}

export default function PharmacyProductsPage() {
  const router = useRouter()
  const { showToast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [products, setProducts] = useState<PharmacyProduct[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [showManualProductForm, setShowManualProductForm] = useState(false)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const [sheetPreviewRows, setSheetPreviewRows] = useState<SheetPreviewRow[]>([])
  const [sheetFailures, setSheetFailures] = useState<BulkUploadFailure[]>([])
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetWebhookUrl, setSheetWebhookUrl] = useState('')
  const [isSheetLoading, setIsSheetLoading] = useState(false)
  const [sheetPreviewCount, setSheetPreviewCount] = useState(0)
  const [sheetSyncEnabled, setSheetSyncEnabled] = useState(false)
  const [sheetLastSyncedAt, setSheetLastSyncedAt] = useState<string | null>(null)
  const [sheetLastPushedAt, setSheetLastPushedAt] = useState<string | null>(null)
  const [sheetWriteConfigured, setSheetWriteConfigured] = useState(false)
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null)

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  })

  const openConfirm = (opts: Omit<ConfirmDialog, 'open'>) =>
    setConfirmDialog({ ...opts, open: true })
  const closeConfirm = () =>
    setConfirmDialog((prev) => ({ ...prev, open: false }))

  const refreshProducts = async (syncFromSheet = false) => {
    const res = await pharmacyProductsApi.list({ sync: syncFromSheet, force: syncFromSheet })
    if (res.error) {
      showToast({ type: 'error', title: 'Could not load products', message: res.error })
      return
    }
    const nextProducts = Array.isArray(res.data) ? res.data : []
    setProducts(nextProducts)
    persistProductSnapshot(nextProducts)
  }

  const loadSheetSyncStatus = async () => {
    const response = await pharmacyProductsApi.getSheetSyncStatus()
    if (response.error || !response.data) return

    setSheetSyncEnabled(Boolean(response.data.google_sheet_sync_enabled))
    setSheetLastSyncedAt(response.data.google_sheet_last_synced_at)
    setSheetLastPushedAt(response.data.google_sheet_last_pushed_at || null)
    setSheetWriteConfigured(Boolean(response.data.google_sheets_write_configured))
    setServiceAccountEmail(response.data.google_service_account_email || null)
    if (response.data.google_sheet_url) {
      setSheetUrl(response.data.google_sheet_url)
    }
    if (response.data.google_sheet_webhook_url) {
      setSheetWebhookUrl(response.data.google_sheet_webhook_url)
    }
  }

  useEffect(() => {
    const userRaw = localStorage.getItem('user')
    if (!userRaw) {
      router.push('/login')
      return
    }

    try {
      const user = JSON.parse(userRaw)
      if ((user.businessType || user.business_type) !== 'pharmacy') {
        router.push('/dashboard')
        return
      }
    } catch {
      router.push('/dashboard')
      return
    }

    const load = async () => {
      setIsLoading(true)
      await loadSheetSyncStatus()
      await refreshProducts(false)
      setIsLoading(false)
    }

    void load()
  }, [router])

  useEffect(() => {
    if (!sheetSyncEnabled) return

    return startPharmacyProductPolling({
      enabled: true,
      authenticated: true,
      onProducts: (nextProducts) => {
        setProducts(nextProducts)
        void loadSheetSyncStatus()
      },
      intervalMs: SHEET_SYNC_INTERVAL_MS,
    })
  }, [sheetSyncEnabled])

  const categories = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : []
    const unique = Array.from(new Set(safeProducts.map((product) => product.category).filter(Boolean)))
    return ['all', ...unique]
  }, [products])

  const filteredProducts = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : []
    return safeProducts.filter((product) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        !searchText ||
        product.name.toLowerCase().includes(searchText) ||
        product.category.toLowerCase().includes(searchText) ||
        product.description.toLowerCase().includes(searchText)
      const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [products, search, selectedCategory])

  const totalProducts = products.length
  const outOfStockCount = useMemo(
    () => products.filter((product) => product.stock <= 0).length,
    [products],
  )
  const lowStockCount = useMemo(
    () => products.filter((product) => product.stock > 0 && product.stock <= 4).length,
    [products],
  )

  const getProductImage = (product: PharmacyProduct) => {
    const nextImage = product.image_url || product.image || ''
    return nextImage.trim()
  }

  const ProductAvatar = ({ product }: { product: PharmacyProduct }) => {
    const imageUrl = getProductImage(product)

    return imageUrl ? (
      <ProductImage
        src={imageUrl}
        alt={product.name}
        className="h-12 w-12 rounded-xl object-cover"
        fallbackClassName="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"
        fallbackLabel={product.name}
      />
    ) : (
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
        <FiPackage className="text-lg" />
      </div>
    )
  }

  const resetForm = () => {
    setForm(emptyForm)
    setFormErrors({})
  }

  const openManualProductForm = () => {
    setShowManualProductForm(true)
  }

  const closeManualProductForm = () => {
    if (isSaving) return
    resetForm()
    setShowManualProductForm(false)
  }

  const validateForm = () => {
    const nextErrors: Record<string, string> = {}

    if (!form.name.trim()) nextErrors.name = 'Name is required.'
    if (!form.category.trim()) nextErrors.category = 'Category is required.'

    const price = Number(form.price)
    if (!form.price.trim()) {
      nextErrors.price = 'Price is required.'
    } else if (!Number.isFinite(price) || price < 0) {
      nextErrors.price = 'Enter a valid non-negative price.'
    }

    const stock = Number.parseInt(form.stock, 10)
    if (Number.isNaN(stock) || stock < 0) {
      nextErrors.stock = 'Stock must be a non-negative integer.'
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const buildPayload = (): PharmacyProductPayload => ({
    name: form.name.trim(),
    category: form.category.trim(),
    description: form.description.trim(),
    image: form.image,
    image_url: form.image_url.trim(),
    price: Number(form.price),
    stock: Number.parseInt(form.stock, 10),
  })

  const handleSubmitProduct = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validateForm()) return

    setIsSaving(true)

    try {
      const payload = buildPayload()
      const response = form.id
        ? await pharmacyProductsApi.update(form.id, payload)
        : await pharmacyProductsApi.create(payload)

      if (response.error) {
        throw new Error(response.error)
      }

      await refreshProducts(false)
      resetForm()
      setShowManualProductForm(false)
      showToast({
        type: 'success',
        title: form.id ? 'Product updated' : 'Product created',
        message: `${payload.name} saved successfully.`,
      })
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Could not save product.'
      showToast({ type: 'error', title: 'Save failed', message: errorText })
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (product: PharmacyProduct) => {
    setForm({
      id: product.id,
      name: product.name,
      category: product.category,
      description: product.description || '',
      price: product.price,
      stock: String(product.stock),
      image: null,
      imagePreview: product.image_url_resolved || '',
      image_url: product.image_url || '',
    })
    setShowManualProductForm(true)
  }

  const handleDelete = (product: PharmacyProduct) => {
    openConfirm({
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const res = await pharmacyProductsApi.remove(product.id)
        if (res.error) {
          showToast({ type: 'error', title: 'Delete failed', message: res.error })
          return
        }
        await refreshProducts(false)
        showToast({ type: 'success', title: 'Product deleted', message: `${product.name} was removed.` })
      },
    })
  }

  const handleLoadSheetPreview = async () => {
    const trimmedUrl = sheetUrl.trim()
    if (!trimmedUrl) {
      showToast({ type: 'error', title: 'Sheet URL required', message: 'Paste your Google Sheet or Drive share link.' })
      return
    }

    setIsSheetLoading(true)
    setSheetPreviewRows([])
    setSheetFailures([])
    setSheetPreviewCount(0)

    try {
      const response = await pharmacyProductsApi.bulkUploadFromSheet(trimmedUrl, true)
      if (response.error || !response.data) {
        throw new Error(response.error || 'Could not load the Google Sheet.')
      }

      const preview = response.data as {
        preview_count?: number
        failed_rows?: BulkUploadFailure[]
        preview_rows?: Array<{ name: string; category: string; price: string; stock: number }>
      }

      const previewRows = (preview.preview_rows || []).map((row) => ({
        name: row.name,
        category: row.category,
        price: Number(row.price),
        description: '',
        stock: row.stock,
      }))

      setSheetPreviewRows(previewRows)
      setSheetFailures(preview.failed_rows || [])
      setSheetPreviewCount(preview.preview_count || previewRows.length)

      if ((preview.preview_count || 0) === 0) {
        showToast({
          type: 'error',
          title: 'No valid rows found',
          message: preview.failed_rows?.[0]?.errors.join(', ') || 'Check your sheet columns and values.',
        })
        return
      }

      showToast({
        type: 'info',
        title: 'Google Sheet preview ready',
        message: `${preview.preview_count} valid rows detected before import.`,
      })
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Could not load the Google Sheet.'
      showToast({ type: 'error', title: 'Sheet load failed', message: errorText })
    } finally {
      setIsSheetLoading(false)
    }
  }

  const handleConnectLiveSync = async () => {
    const trimmedUrl = sheetUrl.trim()
    if (!trimmedUrl) return

    setIsSheetLoading(true)

    try {
      const response = await pharmacyProductsApi.connectGoogleSheet(trimmedUrl, sheetWebhookUrl.trim())
      if (response.error || !response.data) {
        throw new Error(response.error || 'Could not connect live sync.')
      }

      setSheetSyncEnabled(true)
      setSheetLastSyncedAt(response.data.google_sheet_last_synced_at || null)
      setSheetLastPushedAt(response.data.google_sheet_last_pushed_at || null)
      setSheetWriteConfigured(Boolean(response.data.google_sheets_write_configured))
      await refreshProducts(true)

      showToast({
        type: 'success',
        title: 'Live sync connected',
        message: response.data.google_sheets_write_configured
          ? 'Two-way sync is on. Sheet and Medify will stay in sync every ~15 seconds.'
          : 'Sheet → Medify sync is on. Configure the Google service account on the backend to push Medify edits back to the sheet.',
      })
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Could not connect live sync.'
      showToast({ type: 'error', title: 'Connect failed', message: errorText })
    } finally {
      setIsSheetLoading(false)
    }
  }

  const handleDisconnectSheet = () => {
    openConfirm({
      title: 'Disconnect Google Sheet',
      message: 'Disconnect live Google Sheet sync? Products already synced will remain in Medify.',
      confirmLabel: 'Disconnect',
      danger: true,
      onConfirm: async () => {
        setIsSheetLoading(true)
        try {
          const response = await pharmacyProductsApi.disconnectGoogleSheet()
          if (response.error) throw new Error(response.error)
          setSheetSyncEnabled(false)
          setSheetLastSyncedAt(null)
          showToast({ type: 'success', title: 'Live sync disconnected', message: 'Google Sheet is no longer syncing automatically.' })
        } catch (error) {
          const errorText = error instanceof Error ? error.message : 'Could not disconnect live sync.'
          showToast({ type: 'error', title: 'Disconnect failed', message: errorText })
        } finally {
          setIsSheetLoading(false)
        }
      },
    })
  }

  const handleDeleteAll = () => {
    openConfirm({
      title: 'Clear Entire Catalog',
      message: 'Delete ALL products from your catalog? This cannot be undone.',
      confirmLabel: 'Delete All',
      danger: true,
      onConfirm: async () => {
        const response = await pharmacyProductsApi.deleteAll()
        if (response.error) {
          showToast({ type: 'error', title: 'Delete all failed', message: response.error })
          return
        }
        setProducts([])
        setScopedItem('pharmacySetup', JSON.stringify({ products: [] }))
        setPublicSiteItem('pharmacySetup', JSON.stringify({ products: [] }))
        showToast({ type: 'success', title: 'Catalog cleared', message: 'All pharmacy products were deleted.' })
      },
    })
  }

  /* ── Custom confirm dialog component ─────────────────────────────────── */
  const ConfirmDialogUI = confirmDialog.open ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeConfirm}
      />
      {/* Modal card */}
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-neutral-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top accent bar */}
        <div className={`h-1 w-full ${confirmDialog.danger ? 'bg-gradient-to-r from-red-400 to-rose-500' : 'bg-gradient-to-r from-primary to-primary/70'}`} />

        <div className="p-6">
          {/* Icon + title */}
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 flex h-11 w-11 items-center justify-center rounded-full ${
              confirmDialog.danger ? 'bg-red-50 text-red-500' : 'bg-primary-light text-primary'
            }`}>
              <FiAlertTriangle size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-neutral-dark leading-tight">{confirmDialog.title}</h3>
              <p className="mt-1.5 text-sm text-neutral-gray leading-relaxed">{confirmDialog.message}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-3 justify-end">
            <button
              onClick={closeConfirm}
              className="px-4 py-2 rounded-xl text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { closeConfirm(); confirmDialog.onConfirm() }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all ${
                confirmDialog.danger
                  ? 'bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 shadow-sm shadow-red-200'
                  : 'bg-gradient-to-r from-primary to-primary/80 hover:opacity-90'
              }`}
            >
              {confirmDialog.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="space-y-6">
      {ConfirmDialogUI}
      <section className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary-light via-white to-neutral-light p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-dark">Product Management</h1>
            <p className="text-neutral-gray mt-1">Sync from Google Sheet, add products manually, and manage your catalog.</p>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-white/80 px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">Visible Results</p>
            <p className="text-lg font-bold text-neutral-dark">{filteredProducts.length}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-primary/20 bg-white/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">Total Products</p>
            <p className="mt-1 text-lg font-bold text-neutral-dark">{totalProducts}</p>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-white/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-gray">Categories</p>
            <p className="mt-1 text-lg font-bold text-neutral-dark">{Math.max(0, categories.length - 1)}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Low Stock</p>
            <p className="mt-1 text-lg font-bold text-amber-700">{lowStockCount}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Out of Stock</p>
            <p className="mt-1 text-lg font-bold text-red-700">{outOfStockCount}</p>
          </div>
        </div>
      </section>

      <Card className="p-6">
        <h2 className="text-xl font-semibold text-neutral-dark">Google Sheet Sync</h2>
        <p className="mt-1 text-sm text-neutral-gray">
          Required columns: Product Name, Category, Price, Stock Quantity, Description. Optional: Image, image_url, or Image Link.
        </p>

        <div className="mt-6 rounded-2xl border border-neutral-border bg-neutral-light/40 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-dark">Live Google Sheet Sync (two-way)</h3>
              <p className="mt-1 text-sm text-neutral-gray">
                Share your sheet as &quot;Anyone with the link can edit&quot; (or view). Sheet edits flow into Medify every ~15 seconds.
                To push Medify edits back to the sheet, add the optional Apps Script webhook below — no Google Cloud setup required.
              </p>
            </div>
            {sheetSyncEnabled ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                {sheetWriteConfigured ? 'Two-way sync active' : 'Sheet → Medify active'}
              </span>
            ) : null}
          </div>
          {!sheetSyncEnabled ? (
            <div className="mt-3 space-y-3">
              <Input
                label="Apps Script webhook URL (optional — for Medify → Sheet)"
                value={sheetWebhookUrl}
                onChange={(event) => setSheetWebhookUrl(event.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
              />
              <p className="text-xs text-neutral-gray">
                One-time setup: open your sheet → Extensions → Apps Script → paste the code from{' '}
                <a href="/medify-sheet-sync.gs.txt" download className="font-medium text-primary underline underline-offset-2">
                  medify-sheet-sync.gs.txt
                </a>
                {' '}→ Deploy → Web app → Execute as Me → Anyone can access → copy the deployment URL here.
              </p>
            </div>
          ) : null}
          {sheetSyncEnabled && !sheetWriteConfigured ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Your sheet is set to anyone can edit, so Sheet → Medify works. To also push Medify edits back,
              disconnect and reconnect with an Apps Script webhook URL, or configure a Google service account on the backend.
            </p>
          ) : null}
          {sheetSyncEnabled && sheetWriteConfigured && serviceAccountEmail && !sheetWebhookUrl ? (
            <p className="mt-2 text-xs text-neutral-gray">
              Share your sheet with <span className="font-mono text-neutral-dark">{serviceAccountEmail}</span> as Editor so Medify can write changes back.
            </p>
          ) : null}
          {sheetSyncEnabled && sheetWriteConfigured && sheetWebhookUrl ? (
            <p className="mt-2 text-xs text-neutral-gray">
              Medify → Sheet writes use your Apps Script webhook.
            </p>
          ) : null}
          {sheetSyncEnabled && sheetLastSyncedAt ? (
            <p className="mt-2 text-xs text-neutral-gray">
              Last pulled from sheet: {new Date(sheetLastSyncedAt).toLocaleString()}
            </p>
          ) : null}
          {sheetSyncEnabled && sheetLastPushedAt ? (
            <p className="mt-1 text-xs text-neutral-gray">
              Last pushed to sheet: {new Date(sheetLastPushedAt).toLocaleString()}
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={sheetUrl}
              onChange={(event) => {
                setSheetUrl(event.target.value)
                setSheetPreviewRows([])
                setSheetFailures([])
                setSheetPreviewCount(0)
              }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              aria-label="Google Sheet URL"
              disabled={sheetSyncEnabled}
            />
            <Button type="button" variant="secondary" onClick={handleLoadSheetPreview} disabled={!sheetUrl.trim() || isSheetLoading || sheetSyncEnabled}>
              <FiLink className="mr-2" />
              {isSheetLoading ? 'Loading...' : 'Load Preview'}
            </Button>
            {sheetSyncEnabled ? (
              <Button type="button" variant="secondary" onClick={handleDisconnectSheet} disabled={isSheetLoading}>
                Disconnect
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleConnectLiveSync}
                disabled={!sheetUrl.trim() || sheetPreviewCount === 0 || isSheetLoading}
              >
                <FiUploadCloud className="mr-2" />
                {isSheetLoading ? 'Connecting...' : 'Connect Live Sync'}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={handleDeleteAll}>
              <FiTrash2 className="mr-2" />
              Delete All
            </Button>
          </div>
        </div>

        {sheetPreviewRows.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-border">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-light text-left text-neutral-gray">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Stock</th>
                </tr>
              </thead>
              <tbody>
                {sheetPreviewRows.slice(0, 6).map((row, index) => (
                  <tr key={`${row.name}-${index}`} className="border-t border-neutral-border">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.category}</td>
                    <td className="px-3 py-2">${row.price.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.stock ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sheetPreviewRows.length > 6 ? (
              <p className="px-3 py-2 text-xs text-neutral-gray">
                Showing first 6 rows of {sheetPreviewCount || sheetPreviewRows.length} valid rows.
              </p>
            ) : null}
          </div>
        ) : null}

        {sheetFailures.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">Rows with issues ({sheetFailures.length})</div>
            <p className="mt-1 text-xs text-amber-800">
              Invalid rows were skipped. Fix the listed values in your Google Sheet and sync again.
            </p>
            <div className="mt-3 overflow-x-auto rounded-md border border-amber-200 bg-white/70">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="bg-amber-100 text-left text-amber-900">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Errors</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetFailures.slice(0, 10).map((failure) => {
                    const rowData = failure.data || {}
                    return (
                      <tr key={`sheet-failure-${failure.row}`} className="border-t border-amber-100 align-top">
                        <td className="px-3 py-2 font-semibold">{failure.row}</td>
                        <td className="px-3 py-2 whitespace-normal">{failure.errors.join(', ')}</td>
                        <td className="px-3 py-2">
                          {getFailureCell(rowData, ['Product Name', 'name', 'product_name', 'product'])}
                        </td>
                        <td className="px-3 py-2">
                          {getFailureCell(rowData, ['Category', 'category', 'product_category'])}
                        </td>
                        <td className="px-3 py-2">{getFailureCell(rowData, ['Price', 'price'])}</td>
                        <td className="px-3 py-2">
                          {getFailureCell(rowData, ['Stock Quantity', 'stock', 'quantity', 'qty'])}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {sheetFailures.length > 10 ? (
              <div className="mt-2 text-xs">Showing first 10 failed rows of {sheetFailures.length}.</div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-dark">Product List</h2>
            <p className="mt-1 text-sm text-neutral-gray">Browse and manage your catalog with image previews, stock status, and quick actions.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button type="button" onClick={openManualProductForm}>
              <FiPlus className="mr-2" />
              Add Product
            </Button>
            <div className="relative min-w-[220px] lg:min-w-[260px]">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-gray" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products"
                className="input-field pl-9"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="input-field"
              aria-label="Filter by category"
              title="Filter by category"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All categories' : category}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`rounded-lg border px-3 py-2 ${viewMode === 'table' ? 'border-primary text-primary' : 'border-neutral-border'}`}
              onClick={() => setViewMode('table')}
              aria-label="Table view"
            >
              <FiList />
            </button>
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 ${viewMode === 'grid' ? 'border-primary text-primary' : 'border-neutral-border'}`}
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
            >
              <FiGrid />
            </button>
          </div>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-border p-10 text-center">
              <h3 className="text-lg font-semibold text-neutral-dark">No products yet</h3>
              <p className="mt-1 text-sm text-neutral-gray">Connect your Google Sheet or add products manually to build your catalog.</p>
            </div>
          ) : viewMode === 'table' ? (
            <div className="rounded-2xl border border-neutral-border bg-white shadow-sm">
              <div className="overflow-x-auto">
                <div className="max-h-[460px] overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-neutral-light text-left text-neutral-gray shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                      <tr>
                        <th className="w-16 px-3 py-3">Item</th>
                        <th className="px-3 py-3">Name</th>
                        <th className="px-3 py-3">Category</th>
                        <th className="px-3 py-3">Price</th>
                        <th className="px-3 py-3">Stock</th>
                        <th className="px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-border">
                      {filteredProducts.map((product) => (
                        <tr key={product.id} className="transition-colors hover:bg-neutral-light/60">
                          <td className="px-3 py-3 align-middle">
                            <ProductAvatar product={product} />
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <div className="font-semibold text-neutral-dark">{product.name}</div>
                            {product.description ? (
                              <p className="mt-1 line-clamp-1 text-xs text-neutral-gray">{product.description}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 align-middle">{product.category}</td>
                          <td className="px-3 py-3 align-middle">${priceLabel(product.price)}</td>
                          <td className="px-3 py-3 align-middle">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              product.stock <= 0
                                ? 'bg-red-100 text-red-700'
                                : product.stock <= 4
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {product.stock <= 0 ? 'Out' : product.stock <= 4 ? `Low (${product.stock})` : product.stock}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleEdit(product)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-border text-neutral-dark transition-colors hover:border-primary hover:text-primary"
                                aria-label={`Edit ${product.name}`}
                                title={`Edit ${product.name}`}
                              >
                                <FiEdit2 />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(product)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-border text-error transition-colors hover:border-error"
                                aria-label={`Delete ${product.name}`}
                                title={`Delete ${product.name}`}
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <div key={product.id} className="rounded-xl border border-neutral-border p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                  {product.image_url_resolved ? (
                    <img
                      src={product.image_url_resolved}
                      alt={product.name}
                      className="h-36 w-full rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="mt-3">
                    <div className="font-semibold text-neutral-dark">{product.name}</div>
                    <div className="text-xs text-neutral-gray">{product.category}</div>
                    <div className="mt-2 text-sm text-neutral-gray line-clamp-2">{product.description || 'No description.'}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="font-semibold text-primary">${priceLabel(product.price)}</div>
                      <div className={`text-xs font-semibold ${
                        product.stock <= 0
                          ? 'text-red-600'
                          : product.stock <= 4
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}>
                        {product.stock <= 0 ? 'Out of stock' : product.stock <= 4 ? `Low stock (${product.stock})` : `Stock: ${product.stock}`}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="secondary" className="flex-1 px-3 py-2" onClick={() => handleEdit(product)}>
                        Edit
                      </Button>
                      <Button type="button" className="flex-1 px-3 py-2 bg-error hover:bg-red-600" onClick={() => handleDelete(product)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={showManualProductForm || Boolean(form.id)}
        onClose={closeManualProductForm}
        title={form.id ? 'Edit Product' : 'Manual Product Add'}
        size="xl"
      >
        <div className="flex flex-col gap-2 border-b border-neutral-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-sm text-neutral-gray">
            {form.id
              ? 'Update the product details and save your changes.'
              : 'Add a new product manually without using a sheet.'}
          </p>
          {!form.id ? (
            <button
              type="button"
              onClick={closeManualProductForm}
              className="text-sm font-medium text-neutral-gray hover:text-neutral-dark"
            >
              Close
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSubmitProduct} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Input
            label="Name"
            value={form.name}
            error={formErrors.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Vitamin C 1000mg"
          />
          <Input
            label="Category"
            value={form.category}
            error={formErrors.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            placeholder="Vitamins"
          />
          <Input
            label="Price"
            value={form.price}
            error={formErrors.price}
            onChange={(event) => {
              const val = event.target.value
              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                setForm((prev) => ({ ...prev, price: val }))
              }
            }}
            placeholder="19.99"
            inputMode="decimal"
          />
          <Input
            label="Stock"
            value={form.stock}
            error={formErrors.stock}
            onChange={(event) => setForm((prev) => ({ ...prev, stock: event.target.value.replace(/\D/g, '') }))}
            placeholder="25"
            inputMode="numeric"
          />
          <div className="md:col-span-2 xl:col-span-1 2xl:col-span-2">
            <Textarea
              label="Description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Short description for website cards."
              rows={3}
            />
          </div>
          <label className="text-sm font-medium text-neutral-dark md:col-span-2 xl:col-span-1 2xl:col-span-2">
            Product image (optional)
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] || null
                setForm((prev) => ({
                  ...prev,
                  image: file,
                  imagePreview: file ? URL.createObjectURL(file) : prev.imagePreview,
                }))
              }}
              className="input-field mt-2"
            />
          </label>

          {form.imagePreview ? (
            <div className="md:col-span-2 xl:col-span-1 2xl:col-span-2 flex items-center gap-3 rounded-lg border border-neutral-border p-3">
              <img src={form.imagePreview} alt="Product preview" className="h-14 w-14 rounded-md object-cover" />
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, image: null, imagePreview: '', image_url: '' }))}
                className="inline-flex items-center gap-1 text-sm text-error"
              >
                <FiX />
                Remove image
              </button>
            </div>
          ) : null}

          <div className="md:col-span-2 xl:col-span-1 2xl:col-span-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={closeManualProductForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {form.id ? <FiEdit2 className="mr-2" /> : <FiPlus className="mr-2" />}
              {isSaving ? 'Saving...' : form.id ? 'Update Product' : 'Add Product'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
