'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'
import { hospitalAdminApi } from '@/lib/hospitalAdminApi'
import type { Department, Doctor } from '@/types/hospital'

interface DepartmentFormData {
  name: string
  description: string
}

const EMPTY_FORM: DepartmentFormData = {
  name: '',
  description: '',
}

export default function HospitalDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [doctorCounts, setDoctorCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<DepartmentFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    const load = async () => {
      const [departmentsRes, doctorsRes] = await Promise.all([
        hospitalAdminApi.listDepartments(),
        hospitalAdminApi.listDoctors(),
      ])

      if (departmentsRes.data) {
        setDepartments(departmentsRes.data)
      }

      if (doctorsRes.data) {
        const counts = doctorsRes.data.reduce((acc, doctor) => {
          const departmentId = doctor.department
          if (!departmentId) return acc
          acc[departmentId] = (acc[departmentId] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        setDoctorCounts(counts)
      }

      setLoading(false)
    }
    void load()
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError('Department name is required.')
      return
    }

    setSaving(true)

    const response = await hospitalAdminApi.createDepartment({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
    })

    setSaving(false)

    if (response.error || !response.data) {
      setError(response.error ?? 'Failed to create department.')
      return
    }

    setDepartments((prev) => [response.data!, ...prev])
    setForm(EMPTY_FORM)
    showToast({
      type: 'success',
      title: 'Department created',
      message: `${response.data.name} was added successfully.`,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-dark">Departments</h1>
        <p className="mt-1 text-neutral-gray">Create and manage hospital departments before assigning doctors.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6 gap-4">
            <div>
              <h2 className="text-xl font-semibold text-neutral-dark">Create a department</h2>
              <p className="text-sm text-neutral-gray">Add a department that doctors can be assigned to.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-1">Department name</label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full px-3 py-2 border border-neutral-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                placeholder="e.g. Cardiology"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className="w-full min-h-[120px] px-3 py-2 border border-neutral-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                placeholder="Optional department details or specialization"
              />
            </div>

            {error && <p className="text-sm text-error">{error}</p>}

            <Button type="submit" disabled={saving} className="w-full md:w-auto">
              {saving ? 'Saving...' : 'Create department'}
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6 gap-4">
            <div>
              <h2 className="text-xl font-semibold text-neutral-dark">Department list</h2>
              <p className="text-sm text-neutral-gray">Departments available for doctors and your public hospital site.</p>
            </div>
            <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {departments.length} total
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-neutral-gray">Loading departments...</p>
          ) : departments.length === 0 ? (
            <p className="text-sm text-neutral-gray">No departments have been added yet.</p>
          ) : (
            <div className="space-y-3">
              {departments.map((department) => (
                <div key={department.id} className="rounded-3xl border border-neutral-border bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-neutral-dark">{department.name}</p>
                      {department.description ? (
                        <p className="mt-1 text-sm text-neutral-gray">{department.description}</p>
                      ) : (
                        <p className="mt-1 text-sm text-neutral-gray italic">No description provided.</p>
                      )}
                    </div>
                    <span className="rounded-full bg-neutral-light px-3 py-1 text-xs font-semibold text-neutral-dark">
                      {doctorCounts[department.id] ? `${doctorCounts[department.id]} doctor${doctorCounts[department.id] === 1 ? '' : 's'}` : '0 doctors'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
