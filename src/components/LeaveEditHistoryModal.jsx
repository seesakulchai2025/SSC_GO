import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { DURATION_LABELS, formatThaiDate, todayISO, toISODate } from '../utils/dateUtils'

const PERIOD_OPTIONS = [
  { id: 'day', label: 'รายวัน' },
  { id: 'month', label: 'รายเดือน' },
  { id: 'year', label: 'รายปี' },
]

const FIELD_LABELS = {
  leaveTypeName: 'ประเภทการลา',
  startDate: 'วันเริ่มลา',
  endDate: 'วันสิ้นสุด',
  duration: 'ลักษณะการลา',
  days: 'จำนวนวัน',
  reason: 'รายละเอียด',
}

function displayValue(field, value) {
  if (value === undefined || value === null || value === '') return '-'
  if (field === 'startDate' || field === 'endDate') return formatThaiDate(value)
  if (field === 'duration') return DURATION_LABELS[value] || value
  if (field === 'days') return `${value} วัน`
  return value
}

function changedAt(log) {
  if (log.changedAtClient) return new Date(log.changedAtClient)
  if (log.changedAt?.toDate) return log.changedAt.toDate()
  return null
}

export default function LeaveEditHistoryModal({ onClose }) {
  const today = todayISO()
  const [mode, setMode] = useState('month')
  const [selectedDay, setSelectedDay] = useState(today)
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(today.slice(0, 4))
  const [logs, setLogs] = useState([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'leaveEditAuditLogs'), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      rows.sort((a, b) => (b.changedAtClient || '').localeCompare(a.changedAtClient || ''))
      setLogs(rows)
      setLoadError('')
    }, (error) => {
      setLoadError(error.message || 'โหลดประวัติการแก้ไขไม่สำเร็จ')
    })
    return unsubscribe
  }, [])

  const filteredLogs = useMemo(() => logs.filter((log) => {
    const timestamp = changedAt(log)
    if (!timestamp || Number.isNaN(timestamp.getTime())) return false
    const date = toISODate(timestamp)
    if (mode === 'day') return date === selectedDay
    if (mode === 'month') return date.slice(0, 7) === selectedMonth
    return date.slice(0, 4) === selectedYear
  }), [logs, mode, selectedDay, selectedMonth, selectedYear])

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-3 py-4 sm:px-6" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="leave-edit-history-title" onClick={(event) => event.stopPropagation()} className="card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-4 py-4 sm:px-6">
          <div>
            <h2 id="leave-edit-history-title" className="font-display text-xl font-semibold text-ink">ประวัติการแก้ไขใบลา</h2>
            <p className="mt-1 text-sm text-ink-soft">แสดงเวลา ผู้แก้ไข และข้อมูลก่อน/หลังการแก้ไข</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิดประวัติการแก้ไข" className="shrink-0 px-2 text-2xl leading-none text-ink-soft">×</button>
        </header>

        <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex rounded-md border border-ink/15 p-1" role="group" aria-label="ช่วงเวลาประวัติ">
              {PERIOD_OPTIONS.map((option) => (
                <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => setMode(option.id)} className={`rounded px-3 py-1.5 text-sm font-semibold ${mode === option.id ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}>
                  {option.label}
                </button>
              ))}
            </div>
            <label className="min-w-40 flex-1 text-sm text-ink-soft">
              {mode === 'day' ? 'วันที่แก้ไข' : mode === 'month' ? 'เดือนที่แก้ไข' : 'ปี ค.ศ.'}
              <input
                type={mode === 'day' ? 'date' : mode === 'month' ? 'month' : 'number'}
                min={mode === 'year' ? '2000' : undefined}
                max={mode === 'year' ? '2100' : undefined}
                value={mode === 'day' ? selectedDay : mode === 'month' ? selectedMonth : selectedYear}
                onChange={(event) => {
                  if (mode === 'day') setSelectedDay(event.target.value)
                  else if (mode === 'month') setSelectedMonth(event.target.value)
                  else setSelectedYear(event.target.value)
                }}
                className="input-field mt-1"
              />
            </label>
            <p className="pb-2 text-sm text-ink-soft">{filteredLogs.length} รายการ</p>
          </div>

          {loadError && <p role="alert" className="rounded-md bg-clay-light p-3 text-sm text-clay">{loadError}</p>}
          {!loadError && filteredLogs.length === 0 && <p className="py-10 text-center text-sm text-ink-soft">ไม่มีประวัติการแก้ไขในช่วงเวลานี้</p>}

          <div className="space-y-3">
            {filteredLogs.map((log) => {
              const fields = Object.keys(FIELD_LABELS).filter((field) => log.previous?.[field] !== log.next?.[field])
              const timestamp = changedAt(log)
              return (
                <article key={log.id} className="rounded-md border border-ink/10 bg-white p-4">
                  <div className="flex flex-wrap justify-between gap-2 border-b border-ink/10 pb-2">
                    <div>
                      <p className="font-semibold text-ink">{log.employeeName || 'ไม่ระบุพนักงาน'} <span className="font-normal text-ink-soft">· {log.department || 'ไม่ระบุแผนก'}</span></p>
                      <p className="mt-0.5 text-xs text-ink-soft">วันที่ลา {formatThaiDate(log.leaveDate)} · แก้ไขโดย {log.changedByName || 'ไม่ระบุ'}</p>
                    </div>
                    <time className="text-xs text-ink-soft">{timestamp?.toLocaleString('th-TH') || '-'}</time>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    {fields.map((field) => (
                      <div key={field}>
                        <dt className="text-xs text-ink-soft">{FIELD_LABELS[field]}</dt>
                        <dd className="break-words text-ink">
                          <span className="text-clay">{displayValue(field, log.previous?.[field])}</span>
                          <span className="mx-2 text-ink-soft">→</span>
                          <span className="font-semibold">{displayValue(field, log.next?.[field])}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              )
            })}
          </div>
        </div>

        <footer className="flex justify-end border-t border-ink/10 px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="btn-secondary py-2 px-4 text-sm">ปิด</button>
        </footer>
      </section>
    </div>
  )
}
