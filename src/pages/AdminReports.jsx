import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { formatThaiDate, formatThaiDateLong, DURATION_LABELS, todayISO } from '../utils/dateUtils'

const STATUS_OPTIONS = [
  { id: 'approved', label: 'อนุมัติแล้วเท่านั้น' },
  { id: 'all', label: 'ทุกสถานะ' },
  { id: 'pending', label: 'รออนุมัติ' },
  { id: 'rejected', label: 'ไม่อนุมัติ' },
  { id: 'cancelled', label: 'ยกเลิกแล้ว' },
]

function startOfMonthISO() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function AdminReports() {
  const [requests, setRequests] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [dateFrom, setDateFrom] = useState(startOfMonthISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [statusFilter, setStatusFilter] = useState('approved')
  const [typeFilter, setTypeFilter] = useState('')

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
      .filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false
        if (typeFilter && r.leaveTypeId !== typeFilter) return false
        if (dateFrom && r.endDate < dateFrom) return false
        if (dateTo && r.startDate > dateTo) return false
        return true
      })
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || a.employeeName.localeCompare(b.employeeName, 'th'))
  }, [requests, statusFilter, typeFilter, dateFrom, dateTo])

  const totalsByType = useMemo(() => {
    const totals = {}
    filtered.forEach((r) => {
      totals[r.leaveTypeName] = (totals[r.leaveTypeName] || 0) + r.days
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
      จำนวนวัน: r.days,
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
      <h1 className="font-display text-2xl font-semibold text-ink">รายงานสรุปวันลา</h1>

      <div className="card p-4 space-y-3 no-print">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-ink-soft mb-1 block">ตั้งแต่วันที่</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="text-sm text-ink-soft mb-1 block">ถึงวันที่</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field" />
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
        <p className="font-display font-semibold text-ink text-lg">รายงานสรุปวันลา</p>
        <p className="text-sm text-ink-soft">
          ช่วงวันที่ {formatThaiDate(dateFrom)} – {formatThaiDate(dateTo)} · พิมพ์เมื่อ {formatThaiDateLong()}
        </p>
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
                <td className="p-3 text-right font-mono">{r.days}</td>
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
