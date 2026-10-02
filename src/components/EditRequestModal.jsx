import { useState } from 'react'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { calcDaysWithDuration } from '../utils/dateUtils'
import { useHolidays } from '../context/HolidaysContext'
import { notifyError, notifySuccess } from './ToastViewport'

const DURATIONS = [
  { id: 'full', label: 'เต็มวัน' },
  { id: 'half_morning', label: 'ครึ่งวันเช้า' },
  { id: 'half_afternoon', label: 'ครึ่งวันบ่าย' },
]

export default function EditRequestModal({ request, leaveTypes, onClose }) {
  const { holidayDates } = useHolidays()
  const { employee } = useAuth()
  const [leaveTypeId, setLeaveTypeId] = useState(request.leaveTypeId)
  const [startDate, setStartDate] = useState(request.startDate)
  const [endDate, setEndDate] = useState(request.endDate)
  const [duration, setDuration] = useState(request.duration || 'full')
  const [reason, setReason] = useState(request.reason || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')


  const isSingleDay = startDate === endDate
  const days = calcDaysWithDuration(startDate, endDate, isSingleDay ? duration : 'full', holidayDates)

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (days <= 0) {
      setError('ช่วงวันที่ไม่ถูกต้อง')
      return
    }
    setBusy(true)
    try {
      const leaveType = leaveTypes.find((t) => t.id === leaveTypeId)
      const nextValues = {
        leaveTypeId,
        leaveTypeName: leaveType?.name || request.leaveTypeName,
        startDate,
        endDate,
        duration: isSingleDay ? duration : 'full',
        days,
        reason,
      }
      const previousValues = {
        leaveTypeId: request.leaveTypeId,
        leaveTypeName: request.leaveTypeName,
        startDate: request.startDate,
        endDate: request.endDate,
        duration: request.duration || 'full',
        days: request.days,
        reason: request.reason || '',
      }
      const hasChanges = Object.keys(nextValues).some((key) => nextValues[key] !== previousValues[key])
      if (!hasChanges) {
        onClose()
        return
      }

      const batch = writeBatch(db)
      batch.update(doc(db, 'leaveRequests', request.id), nextValues)
      const auditRef = doc(collection(db, 'leaveEditAuditLogs'))
      batch.set(auditRef, {
        requestId: request.id,
        employeeId: request.employeeId || '',
        employeeName: request.employeeName || '',
        department: request.department || '',
        leaveDate: startDate,
        changedById: employee.id,
        changedByName: employee.name,
        changedAt: serverTimestamp(),
        changedAtClient: new Date().toISOString(),
        previous: previousValues,
        next: nextValues,
      })
      await batch.commit()
      notifySuccess('แก้ไขใบลาเรียบร้อยแล้ว')
      onClose()
    } catch (err) {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      notifyError(err.message || 'แก้ไขใบลาไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink/50 p-3 no-print sm:p-6" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSave} className="card modal-frame w-full max-w-md">
        <header className="flex shrink-0 items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">แก้ไขใบลา</h2>
          <button type="button" onClick={onClose} aria-label="ปิดแก้ไขใบลา" className="px-2 text-xl leading-none text-ink-soft">
            ×
          </button>
        </header>
        <div className="modal-scroll space-y-4 px-5 py-4">
        <p className="text-sm text-ink-soft">{request.employeeName}</p>

        <div>
          <label className="text-sm text-ink-soft mb-1 block">ประเภทการลา</label>
          <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="input-field" required>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-ink-soft mb-1 block">วันที่เริ่มลา</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field" required />
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
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="input-field" rows={2} />
        </div>

        {error && <p className="text-clay text-sm">{error}</p>}

        </div>
        <footer className="flex shrink-0 gap-2 border-t border-ink/10 p-4">
          <button className="btn-primary flex-1" disabled={busy}>
            {busy ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            ยกเลิก
          </button>
        </footer>
      </form>
    </div>
  )
}
