import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { calcDaysWithDuration, formatThaiDate, formatThaiDateLong, DURATION_LABELS, todayISO } from '../utils/dateUtils'
import { useHolidays } from '../context/HolidaysContext'
import { notifyError, notifySuccess } from '../components/ToastViewport'

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

function requestDaysInRange(request, startDate, endDate, holidayDates) {
  if (!request.startDate || !request.endDate || request.endDate < startDate || request.startDate > endDate) return 0
  const overlapStart = request.startDate > startDate ? request.startDate : startDate
  const overlapEnd = request.endDate < endDate ? request.endDate : endDate
  const duration = overlapStart === request.startDate && overlapEnd === request.endDate ? request.duration : 'full'
  return calcDaysWithDuration(overlapStart, overlapEnd, duration, holidayDates)
}

export default function AdminReports() {
  const { holidayDates } = useHolidays()
  const [requests, setRequests] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [employees, setEmployees] = useState([])
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
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => {
      unsub()
      unsubTypes()
      unsubEmployees()
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

  const typeSummary = useMemo(() => {
    const summary = new Map()
    leaveTypes
      .filter((type) => !typeFilter || type.id === typeFilter)
      .forEach((type) => summary.set(type.id, { id: type.id, name: type.name, requests: 0, days: 0 }))
    filtered.forEach((request) => {
      const id = request.leaveTypeId || request.leaveTypeName
      const row = summary.get(id) || { id, name: request.leaveTypeName || 'ไม่ระบุประเภท', requests: 0, days: 0 }
      row.requests += 1
      row.days += request.reportDays
      summary.set(id, row)
    })
    return [...summary.values()]
  }, [leaveTypes, typeFilter, filtered])

  const payrollSummary = useMemo(() => {
    const summary = new Map()
    filtered.forEach((r) => {
      const employee = summary.get(r.employeeId || r.employeeName) || {
        employeeId: r.employeeId || r.employeeName,
        employeeName: r.employeeName,
        department: r.department || '',
        requests: 0,
        days: 0,
        daysByType: {},
      }
      employee.requests += 1
      employee.days += r.reportDays
      const typeId = r.leaveTypeId || r.leaveTypeName
      employee.daysByType[typeId] = (employee.daysByType[typeId] || 0) + r.reportDays
      summary.set(employee.employeeId, employee)
    })
    return [...summary.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'th'))
  }, [filtered])

  const monthlyOverage = useMemo(() => {
    const byEmployee = new Map()
    const byType = new Map()
    if (period !== 'month' || !periodDate || !dateFrom || !dateTo) return { byEmployee, byType }

    const yearStart = `${periodDate.slice(0, 4)}-01-01`
    const previousMonthEnd = new Date(`${dateFrom}T00:00:00`)
    previousMonthEnd.setDate(previousMonthEnd.getDate() - 1)
    const previousEnd = toISODate(previousMonthEnd)
    const usageByEmployeeType = new Map()

    requests.filter((request) => request.status === 'approved').forEach((request) => {
      const typeId = request.leaveTypeId
      if (!request.employeeId || !typeId) return
      const beforeDays = requestDaysInRange(request, yearStart, previousEnd, holidayDates)
      const monthDays = requestDaysInRange(request, dateFrom, dateTo, holidayDates)
      if (beforeDays === 0 && monthDays === 0) return
      const key = `${request.employeeId}:${typeId}`
      const usage = usageByEmployeeType.get(key) || { employeeId: request.employeeId, typeId, beforeDays: 0, monthDays: 0 }
      usage.beforeDays += beforeDays
      usage.monthDays += monthDays
      usageByEmployeeType.set(key, usage)
    })

    usageByEmployeeType.forEach((usage) => {
      const employee = employees.find((item) => item.id === usage.employeeId)
      const leaveType = leaveTypes.find((item) => item.id === usage.typeId)
      if (!employee || !leaveType) return
      const quota = employee.balances?.[leaveType.id] ?? leaveType.defaultDays ?? 0
      const overBeforeMonth = Math.max(0, usage.beforeDays - quota)
      const overAfterMonth = Math.max(0, usage.beforeDays + usage.monthDays - quota)
      const increasedOverage = overAfterMonth - overBeforeMonth
      if (increasedOverage > 0) {
        byEmployee.set(usage.employeeId, (byEmployee.get(usage.employeeId) || 0) + increasedOverage)
        const overages = byType.get(usage.typeId) || []
        overages.push({ employeeId: usage.employeeId, employeeName: employee.name, days: increasedOverage })
        byType.set(usage.typeId, overages)
      }
    })

    byType.forEach((overages) => overages.sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'th')))
    return { byEmployee, byType }
  }, [period, periodDate, dateFrom, dateTo, requests, employees, leaveTypes, holidayDates])

  const STATUS_LABELS = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' }

  async function handleExportExcel() {
    try {
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
      notifySuccess('ดาวน์โหลดรายงานวันลา Excel แล้ว')
    } catch (error) {
      notifyError(`ส่งออกรายงานวันลาไม่สำเร็จ (${error.message || 'unknown'})`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="no-print font-display text-2xl font-semibold text-ink">รายงานวันลาเพื่อคำนวณเงินเดือน</h1>

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
              {STATUS_OPTIONS.map((status) => (
                <option key={status.id} value={status.id}>{status.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-ink-soft mb-1 block">ประเภทการลา</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-field">
              <option value="">ทุกประเภท</option>
              {leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button onClick={handleExportExcel} className="btn-primary py-2 px-4 text-sm">⬇ ส่งออกเป็น Excel</button>
          <button onClick={() => { window.print(); notifySuccess('เปิดหน้าต่างพิมพ์หรือบันทึก PDF แล้ว') }} className="btn-secondary py-2 px-4 text-sm">🖨 พิมพ์ / บันทึกเป็น PDF</button>
        </div>
      </div>

      <section className="report-print-section">
        <header className="mb-4">
          <h1 className="font-display font-semibold text-ink text-lg">รายงานวันลาเพื่อคำนวณเงินเดือน</h1>
          <p className="text-sm text-ink-soft">{periodLabel} · ช่วงวันที่ {formatThaiDate(dateFrom)} – {formatThaiDate(dateTo)} · พิมพ์เมื่อ {formatThaiDateLong()}</p>
        </header>

        <div className="card report-print-card overflow-x-auto">
          <div className="border-b border-ink/10 px-3 py-2 font-semibold text-ink">สรุปการลาแยกตามประเภท</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-ink-soft">
                <th className="p-3 font-semibold">พนักงาน</th>
                {typeSummary.map((type) => <th key={type.id} className="p-3 text-right font-semibold">{type.name}</th>)}
                <th className="p-3 text-right font-semibold">รวมวันลา</th>
              </tr>
            </thead>
            <tbody>
              {payrollSummary.map((employee) => (
                <tr key={employee.employeeId} className="border-b border-ink/5 last:border-0">
                  <td className="p-3 font-semibold">{employee.employeeName}</td>
                  {typeSummary.map((type) => {
                    const overage = (monthlyOverage.byType.get(type.id) || []).find((item) => item.employeeId === employee.employeeId)
                    return (
                      <td key={type.id} className="p-3 text-right font-mono">
                        {employee.daysByType[type.id] || 0}
                        {period === 'month' && overage && <span className="ml-1 font-semibold text-clay">-{Number(overage.days.toFixed(2))}</span>}
                      </td>
                    )
                  })}
                  <td className="p-3 text-right font-mono font-semibold">{employee.days}</td>
                </tr>
              ))}
              {payrollSummary.length === 0 && (
                <tr><td colSpan={typeSummary.length + 2} className="p-6 text-center text-ink-soft">ไม่มีข้อมูลตามตัวกรองที่เลือก</td></tr>
              )}
              {payrollSummary.length > 0 && (
                <tr className="border-t-2 border-ink/15 font-semibold">
                  <td className="p-3">รวมทั้งหมด</td>
                  {typeSummary.map((type) => {
                    const overageTotal = (monthlyOverage.byType.get(type.id) || []).reduce((sum, item) => sum + item.days, 0)
                    return (
                      <td key={type.id} className="p-3 text-right font-mono">
                        {type.days}
                        {period === 'month' && overageTotal > 0 && <span className="ml-1 font-semibold text-clay">-{Number(overageTotal.toFixed(2))}</span>}
                      </td>
                    )
                  })}
                  <td className="p-3 text-right font-mono">{payrollSummary.reduce((sum, employee) => sum + employee.days, 0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card report-print-section report-print-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-ink-soft">
              <th className="p-3 font-semibold">พนักงาน</th>
              <th className="p-3 font-semibold">ประเภท</th>
              <th className="p-3 font-semibold">วันที่</th>
              <th className="p-3 text-right font-semibold">จำนวนวัน</th>
              <th className="p-3 font-semibold">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((request) => (
              <tr key={request.id} className="border-b border-ink/5 last:border-0">
                <td className="p-3">
                  <p className="font-semibold text-ink">{request.employeeName}</p>
                  <p className="text-ink-soft text-xs">{request.department}</p>
                </td>
                <td className="p-3">{request.leaveTypeName}</td>
                <td className="p-3 font-mono text-xs">
                  {formatThaiDate(request.startDate)}
                  {request.startDate !== request.endDate && ` – ${formatThaiDate(request.endDate)}`}
                </td>
                <td className="p-3 text-right font-mono">{request.reportDays}</td>
                <td className="p-3">{STATUS_LABELS[request.status] || request.status}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-ink-soft">ไม่มีข้อมูลตามตัวกรองที่เลือก</td></tr>}
          </tbody>
        </table>
      </section>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body { background: #fff !important; color: #111 !important; }
          .no-print { display: none !important; }
          .lg\\:pl-64 { padding-left: 0 !important; }
          .report-print-section + .report-print-section { break-before: page; page-break-before: always; }
          .report-print-section { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .report-print-card { overflow: visible !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; }
          .report-print-card table { width: 100% !important; border-collapse: collapse !important; font-size: 9pt !important; }
          .report-print-card thead { display: table-header-group; }
          .report-print-card tr { break-inside: avoid; page-break-inside: avoid; }
          .report-print-card th, .report-print-card td { padding: 5px 4px !important; }
          .report-print-section p, .report-print-section th, .report-print-section td { color: #111 !important; }
        }
      `}</style>
    </div>
  )
}
