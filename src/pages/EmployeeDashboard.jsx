import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import LeaveBalanceCard from '../components/LeaveBalanceCard'
import LeaveRequestForm from '../components/LeaveRequestForm'
import LeaveHistoryList from '../components/LeaveHistoryList'
import AttachmentUploader from '../components/AttachmentUploader'
import TodayLeaveCard from '../components/TodayLeaveCard'
import LeaveEditHistoryModal from '../components/LeaveEditHistoryModal'
import PrintLeaveForm from './PrintLeaveForm'
import AdminDashboard from './AdminDashboard'
import { filterVisibleLeaveTypes } from '../utils/leaveTypeAccess'
import { notifyError, notifySuccess } from '../components/ToastViewport'
import { useAdminPendingCount } from '../hooks/useAdminPendingCount'

export default function EmployeeDashboard() {
  const { employee } = useAuth()
  const isAdmin = employee?.role === 'admin'
  const { count: pendingCount } = useAdminPendingCount(isAdmin)
  const [leaveTypes, setLeaveTypes] = useState([])
  const [requests, setRequests] = useState([])
  const [printingRequestId, setPrintingRequestId] = useState(null)
  const [showApprovalPopup, setShowApprovalPopup] = useState(false)
  const [showAllLeavesPopup, setShowAllLeavesPopup] = useState(false)
  const [allLeavesTab, setAllLeavesTab] = useState('all')

  useEffect(() => {
    if (!showApprovalPopup && !showAllLeavesPopup) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setShowApprovalPopup(false)
        setShowAllLeavesPopup(false)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [showApprovalPopup, showAllLeavesPopup])

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
  const quotaGridColumns = visibleLeaveTypes.length >= 3 ? 'grid-cols-3' : visibleLeaveTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-1'

  async function handleCancel(id) {
    if (!confirm('ยืนยันยกเลิกใบลานี้?')) return
    try {
      await updateDoc(doc(db, 'leaveRequests', id), { status: 'cancelled' })
      notifySuccess('ยกเลิกคำขอลาเรียบร้อยแล้ว')
    } catch (error) {
      notifyError(`ยกเลิกคำขอลาไม่สำเร็จ (${error.code || error.message || 'unknown'})`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">ลงวันลา</h1>
          <p className="text-sm text-ink-soft">{employee.name}{employee.department ? ` · ${employee.department}` : ''}</p>
        </div>
        {isAdmin && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
            <button type="button" onClick={() => setShowApprovalPopup(true)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-ink bg-ink px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-light sm:flex-none sm:px-4">
              อนุมัติ ({pendingCount})
            </button>
            <button type="button" onClick={() => { setAllLeavesTab('all'); setShowAllLeavesPopup(true) }} className="btn-secondary inline-flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm sm:flex-none sm:px-4">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
              ใบลาทั้งหมด
            </button>
          </div>
        )}
      </div>

      <TodayLeaveCard />

      <div>
        <h2 className="font-display font-semibold text-ink mb-3">โควตาวันลาปีนี้</h2>
        <div className={`grid ${quotaGridColumns} gap-2 sm:gap-3`}>
          {visibleLeaveTypes.map((t) => (
            <LeaveBalanceCard key={t.id} leaveType={t} used={usedByType[t.id] || 0} quota={quotaByType[t.id]} variant="donut" />
          ))}
        </div>
      </div>

      <LeaveRequestForm leaveTypes={visibleLeaveTypes} remainingByType={remainingByType} />

      <div>
        <h2 className="font-display font-semibold text-ink mb-3">ประวัติการลา</h2>
        <LeaveHistoryList
          requests={requests}
          actions={(r) => (
            <div className="flex flex-col items-end gap-2">
              <button type="button" onClick={() => setPrintingRequestId(r.id)} className="text-xs font-semibold text-ink-soft underline">
                พิมพ์ใบลา
              </button>
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
      {showApprovalPopup && isAdmin && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={() => setShowApprovalPopup(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="leave-approval-popup-title" onClick={(event) => event.stopPropagation()} className="card modal-frame w-full max-w-3xl">
            <header className="flex items-center justify-between border-b border-ink/10 px-4 py-3 sm:px-6">
              <h2 id="leave-approval-popup-title" className="font-display text-lg font-semibold text-ink">อนุมัติวันลา</h2>
              <button type="button" onClick={() => setShowApprovalPopup(false)} aria-label="ปิดหน้าต่างอนุมัติ" className="grid size-11 place-items-center text-xl text-ink-soft">×</button>
            </header>
            <AdminDashboard embedded approvalOnly />
          </section>
        </div>
      )}
      {showAllLeavesPopup && isAdmin && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={() => setShowAllLeavesPopup(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="all-leaves-popup-title" onClick={(event) => event.stopPropagation()} className="card modal-frame w-full max-w-3xl">
            <header className="shrink-0 border-b border-ink/10 px-4 pt-3 sm:px-6 sm:pt-4">
              <div className="flex items-center justify-between gap-3">
                <h2 id="all-leaves-popup-title" className="font-display text-lg font-semibold text-ink">ใบลาทั้งหมด</h2>
                <button type="button" onClick={() => setShowAllLeavesPopup(false)} aria-label="ปิดใบลาทั้งหมด" className="grid size-11 shrink-0 place-items-center text-xl text-ink-soft">×</button>
              </div>
              <div className="grid grid-cols-2 gap-1 border-b border-ink/10" role="tablist" aria-label="ข้อมูลใบลา">
                <button type="button" role="tab" aria-selected={allLeavesTab === 'all'} onClick={() => setAllLeavesTab('all')} className={`min-h-11 border-b-2 px-2 text-sm font-semibold ${allLeavesTab === 'all' ? 'border-ink text-ink' : 'border-transparent text-ink-soft'}`}>
                  ใบลาทั้งหมด / แก้ย้อนหลัง
                </button>
                <button type="button" role="tab" aria-selected={allLeavesTab === 'history'} onClick={() => setAllLeavesTab('history')} className={`min-h-11 border-b-2 px-2 text-sm font-semibold ${allLeavesTab === 'history' ? 'border-ink text-ink' : 'border-transparent text-ink-soft'}`}>
                  ประวัติการแก้ไข
                </button>
              </div>
            </header>
            {allLeavesTab === 'all'
              ? <AdminDashboard embedded reviewedOnly initialStatusFilter="all" />
              : <div className="modal-scroll px-3 py-3 sm:px-5 sm:py-4"><LeaveEditHistoryModal embedded /></div>}
          </section>
        </div>
      )}
      {printingRequestId && <PrintLeaveForm requestId={printingRequestId} onClose={() => setPrintingRequestId(null)} />}
    </div>
  )
}
