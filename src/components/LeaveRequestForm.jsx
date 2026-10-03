import { useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { calcDaysWithDuration, todayISO } from '../utils/dateUtils'
import { fileToAttachment } from '../utils/attachmentStorage'
import { filterVisibleLeaveTypes } from '../utils/leaveTypeAccess'
import { useHolidays } from '../context/HolidaysContext'
import { notifyError, notifySuccess } from './ToastViewport'

const DURATIONS = [
  { id: 'full', label: 'เต็มวัน' },
  { id: 'half_morning', label: 'ครึ่งวันเช้า' },
  { id: 'half_afternoon', label: 'ครึ่งวันบ่าย' },
]

export default function LeaveRequestForm({ leaveTypes, remainingByType, onSubmitted }) {
  const { employee } = useAuth()
  const { holidayDates } = useHolidays()
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [duration, setDuration] = useState('full')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const isSingleDay = startDate === endDate
  const days = calcDaysWithDuration(startDate, endDate, isSingleDay ? duration : 'full', holidayDates)
  const remaining = leaveTypeId ? remainingByType?.[leaveTypeId] : undefined
  const overQuota = remaining !== undefined && days > remaining
  const visibleLeaveTypes = filterVisibleLeaveTypes(employee, leaveTypes)

  function handleStartChange(v) {
    setStartDate(v)
    if (v !== endDate) setDuration('full')
    if (new Date(endDate) < new Date(v)) setEndDate(v)
  }
  function handleEndChange(v) {
    setEndDate(v)
    if (v !== startDate) setDuration('full')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!leaveTypeId) {
      setError('กรุณาเลือกประเภทการลา')
      notifyError('กรุณาเลือกประเภทการลา')
      return
    }
    if (days <= 0) {
      setError('ช่วงวันที่ไม่ถูกต้อง')
      notifyError('ช่วงวันที่ไม่ถูกต้อง')
      return
    }
    if (!reason.trim()) {
      setError('กรุณาระบุรายละเอียดการลา')
      notifyError('กรุณาระบุรายละเอียดการลา')
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
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department || '',
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
        status: 'pending',
        createdAt: serverTimestamp(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: '',
      })

      setSuccess(true)
      notifySuccess('ส่งคำขอลาเรียบร้อยแล้ว')
      setReason('')
      setLeaveTypeId('')
      setFile(null)
      setDuration('full')
      onSubmitted?.()
      setTimeout(() => setSuccess(false), 3000)
    } catch (e2) {
      const message = e2.message || 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'
      setError(message)
      notifyError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-3 space-y-3 sm:p-5 sm:space-y-4">
      <h2 className="font-display font-semibold text-ink text-base sm:text-lg">ยื่นใบลา</h2>

      <div>
        <label className="text-sm text-ink-soft mb-1 block">ประเภทการลา</label>
        <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="input-field" required>
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
          <input type="date" value={startDate} onChange={(e) => handleStartChange(e.target.value)} className="input-field" required />
        </div>
        <div>
          <label className="text-sm text-ink-soft mb-1 block">วันที่สิ้นสุด</label>
          <input type="date" value={endDate} min={startDate} onChange={(e) => handleEndChange(e.target.value)} className="input-field" required />
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
                className={`min-h-10 sm:min-h-11 rounded-lg px-2 text-sm font-semibold border-2 transition-colors ${
                  duration === d.id ? 'bg-ink text-paper border-ink' : 'bg-white text-ink-soft border-ink/15'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className={`text-sm font-mono ${overQuota ? 'text-clay font-semibold' : 'text-brass-dark'}`}>
        รวม {days} วัน{isSingleDay && duration !== 'full' ? '' : 'ทำการ (ไม่รวมวันอาทิตย์และวันหยุด)'}
        {overQuota && ` — เกินโควตาคงเหลือ (เหลือ ${remaining} วัน)`}
      </p>

      <div>
        <label className="text-sm text-ink-soft mb-1 block">รายละเอียดการลา</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="input-field" rows={2} placeholder="เช่น เดินทางไปธุระต่างจังหวัด, มีนัดหมอ ฯลฯ" required />
      </div>

      <div>
        <label className="text-sm text-ink-soft mb-1 block"><span className="sm:hidden">แนบหลักฐาน (ไม่บังคับ)</span><span className="hidden sm:inline">แนบหลักฐาน (ไม่บังคับ — แนบทีหลังก็ได้, ไฟล์รูปภาพ/PDF)</span></label>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="min-h-11 text-sm text-ink-soft file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-ink file:text-paper file:text-sm file:font-semibold file:cursor-pointer"
        />
      </div>

      {error && <p className="text-clay text-sm">{error}</p>}
      {success && <p className="text-sage text-sm font-semibold">ส่งใบลาเรียบร้อย รอการอนุมัติ</p>}

      <button className="btn-primary w-full" disabled={busy}>
        {busy ? 'กำลังส่ง...' : 'ส่งใบลา'}
      </button>
    </form>
  )
}
