import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import LeaveBalanceCard from '../components/LeaveBalanceCard'
import LeaveRequestForm from '../components/LeaveRequestForm'
import LeaveHistoryList from '../components/LeaveHistoryList'
import AttachmentUploader from '../components/AttachmentUploader'
import TodayLeaveCard from '../components/TodayLeaveCard'
import Attendance from './Attendance'
import { filterVisibleLeaveTypes } from '../utils/leaveTypeAccess'
import { Link } from 'react-router-dom'

export default function EmployeeDashboard() {
  const { employee } = useAuth()
  const [leaveTypes, setLeaveTypes] = useState([])
  const [requests, setRequests] = useState([])
  const [activeSystem, setActiveSystem] = useState('leave')

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'leaveTypes'), (snap) => {
      setLeaveTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    })
    return unsub1
  }, [])

  useEffect(() => {
    if (!employee) return
    const q = query(collection(db, 'leaveRequests'), where('employeeId', '==', employee.id))
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rows.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
      setRequests(rows)
    })
    return unsub
  }, [employee])

  const currentYear = new Date().getFullYear()
  const usedByType = {}
  requests.forEach((r) => {
    if (r.status === 'approved' && new Date(r.startDate).getFullYear() === currentYear) {
      usedByType[r.leaveTypeId] = (usedByType[r.leaveTypeId] || 0) + r.days
    }
  })

  const quotaByType = {}
  const remainingByType = {}
  leaveTypes.forEach((t) => {
    const quota = employee.balances?.[t.id] ?? t.defaultDays ?? 0
    quotaByType[t.id] = quota
    remainingByType[t.id] = quota - (usedByType[t.id] || 0)
  })

  const visibleLeaveTypes = filterVisibleLeaveTypes(employee, leaveTypes)

  async function handleCancel(id) {
    if (!confirm('ยืนยันยกเลิกใบลานี้?')) return
    await updateDoc(doc(db, 'leaveRequests', id), { status: 'cancelled' })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">ลงเวลาเข้างาน</h1>
          <p className="text-sm text-ink-soft">{employee.name}{employee.department ? ` · ${employee.department}` : ''}</p>
        </div>
        <div className="flex gap-1 border-b border-ink/10" role="tablist" aria-label="ระบบงานพนักงาน">
          <button
            type="button"
            role="tab"
            aria-selected={activeSystem === 'leave'}
            onClick={() => setActiveSystem('leave')}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${activeSystem === 'leave' ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            ลงวันลา
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSystem === 'attendance'}
            onClick={() => setActiveSystem('attendance')}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${activeSystem === 'attendance' ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            ลงเวลาเข้างาน
          </button>
        </div>
      </div>

      {activeSystem === 'attendance' ? (
        <Attendance embedded />
      ) : (
        <>
          <TodayLeaveCard />

          <div>
            <h2 className="font-display font-semibold text-ink mb-3">โควตาวันลาปีนี้</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visibleLeaveTypes.map((t) => (
                <LeaveBalanceCard key={t.id} leaveType={t} used={usedByType[t.id] || 0} quota={quotaByType[t.id]} />
              ))}
            </div>
          </div>

          <LeaveRequestForm leaveTypes={leaveTypes} remainingByType={remainingByType} />

          <div>
            <h2 className="font-display font-semibold text-ink mb-3">ประวัติการลา</h2>
            <LeaveHistoryList
              requests={requests}
              actions={(r) => (
                <div className="flex flex-col items-end gap-2">
                  <Link to={`/print/${r.id}`} className="text-xs font-semibold text-ink-soft underline">
                    พิมพ์ใบลา
                  </Link>
                  {r.status === 'pending' && (
                    <button onClick={() => handleCancel(r.id)} className="text-xs font-semibold text-clay underline">
                      ยกเลิกใบลา
                    </button>
                  )}
                  <AttachmentUploader requestId={r.id} existing={r} />
                </div>
              )}
            />
          </div>
        </>
      )}
    </div>
  )
}
