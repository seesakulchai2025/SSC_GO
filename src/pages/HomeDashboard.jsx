import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import LeaveBalanceCard from '../components/LeaveBalanceCard'
import TodayLeaveCard from '../components/TodayLeaveCard'
import { formatDateDMY, formatDateTimeDMY, todayISO } from '../utils/dateUtils'
import { filterVisibleLeaveTypes } from '../utils/leaveTypeAccess'
import { notifyError } from '../components/ToastViewport'
import { MobileList } from '../components/MobileSheetSection'

function formatDateTime(value) {
  return formatDateTimeDMY(value)
}

export default function HomeDashboard() {
  const { employee } = useAuth()
  const [vehicles, setVehicles] = useState([])
  const [checkouts, setCheckouts] = useState([])
  const [attendance, setAttendance] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [now, setNow] = useState(() => Date.now())
  const today = todayISO()
  const monthStart = `${today.slice(0, 7)}-01`

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const stopVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      setVehicles(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th')))
    }, () => notifyError('โหลดสถานะรถบริษัทไม่สำเร็จ'))
    const stopCheckouts = onSnapshot(collection(db, 'vehicleCheckouts'), (snapshot) => {
      setCheckouts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    }, () => notifyError('โหลดผู้ใช้งานรถไม่สำเร็จ'))
    const attendanceQuery = query(collection(db, 'attendance'), where('employeeId', '==', employee.id))
    const stopAttendance = onSnapshot(attendanceQuery, (snapshot) => {
      setAttendance(snapshot.docs.map((item) => item.data()).filter((item) => item.attendanceDate >= monthStart && item.attendanceDate <= today))
    }, () => notifyError('โหลดสถิติลงเวลาไม่สำเร็จ'))
    const stopLeaveTypes = onSnapshot(collection(db, 'leaveTypes'), (snapshot) => {
      setLeaveTypes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    }, () => notifyError('โหลดประเภทการลาไม่สำเร็จ'))
    const leaveRequestsQuery = query(collection(db, 'leaveRequests'), where('employeeId', '==', employee.id))
    const stopLeaveRequests = onSnapshot(leaveRequestsQuery, (snapshot) => {
      setLeaveRequests(snapshot.docs.map((item) => item.data()))
    }, () => notifyError('โหลดโควตาวันลาไม่สำเร็จ'))
    return () => {
      stopVehicles()
      stopCheckouts()
      stopAttendance()
      stopLeaveTypes()
      stopLeaveRequests()
    }
  }, [employee.id, monthStart, today])

  const attendanceDays = attendance.filter((record) => record.events?.checkIn || record.checkInClientAt).length
  const completeDays = attendance.filter((record) => ['checkIn', 'lunchOut', 'lunchReturn', 'checkOut'].every((event) => record.events?.[event])).length
  const lateMinutes = attendance.reduce((total, record) => total + (record.lateMinutes || 0), 0)
  const currentYear = new Date().getFullYear()
  const usedByType = {}
  leaveRequests.forEach((request) => {
    if (request.status === 'approved' && new Date(request.startDate).getFullYear() === currentYear) {
      usedByType[request.leaveTypeId] = (usedByType[request.leaveTypeId] || 0) + request.days
    }
  })
  const visibleLeaveTypes = filterVisibleLeaveTypes(employee, leaveTypes)
  const quotaCharts = visibleLeaveTypes.map((leaveType) => ({
    leaveType,
    used: usedByType[leaveType.id] || 0,
    quota: employee.balances?.[leaveType.id] ?? leaveType.defaultDays ?? 0,
  }))
  const vehiclesInUse = vehicles.filter((vehicle) => Boolean(vehicle.activeCheckoutId))

  return (
    <main className="page-container page-stack">
      <header className="page-section-head items-center border-b border-ink/10 pb-2 sm:items-end sm:pb-4">
        <div>
          <p className="hidden font-mono text-xs uppercase text-brass-dark sm:block">Dashboard</p>
          <h1 className="font-display text-lg font-semibold text-ink sm:text-2xl">หน้าหลัก</h1>
          <p className="mt-1 hidden text-sm text-ink-soft sm:block">{employee.name}{employee.department ? ` · ${employee.department}` : ''}</p>
        </div>
        <Link to="/attendance" className="inline-flex min-h-10 items-center sm:min-h-11 rounded-xl border border-ink bg-ink px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-light">ลงเวลาเข้างาน</Link>
      </header>

      <section className="min-w-0" aria-labelledby="attendance-summary-title">
        <div className="page-section-head mb-2 sm:mb-3">
          <div>
            <h2 id="attendance-summary-title" className="font-display text-base font-semibold text-ink sm:text-lg">สถิติลงเวลาเดือนนี้</h2>
            <p className="text-xs text-ink-soft">{formatDateDMY(monthStart)}</p>
          </div>
          <Link to="/attendance" className="inline-flex min-h-10 items-center text-sm font-semibold text-brass-dark underline sm:min-h-11">ไปหน้าลงเวลา</Link>
        </div>
        <div className="card-grid card-grid--three">
          {[
            ['วันที่เข้างาน', attendanceDays, 'วัน'],
            ['ลงเวลาครบ 4 ขั้น', completeDays, 'วัน'],
            ['สายรวม', lateMinutes, 'นาที'],
          ].map(([label, value, unit]) => (
            <div key={label} className="flex min-h-16 min-w-0 flex-col sm:min-h-20 justify-between rounded-card border border-border bg-white px-2 py-2 shadow-stamp sm:px-4 sm:py-3">
              <p className="line-clamp-2 min-h-8 break-words text-[11px] leading-4 text-ink-soft sm:min-h-0 sm:text-xs">{label}</p>
              <p className="mt-1 min-w-0 font-display text-lg font-semibold leading-6 text-ink sm:text-xl">
                {value} <span className="text-[10px] font-normal text-ink-soft sm:text-xs">{unit}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      <TodayLeaveCard />

      <section className="min-w-0" aria-labelledby="leave-quota-title">
        <div className="page-section-head mb-2 sm:mb-3">
          <div>
            <h2 id="leave-quota-title" className="font-display text-base font-semibold text-ink sm:text-lg">โควต้าวันลาปีนี้</h2>
            <p className="hidden text-xs text-ink-soft sm:block">แสดงวันคงเหลือและจำนวนวันที่ใช้ไป</p>
          </div>
          <Link to="/leave" className="inline-flex min-h-10 items-center sm:min-h-11 text-sm font-semibold text-brass-dark underline">ไปหน้ายื่นใบลา</Link>
        </div>
        <div className="card-grid card-grid--two">
          {quotaCharts.map(({ leaveType, used, quota }) => (
            <div key={leaveType.id} className="min-w-0">
              <LeaveBalanceCard leaveType={leaveType} used={used} quota={quota} variant="donut" />
            </div>
          ))}
          {quotaCharts.length === 0 && <p className="py-4 text-sm text-ink-soft">ยังไม่มีประเภทการลาที่แสดงได้</p>}
        </div>
      </section>

      <section aria-labelledby="vehicle-status-title">
        <div className="page-section-head mb-2 sm:mb-3">
          <div>
            <h2 id="vehicle-status-title" className="font-display text-base font-semibold text-ink sm:text-lg">สถานะรถบริษัท</h2>
            <p className="text-sm text-ink-soft">ยังไม่คืน {vehiclesInUse.length} คัน</p>
          </div>
          <Link to="/vehicles" className="inline-flex min-h-10 items-center sm:min-h-11 text-sm font-semibold text-brass-dark underline">ดูรายการและใช้รถ</Link>
        </div>
        {vehiclesInUse.length === 0 ? (
          <p className="border border-dashed border-ink/20 p-3 text-center sm:p-5 text-sm text-ink-soft">ขณะนี้ไม่มีรถที่กำลังใช้งานหรือยังไม่คืน</p>
        ) : (
          <MobileList
            items={vehiclesInUse}
            limit={3}
            title="สถานะรถบริษัท"
            className="divide-y divide-ink/10 border-y border-ink/10"
            renderItem={(vehicle) => {
              const current = checkouts.find((item) => item.id === vehicle.activeCheckoutId)
              const overdue = current?.expectedReturnAt && new Date(current.expectedReturnAt).getTime() < now
              return (
                <article key={vehicle.id} className="flex flex-wrap items-center justify-between gap-1 bg-white px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
                  <div>
                    <p className="font-semibold text-ink">{vehicle.name} · {vehicle.plate}</p>
                    {current && <p className="mt-1 text-xs text-ink-soft">ผู้ใช้ {current.employeeName} · กำหนดคืน {formatDateTime(current.expectedReturnAt)}</p>}
                  </div>
                  <span className={`text-xs font-semibold ${current ? overdue ? 'text-clay' : 'text-brass-dark' : 'text-sage'}`}>
                    {current ? overdue ? 'เกินกำหนด' : 'กำลังใช้งาน' : 'ว่าง'}
                  </span>
                </article>
              )
            }}
          />
        )}
      </section>
    </main>
  )
}