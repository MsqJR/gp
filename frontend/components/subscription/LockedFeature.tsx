'use client'

import React, { useState } from 'react'
import { FiLock } from 'react-icons/fi'
import { UpgradeModal } from './UpgradeModal'

interface LockedFeatureProps {
  /** Whether this feature is locked (false = render children normally) */
  locked: boolean
  /** Feature display name shown inside the modal */
  featureName?: string
  children: React.ReactNode
}

/**
 * Wraps any content in a grayed-out overlay with a lock icon when `locked=true`.
 * Clicking the overlay opens the <UpgradeModal>.
 */
export function LockedFeature({ locked, featureName, children }: LockedFeatureProps) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!locked) return <>{children}</>

  return (
    <>
      {/* Container — position relative so overlay can cover it */}
      <div className="relative rounded-xl overflow-hidden">
        {/* Dimmed children (non-interactive) */}
        <div
          className="select-none pointer-events-none opacity-40 blur-[1px]"
          aria-hidden="true"
        >
          {children}
        </div>

        {/* Overlay */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="
            absolute inset-0 flex flex-col items-center justify-center gap-2
            bg-white/60 backdrop-blur-[2px] cursor-pointer
            group transition-colors hover:bg-white/70
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
          "
          aria-label={`Unlock ${featureName ?? 'this feature'} — upgrade your plan`}
        >
          {/* Lock icon bubble */}
          <span className="
            flex h-12 w-12 items-center justify-center rounded-full
            bg-white shadow-md border border-neutral-border
            group-hover:border-primary group-hover:shadow-primary/20
            transition-all
          ">
            <FiLock className="text-neutral-gray group-hover:text-primary transition-colors" size={22} />
          </span>

          {/* Tooltip-style label */}
          <span className="
            rounded-full border border-neutral-border bg-white px-3 py-1
            text-xs font-semibold text-neutral-gray
            group-hover:border-primary group-hover:text-primary
            transition-colors shadow-sm
          ">
            Requires Premium Plan to unlock
          </span>
        </button>
      </div>

      <UpgradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        featureName={featureName}
      />
    </>
  )
}
