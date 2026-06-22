'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  FiUpload,
  FiTrash2,
  FiEdit2,
  FiChevronUp,
  FiChevronDown,
  FiSave,
  FiImage,
  FiLoader,
  FiCamera,
  FiMove,
  FiGrid,
  FiX,
} from 'react-icons/fi'

import { hospitalAdminApi } from '@/lib/hospitalAdminApi'
import { useToast } from '@/components/ui/ToastProvider'
import type { HospitalPhoto } from '@/types/hospital'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

/* ─────────────────────────────────────────────────────────────────────────────
   Upload / Edit Modal
───────────────────────────────────────────────────────────────────────────── */

interface PhotoUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (photo: HospitalPhoto) => void
  editingPhoto?: HospitalPhoto | null
}

function PhotoUploadModal({ isOpen, onClose, onSuccess, editingPhoto }: PhotoUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [altText, setAltText] = useState('')
  const [caption, setCaption] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { showToast } = useToast()
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      if (editingPhoto) {
        setAltText(editingPhoto.alt_text || '')
        setCaption(editingPhoto.caption || '')
        setPreviewUrl(editingPhoto.image_url || null)
      } else {
        setAltText('')
        setCaption('')
        setPreviewUrl(null)
        setSelectedFile(null)
      }
    }
  }, [editingPhoto, isOpen])

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast({ type: 'error', title: 'Invalid file', message: 'Please select an image file.' })
      return
    }
    setSelectedFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleSubmit = async () => {
    if (!editingPhoto && !selectedFile) {
      showToast({ type: 'error', title: 'File Required', message: 'Please select an image to upload.' })
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      if (selectedFile) formData.append('image', selectedFile)
      formData.append('alt_text', altText)
      formData.append('caption', caption)

      const result = editingPhoto
        ? await hospitalAdminApi.updatePhoto(editingPhoto.id, formData)
        : await hospitalAdminApi.uploadPhoto(formData)

      if (result.error) {
        showToast({ type: 'error', title: editingPhoto ? 'Update Failed' : 'Upload Failed', message: result.error })
        return
      }

      if (result.data) {
        onSuccess(result.data)
        showToast({
          type: 'success',
          title: editingPhoto ? 'Photo Updated' : 'Photo Uploaded',
          message: editingPhoto ? 'Photo updated successfully.' : 'Photo uploaded successfully.',
        })
        onClose()
      }
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'An unexpected error occurred.' })
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (previewUrl && selectedFile) URL.revokeObjectURL(previewUrl)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FiCamera className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-neutral-dark">
              {editingPhoto ? 'Edit Photo' : 'Upload New Photo'}
            </h2>
          </div>
          <button type="button" onClick={handleClose} className="p-1 rounded hover:bg-neutral-light text-neutral-gray">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Using div instead of form to avoid nested <form> (parent page already has one) */}
        <div className="space-y-4">
          {/* Drop Zone */}
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('photo-upload-input')?.click()}
            className={`border-2 border-dashed rounded-xl cursor-pointer transition-colors duration-200 ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-neutral-border hover:border-primary/50 hover:bg-neutral-light/50'
            }`}
          >
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-44 object-cover rounded-xl"
                />
                <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                  <span className="text-white text-sm font-medium">Click to change</span>
                </div>
              </div>
            ) : (
              <div className="py-10 flex flex-col items-center gap-3 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-neutral-light flex items-center justify-center">
                  <FiUpload className="w-5 h-5 text-neutral-gray" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-dark">Drop image here or click to browse</p>
                  <p className="text-xs text-neutral-gray mt-1">PNG, JPG, WEBP — up to 10 MB</p>
                </div>
              </div>
            )}
          </div>

          <input
            id="photo-upload-input"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Input
            label="Alt Text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Describe the image (for accessibility)"
          />

          <Input
            label="Caption (Optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="A short caption shown below the photo"
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" onClick={() => void handleSubmit()} disabled={isUploading} className="flex-1">
              {isUploading ? (
                <>
                  <FiLoader className="w-4 h-4 mr-2 animate-spin" />
                  {editingPhoto ? 'Updating...' : 'Uploading...'}
                </>
              ) : (
                <>
                  <FiSave className="w-4 h-4 mr-2" />
                  {editingPhoto ? 'Update Photo' : 'Upload Photo'}
                </>
              )}
            </Button>
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isUploading}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Photo Item Card
───────────────────────────────────────────────────────────────────────────── */

