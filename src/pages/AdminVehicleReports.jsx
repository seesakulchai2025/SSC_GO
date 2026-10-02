import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { notifyError } from '../components/ToastViewport'

function localDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function quoteCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function describeError(error) {
  if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
    return 'โหลดรายงานไม่สำเร็จ: Firestore Rules ยังไม่ถูก Publish ให้รัน npm run deploy:firestore หลังเข้าสู่ระบบ Firebase CLI'
  }
  return `โหลดรายงานใช้รถไม่สำเร็จ (${error.message || 'unknown'})`
}

function checkoutStatus(record, now) {
  if (record.returnedAt) return 'คืนแล้ว'
  if (record.expectedReturnAt && new Date(record.expectedReturnAt).getTime() < now) return 'เกินกำหนด'
  return 'กำลังใช้งาน'
}

export default function AdminVehicleReports() {
  const now = Date.now()
  const today = localDateInput(new Date(now))
  const monthStart = `${today.slice(0, 7)}-01`
  const [checkouts, setCheckouts] = useState([])
  const [startDate, setStartDate] = useState(monthStart)
  const [endDate, setEndDate] = useState(today)
  const [status, setStatus] = useState('all')
  const [employeeFilter, setEmployeeFilter] = useState('')

  useEffect(() => {
    const stop = onSnapshot(collection(db, 'vehicleCheckouts'), (snapshot) => {
      setCheckouts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (b.checkoutAt || '').localeCompare(a.checkoutAt || '')))
    }, (error) => notifyError(describeError(error)))
    return stop
  }, [])

  const filteredCheckouts = useMemo(() => checkouts.filter((record) => {
    const date = (record.checkoutAt || '').slice(0, 10)
    if (startDate && date < startDate) return false
    if (endDate && date > endDate) return false
    if (status !== 'all' && checkoutStatus(record, now) !== status) return false
    if (employeeFilter && !`${record.employeeName || ''} ${record.employeeId || ''}`.toLocaleLowerCase().includes(employeeFilter.toLocaleLowerCase())) return false
    return true
  }), [checkouts, startDate, endDate, status, employeeFilter, now])

  function exportCsv() {
    const headers = ['รถ', 'ทะเบียน', 'พนักงาน', 'วัตถุประสงค์', 'เวลาเบิก', 'กำหนดคืน', 'เวลาคืนจริง', 'สถานะ']
    const rows = filteredCheckouts.map((record) => [
      record.vehicleName,
      record.plate,
      record.employeeName,
      record.purpose,
      formatDateTime(record.checkoutAt),
      formatDateTime(record.expectedReturnAt),
      formatDateTime(record.returnedAt),
      checkoutStatus(record, Date.now()),
    ])
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(quoteCsv).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `vehicle-usage-${startDate || 'all'}-${endDate || 'all'}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-4">
        <div>
          <p className="font-mono text-xs uppercase text-brass-dark">Fleet report</p>
          <h1 className="font-display text-2xl font-semibold text-ink">รายงานใช้รถ</h1>
          <p className="mt-1 text-sm text-ink-soft">กรองประวัติการเบิกและคืนรถ แล้วส่งออกเป็น CSV</p>
        </div>
        <button type="button" onClick={exportCsv} disabled={filteredCheckouts.length === 0} className="btn-primary px-4 py-2 text-sm">↓ ส่งออก CSV ({filteredCheckouts.length})</button>
      </header>

      <section className="grid gap-3 border-b border-ink/10 pb-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-ink">ตั้งแต่<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="input-field mt-1" /></label>
        <label className="text-sm font-medium text-ink">ถึงวันที่<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="input-field mt-1" /></label>
        <label className="text-sm font-medium text-ink">สถานะ<select value={status} onChange={(event) => setStatus(event.target.value)} className="input-field mt-1"><option value="all">ทั้งหมด</option><option value="กำลังใช้งาน">กำลังใช้งาน</option><option value="เกินกำหนด">เกินกำหนด</option><option value="คืนแล้ว">คืนแล้ว</option></select></label>
        <label className="text-sm font-medium text-ink">ค้นหาพนักงาน<input value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className="input-field mt-1" placeholder="ชื่อหรือรหัสพนักงาน" /></label>
      </section>

      <div className="flex flex-wrap gap-4 text-sm text-ink-soft">
        <span>ทั้งหมด {filteredCheckouts.length} รายการ</span>
        <span>ยังใช้รถ {filteredCheckouts.filter((item) => !item.returnedAt).length} รายการ</span>
        <span>คืนแล้ว {filteredCheckouts.filter((item) => Boolean(item.returnedAt)).length} รายการ</span>
      </div>

      <div className="overflow-x-auto border-y border-ink/10">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead><tr className="border-b border-ink/10 text-xs text-ink-soft"><th className="px-3 py-3 font-semibold">รถ / ทะเบียน</th><th className="px-3 py-3 font-semibold">พนักงาน / วัตถุประสงค์</th><th className="px-3 py-3 font-semibold">เวลาเบิก</th><th className="px-3 py-3 font-semibold">กำหนดคืน</th><th className="px-3 py-3 font-semibold">คืนจริง</th><th className="px-3 py-3 font-semibold">สถานะ</th></tr></thead>
          <tbody>
            {filteredCheckouts.map((record) => {
              const recordStatus = checkoutStatus(record, now)
              return <tr key={record.id} className="border-b border-ink/5 align-top"><td className="px-3 py-3"><p className="font-semibold text-ink">{record.vehicleName}</p><p className="font-mono text-xs text-ink-soft">{record.plate}</p></td><td className="max-w-xs px-3 py-3"><p className="font-medium text-ink">{record.employeeName}</p><p className="mt-1 break-words text-xs text-ink-soft">{record.purpose}</p></td><td className="whitespace-nowrap px-3 py-3 text-xs text-ink-soft">{formatDateTime(record.checkoutAt)}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-ink-soft">{formatDateTime(record.expectedReturnAt)}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-ink-soft">{formatDateTime(record.returnedAt)}</td><td className={`whitespace-nowrap px-3 py-3 text-xs font-semibold ${recordStatus === 'เกินกำหนด' ? 'text-clay' : recordStatus === 'คืนแล้ว' ? 'text-sage' : 'text-brass-dark'}`}>{recordStatus}</td></tr>
            })}
            {filteredCheckouts.length === 0 && <tr><td colSpan="6" className="px-3 py-10 text-center text-ink-soft">ไม่พบรายการตามตัวกรอง</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  )
}