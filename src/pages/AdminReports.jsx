import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { calcDaysWithDuration, formatThaiDate, formatThaiDateLong, DURATION_LABELS, todayISO } from '../utils/dateUtils'
import { useHolidays } from '../context/HolidaysContext'

const STATUS_OPTIONS = [
  { id: 'approved', label: 'อนุมัติแล้วเท่านั้น' },
  { id: 'all', label: 'ทุกสถานะ' },
  { id: 'pending', label: 'รออนุมัติ' },
  { id: 'rejected', label: 'ไม่อนุมัติ' },
  { id: 'cancelled', label: 'ยกเลิกแล้ว' },
]

function toISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function AdminReports() {
  const { holidayDates } = useHolidays()
  const [requests, setRequests] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [period, setPeriod] = useState('month')
  const [periodDate, setPeriodDate] = useState(todayISO().slice(0, 7))
  const [statusFilter, setStatusFilter] = useState('approved')
  const [typeFilter, setTypeFilter] = useState('')

  function changePeriod(nextPeriod) {
    let nextDate = periodDate
    if (period === 'year' && nextDate) nextDate = `${nextDate}-01-01`
    if (period === 'month' && nextDate) nextDate = `${nextDate}-01`
    if (nextPeriod === 'year') nextDate = nextDate.slice(0, 4)
    if (nextPeriod === 'month') nextDate = nextDate.slice(0, 7)
    setPeriodDate(nextDate)
    setPeriod(nextPeriod)
  }

  const dateFrom = !periodDate ? ''
    : period === 'year' ? `${periodDate}-01-01`
      : period === 'month' ? `${periodDate}-01`
        : periodDate
  const dateTo = !periodDate ? ''
    : period === 'year' ? `${periodDate}-12-31`
      : period === 'month' ? (() => {
        const [year, month] = periodDate.split('-').map(Number)
        return toISODate(new Date(year, month, 0))
      })()
        : periodDate
  const periodLabel = !periodDate ? 'กรุณาเลือกช่วงเวลา'
    : period === 'year'
      ? `ปี ${Number(periodDate) + 543}`
      : period === 'month'
        ? new Date(`${periodDate}-01`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
        : formatThaiDate(periodDate)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'leaveRequests'), (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    const unsubTypes = onSnapshot(collection(db, 'leaveTypes'), (snap) => {
      setLeaveTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    })
    return () => {
      unsub()
      unsubTypes()
    }
  }, [])

  const filtered = useMemo(() => {
    return requests
      .flatMap((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return []
        if (typeFilter && r.leaveTypeId !== typeFilter) return []
        if (!r.startDate || !r.endDate || r.endDate < dateFrom || r.startDate > dateTo) return []
        const overlapStart = r.startDate > dateFrom ? r.startDate : dateFrom
        const overlapEnd = r.endDate < dateTo ? r.endDate : dateTo
        const duration = overlapStart === r.startDate && overlapEnd === r.endDate ? r.duration : 'full'
        const reportDays = calcDaysWithDuration(overlapStart, overlapEnd, duration, holidayDates)
        return reportDays > 0 ? [{ ...r, reportDays }] : []
      })
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || a.employeeName.localeCompare(b.employeeName, 'th'))
  }, [requests, statusFilter, typeFilter, dateFrom, dateTo, holidayDates])

  const payrollSummary = useMemo(() => {
    const summary = new Map()
    filtered.forEach((r) => {
      const employee = summary.get(r.employeeId || r.employeeName) || {
        employeeId: r.employeeId || r.employeeName,
        employeeName: r.employeeName,
        department: r.department || '',
        requests: 0,
        days: 0,
      }
      employee.requests += 1
      employee.days += r.reportDays
      summary.set(employee.employeeId, employee)
    })
    return [...summary.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'th'))
  }, [filtered])

  const totalsByType = useMemo(() => {
    const totals = {}
    filtered.forEach((r) => {
      totals[r.leaveTypeName] = (totals[r.leaveTypeName] || 0) + r.reportDays
    })
    return totals
  }, [filtered])

  const STATUS_LABELS = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' }

  async function handleExportExcel() {
    const XLSX = await import('xlsx')
    const rows = filtered.map((r, i) => ({
      ลำดับ: i + 1,
      ชื่อพนักงาน: r.employeeName,
      แผนก: r.department || '',
      ประเภทการลา: r.leaveTypeName,
      วันที่เริ่ม: r.startDate,
      วันที่สิ้นสุด: r.endDate,
      ลักษณะ: r.duration && r.duration !== 'full' ? DURATION_LABELS[r.duration] : 'เต็มวัน',
      จำนวนวันในงวด: r.reportDays,
      สถานะ: STATUS_LABELS[r.status] || r.status,
      รายละเอียด: r.reason || '',
      ผู้อนุมัติ: r.reviewedBy || '',
      หมายเหตุ: r.reviewNote || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'รายงานวันลา')
    XLSX.writeFile(wb, `รายงานวันลา_${dateFrom}_ถึง_${dateTo}.xlsx`)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">รายงานวันลาเพื่อคำนวณเงินเดือน</h1>

      <div className="card p-4 space-y-3 no-print">
        <div>
          <label className="text-sm text-ink-soft mb-1 block">ช่วงเวลารายงาน</label>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="เลือกช่วงเวลารายงาน">
            {[
              { id: 'day', label: 'รายวัน' },
              { id: 'month', label: 'รายเดือน' },
              { id: 'year', label: 'รายปี' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => changePeriod(option.id)}
                aria-pressed={period === option.id}
                className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold ${period === option.id ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white text-ink-soft'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-ink-soft mb-1 block">{period === 'day' ? 'วันที่' : period === 'month' ? 'เดือน' : 'ปี ค.ศ.'}</label>
            <input
              type={period === 'day' ? 'date' : period === 'month' ? 'month' : 'number'}
              min={period === 'year' ? '2000' : undefined}
              max={period === 'year' ? '2100' : undefined}
              value={periodDate}
              onChange={(e) => setPeriodDate(e.target.value)}
              className="input-field"
              aria-label={period === 'day' ? 'วันที่รายงาน' : period === 'month' ? 'เดือนที่รายงาน' : 'ปีที่รายงาน ค.ศ.'}
            />
          </div>
          <div>
            <label className="text-sm text-ink-soft mb-1 block">สถานะ</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field">
              {STATUS_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-ink-soft mb-1 block">ประเภทการลา</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-field">
              <option value="">ทุกประเภท</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button onClick={handleExportExcel} className="btn-primary py-2 px-4 text-sm">
            ⬇ ส่งออกเป็น Excel
          </button>
          <button onClick={() => window.print()} className="btn-secondary py-2 px-4 text-sm">
            🖨 พิมพ์ / บันทึกเป็น PDF
          </button>
        </div>
      </div>

      <div>
        <p className="font-display font-semibold text-ink text-lg">รายงานวันลาเพื่อคำนวณเงินเดือน</p>
        <p className="text-sm text-ink-soft">
          {periodLabel} · ช่วงวันที่ {formatThaiDate(dateFrom)} – {formatThaiDate(dateTo)} · พิมพ์เมื่อ {formatThaiDateLong()}
        </p>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-ink/10 px-3 py-2 font-semibold text-ink">สรุปวันลารายพนักงาน</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-ink-soft">
              <th className="p-3 font-semibold">พนักงาน</th>
              <th className="p-3 font-semibold">แผนก</th>
              <th className="p-3 font-semibold text-right">จำนวนใบลา</th>
              <th className="p-3 font-semibold text-right">รวมวันลาในงวด</th>
            </tr>
          </thead>
          <tbody>
            {payrollSummary.map((employee) => (
              <tr key={employee.employeeId} className="border-b border-ink/5 last:border-0">
                <td className="p-3 font-semibold">{employee.employeeName}</td>
                <td className="p-3">{employee.department || '-'}</td>
                <td className="p-3 text-right font-mono">{employee.requests}</td>
                <td className="p-3 text-right font-mono font-semibold">{employee.days} วัน</td>
              </tr>
            ))}
            {payrollSummary.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-ink-soft">ไม่มีข้อมูลตามตัวกรองที่เลือก</td></tr>
            )}
            {payrollSummary.length > 0 && (
              <tr className="border-t-2 border-ink/15 font-semibold">
                <td className="p-3" colSpan={3}>รวมทั้งหมด</td>
                <td className="p-3 text-right font-mono">{payrollSummary.reduce((sum, employee) => sum + employee.days, 0)} วัน</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-ink-soft">
              <th className="p-3 font-semibold">พนักงาน</th>
              <th className="p-3 font-semibold">ประเภท</th>
              <th className="p-3 font-semibold">วันที่</th>
              <th className="p-3 font-semibold text-right">จำนวนวัน</th>
              <th className="p-3 font-semibold">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-ink/5 last:border-0">
                <td className="p-3">
                  <p className="font-semibold text-ink">{r.employeeName}</p>
                  <p className="text-ink-soft text-xs">{r.department}</p>
                </td>
                <td className="p-3">{r.leaveTypeName}</td>
                <td className="p-3 font-mono text-xs">
                  {formatThaiDate(r.startDate)}
                  {r.startDate !== r.endDate && ` – ${formatThaiDate(r.endDate)}`}
                </td>
                <td className="p-3 text-right font-mono">{r.reportDays}</td>
                <td className="p-3">{STATUS_LABELS[r.status] || r.status}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-soft">
                  ไม่มีข้อมูลตามตัวกรองที่เลือก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {Object.keys(totalsByType).length > 0 && (
        <div className="card p-4">
          <p className="font-semibold text-ink mb-2">สรุปรวมตามประเภทการลา</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {Object.entries(totalsByType).map(([name, days]) => (
              <div key={name} className="flex justify-between border-b border-ink/10 pb-1">
                <span className="text-ink-soft">{name}</span>
                <span className="font-mono font-semibold text-ink">{days} วัน</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
