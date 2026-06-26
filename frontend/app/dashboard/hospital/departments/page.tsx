'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/ToastProvider'
import { hospitalAdminApi } from '@/lib/hospitalAdminApi'
import type { Department, Doctor } from '@/types/hospital'
import { Trash2, Edit2, Building2, Activity, Users, PlusCircle, Sparkles, AlertCircle, Search } from 'lucide-react'

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
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorCounts, setDoctorCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<DepartmentFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewingDept, setViewingDept] = useState<Department | null>(null)
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
        setDoctors(doctorsRes.data)
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

    if (editingId) {
      const response = await hospitalAdminApi.updateDepartment(editingId, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      })

      setSaving(false)

      if (response.error || !response.data) {
        setError(response.error ?? 'Failed to update department.')
        return
      }

      setDepartments((prev) => prev.map(d => d.id === editingId ? response.data! : d))
      setForm(EMPTY_FORM)
      setEditingId(null)
      setIsModalOpen(false)
      showToast({
        type: 'success',
        title: 'Department updated',
        message: `${response.data.name} was updated successfully.`,
      })
    } else {
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
      setIsModalOpen(false)
      showToast({
        type: 'success',
        title: 'Department created',
        message: `${response.data.name} was added successfully.`,
      })
    }
  }

  const handleEdit = (dept: Department) => {
    setEditingId(dept.id)
    setForm({
      name: dept.name,
      description: dept.description || '',
    })
    setIsModalOpen(true)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setIsModalOpen(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return

    setDeletingId(id)
    const response = await hospitalAdminApi.deleteDepartment(id)
    setDeletingId(null)

    if (response.error) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        message: response.error ?? 'Failed to delete department.',
      })
      return
    }

    setDepartments((prev) => prev.filter((d) => d.id !== id))
    if (editingId === id) cancelEdit()
    
    showToast({
      type: 'success',
      title: 'Department deleted',
      message: `${name} has been removed.`,
    })
  }

  const filteredDepartments = departments.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (d.description && d.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 rounded-3xl border border-primary/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white shadow-sm rounded-2xl">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-neutral-dark tracking-tight">Departments</h1>
            <p className="mt-1 text-neutral-gray font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary/70" />
              Manage your hospital's specialized divisions
            </p>
          </div>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all shrink-0 h-12 px-6">
          <PlusCircle className="w-5 h-5 mr-2" />
          Add Department
        </Button>
      </div>

      <Modal isOpen={isModalOpen} onClose={cancelEdit} title={editingId ? 'Edit Department' : 'New Department'}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-dark flex items-center gap-2">
              Department Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full px-4 py-3 bg-neutral-50/50 border border-neutral-200 rounded-xl text-sm focus:ring-4 focus:ring-primary/20 focus:border-primary focus:bg-white transition-all outline-none font-medium placeholder:text-neutral-400"
              placeholder="e.g. Cardiology"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-dark flex items-center gap-2">
              Description <span className="text-neutral-400 font-normal text-xs">(Optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full min-h-[140px] px-4 py-3 bg-neutral-50/50 border border-neutral-200 rounded-xl text-sm focus:ring-4 focus:ring-primary/20 focus:border-primary focus:bg-white transition-all outline-none resize-none placeholder:text-neutral-400"
              placeholder="Brief overview of the department's specialties..."
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-error/10 text-error rounded-xl text-sm font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <Button type="button" onClick={cancelEdit} variant="secondary" className="rounded-xl px-6 hover:bg-neutral-100 flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="flex-1 rounded-xl h-12 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95 group">
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </span>
              ) : editingId ? (
                'Update'
              ) : (
                'Create'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 px-2">
            <h2 className="text-lg font-bold text-neutral-dark flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Active Departments
            </h2>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search departments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-white border border-neutral-200 rounded-full text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all w-full sm:w-64"
                />
              </div>
              <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-full border border-neutral-200 shadow-sm whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-bold text-neutral-dark">{departments.length}</span>
                <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Total</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-28 rounded-2xl bg-neutral-100 animate-pulse border border-neutral-200/50" />
              ))}
            </div>
          ) : departments.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2 border-neutral-200 bg-neutral-50/50">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                <Building2 className="w-8 h-8 text-neutral-300" />
              </div>
              <h3 className="text-lg font-bold text-neutral-700 mb-1">No departments yet</h3>
              <p className="text-sm text-neutral-500 max-w-sm">
                Get started by creating your first department using the form.
              </p>
            </Card>
          ) : filteredDepartments.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-2 border-neutral-200 bg-neutral-50/50">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                <Search className="w-8 h-8 text-neutral-300" />
              </div>
              <h3 className="text-lg font-bold text-neutral-700 mb-1">No matches found</h3>
              <p className="text-sm text-neutral-500 max-w-sm">
                We couldn't find any departments matching "{searchQuery}"
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 max-h-[calc(100vh-16rem)] overflow-y-auto pr-2 pb-4 scrollbar-thin scrollbar-thumb-neutral-200 scrollbar-track-transparent">
              {filteredDepartments.map((department) => (
                <Card 
                  key={department.id} 
                  onClick={() => setViewingDept(department)}
                  className={`group relative overflow-hidden transition-all duration-300 hover:shadow-lg border-0 bg-white ring-1 ring-neutral-200/50 hover:ring-primary/20 cursor-pointer ${editingId === department.id ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-500/10 scale-[1.01]' : ''}`}
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary to-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold text-neutral-900 truncate">
                          {department.name}
                        </h3>
                        {editingId === department.id && (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                            Editing
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-neutral-500 line-clamp-2 leading-relaxed max-w-2xl">
                        {department.description || <span className="italic opacity-60">No description provided</span>}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-0 border-neutral-100">
                      <div className="flex flex-col sm:items-end gap-1">
                        <div className="flex items-center gap-1.5 text-neutral-600 bg-neutral-100 px-3 py-1.5 rounded-lg">
                          <Users className="w-4 h-4" />
                          <span className="text-sm font-semibold">
                            {doctorCounts[department.id] || 0}
                          </span>
                          <span className="text-xs text-neutral-500">Doctors</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(department); }}
                          className={`p-2 rounded-xl transition-all duration-200 ${editingId === department.id ? 'bg-amber-100 text-amber-700' : 'bg-neutral-50 text-neutral-400 hover:bg-primary/10 hover:text-primary'} focus:outline-none focus:ring-2 focus:ring-primary/20`}
                          title="Edit department"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(department.id, department.name); }}
                          disabled={deletingId === department.id}
                          className="p-2 bg-neutral-50 text-neutral-400 hover:bg-error/10 hover:text-error rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-error/20 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete department"
                        >
                          {deletingId === department.id ? (
                            <div className="w-4 h-4 border-2 border-error/30 border-t-error rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
      </div>
      <Modal isOpen={!!viewingDept} onClose={() => setViewingDept(null)} title={viewingDept?.name} size="lg">
        {viewingDept && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-neutral-dark mb-2">Description</h3>
              <p className="text-sm text-neutral-gray bg-neutral-50/50 p-4 rounded-xl border border-neutral-100 leading-relaxed">
                {viewingDept.description || <span className="italic opacity-60">No description provided</span>}
              </p>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-dark">Assigned Doctors</h3>
                <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {doctors.filter(d => d.department === viewingDept.id).length} Doctors
                </span>
              </div>
              
              <div className="grid gap-3 sm:grid-cols-2">
                {doctors.filter(d => d.department === viewingDept.id).map(doc => (
                  <div key={doc.id} className="flex items-start gap-3 p-3 rounded-xl border border-neutral-200 bg-white hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all">
                    {doc.image_url_resolved || doc.image_url ? (
                      <img src={doc.image_url_resolved || doc.image_url!} alt={doc.name} className="w-12 h-12 rounded-full object-cover shadow-sm" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-neutral-dark truncate">{doc.name}</p>
                      <p className="text-xs font-medium text-primary truncate mb-1">{doc.specialty}</p>
                      {doc.bio && (
                        <p className="text-[11px] text-neutral-500 line-clamp-2 leading-snug">
                          {doc.bio}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                
                {doctors.filter(d => d.department === viewingDept.id).length === 0 && (
                  <div className="col-span-full p-6 text-center border-2 border-dashed border-neutral-200 rounded-xl bg-neutral-50/50">
                    <p className="text-sm text-neutral-500">No doctors assigned to this department yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}
