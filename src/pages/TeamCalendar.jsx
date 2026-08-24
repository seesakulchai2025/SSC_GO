import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { getMonthGrid, thaiMonthYearLabel, expandBusinessDays, formatThaiDate, DURATION_LABELS, todayISO } from '../utils/dateUtils'

const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export default function TeamCalendar() {
  const [requests, setRequests] = useState([])
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'leaveRequests'), (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === 'approved'))
    })
    return unsub
  }, [])

  const byDate = useMemo(() => {
    const map = {}
    requests.forEach((r) => {
      expandBusinessDays(r.startDate, r.endDate).forEach((dateStr) => {
        if (!map[dateStr]) map[dateStr] = []
        map[dateStr].push(r)
      })
    })
    return map
  }, [requests])

  const weeks = getMonthGrid(cursor.year, cursor.month)
  const todayStr = todayISO()
  const selectedList = selectedDate ? byDate[selectedDate] || [] : []

  function prevMonth() {
    setSelectedDate(null)
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))
  }
  function nextMonth() {
    setSelectedDate(null)
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">ปฏิทินวันลาทีม</h1>
        <p className="text-sm text-ink-soft mt-1">แสดงเฉพาะใบลาที่อนุมัติแล้ว — แตะวันที่มีจุดเพื่อดูรายละเอียด</p>
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
            const isToday = cell.dateStr === todayStr
            const isSelected = cell.dateStr === selectedDate
            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => items.length > 0 && setSelectedDate(cell.dateStr)}
                className={`aspect-square rounded-md p-1 text-left border transition-colors ${
                  isSelected ? 'border-brass bg-brass/10' : isToday ? 'border-brass' : 'border-ink/10'
                } ${cell.isWeekend ? 'bg-paperDark/60' : 'bg-white'} ${
                  items.length > 0 ? 'hover:border-brass cursor-pointer' : 'cursor-default'
                }`}
              >
                <span className={`text-xs font-mono ${isToday ? 'text-brass-dark font-bold' : 'text-ink-soft'}`}>{cell.dayNum}</span>
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
      </div>

      {selectedDate && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-display font-semibold text-ink">{formatThaiDate(selectedDate)}</p>
            <button onClick={() => setSelectedDate(null)} className="text-ink-soft text-sm">
              ปิด
            </button>
          </div>
          <div className="space-y-2">
            {selectedList.map((r) => (
              <div key={r.id} className="text-sm border-b border-ink/10 pb-2 last:border-0 last:pb-0">
                <p className="font-semibold text-ink">
                  {r.employeeName} <span className="text-ink-soft font-normal">· {r.department}</span>
                </p>
                <p className="text-ink-soft">
                  {r.leaveTypeName}
                  {r.duration && r.duration !== 'full' ? ` (${DURATION_LABELS[r.duration]})` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