interface PhotoItemProps {
  photo: HospitalPhoto
  index: number
  total: number
  onEdit: (photo: HospitalPhoto) => void
  onDelete: (photoId: string) => void
  onMoveUp: (photoId: string) => void
  onMoveDown: (photoId: string) => void
  isDeleting: boolean
  isReordering: boolean
}

function PhotoItem({
  photo,
  index,
  total,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isDeleting,
  isReordering,
}: PhotoItemProps) {
  const canMoveUp = index > 0
  const canMoveDown = index < total - 1

  return (
    <div className="flex items-stretch gap-0 border border-neutral-border rounded-xl bg-white overflow-hidden hover:shadow-sm transition-shadow duration-200">
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-24 h-24 sm:w-28 sm:h-28 relative overflow-hidden bg-neutral-light">
        {photo.image_url ? (
          <img
            src={photo.image_url}
            alt={photo.alt_text || 'Hospital photo'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FiImage className="w-8 h-8 text-neutral-border" />
          </div>
        )}
        {/* Order badge */}
        <div className="absolute top-1 left-1 bg-black/50 text-white text-[10px] font-bold rounded px-1.5 py-0.5">
          #{index + 1}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 px-4 py-3 flex flex-col justify-center">
        <p className="text-sm font-semibold text-neutral-dark truncate">
          {photo.alt_text || <span className="text-neutral-gray italic">No alt text</span>}
        </p>
        {photo.caption && (
          <p className="text-xs text-neutral-gray mt-0.5 truncate">{photo.caption}</p>
        )}
        <p className="text-xs text-neutral-border mt-1">
          Added {new Date(photo.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center justify-center gap-1 px-3 border-l border-neutral-border bg-neutral-light/30">
        {/* Move Up */}
        <button
          type="button"
          onClick={() => onMoveUp(photo.id)}
          disabled={!canMoveUp || isReordering}
          className={`p-1.5 rounded-lg transition-colors ${
            canMoveUp && !isReordering
              ? 'text-neutral-gray hover:text-neutral-dark hover:bg-neutral-light'
              : 'text-neutral-border cursor-not-allowed'
          }`}
          title="Move up"
        >
          <FiChevronUp className="w-4 h-4" />
        </button>

        {/* Move icon */}
        <div className="text-neutral-border">
          <FiMove className="w-3 h-3" />
        </div>

        {/* Move Down */}
        <button
          type="button"
          onClick={() => onMoveDown(photo.id)}
          disabled={!canMoveDown || isReordering}
          className={`p-1.5 rounded-lg transition-colors ${
            canMoveDown && !isReordering
              ? 'text-neutral-gray hover:text-neutral-dark hover:bg-neutral-light'
              : 'text-neutral-border cursor-not-allowed'
          }`}
          title="Move down"
        >
          <FiChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Edit / Delete */}
      <div className="flex flex-col items-center justify-center gap-1 px-3 border-l border-neutral-border">
        <button
          type="button"
          onClick={() => onEdit(photo)}
          className="p-2 rounded-lg text-neutral-gray hover:text-primary hover:bg-primary/10 transition-colors"
          title="Edit photo"
        >
          <FiEdit2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(photo.id)}
          disabled={isDeleting}
          className="p-2 rounded-lg text-neutral-gray hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
          title="Delete photo"
        >
          {isDeleting ? (
            <FiLoader className="w-4 h-4 animate-spin" />
          ) : (
            <FiTrash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main Section
───────────────────────────────────────────────────────────────────────────── */

export function HospitalPhotosSection() {
  const [photos, setPhotos] = useState<HospitalPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [isReordering, setIsReordering] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState<HospitalPhoto | null>(null)
  const { showToast } = useToast()

  const loadPhotos = useCallback(async () => {
    try {
      const result = await hospitalAdminApi.listPhotos()
      if (result.error) {
        showToast({ type: 'error', title: 'Loading Failed', message: 'Unable to load hospital photos.' })
        return
      }
      if (result.data) setPhotos(result.data)
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'Failed to load photos.' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadPhotos()
  }, [loadPhotos])

  const handlePhotoSuccess = (newPhoto: HospitalPhoto) => {
    if (editingPhoto) {
      setPhotos((prev) => prev.map((p) => (p.id === newPhoto.id ? newPhoto : p)))
      setEditingPhoto(null)
    } else {
      setPhotos((prev) => [...prev, newPhoto].sort((a, b) => a.display_order - b.display_order))
    }
    setUploadModalOpen(false)
  }

  const handleEdit = (photo: HospitalPhoto) => {
    setEditingPhoto(photo)
    setUploadModalOpen(true)
  }

  const handleDelete = async (photoId: string) => {
    if (!confirm('Delete this photo? This cannot be undone.')) return
    setDeletingPhotoId(photoId)
    try {
      const result = await hospitalAdminApi.deletePhoto(photoId)
      if (result.error) {
        showToast({ type: 'error', title: 'Delete Failed', message: 'Unable to delete the photo.' })
        return
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photoId))
      showToast({ type: 'success', title: 'Photo Deleted', message: 'Photo removed from gallery.' })
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'Failed to delete photo.' })
    } finally {
      setDeletingPhotoId(null)
    }
  }

  const handleMove = async (photoId: string, direction: 'up' | 'down') => {
    const idx = photos.findIndex((p) => p.id === photoId)
    if (idx === -1) return

    const newPhotos = [...photos]
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= newPhotos.length) return

    ;[newPhotos[idx], newPhotos[targetIdx]] = [newPhotos[targetIdx], newPhotos[idx]]

    // Optimistic update
    setPhotos(newPhotos)
    setIsReordering(true)

    try {
      const result = await hospitalAdminApi.updatePhotoOrder(newPhotos.map((p) => p.id))
      if (result.error) {
        showToast({ type: 'error', title: 'Reorder Failed', message: 'Unable to update photo order.' })
        void loadPhotos() // revert
        return
      }
      if (result.data) setPhotos(result.data)
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'Failed to reorder photos.' })
      void loadPhotos()
    } finally {
      setIsReordering(false)
    }
  }

  const handleCloseModal = () => {
    setUploadModalOpen(false)
    setEditingPhoto(null)
  }

  /* ── Render ── */

  return (
    <>
      <Card className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FiGrid className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-neutral-dark">Hospital Photos</h2>
              <p className="text-sm text-neutral-gray mt-0.5">
                Manage your gallery — photos display on your public website in this order.
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          /* Skeleton */
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-0 border border-neutral-border rounded-xl overflow-hidden animate-pulse">
                <div className="w-24 h-24 bg-neutral-light flex-shrink-0" />
                <div className="flex-1 px-4 py-3 space-y-2">
                  <div className="h-3 bg-neutral-light rounded w-1/2" />
                  <div className="h-3 bg-neutral-light rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : photos.length === 0 ? (
          /* Empty state */
          <div className="text-center py-14 border-2 border-dashed border-neutral-border rounded-xl">
            <div className="w-16 h-16 rounded-2xl bg-neutral-light flex items-center justify-center mx-auto mb-4">
              <FiImage className="w-7 h-7 text-neutral-border" />
            </div>
            <p className="text-neutral-dark font-medium mb-1">No photos yet</p>
            <p className="text-sm text-neutral-gray mb-5">
              Upload photos to showcase your hospital facilities on your public website.
            </p>
            <Button type="button" variant="secondary" onClick={() => setUploadModalOpen(true)}>
              <FiUpload className="w-4 h-4 mr-2" />
              Upload First Photo
            </Button>
          </div>
        ) : (
          /* Photo list */
          <div className="space-y-3">
            {isReordering && (
              <div className="flex items-center gap-2 text-xs text-neutral-gray px-1">
                <FiLoader className="w-3 h-3 animate-spin" />
                Saving new order...
              </div>
            )}
            <div className="max-h-[460px] overflow-y-auto pr-1.5 space-y-3">
              {photos.map((photo, index) => (
                <PhotoItem
                  key={photo.id}
                  photo={photo}
                  index={index}
                  total={photos.length}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMoveUp={(id) => handleMove(id, 'up')}
                  onMoveDown={(id) => handleMove(id, 'down')}
                  isDeleting={deletingPhotoId === photo.id}
                  isReordering={isReordering}
                />
              ))}
            </div>
            
            {/* Dashed Add Photo button at bottom */}
            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center justify-center gap-2 w-full py-3.5 border-2 border-dashed border-neutral-border hover:border-primary/50 hover:bg-neutral-light/30 rounded-xl transition-all text-neutral-gray hover:text-primary font-semibold text-sm mt-2"
            >
              <FiUpload className="w-4 h-4" />
              Add Photo
            </button>

            <p className="text-xs text-neutral-gray text-center pt-2">
              {photos.length} photo{photos.length !== 1 ? 's' : ''} · Use the arrows to reorder
            </p>
          </div>
        )}
      </Card>

      <PhotoUploadModal
        isOpen={uploadModalOpen}
        onClose={handleCloseModal}
        onSuccess={handlePhotoSuccess}
        editingPhoto={editingPhoto}
      />
    </>
  )
}