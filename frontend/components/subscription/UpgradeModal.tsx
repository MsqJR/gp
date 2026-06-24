'use client'

import React from 'react'
import Link from 'next/link'
import { FiLock, FiArrowUpRight, FiX } from 'react-icons/fi'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  /** Optional feature name shown in the message body */
  featureName?: string
}

/**
 * Modal shown when the user interacts with a locked feature.
 * Provides "Upgrade Plan" and "View Pricing" CTAs.
 */
export function UpgradeModal({ open, onClose, featureName }: UpgradeModalProps) {
  if (!open) return null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal panel */}
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl p-8 text-center"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-gray hover:text-neutral-dark transition-colors"
          aria-label="Close"
        >
          <FiX size={20} />
        </button>

        {/* Lock icon */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
          <FiLock className="text-amber-500" size={28} />
        </div>

        <h2 id="upgrade-modal-title" className="text-xl font-bold text-neutral-dark mb-2">
          Premium Plan Required
        </h2>

        <p className="text-sm text-neutral-gray leading-relaxed mb-6">
          {featureName
            ? <><span className="font-semibold text-neutral-dark">{featureName}</span> requires an active subscription.</>
            : 'This feature requires an active subscription.'
          }
          {' '}Please purchase the <span className="font-semibold text-neutral-dark">Premium Plan</span> or higher to unlock all website customization features.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard/hospital/setup"
            onClick={onClose}
            className="
              flex items-center justify-center gap-2 rounded-xl
              bg-primary px-6 py-3 text-sm font-semibold text-white
              hover:bg-primary-dark transition-colors shadow-sm
            "
          >
            <FiArrowUpRight size={16} />
            Purchase Premium Plan
          </Link>
          <Link
            href="/dashboard/hospital/setup"
            onClick={onClose}
            className="
              flex items-center justify-center gap-2 rounded-xl
              border border-neutral-border px-6 py-3 text-sm font-semibold text-neutral-dark
              hover:bg-neutral-light transition-colors
            "
          >
            View Plans & Pricing
          </Link>
        </div>
      </div>
    </div>
  )
}
