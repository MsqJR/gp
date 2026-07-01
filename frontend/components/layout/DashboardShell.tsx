'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { getAuthToken } from '@/lib/api'

export function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const token = getAuthToken()
    const user = localStorage.getItem('user')
    if (!token || !user) {
      router.push('/login')
    }
  }, [router])

  return (
    <div className="flex min-h-screen w-full bg-neutral-light">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="min-w-0 flex-1 w-full md:ml-64 md:w-auto">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="w-full max-w-full p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}