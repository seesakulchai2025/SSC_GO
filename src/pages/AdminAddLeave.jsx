import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useHolidays } from '../context/HolidaysContext'
import { calcDaysWithDuration, todayISO } from '../utils/dateUtils'
import { filterVisibleLeaveTypes } from '../utils/leaveTypeAccess'
import { fileToAttachment } from '../utils/attachmentStorage'

const DURATIONS = [
  { id: 'full', label: 'เต็มวัน' },
  { id: 'half_morning', label: 'ครึ่งวันเช้า' },
  { id: 'half_afternoon', label: 'ครึ่งวันบ่าย' },
]

export default function AdminAddLeave() {
  const { employee: admin } = useAuth()
  const { holidayDates } = useHolidays()
  const [employees, setEmployees] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])

  const [employeeId, setEmployeeId] = useState('')
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [duration, setDuration] = useState('full')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'employees'), (snap) =>
      setEmployees(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((e) => e.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      )
    )
    const unsub2 = onSnapshot(collection(db, 'leaveTypes'), (snap) =>
      setLeaveTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    )
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  const selectedEmployee = employees.find((e) => e.id === employeeId)
  const visibleLeaveTypes = selectedEmployee ? filterVisibleLeaveTypes(selectedEmployee, leaveTypes) : leaveTypes
  const isSingleDay = startDate === endDate
  const days = calcDaysWithDuration(startDate, endDate, isSingleDay ? duration : 'full', holidayDates)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!selectedEmployee) {
      setError('กรุณาเลือกพนักงาน')
      return
    }
    if (!leaveTypeId) {
      setError('กรุณาเลือกประเภทการลา')
      return
    }
    if (days <= 0) {
      setError('ช่วงวันที่ไม่ถูกต้อง')
      return
    }

    setBusy(true)
    try {
      let attachment = null
      if (file) {
        attachment = await fileToAttachment(file)
      }
      const leaveType = leaveTypes.find((t) => t.id === leaveTypeId)
      await addDoc(collection(db, 'leaveRequests'), {
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        department: selectedEmployee.department || '',
        leaveTypeId,
        leaveTypeName: leaveType?.name || '',
        startDate,
        endDate,
        duration: isSingleDay ? duration : 'full',
        days,
        reason,
        attachmentData: attachment?.data || null,
        attachmentName: attachment?.name || null,
        attachmentType: attachment?.type || null,
        status: 'approved',
        createdAt: serverTimestamp(),
        reviewedBy: admin.name,
        reviewedById: admin.id,
        reviewedAt: serverTimestamp(),
        reviewNote: 'ลงบันทึกโดยแอดมิน',
      })
      setSuccess(true)
      setReason('')
      setFile(null)
      setDuration('full')
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">ลงวันลาให้พนักงาน</h1>
        <p className="text-sm text-ink-soft mt-1">รายการที่บันทึกจากหน้านี้จะถูกอนุมัติทันที (ไม่ต้องรออนุมัติ)</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <div>
          <label className="text-sm text-ink-soft mb-1 block">พนักงาน</label>
          <select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setLeaveTypeId('') }} className="input-field" required>
            <option value="">เลือกพนักงาน</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} {e.department ? `· ${e.department}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-ink-soft mb-1 block">ประเภทการลา</label>
          <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="input-field" required disabled={!employeeId}>
            <option value="">เลือกประเภทการลา</option>
            {visibleLeaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-ink-soft mb-1 block">วันที่เริ่มลา</label>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (new Date(endDate) < new Date(e.target.value)) setEndDate(e.target.value) }} className="input-field" required />
          </div>
          <div>
            <label className="text-sm text-ink-soft mb-1 block">วันที่สิ้นสุด</label>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="input-field" required />
          </div>
        </div>

        {isSingleDay && (
          <div>
            <label className="text-sm text-ink-soft mb-1 block">ลักษณะการลา</label>
            <div className="grid grid-cols-3 gap-2">
              {DURATIONS.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => setDuration(d.id)}
                  className={`py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    duration === d.id ? 'bg-ink text-paper border-ink' : 'bg-white text-ink-soft border-ink/15'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm font-mono text-brass-dark">รวม {days} วัน</p>

        <div>
          <label className="text-sm text-ink-soft mb-1 block">รายละเอียดการลา</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="input-field" rows={2} placeholder="เช่น ลาป่วยตามใบรับรองแพทย์" />
        </div>

        <div>
          <label className="text-sm text-ink-soft mb-1 block">แนบหลักฐาน (ไม่บังคับ)</label>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm text-ink-soft file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-ink file:text-paper file:text-sm file:font-semibold file:cursor-pointer"
          />
        </div>

        {error && <p className="text-clay text-sm">{error}</p>}
        {success && <p className="text-sage text-sm font-semibold">บันทึกใบลาเรียบร้อย (อนุมัติแล้ว)</p>}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'กำลังบันทึก...' : 'บันทึกใบลา (อนุมัติทันที)'}
        </button>
      </form>
    </div>
  )
}
