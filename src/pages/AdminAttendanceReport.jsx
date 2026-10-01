import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { ATTENDANCE_EVENTS, getAttendanceEvents } from '../utils/attendanceUtils'
import { todayISO } from '../utils/dateUtils'

const PERIODS = [
  { id: 'day', label: 'รายวัน' },
  { id: 'month', label: 'รายเดือน' },
  { id: 'year', label: 'รายปี' },
]

function formatDate(date) {
  if (!date) return '-'
  return new Date(`${date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatShortDate(date) {
  if (!date) return '-'
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year.slice(-2)}`
}

function formatTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getDateRange(period, value) {
  if (!value) return { from: '', to: '' }
  if (period === 'day') return { from: value, to: value }
  if (period === 'year') return { from: `${value}-01-01`, to: `${value}-12-31` }
  const [year, month] = value.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return { from: `${value}-01`, to: `${value}-${String(lastDay).padStart(2, '0')}` }
}

export default function AdminAttendanceReport() {
  const today = todayISO()
  const [period, setPeriod] = useState('month')
  const [periodValue, setPeriodValue] = useState(today.slice(0, 7))
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [employees, setEmployees] = useState([])
  const [records, setRecords] = useState([])

  useEffect(() => {
    const unsubscribeEmployees = onSnapshot(query(collection(db, 'employees'), where('payrollProfileReady', '==', true)), (snapshot) => {
      setEmployees(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => a.name.localeCompare(b.name, 'th')))
    })
    const unsubscribeAttendance = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      setRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    })
    return () => {
      unsubscribeEmployees()
      unsubscribeAttendance()
    }
  }, [])

  function changePeriod(nextPeriod) {
    let value = periodValue
    if (period === 'year' && value) value = `${value}-01-01`
    if (period === 'month' && value) value = `${value}-01`
    if (nextPeriod === 'year') value = value.slice(0, 4)
    if (nextPeriod === 'month') value = value.slice(0, 7)
    setPeriodValue(value)
    setPeriod(nextPeriod)
  }

  const { from, to } = getDateRange(period, periodValue)
  const filteredRecords = useMemo(() => records
    .filter((record) => record.attendanceDate && record.attendanceDate >= from && record.attendanceDate <= to)
    .filter((record) => !employeeFilter || record.employeeId === employeeFilter)
    .sort((a, b) => (b.attendanceDate || '').localeCompare(a.attendanceDate || '') || (a.employeeName || '').localeCompare(b.employeeName || '', 'th')),
  [records, from, to, employeeFilter])
  const totalDeduction = filteredRecords.reduce((sum, record) => sum + (record.deductionBaht || 0), 0)

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const rows = filteredRecords.map((record) => {
      const events = getAttendanceEvents(record)
      const row = {
        วันที่: record.attendanceDate,
        พนักงาน: record.employeeName,
        แผนก: record.department || '',
      }
      ATTENDANCE_EVENTS.forEach((event) => {
        const scan = events[event.id]
        row[`${event.label}เวลา`] = scan?.clientAt || ''
        row[`${event.label}พิกัด`] = scan?.latitude != null && scan?.longitude != null ? `${scan.latitude}, ${scan.longitude}` : ''
        row[`${event.label}ระยะจากร้าน(เมตร)`] = scan?.distanceMeters ?? ''
      })
      row['สาย(นาที)'] = record.lateMinutes || 0
      row['หัก(บาท)'] = record.deductionBaht || 0
      return row
    })
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'รายงานลงเวลา')
    XLSX.writeFile(workbook, `รายงานลงเวลา_${from}_ถึง_${to}.xlsx`)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <h2 className="font-display text-xl font-semibold text-ink">รายงานลงเวลาเข้างาน</h2>

      <div className="card no-print p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="ช่วงเวลารายงานลงเวลา">
          {PERIODS.map((option) => (
            <button key={option.id} type="button" aria-pressed={period === option.id} onClick={() => changePeriod(option.id)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${period === option.id ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white text-ink-soft'}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto_auto] sm:items-end">
          <label className="text-sm text-ink-soft">
            {period === 'day' ? 'วันที่' : period === 'month' ? 'เดือน' : 'ปี ค.ศ.'}
            <input type={period === 'day' ? 'date' : period === 'month' ? 'month' : 'number'} min={period === 'year' ? '2000' : undefined} max={period === 'year' ? '2100' : undefined} value={periodValue} onChange={(event) => setPeriodValue(event.target.value)} className="input-field mt-1" />
          </label>
          <label className="text-sm text-ink-soft">
            พนักงาน
            <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className="input-field mt-1">
              <option value="">ทุกคน</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={exportExcel} className="btn-primary py-2 px-4 text-sm">ส่งออก Excel</button>
          <button type="button" onClick={() => window.print()} className="btn-secondary py-2 px-4 text-sm">พิมพ์ / บันทึก PDF</button>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{from && to ? `${formatDate(from)} – ${formatDate(to)}` : 'เลือกช่วงเวลารายงาน'}</p>
          <p className="text-sm text-ink-soft">{filteredRecords.length} รายการ · ยอดหักรวม {totalDeduction} บาท</p>
        </div>
      </div>

      <section className="card report-print-card overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-center text-ink-soft">
              <th className="whitespace-nowrap p-3 font-semibold">วันที่</th>
              <th className="whitespace-nowrap p-3 font-semibold">พนักงาน</th>
              <th className="whitespace-nowrap p-3 font-semibold">เข้า</th>
              <th className="whitespace-nowrap p-3 font-semibold">ออกพัก</th>
              <th className="whitespace-nowrap p-3 font-semibold">กลับพัก</th>
              <th className="whitespace-nowrap p-3 font-semibold">ออกงาน</th>
              <th className="whitespace-nowrap p-3 text-center font-semibold">สาย</th>
              <th className="whitespace-nowrap p-3 text-center font-semibold">หัก (บาท)</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record) => {
              const events = getAttendanceEvents(record)
              return (
                <tr key={record.id} className="border-b border-ink/5 align-top last:border-0">
                  <td className="whitespace-nowrap p-3 text-center font-mono">{formatShortDate(record.attendanceDate)}</td>
                  <td className="whitespace-nowrap p-3 text-center"><span className="font-semibold">{record.employeeName}</span><span className="block text-xs text-ink-soft">{record.department || ''}</span></td>
                  {ATTENDANCE_EVENTS.map((event) => (
                    <td key={event.id} className="whitespace-nowrap p-3 text-center">
                      {events[event.id] ? (
                        <div>
                          <p className="font-mono">{formatTime(events[event.id].clientAt)}</p>
                          <a href={`https://www.google.com/maps?q=${events[event.id].latitude},${events[event.id].longitude}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brass-dark underline">
                            แผนที่ · {events[event.id].distanceMeters} ม.
                          </a>
                        </div>
                      ) : <span className="text-ink-soft">-</span>}
                    </td>
                  ))}
                  <td className="whitespace-nowrap p-3 text-center font-mono">{record.lateMinutes || 0} นาที</td>
                  <td className="whitespace-nowrap p-3 text-center font-mono">{record.deductionBaht || 0}</td>
                </tr>
              )
            })}
            {filteredRecords.length === 0 && <tr><td colSpan={ATTENDANCE_EVENTS.length + 4} className="p-8 text-center text-ink-soft">ไม่มีรายการลงเวลาในช่วงนี้</td></tr>}
          </tbody>
        </table>
      </section>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          .no-print { display: none !important; }
          .report-print-card { overflow: visible !important; border: 0 !important; box-shadow: none !important; }
          .report-print-card table { width: 100% !important; min-width: 0 !important; border-collapse: collapse !important; font-size: 7pt !important; }
          .report-print-card thead { display: table-header-group; }
          .report-print-card tr { break-inside: avoid; page-break-inside: avoid; }
          .report-print-card th, .report-print-card td { padding: 4px 3px !important; }
        }
      `}</style>
    </div>
  )
}
