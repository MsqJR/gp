'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { FiChevronLeft, FiChevronRight, FiX, FiMaximize2, FiCamera } from 'react-icons/fi'
import type { HospitalPhoto } from '@/types/hospital'

interface HospitalGalleryBlockProps {
  subdomain: string
  photos?: HospitalPhoto[]
}

/* ─────────────────────────────────────────────────────────────────────────────
   Lightbox
───────────────────────────────────────────────────────────────────────────── */

interface LightboxProps {
  photos: HospitalPhoto[]
  currentIndex: number
  onClose: () => void
  onNext: () => void
  onPrevious: () => void
}

function Lightbox({ photos, currentIndex, onClose, onNext, onPrevious }: LightboxProps) {
  const photo = photos[currentIndex]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrevious()
      if (e.key === 'ArrowRight') onNext()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, onNext, onPrevious])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
        style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
        aria-label="Close gallery"
      >
        <FiX className="w-5 h-5" />
      </button>

      {/* Prev */}
      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrevious() }}
          className="absolute left-3 sm:left-6 z-10 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.14)', color: '#fff' }}
          aria-label="Previous photo"
        >
          <FiChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Image */}
      <div
        className="relative mx-auto px-16 flex items-center justify-center max-w-5xl w-full max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          key={photo.id}
          src={photo.image_url || ''}
          alt={photo.alt_text || 'Hospital photo'}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
          style={{ animation: 'fadeIn .2s ease' }}
        />
        {/* Caption + counter */}
        {(photo.caption || photos.length > 1) && (
          <div
            className="absolute bottom-0 left-16 right-16 rounded-b-lg px-4 py-3 text-center"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,.7), transparent)' }}
          >
            {photo.caption && (
              <p className="text-white text-sm font-medium">{photo.caption}</p>
            )}
            {photos.length > 1 && (
              <p className="text-white/60 text-xs mt-0.5">{currentIndex + 1} / {photos.length}</p>
            )}
          </div>
        )}
      </div>

      {/* Next */}
      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext() }}
          className="absolute right-3 sm:right-6 z-10 w-11 h-11 rounded-full flex items-center justify-center transition-all hover:scale-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.14)', color: '#fff' }}
          aria-label="Next photo"
        >
          <FiChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Dot indicators */}
      {photos.length > 1 && photos.length <= 12 && (
        <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-1.5">
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation() }}
              className="w-2 h-2 rounded-full transition-all"
              style={{
                backgroundColor: i === currentIndex ? '#fff' : 'rgba(255,255,255,0.35)',
                transform: i === currentIndex ? 'scale(1.3)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(.97) } to { opacity: 1; transform: scale(1) } }`}</style>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Gallery Block — Horizontal Scroll Strip
───────────────────────────────────────────────────────────────────────────── */

export function HospitalGalleryBlock({ subdomain, photos: initialPhotos }: HospitalGalleryBlockProps) {
  const [photos, setPhotos] = useState<HospitalPhoto[]>(initialPhotos || [])
  const [loading, setLoading] = useState(!initialPhotos)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  /* Load photos */
  useEffect(() => {
    if (initialPhotos) {
      setPhotos(initialPhotos)
      setLoading(false)
      return
    }
    const load = async () => {
      try {
        const { hospitalApi } = await import('@/lib/hospitalApi')
        const result = await hospitalApi.getPhotos(subdomain)
        if (result.data) setPhotos(result.data)
      } catch (err) {
        console.error('Failed to load hospital photos:', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [subdomain, initialPhotos])

  /* Scroll state tracker */
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [updateScrollState, photos])

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const amount = el.clientWidth * 0.75
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  /* Lightbox handlers */
  const openLightbox = (i: number) => setLightboxIndex(i)
  const closeLightbox = () => setLightboxIndex(null)
  const nextPhoto = useCallback(() => {
    if (lightboxIndex !== null) setLightboxIndex((lightboxIndex + 1) % photos.length)
  }, [lightboxIndex, photos.length])
  const prevPhoto = useCallback(() => {
    if (lightboxIndex !== null) setLightboxIndex(lightboxIndex === 0 ? photos.length - 1 : lightboxIndex - 1)
  }, [lightboxIndex, photos.length])

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <section
        className="py-16"
        style={{ backgroundColor: 'var(--hospital-surface-alt)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-28 mx-auto mb-3" />
            <div className="h-8 bg-gray-200 rounded w-64 mx-auto" />
          </div>
          <div className="flex gap-5 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-72 h-56 rounded-2xl bg-gray-200 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>
      </section>
    )
  }

  /* Hide when no photos */
  if (!photos || photos.length === 0) return null

  return (
    <>
      <section
        id="gallery"
        className="py-16 relative overflow-hidden"
        style={{ backgroundColor: 'var(--hospital-surface-alt)' }}
      >
        {/* Subtle background decoration */}
        <div
          className="pointer-events-none absolute -right-32 top-0 h-64 w-64 rounded-full blur-3xl opacity-30"
          style={{ backgroundColor: 'var(--hospital-primary-soft)' }}
        />
        <div
          className="pointer-events-none absolute -left-24 bottom-0 h-48 w-48 rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: 'var(--hospital-primary-soft)' }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          {/* Section header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.25em] mb-2"
                style={{ color: 'var(--hospital-text-muted)' }}
              >
                Our Facilities
              </p>
              <h2
                className="text-3xl sm:text-4xl font-extrabold leading-tight"
                style={{ color: 'var(--hospital-text)' }}
              >
                Hospital Gallery
              </h2>
              <p
                className="mt-2 text-sm sm:text-base"
                style={{ color: 'var(--hospital-text-muted)' }}
              >
                A look inside our modern facilities and welcoming spaces.
              </p>
            </div>

            {/* Scroll chevrons — shown only when needed */}
            {photos.length > 1 && (
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0 pb-1">
                <button
                  onClick={() => scroll('left')}
                  disabled={!canScrollLeft}
                  className="w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-200 disabled:opacity-30 hover:bg-gray-50 hover:border-gray-300 hover:scale-105 active:scale-95 disabled:pointer-events-none shadow-sm"
                  style={{
                    borderColor: 'var(--hospital-border)',
                    backgroundColor: 'var(--hospital-surface)',
                    color: 'var(--hospital-text)',
                  }}
                  aria-label="Scroll left"
                >
                  <FiChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => scroll('right')}
                  disabled={!canScrollRight}
                  className="w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-200 disabled:opacity-30 hover:bg-gray-50 hover:border-gray-300 hover:scale-105 active:scale-95 disabled:pointer-events-none shadow-sm"
                  style={{
                    borderColor: 'var(--hospital-border)',
                    backgroundColor: 'var(--hospital-surface)',
                    color: 'var(--hospital-text)',
                  }}
                  aria-label="Scroll right"
                >
                  <FiChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* ── Horizontal scroll strip ── */}
          <div className="relative">
            {/* Left fade gradient */}
            {canScrollLeft && (
              <div
                className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
                style={{
                  background: `linear-gradient(to right, var(--hospital-surface-alt), transparent)`,
                }}
              />
            )}

            {/* Right fade gradient */}
            {canScrollRight && (
              <div
                className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
                style={{
                  background: `linear-gradient(to left, var(--hospital-surface-alt), transparent)`,
                }}
              />
            )}

            <div
              ref={scrollRef}
              data-gallery-strip
              className="flex gap-6 sm:gap-8 overflow-x-auto pb-4"
              style={{
                scrollSnapType: 'x mandatory',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="group flex-shrink-0 relative overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-white"
                  style={{
                    scrollSnapAlign: 'start',
                    width: 'clamp(300px, 38vw, 440px)',
                    borderRadius: '24px',
                    boxShadow: '0 20px 40px -15px rgba(0,0,0,0.08), 0 2px 12px -3px rgba(0,0,0,0.03)',
                  }}
                  onClick={() => openLightbox(index)}
                >
                  {/* Photo */}
                  <div className="relative overflow-hidden" style={{ height: '280px' }}>
                    <img
                      src={photo.image_url || ''}
                      alt={photo.alt_text || 'Hospital photo'}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      style={{ transition: 'transform .5s ease' }}
                    />

                    {/* Hover overlay */}
                    <div
                      className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
                    >
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300"
                        style={{ backgroundColor: 'rgba(255,255,255,0.95)' }}
                      >
                        <FiMaximize2 className="w-5 h-5" style={{ color: 'var(--hospital-btn-primary)' }} />
                      </div>
                    </div>
                  </div>

                  {/* Caption footer */}
                  {photo.caption && (
                    <div
                      className="px-4 py-3 border-t border-neutral-light"
                      style={{ backgroundColor: 'var(--hospital-surface)' }}
                    >
                      <p
                        className="text-sm font-medium truncate text-center"
                        style={{ color: 'var(--hospital-text)' }}
                      >
                        {photo.caption}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Hide native scrollbar */}
            <style>{`
              [data-gallery-strip]::-webkit-scrollbar { display: none; }
            `}</style>
          </div>

          {/* Mobile scroll hint */}
          {photos.length > 2 && (
            <p
              className="text-xs text-center mt-3 sm:hidden"
              style={{ color: 'var(--hospital-text-muted)' }}
            >
              ← Swipe to explore →
            </p>
          )}


        </div>
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={nextPhoto}
          onPrevious={prevPhoto}
        />
      )}
    </>
  )
}