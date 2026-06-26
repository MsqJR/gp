'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { hospitalAdminApi } from '@/lib/hospitalAdminApi';
import { businessInfoApi } from '@/lib/api';
import { normalizeLogoUrl, getScopedItem } from '@/lib/storage';
import type { Appointment } from '@/types/hospital';
import { FiPrinter, FiChevronDown, FiChevronRight, FiUser, FiCalendar } from 'react-icons/fi';

type PatientWithAppointments = {
  name: string;
  email: string;
  phone: string;
  gender?: string;
  age?: number;
  appointments: Appointment[];
};

type DoctorGroup = {
  doctorId: string;
  doctorName: string;
  departmentName: string;
  patients: PatientWithAppointments[];
  totalAppointments: number;
};

export default function HospitalPatientsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDoctors, setExpandedDoctors] = useState<Set<string>>(new Set());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('all');
  const [hospitalInfo, setHospitalInfo] = useState<{name: string, logoUrl: string | null}>({ name: 'Medify', logoUrl: null });

  useEffect(() => {
    const load = async () => {
      try {
        const [apptsRes, infoRes] = await Promise.all([
          hospitalAdminApi.listAppointments(),
          businessInfoApi.get().catch(() => null)
        ]);

        if (apptsRes.data) setAppointments(apptsRes.data);
        
        let loadedName = 'Medify';
        let loadedLogo = null;

        if (infoRes && infoRes.data) {
          const infoData = infoRes.data as any;
          if (infoData) {
            if (infoData.name) loadedName = infoData.name;
            loadedLogo = normalizeLogoUrl(infoData.logo_url) || normalizeLogoUrl(infoData.logo);
          }
        }
        
        // Fallback to local storage (important if logo is too large for backend or hasn't synced)
        if (!loadedLogo || loadedName === 'Medify') {
          const snapshot = getScopedItem('businessInfo');
          if (snapshot) {
            try {
              const parsed = JSON.parse(snapshot);
              if (parsed.name && loadedName === 'Medify') loadedName = parsed.name;
              if (!loadedLogo) loadedLogo = normalizeLogoUrl(parsed.logo) || normalizeLogoUrl(parsed.logo_url);
            } catch (e) {}
          }
        }

        // Clean up redundant "Hospital's Hospital" if accidentally saved that way
        const cleanedName = loadedName
          .replace(/ Hospital's Hospital/gi, ' Hospital')
          .replace(/ Hospital Hospital/gi, ' Hospital');

        setHospitalInfo({
          name: cleanedName,
          logoUrl: loadedLogo
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const doctorGroups = useMemo<DoctorGroup[]>(() => {
    const doctorMap = new Map<string, Map<string, PatientWithAppointments>>();

    for (const appointment of appointments) {
      const doctorId = appointment.doctor;
      const doctorName = appointment.doctor_name || 'Unknown Doctor';
      const patientKey = `${appointment.patient_name}|${appointment.patient_email}|${appointment.patient_phone}`;

      if (!doctorMap.has(doctorId)) {
        doctorMap.set(doctorId, new Map());
      }

      const patientsMap = doctorMap.get(doctorId)!;
      
      if (!patientsMap.has(patientKey)) {
        patientsMap.set(patientKey, {
          name: appointment.patient_name,
          email: appointment.patient_email,
          phone: appointment.patient_phone,
          gender: appointment.patient_gender,
          age: appointment.patient_age,
          appointments: [],
        });
      }

      patientsMap.get(patientKey)!.appointments.push(appointment);
    }

    const groups: DoctorGroup[] = [];
    for (const [doctorId, patientsMap] of doctorMap.entries()) {
      const patients = [...patientsMap.values()];
      const firstAppointment = patients[0]?.appointments[0];
      
      groups.push({
        doctorId,
        doctorName: firstAppointment?.doctor_name || 'Unknown Doctor',
        departmentName: firstAppointment?.department_name || 'General',
        patients: patients.sort((a, b) => a.name.localeCompare(b.name)),
        totalAppointments: patients.reduce((sum, p) => sum + p.appointments.length, 0),
      });
    }

    return groups.sort((a, b) => a.doctorName.localeCompare(b.doctorName));
  }, [appointments]);

  const uniqueDepartments = useMemo(() => {
    const depts = new Set<string>();
    doctorGroups.forEach(g => depts.add(g.departmentName));
    return Array.from(depts).sort();
  }, [doctorGroups]);

  const filteredDoctorsByDept = useMemo(() => {
    if (selectedDepartment === 'all') return doctorGroups;
    return doctorGroups.filter(g => g.departmentName === selectedDepartment);
  }, [doctorGroups, selectedDepartment]);

  const filteredGroups = selectedDoctor === 'all' 
    ? filteredDoctorsByDept 
    : filteredDoctorsByDept.filter(g => g.doctorId === selectedDoctor);

  const toggleDoctor = (doctorId: string) => {
    setExpandedDoctors(prev => {
      const next = new Set(prev);
      if (next.has(doctorId)) {
        next.delete(doctorId);
      } else {
        next.add(doctorId);
      }
      return next;
    });
  };

  const handlePrint = (doctorId?: string) => {
    let groupsToPrint = doctorId 
      ? doctorGroups.filter(g => g.doctorId === doctorId)
      : filteredGroups;

    // Filter for today's confirmed appointments
    const today = new Date();
    const todayStart = new Date(today.setHours(0,0,0,0));
    const todayEnd = new Date(today.setHours(23,59,59,999));

    groupsToPrint = groupsToPrint.map(group => {
      const todayPatients = group.patients.map(patient => {
        const todayAppointments = patient.appointments.filter(appt => {
          const apptDate = new Date(appt.start_datetime);
          return apptDate >= todayStart && apptDate <= todayEnd && appt.status === 'CONFIRMED';
        });
        return { ...patient, appointments: todayAppointments };
      }).filter(p => p.appointments.length > 0);

      return {
        ...group,
        patients: todayPatients,
        totalAppointments: todayPatients.reduce((sum, p) => sum + p.appointments.length, 0),
      };
    }).filter(g => g.patients.length > 0);

    if (groupsToPrint.length === 0) {
      alert("No confirmed appointments found for today.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Patient List - ${doctorId ? groupsToPrint[0]?.doctorName : 'All Doctors'}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px;
              color: #333;
            }
            .brand-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 3px solid #2563eb;
              padding-bottom: 15px;
              margin-bottom: 25px;
            }
            .brand-logo {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .brand-text {
              font-size: 26px;
              font-weight: 800;
              color: #1e3a8a;
              letter-spacing: -0.5px;
            }
            h1 { 
              color: #4b5563; 
              font-size: 18px;
              font-weight: 600;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .doctor-header {
              display: flex;
              align-items: center;
              gap: 12px;
              margin-top: 35px;
              margin-bottom: 15px;
            }
            h2 { 
              color: #2563eb; 
              margin: 0;
              font-size: 20px;
            }
            .dept-badge {
              background: #eff6ff;
              color: #1d4ed8;
              border: 1px solid #bfdbfe;
              padding: 4px 12px;
              border-radius: 100px;
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 30px;
              background: white;
            }
            th { 
              background-color: #f3f4f6; 
              padding: 12px 8px; 
              text-align: left; 
              border: 1px solid #e5e7eb;
              font-weight: 600;
              color: #374151;
              font-size: 13px;
            }
            td { 
              padding: 10px 8px; 
              border: 1px solid #e5e7eb;
              font-size: 13px;
              vertical-align: top;
            }
            tr:nth-child(even) {
              background-color: #f9fafb;
            }
            .header-info {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
              padding: 15px;
              background: #f3f4f6;
              border-radius: 8px;
            }
            .summary {
              margin-bottom: 20px;
              padding: 15px;
              background: #eff6ff;
              border-left: 4px solid #2563eb;
            }
            .appointment-list {
              margin: 0;
              padding: 0;
              list-style: none;
            }
            .appointment-item {
              padding: 4px 0;
              font-size: 12px;
            }
            .appointment-date {
              font-weight: 600;
              color: #1f2937;
            }
            .appointment-time {
              color: #6b7280;
              margin-left: 8px;
            }
            .checkbox-box {
              display: inline-block;
              width: 14px;
              height: 14px;
              border: 1px solid #9ca3af;
              border-radius: 3px;
              margin-left: 10px;
              vertical-align: text-bottom;
              background-color: white;
            }
            @media print {
              .no-print { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="brand-header">
            <div class="brand-logo">
              ${hospitalInfo.logoUrl ? `
                <img src="${hospitalInfo.logoUrl}" alt="Hospital Logo" style="max-height: 40px; max-width: 120px; object-fit: contain;" />
              ` : `
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              `}
              <div class="brand-text">${hospitalInfo.name}</div>
            </div>
            <h1>Daily Patient Schedule</h1>
          </div>
          <div class="header-info">
            <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
            <div><strong>Total Doctors:</strong> ${groupsToPrint.length}</div>
          </div>
          
          ${groupsToPrint.map(group => `
            <div style="page-break-inside: avoid;">
              <div class="doctor-header">
                <h2>${group.doctorName}</h2>
                <span class="dept-badge">${group.departmentName}</span>
              </div>
              <div class="summary">
                <strong>Total Patients:</strong> ${group.patients.length} | 
                <strong>Total Appointments:</strong> ${group.totalAppointments}
              </div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 5%;">#</th>
                    <th style="width: 20%;">Patient Name</th>
                    <th style="width: 15%;">Phone</th>
                    <th style="width: 10%;">Gender</th>
                    <th style="width: 10%;">Age</th>
                    <th style="width: 15%;">Department</th>
                    <th style="width: 15%;">Time</th>
                    <th style="width: 10%; text-align: center;">Arrived</th>
                  </tr>
                </thead>
                <tbody>
                  ${group.patients.map((patient, idx) => {
                    const sortedAppointments = patient.appointments.sort((a, b) => 
                      new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
                    );
                    
                    return `
                    <tr>
                      <td>${idx + 1}</td>
                      <td><strong>${patient.name}</strong></td>
                      <td>${patient.phone}</td>
                      <td style="font-size: 11px;">${patient.gender || '-'}</td>
                      <td style="font-size: 11px;">${patient.age || '-'}</td>
                      <td style="font-size: 11px;">${group.departmentName}</td>
                      <td>
                        <ul class="appointment-list">
                          ${sortedAppointments.map(appt => {
                            const date = new Date(appt.start_datetime);
                            const dateStr = date.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            });
                            const timeStr = date.toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            });
                            
                            return `
                              <li class="appointment-item">
                                <span class="appointment-date">${dateStr}</span>
                                <span class="appointment-time">${timeStr}</span>
                              </li>
                            `;
                          }).join('')}
                        </ul>
                      </td>
                      <td style="text-align: center; vertical-align: middle;">
                        <span class="checkbox-box" style="margin: 0; width: 16px; height: 16px; border: 1.5px solid #6b7280;"></span>
                      </td>
                    </tr>
                  `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `).join('')}
          
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-dark">Patients by Doctor</h1>
          <p className="mt-1 text-neutral-gray">Patient records grouped by their treating physician.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => handlePrint()}
          disabled={loading || doctorGroups.length === 0}
        >
          <FiPrinter className="mr-2" />
          Print All
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-dark">Filter by Department:</label>
            <select
              value={selectedDepartment}
              onChange={(e) => {
                setSelectedDepartment(e.target.value);
                setSelectedDoctor('all'); // Reset doctor when department changes
              }}
              className="rounded-lg border border-neutral-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
            >
              <option value="all">All Departments</option>
              {uniqueDepartments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-dark">Filter by Doctor:</label>
            <select
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              className="rounded-lg border border-neutral-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
            >
              <option value="all">All Doctors ({filteredDoctorsByDept.length})</option>
              {filteredDoctorsByDept.map(group => (
                <option key={group.doctorId} value={group.doctorId}>
                  {group.doctorName} ({group.patients.length} patients)
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Doctor Groups */}
      {loading ? (
        <Card className="p-6">
          <div className="text-sm text-neutral-gray">Loading patients...</div>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card className="p-6">
          <div className="text-sm text-neutral-gray">No patients yet.</div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const isExpanded = expandedDoctors.has(group.doctorId);
            
            return (
              <Card key={group.doctorId} className="overflow-hidden">
                {/* Doctor Header */}
                <div
                  className="flex items-center justify-between bg-neutral-light p-4 cursor-pointer hover:bg-neutral-light/80 transition"
                  onClick={() => toggleDoctor(group.doctorId)}
                >
                  <div className="flex items-center gap-3">
                    <button className="text-neutral-gray">
                      {isExpanded ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
                    </button>
                    <div>
                      <h3 className="font-bold text-neutral-dark flex items-center gap-2">
                        <FiUser size={18} />
                        {group.doctorName}
                      </h3>
                      <p className="text-sm text-neutral-gray mt-0.5">
                        {group.patients.length} patient{group.patients.length !== 1 ? 's' : ''} • {group.totalAppointments} appointment{group.totalAppointments !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrint(group.doctorId);
                    }}
                  >
                    <FiPrinter className="mr-2" />
                    Print
                  </Button>
                </div>

                {/* Patient List */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-neutral-light/50">
                        <tr className="text-left text-neutral-gray">
                          <th className="px-4 py-3 font-medium">#</th>
                          <th className="px-4 py-3 font-medium">Patient Name</th>
                          <th className="px-4 py-3 font-medium">Phone</th>
                          <th className="px-4 py-3 font-medium">Email</th>
                          <th className="px-4 py-3 font-medium">Department</th>
                          <th className="px-4 py-3 font-medium text-center">Appointments</th>
                          <th className="px-4 py-3 font-medium">Last Visit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.patients.map((patient, idx) => {
                          const lastAppointment = patient.appointments.sort((a, b) => 
                            new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()
                          )[0];
                          
                          return (
                            <tr key={idx} className="border-t border-neutral-border hover:bg-neutral-light/30">
                              <td className="px-4 py-3 text-sm text-neutral-gray font-medium">{idx + 1}</td>
                              <td className="px-4 py-3 font-semibold text-neutral-dark">{patient.name}</td>
                              <td className="px-4 py-3 text-neutral-gray">{patient.phone}</td>
                              <td className="px-4 py-3 text-neutral-gray">{patient.email}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-medium text-primary px-2.5 py-1 bg-primary/10 rounded-full inline-block">
                                  {group.departmentName}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                  <FiCalendar size={12} />
                                  {patient.appointments.length}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-neutral-gray">
                                {new Date(lastAppointment.start_datetime).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
