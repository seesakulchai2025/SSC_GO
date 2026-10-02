import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { formatDateTimeDMY } from '../utils/dateUtils'
import { notifyError } from '../components/ToastViewport'
import VehicleUsagePrint from '../components/VehicleUsagePrint'

function localDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function formatDateTime(value) {
  return formatDateTimeDMY(value)
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
  const [employees, setEmployees] = useState([])
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [showEmployeePicker, setShowEmployeePicker] = useState(false)

  useEffect(() => {
    const stopCheckouts = onSnapshot(collection(db, 'vehicleCheckouts'), (snapshot) => {
      setCheckouts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (b.checkoutAt || '').localeCompare(a.checkoutAt || '')))
    }, (error) => notifyError(describeError(error)))
    const stopEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      setEmployees(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th')))
    }, (error) => notifyError(describeError(error)))
    return () => {
      stopCheckouts()
      stopEmployees()
    }
  }, [])

  const filteredCheckouts = useMemo(() => checkouts.filter((record) => {
    const date = (record.checkoutAt || '').slice(0, 10)
    if (startDate && date < startDate) return false
    if (endDate && date > endDate) return false
    if (status !== 'all' && checkoutStatus(record, now) !== status) return false
    if (employeeFilter && record.employeeId !== employeeFilter) return false
    return true
  }), [checkouts, startDate, endDate, status, employeeFilter, now])

  const selectedEmployee = employees.find((employee) => employee.id === employeeFilter)
  const filteredEmployees = employees.filter((employee) =>
    `${employee.name || ''} ${employee.id || ''}`.toLocaleLowerCase().includes(employeeSearch.trim().toLocaleLowerCase())
  )

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

  function printPdfReport() {
    window.print()
  }

  return (
    <main className="report-compact-page mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-4">
        <div>
          <p className="report-compact-eyebrow font-mono text-xs uppercase text-brass-dark">Fleet report</p>
          <h1 className="report-compact-heading font-display text-2xl font-semibold text-ink">รายงานใช้รถ</h1>
          <p className="report-compact-description report-compact-hide-mobile mt-1 text-sm text-ink-soft">กรองประวัติการเบิกและคืนรถ แล้วส่งออกหรือพิมพ์รายงาน</p>
        </div>
        <div className="report-compact-actions no-print flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" onClick={exportCsv} disabled={filteredCheckouts.length === 0} className="btn-secondary flex-1 px-4 py-2 text-sm sm:flex-none">↓ CSV ({filteredCheckouts.length})</button>
          <button type="button" onClick={printPdfReport} disabled={filteredCheckouts.length === 0} className="btn-primary flex-1 px-4 py-2 text-sm sm:flex-none">พิมพ์ / PDF</button>
        </div>
      </header>

      <section className="report-compact-filter-grid no-print grid grid-cols-2 gap-3 border-b border-ink/10 pb-5 lg:grid-cols-4">
        <label className="report-compact-label text-sm font-medium text-ink">ตั้งแต่<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="report-compact-control input-field mt-1" /></label>
        <label className="report-compact-label text-sm font-medium text-ink">ถึงวันที่<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="report-compact-control input-field mt-1" /></label>
        <label className="report-compact-label text-sm font-medium text-ink">สถานะ<select value={status} onChange={(event) => setStatus(event.target.value)} className="report-compact-control input-field mt-1"><option value="all">ทั้งหมด</option><option value="กำลังใช้งาน">กำลังใช้งาน</option><option value="เกินกำหนด">เกินกำหนด</option><option value="คืนแล้ว">คืนแล้ว</option></select></label>
        <div className="report-compact-label text-sm font-medium text-ink">
          <span>พนักงาน</span>
          <button type="button" onClick={() => setShowEmployeePicker(true)} className="report-compact-control input-field mt-1 flex items-center justify-between gap-2 text-left font-normal">
            <span className={selectedEmployee ? 'text-ink' : 'text-ink-soft'}>{selectedEmployee ? `${selectedEmployee.name} · ${selectedEmployee.id}` : 'ทุกคน'}</span>
            <span aria-hidden="true">⌄</span>
          </button>
        </div>
      </section>

      <section className="vehicle-report-print space-y-4">
      <div className="report-compact-summary flex flex-wrap gap-4 text-sm text-ink-soft">
        <span>ทั้งหมด {filteredCheckouts.length} รายการ</span>
        <span>ยังใช้รถ {filteredCheckouts.filter((item) => !item.returnedAt).length} รายการ</span>
        <span>คืนแล้ว {filteredCheckouts.filter((item) => Boolean(item.returnedAt)).length} รายการ</span>
      </div>

      <div className="vehicle-report-mobile space-y-3 lg:hidden">
        {filteredCheckouts.map((record) => {
          const recordStatus = checkoutStatus(record, now)
          return (
            <article key={record.id} className="report-compact-card border-l-2 border-brass bg-white p-3 shadow-stamp">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><h2 className="break-words font-semibold text-ink">{record.vehicleName}</h2><p className="font-mono text-xs text-ink-soft">{record.plate}</p></div>
                <span className={`shrink-0 text-xs font-semibold ${recordStatus === 'เกินกำหนด' ? 'text-clay' : recordStatus === 'คืนแล้ว' ? 'text-sage' : 'text-brass-dark'}`}>{recordStatus}</span>
              </div>
              <div className="mt-3 border-t border-ink/10 pt-2">
                <p className="text-sm font-medium text-ink">{record.employeeName}</p>
                <p className="mt-1 break-words text-xs text-ink-soft">{record.purpose}</p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-ink/10 pt-2 text-xs">
                <div><dt className="text-ink-soft">เวลาเบิก</dt><dd className="mt-0.5 break-words font-medium text-ink">{formatDateTime(record.checkoutAt)}</dd></div>
                <div><dt className="text-ink-soft">กำหนดคืน</dt><dd className="mt-0.5 break-words font-medium text-ink">{formatDateTime(record.expectedReturnAt)}</dd></div>
                <div className="col-span-2"><dt className="text-ink-soft">คืนจริง</dt><dd className="mt-0.5 break-words font-medium text-ink">{formatDateTime(record.returnedAt)}</dd></div>
              </dl>
              {record.returnedAt && <div className="mt-3 flex justify-end"><VehicleUsagePrint checkout={record} /></div>}
            </article>
          )
        })}
        {filteredCheckouts.length === 0 && <p className="report-compact-empty py-8 text-center text-sm text-ink-soft">ไม่พบรายการตามตัวกรอง</p>}
      </div>

      <div className="vehicle-report-desktop hidden overflow-x-auto border-y border-ink/10 lg:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead><tr className="border-b border-ink/10 text-xs text-ink-soft"><th className="px-3 py-3 font-semibold">รถ / ทะเบียน</th><th className="px-3 py-3 font-semibold">พนักงาน / วัตถุประสงค์</th><th className="px-3 py-3 font-semibold">เวลาเบิก</th><th className="px-3 py-3 font-semibold">กำหนดคืน</th><th className="px-3 py-3 font-semibold">คืนจริง</th><th className="px-3 py-3 font-semibold">สถานะ</th><th className="no-print px-3 py-3 font-semibold">ใบใช้รถ</th></tr></thead>
          <tbody>
            {filteredCheckouts.map((record) => {
              const recordStatus = checkoutStatus(record, now)
              return (
                <tr key={record.id} className="border-b border-ink/5 align-top">
                  <td className="px-3 py-3"><p className="font-semibold text-ink">{record.vehicleName}</p><p className="font-mono text-xs text-ink-soft">{record.plate}</p></td>
                  <td className="max-w-xs px-3 py-3"><p className="font-medium text-ink">{record.employeeName}</p><p className="mt-1 break-words text-xs text-ink-soft">{record.purpose}</p></td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-soft">{formatDateTime(record.checkoutAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-soft">{formatDateTime(record.expectedReturnAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-soft">{formatDateTime(record.returnedAt)}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-xs font-semibold ${recordStatus === 'เกินกำหนด' ? 'text-clay' : recordStatus === 'คืนแล้ว' ? 'text-sage' : 'text-brass-dark'}`}>{recordStatus}</td>
                  <td className="no-print px-3 py-3">{record.returnedAt && <VehicleUsagePrint checkout={record} />}</td>
                </tr>
              )
            })}
            {filteredCheckouts.length === 0 && <tr><td colSpan="7" className="px-3 py-10 text-center text-ink-soft">ไม่พบรายการตามตัวกรอง</td></tr>}
          </tbody>
        </table>
      </div>
      </section>

      {showEmployeePicker && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={() => setShowEmployeePicker(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="vehicle-employee-picker-title" onClick={(event) => event.stopPropagation()} className="card modal-frame w-full max-w-lg">
            <header className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <h2 id="vehicle-employee-picker-title" className="font-display text-lg font-semibold text-ink">เลือกพนักงาน</h2>
              <button type="button" onClick={() => setShowEmployeePicker(false)} aria-label="ปิดหน้าต่าง" className="px-2 text-xl text-ink-soft">×</button>
            </header>
            <div className="p-4">
              <input autoFocus value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} className="input-field" placeholder="ค้นหาชื่อหรือรหัสพนักงาน" aria-label="ค้นหาชื่อหรือรหัสพนักงาน" />
            </div>
            <div className="modal-scroll divide-y divide-ink/10 px-4">
              <button type="button" onClick={() => { setEmployeeFilter(''); setShowEmployeePicker(false) }} className={`flex w-full items-center justify-between gap-3 py-3 text-left text-sm ${!employeeFilter ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                <span>ทุกคน</span><span>{!employeeFilter ? '✓' : ''}</span>
              </button>
              {filteredEmployees.map((employee) => (
                <button key={employee.id} type="button" onClick={() => { setEmployeeFilter(employee.id); setShowEmployeePicker(false) }} className={`flex w-full items-center justify-between gap-3 py-3 text-left text-sm ${employeeFilter === employee.id ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                  <span className="min-w-0"><span className="block truncate text-ink">{employee.name}</span><span className="font-mono text-xs">{employee.id}</span></span>
                  <span>{employeeFilter === employee.id ? '✓' : ''}</span>
                </button>
              ))}
              {filteredEmployees.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">ไม่พบพนักงาน</p>}
            </div>
          </section>
        </div>
      )}
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } .no-print { display: none !important; } main { max-width: none !important; padding: 0 !important; } .vehicle-report-print { width: 100% !important; } .vehicle-report-mobile { display: none !important; } .vehicle-report-desktop { display: block !important; overflow: visible !important; border: 0 !important; } .vehicle-report-desktop table { width: 100% !important; min-width: 0 !important; border-collapse: collapse !important; font-size: 9pt !important; } .vehicle-report-desktop th, .vehicle-report-desktop td { padding: 5px 4px !important; } }`}</style>
    </main>
  )
}