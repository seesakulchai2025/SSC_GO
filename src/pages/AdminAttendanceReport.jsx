import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { ATTENDANCE_EVENTS, getAttendanceEvents, getAttendanceLateMinutes, isOffsite, summarizeMonthlyAttendance } from '../utils/attendanceUtils'
import { attendanceDay, bangkokTime, formatDateDMY, todayISO } from '../utils/dateUtils'
import { notifyError, notifySuccess } from '../components/ToastViewport'

const PERIODS = [
  { id: 'day', label: 'รายวัน' },
  { id: 'month', label: 'รายเดือน' },
  { id: 'year', label: 'รายปี' },
]

function formatDate(date) {
  return formatDateDMY(date)
}

function formatShortDate(date) {
  return formatDateDMY(date)
}

function formatTime(value) {
  if (!value) return '-'
  return bangkokTime(value, { seconds: true })
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
    const unsubscribeEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
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
    .filter((record) => { const date = attendanceDay(record.attendanceDate); return date && date >= from && date <= to })
    .filter((record) => !employeeFilter || record.employeeId === employeeFilter)
    .sort((a, b) => (attendanceDay(b.attendanceDate) || '').localeCompare(attendanceDay(a.attendanceDate) || '') || (a.employeeName || '').localeCompare(b.employeeName || '', 'th')),
  [records, from, to, employeeFilter])
  const months = new Set(filteredRecords.map((record) => attendanceDay(record.attendanceDate).slice(0, 7)))
  const totalDeduction = [...months].reduce((sum, month) => sum + summarizeMonthlyAttendance(filteredRecords, month).deductionBaht, 0)
  const offsiteCounts = new Map()
  filteredRecords.filter(isOffsite).forEach((record) => {
    const month = attendanceDay(record.attendanceDate).slice(0, 7)
    const key = `${record.employeeId}:${month}`
    const current = offsiteCounts.get(key) || { name: record.employeeName, month, days: new Set() }
    current.days.add(attendanceDay(record.attendanceDate))
    offsiteCounts.set(key, current)
  })

  async function exportExcel() {
    try {
      const XLSX = await import('xlsx')
      const rows = filteredRecords.map((record) => {
      const events = getAttendanceEvents(record)
      const row = {
        วันที่: formatDateDMY(attendanceDay(record.attendanceDate)),
        พนักงาน: record.employeeName,
        แผนก: record.department || '',
        สถานะ: isOffsite(record) ? 'นอกสถานที่' : record.status === 'late' ? 'สาย' : 'ปกติ',
        รายละเอียดนอกสถานที่: record.offsite?.destination || record.offSiteDetails || '',
      }
      ATTENDANCE_EVENTS.forEach((event) => {
        const scan = events[event.id]
        row[`${event.label}เวลา`] = scan?.clientAt ? `${formatDateDMY(attendanceDay(scan.clientAt))} ${bangkokTime(scan.clientAt, { seconds: true })}` : ''
        row[`${event.label}พิกัด`] = scan?.latitude != null && scan?.longitude != null ? `${scan.latitude}, ${scan.longitude}` : ''
        row[`${event.label}ระยะจากร้าน(เมตร)`] = scan?.distanceMeters ?? ''
      })
      row['สาย(นาที)'] = getAttendanceLateMinutes(record)
      row['หัก(บาท)'] = getAttendanceLateMinutes(record)
      return row
      })
      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'รายงานลงเวลา')
      XLSX.writeFile(workbook, `รายงานลงเวลา_${from}_ถึง_${to}.xlsx`)
      notifySuccess('ดาวน์โหลดรายงานเวลาเข้างาน Excel แล้ว')
    } catch (error) {
      notifyError(`ส่งออกรายงานเวลาเข้างานไม่สำเร็จ (${error.message || 'unknown'})`)
    }
  }

  return (
    <div className="report-panel report-compact-page page-stack">
      <h2 className="report-compact-heading font-display text-xl font-semibold text-ink">รายงานลงเวลาเข้างาน</h2>

      <div className="report-compact-card card no-print p-4 space-y-4">
        <div className="report-compact-segmented flex flex-wrap items-center gap-2" role="group" aria-label="ช่วงเวลารายงานลงเวลา">
          {PERIODS.map((option) => (
            <button key={option.id} type="button" aria-pressed={period === option.id} onClick={() => changePeriod(option.id)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${period === option.id ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white text-ink-soft'}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="report-compact-filter-grid grid grid-cols-2 gap-2 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto_auto] sm:items-end sm:gap-3">
          <label className="report-compact-label min-w-0 text-sm text-ink-soft">
            {period === 'day' ? 'วันที่' : period === 'month' ? 'เดือน' : 'ปี ค.ศ.'}
            <input type={period === 'day' ? 'date' : period === 'month' ? 'month' : 'number'} min={period === 'year' ? '2000' : undefined} max={period === 'year' ? '2100' : undefined} value={periodValue} onChange={(event) => setPeriodValue(event.target.value)} className="report-compact-control input-field mt-1" />
          </label>
          <label className="report-compact-label min-w-0 text-sm text-ink-soft">
            พนักงาน
            <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className="report-compact-control input-field mt-1">
              <option value="">ทุกคน</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={exportExcel} className="btn-primary py-2 px-4 text-sm">ส่งออก Excel</button>
          <button type="button" onClick={() => { window.print(); notifySuccess('เปิดหน้าต่างพิมพ์หรือบันทึก PDF แล้ว') }} className="btn-secondary py-2 px-4 text-sm">พิมพ์ / บันทึก PDF</button>
        </div>
      </div>

      <div className="report-compact-summary flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{from && to ? `${formatDate(from)} – ${formatDate(to)}` : 'เลือกช่วงเวลารายงาน'}</p>
          <p className="text-sm text-ink-soft">{filteredRecords.length} รายการ · ยอดหักรวม {totalDeduction} บาท</p>
        </div>
        {offsiteCounts.size > 0 && <section className="card p-3 text-sm"><h3 className="font-semibold">สรุปวันนอกสถานที่ต่อเดือน</h3>{[...offsiteCounts.values()].map((item) => <p key={`${item.name}-${item.month}`}>{item.name} · {item.month} · {item.days.size} วัน</p>)}</section>}
      </div>

      <section className="report-compact-card report-compact-table-frame card report-print-card overflow-x-auto">
        <table className="report-compact-attendance-table w-full min-w-[1120px] text-sm">
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
                  <td className="whitespace-nowrap p-3 text-center font-mono">{formatShortDate(attendanceDay(record.attendanceDate))}</td>
                  <td className="whitespace-nowrap p-3 text-center"><span className="font-semibold">{record.employeeName}</span><span className="block text-xs text-ink-soft">{record.department || ''}</span>{isOffsite(record) && <span className="block text-xs font-semibold">นอกสถานที่ · {record.offsite?.destination || record.offSiteDetails}</span>}{record.edited && <span className="block text-xs font-semibold">แก้ไขแล้ว</span>}</td>
                  {ATTENDANCE_EVENTS.map((event) => (
                    <td key={event.id} className="whitespace-nowrap p-3 text-center">
                      {events[event.id] ? (
                        <div className="report-compact-attendance-event">
                          <p className="font-mono">{formatTime(events[event.id].clientAt)}</p>
                          {Number.isFinite(events[event.id].latitude) && Number.isFinite(events[event.id].longitude) && (
                            <a href={`https://www.google.com/maps?q=${events[event.id].latitude},${events[event.id].longitude}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brass-dark underline">
                              แผนที่ · {events[event.id].distanceMeters} ม.
                            </a>
                          )}
                        </div>
                      ) : <span className="text-ink-soft">-</span>}
                    </td>
                  ))}
                  <td className="whitespace-nowrap p-3 text-center font-mono">{getAttendanceLateMinutes(record)} นาที</td>
                  <td className="whitespace-nowrap p-3 text-center font-mono">{getAttendanceLateMinutes(record)}</td>
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
