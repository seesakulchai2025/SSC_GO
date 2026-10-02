import { useEffect, useState } from 'react'
import { collection, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import LeaveHistoryList from '../components/LeaveHistoryList'
import EditRequestModal from '../components/EditRequestModal'
import LeaveEditHistoryModal from '../components/LeaveEditHistoryModal'
import PrintLeaveForm from './PrintLeaveForm'
import { notifyError, notifySuccess } from '../components/ToastViewport'

const STATUS_OPTIONS = [
  { id: 'pending', label: 'รออนุมัติ' },
  { id: 'approved', label: 'อนุมัติแล้ว' },
  { id: 'rejected', label: 'ไม่อนุมัติ' },
  { id: 'cancelled', label: 'ยกเลิกแล้ว' },
  { id: 'all', label: 'ทั้งหมด' },
]

export default function AdminDashboard() {
  const { employee } = useAuth()
  const [requests, setRequests] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [noteDrafts, setNoteDrafts] = useState({})
  const [rowError, setRowError] = useState({})
  const [editingRequest, setEditingRequest] = useState(null)
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [printingRequestId, setPrintingRequestId] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'leaveRequests'), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rows.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
      setRequests(rows)
    })
    const unsubTypes = onSnapshot(collection(db, 'leaveTypes'), (snap) => {
      setLeaveTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    })
    return () => {
      unsub()
      unsubTypes()
    }
  }, [])

  async function review(id, status) {
    const note = noteDrafts[id] || ''
    if (status === 'rejected' && !note.trim()) {
      setRowError((s) => ({ ...s, [id]: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' }))
      notifyError('กรุณาระบุเหตุผลที่ไม่อนุมัติ')
      return
    }
    setRowError((s) => ({ ...s, [id]: '' }))
    try {
      await updateDoc(doc(db, 'leaveRequests', id), {
        status,
        reviewedBy: employee.name,
        reviewedById: employee.id,
        reviewedAt: serverTimestamp(),
        reviewNote: note,
      })
      notifySuccess(status === 'approved' ? 'อนุมัติคำขอลาเรียบร้อยแล้ว' : 'บันทึกผลไม่อนุมัติเรียบร้อยแล้ว')
    } catch (error) {
      notifyError(`บันทึกผลคำขอลาไม่สำเร็จ (${error.code || error.message || 'unknown'})`)
    }
  }

  async function handleDelete(id, r) {
    const label = `${r.employeeName} · ${r.leaveTypeName} (${r.startDate})`
    if (!confirm(`ยืนยันการลบใบลานี้?\n${label}\n\nการลบไม่สามารถกู้คืนได้`)) return
    try {
      await deleteDoc(doc(db, 'leaveRequests', id))
      notifySuccess('ลบรายการลาเรียบร้อยแล้ว')
    } catch (error) {
      notifyError(`ลบรายการลาไม่สำเร็จ (${error.code || error.message || 'unknown'})`)
    }
  }

  function clearFilters() {
    setSearch('')
    setTypeFilter('')
    setDateFrom('')
    setDateTo('')
    setStatusFilter('pending')
  }

  function showAllRequests() {
    setSearch('')
    setTypeFilter('')
    setDateFrom('')
    setDateTo('')
    setStatusFilter('all')
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length
  const hasActiveFilters = search || typeFilter || dateFrom || dateTo || statusFilter !== 'pending'

  const visible = requests.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (typeFilter && r.leaveTypeId !== typeFilter) return false
    if (dateFrom && r.endDate < dateFrom) return false
    if (dateTo && r.startDate > dateTo) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const haystack = `${r.employeeName} ${r.department || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">อนุมัติวันลา</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={showAllRequests} className="btn-secondary py-2 px-3 text-sm">ดูใบลาทั้งหมด / แก้ย้อนหลัง</button>
          <button type="button" onClick={() => setShowEditHistory(true)} className="btn-secondary py-2 px-3 text-sm">ประวัติการแก้ไข</button>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            placeholder="ค้นหาชื่อพนักงาน หรือแผนก"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field">
            {STATUS_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.id === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
              </option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-field">
            <option value="">ทุกประเภทการลา</option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field" title="ตั้งแต่วันที่" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field" title="ถึงวันที่" />
          </div>
        </div>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-xs font-semibold text-ink-soft underline">
            ล้างตัวกรอง
          </button>
        )}
      </div>

      <p className="text-sm text-ink-soft -mt-2">พบ {visible.length} รายการ</p>

      <LeaveHistoryList
        requests={visible}
        showEmployee
        actions={(r) => (
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setPrintingRequestId(r.id)} className="text-xs font-semibold text-ink-soft underline">
                พิมพ์ใบลา
              </button>
              <button onClick={() => setEditingRequest(r)} className="text-xs font-semibold text-brass-dark underline">
                แก้ไข
              </button>
              <button onClick={() => handleDelete(r.id, r)} className="text-xs font-semibold text-clay underline">
                ลบ
              </button>
            </div>
            {r.status === 'pending' && (
              <div className="flex flex-col gap-1.5 w-44">
                <input
                  placeholder="หมายเหตุ (บังคับถ้าไม่อนุมัติ)"
                  className="text-xs rounded border border-ink/15 px-2 py-1"
                  value={noteDrafts[r.id] || ''}
                  onChange={(e) => setNoteDrafts((s) => ({ ...s, [r.id]: e.target.value }))}
                />
                {rowError[r.id] && <p className="text-clay text-xs">{rowError[r.id]}</p>}
                <div className="flex gap-1.5">
                  <button onClick={() => review(r.id, 'approved')} className="flex-1 text-xs font-semibold rounded-md bg-sage text-white py-1.5 hover:bg-sage/90">
                    อนุมัติ
                  </button>
                  <button onClick={() => review(r.id, 'rejected')} className="flex-1 text-xs font-semibold rounded-md bg-clay text-white py-1.5 hover:bg-clay/90">
                    ปฏิเสธ
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      />

      {editingRequest && (
        <EditRequestModal request={editingRequest} leaveTypes={leaveTypes} onClose={() => setEditingRequest(null)} />
      )}
      {showEditHistory && <LeaveEditHistoryModal onClose={() => setShowEditHistory(false)} />}
      {printingRequestId && <PrintLeaveForm requestId={printingRequestId} onClose={() => setPrintingRequestId(null)} />}
    </div>
  )
}
