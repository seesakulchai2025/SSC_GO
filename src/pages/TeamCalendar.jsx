import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { getMonthGrid, thaiMonthYearLabel, expandBusinessDays, formatThaiDate, DURATION_LABELS, todayISO } from '../utils/dateUtils'
import { useHolidays } from '../context/HolidaysContext'
import { useAuth } from '../context/AuthContext'
import AdminLeaveTypes from './AdminLeaveTypes'
import AdminHolidays from './AdminHolidays'

const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export default function TeamCalendar() {
  const { employee } = useAuth()
  const isAdmin = employee?.role === 'admin'
  const { holidays, holidayDates } = useHolidays()
  const [requests, setRequests] = useState([])
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState(null)
  const [calendarTool, setCalendarTool] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'leaveRequests'), (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === 'approved'))
    })
    return unsub
  }, [])

  const byDate = useMemo(() => {
    const map = {}
    requests.forEach((r) => {
      expandBusinessDays(r.startDate, r.endDate, holidayDates).forEach((dateStr) => {
        if (!map[dateStr]) map[dateStr] = []
        map[dateStr].push(r)
      })
    })
    return map
  }, [requests, holidayDates])

  const holidayNameByDate = useMemo(() => {
    const map = {}
    holidays.forEach((h) => {
      if (h.enabled !== false) map[h.date] = h.name
    })
    return map
  }, [holidays])

  const weeks = getMonthGrid(cursor.year, cursor.month)
  const todayStr = todayISO()
  const selectedList = selectedDate ? byDate[selectedDate] || [] : []
  const selectedHolidayName = selectedDate ? holidayNameByDate[selectedDate] : null

  function prevMonth() {
    setSelectedDate(null)
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))
  }
  function nextMonth() {
    setSelectedDate(null)
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))
  }

  return (
    <div className="page-container page-stack">
      <div className="page-section-head">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">ปฏิทินวันลาทีม</h1>
          <p className="text-sm text-ink-soft mt-1">แสดงเฉพาะใบลาที่อนุมัติแล้ว — แตะวันที่มีจุดหรือวันหยุดเพื่อดูรายละเอียด</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCalendarTool('leaveTypes')} className="btn-secondary py-2 px-3 text-sm">ประเภทลา</button>
            <button type="button" onClick={() => setCalendarTool('holidays')} className="btn-secondary py-2 px-3 text-sm">วันหยุด</button>
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="btn-secondary py-1.5 px-3 text-sm">
            ‹
          </button>
          <p className="font-display font-semibold text-ink">{thaiMonthYearLabel(cursor.year, cursor.month)}</p>
          <button onClick={nextMonth} className="btn-secondary py-1.5 px-3 text-sm">
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-soft mb-1">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((cell, i) => {
            if (!cell) return <div key={`blank-${i}`} />
            const items = byDate[cell.dateStr] || []
            const holidayName = holidayNameByDate[cell.dateStr]
            const isToday = cell.dateStr === todayStr
            const isSelected = cell.dateStr === selectedDate
            const canOpen = items.length > 0 || !!holidayName
            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => canOpen && setSelectedDate(cell.dateStr)}
                title={holidayName}
                className={`aspect-square rounded-md p-1 text-left border transition-colors ${
                  isSelected ? 'border-brass bg-brass/10' : isToday ? 'border-brass' : 'border-ink/10'
                } ${holidayName ? 'bg-clay-light' : cell.isWeekend ? 'bg-paperDark/60' : 'bg-white'} ${
                  canOpen ? 'hover:border-brass cursor-pointer' : 'cursor-default'
                }`}
              >
                <span className={`text-xs font-mono ${isToday ? 'text-brass-dark font-bold' : holidayName ? 'text-clay font-semibold' : 'text-ink-soft'}`}>
                  {cell.dayNum}
                </span>
                {items.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {items.slice(0, 4).map((r) => (
                      <span key={r.id} className="block w-1.5 h-1.5 rounded-full bg-ink" title={r.employeeName} />
                    ))}
                    {items.length > 4 && <span className="text-[9px] text-ink-soft">+{items.length - 4}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-4 mt-4 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-paperDark/60 border border-ink/10 inline-block" /> วันอาทิตย์
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-clay-light border border-ink/10 inline-block" /> วันหยุดที่เปิดใช้งาน
          </span>
        </div>
      </div>

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink/50 p-3 no-print sm:p-6" onClick={() => setSelectedDate(null)}>
          <section role="dialog" aria-modal="true" aria-label={`รายละเอียดวันที่ ${formatThaiDate(selectedDate)}`} onClick={(e) => e.stopPropagation()} className="card modal-frame w-full max-w-md">
            <header className="flex shrink-0 items-center justify-between border-b border-ink/10 px-5 py-4">
              <div>
                <p className="font-display font-semibold text-ink text-lg">{formatThaiDate(selectedDate)}</p>
                {selectedHolidayName && <p className="text-sm text-clay font-semibold mt-0.5">🎌 {selectedHolidayName}</p>}
              </div>
              <button onClick={() => setSelectedDate(null)} aria-label="ปิดรายละเอียดวันที่" className="px-2 text-xl leading-none text-ink-soft">
                ×
              </button>
            </header>
            <div className="modal-scroll space-y-3 p-5">
              {selectedList.length === 0 && <p className="text-ink-soft text-sm">ไม่มีใครลาวันนี้</p>}
              {selectedList.map((r) => (
                <div key={r.id} className="border-b border-ink/10 pb-3 last:border-0 last:pb-0">
                  <p className="font-semibold text-ink">
                    {r.employeeName} <span className="text-ink-soft font-normal text-sm">· {r.department}</span>
                  </p>
                  <p className="text-sm text-ink-soft">
                    {r.leaveTypeName}
                    {r.duration && r.duration !== 'full' ? ` (${DURATION_LABELS[r.duration]})` : ''}
                  </p>
                  {r.reason && <p className="text-sm text-ink mt-1">"{r.reason}"</p>}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {calendarTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink/50 p-3 no-print sm:p-6" onClick={() => setCalendarTool(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="calendar-tool-title" onClick={(event) => event.stopPropagation()} className="card modal-frame relative w-full max-w-4xl">
            <header className="flex shrink-0 items-center justify-between border-b border-ink/10 bg-white px-4 py-3 sm:px-6">
              <h2 id="calendar-tool-title" className="font-display text-lg font-semibold text-ink">{calendarTool === 'leaveTypes' ? 'จัดการประเภทลา' : 'จัดการวันหยุด'}</h2>
              <button type="button" onClick={() => setCalendarTool(null)} aria-label="ปิดหน้าต่าง" className="px-2 text-2xl leading-none text-ink-soft">×</button>
            </header>
            <div className="modal-scroll">{calendarTool === 'leaveTypes' ? <AdminLeaveTypes /> : <AdminHolidays />}</div>
          </section>
        </div>
      )}
    </div>
  )
}
