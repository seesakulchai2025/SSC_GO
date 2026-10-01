import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { getAttendanceEvents } from '../utils/attendanceUtils'

const EMPLOYMENT_STATUS_LABELS = { intern: 'ฝึกงาน', probation: 'ทดลองงาน', permanent: 'บรรจุแล้ว' }
const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function currentPeriod() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

export default function AdminPayroll() {
  const { employee: admin } = useAuth()
  const [period, setPeriod] = useState(currentPeriod)
  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [payrollProfiles, setPayrollProfiles] = useState([])
  const [payrollRecords, setPayrollRecords] = useState([])
  const [draftWorkDays, setDraftWorkDays] = useState({})
  const [employeesLoaded, setEmployeesLoaded] = useState(false)
  const [attendanceLoaded, setAttendanceLoaded] = useState(false)
  const [payrollProfilesLoaded, setPayrollProfilesLoaded] = useState(false)
  const [payrollLoaded, setPayrollLoaded] = useState(false)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubscribeEmployees = onSnapshot(
      collection(db, 'employees'),
      (snapshot) => {
        setEmployees(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
        setEmployeesLoaded(true)
      },
      () => setError('โหลดข้อมูลพนักงานไม่สำเร็จ')
    )
    const unsubscribeAttendance = onSnapshot(
      collection(db, 'attendance'),
      (snapshot) => {
        setAttendance(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
        setAttendanceLoaded(true)
      },
      () => setError('โหลดข้อมูลเวลาเข้างานไม่สำเร็จ')
    )
    const unsubscribePayrollProfiles = onSnapshot(
      collection(db, 'payrollProfiles'),
      (snapshot) => {
        setPayrollProfiles(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
        setPayrollProfilesLoaded(true)
      },
      () => {
        setError('ไม่มีสิทธิ์อ่านข้อมูลเงินเดือน กรุณาเพิ่ม Firebase UID ในหน้า พนักงาน และเผยแพร่ Firestore Rules')
        setPayrollProfilesLoaded(true)
      }
    )
    return () => {
      unsubscribeEmployees()
      unsubscribeAttendance()
      unsubscribePayrollProfiles()
    }
  }, [])

  useEffect(() => {
    if (!period) {
      setPayrollRecords([])
      setPayrollLoaded(true)
      return undefined
    }
    setPayrollLoaded(false)
    const payrollQuery = query(collection(db, 'payrollRecords'), where('period', '==', period))
    return onSnapshot(
      payrollQuery,
      (snapshot) => {
        setPayrollRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
        setPayrollLoaded(true)
      },
      () => {
        setError('โหลดจำนวนวันทำงานที่บันทึกไว้ไม่สำเร็จ')
        setPayrollLoaded(true)
      }
    )
  }, [period])

  async function saveWorkDays(employeeId) {
    const recordId = `${period}_${employeeId}`
    const value = draftWorkDays[recordId]
    const workDays = Number(value)
    if (!period || value === '' || !Number.isFinite(workDays) || workDays < 0 || workDays > 31) {
      setError('กรุณากรอกจำนวนวันทำงานตั้งแต่ 0 ถึง 31 วัน')
      return
    }
    setSavingId(recordId)
    setError('')
    try {
      await setDoc(doc(db, 'payrollRecords', recordId), {
        period,
        employeeId,
        workDays,
        updatedBy: admin.id,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDraftWorkDays((current) => {
        const next = { ...current }
        delete next[recordId]
        return next
      })
    } catch {
      setError('บันทึกจำนวนวันทำงานไม่สำเร็จ')
    } finally {
      setSavingId('')
    }
  }

  const periodAttendance = period
    ? attendance.filter((record) => record.attendanceDate?.startsWith(period))
    : []
  const payrollProfileByEmployee = new Map(payrollProfiles.map((profile) => [profile.id, profile]))
  const payrollByEmployee = new Map(payrollRecords.map((record) => [record.employeeId, record]))
  const rows = employees
    .filter((employee) => employee.active !== false)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'))
    .map((employee) => {
      const records = periodAttendance.filter((record) => record.employeeId === employee.id)
      const attendanceDays = new Set(records.map((record) => record.attendanceDate).filter(Boolean)).size
      const lateMinutes = records.reduce((total, record) => {
        const events = getAttendanceEvents(record)
        const checkInLate = events.checkIn?.lateMinutes ?? (!record.events ? record.lateMinutes : 0)
        return total + (Number(checkInLate) || 0)
      }, 0)
      const payrollProfile = payrollProfileByEmployee.get(employee.id) || {}
      const employmentStatus = payrollProfile.employmentStatus || ''
      const baseSalary = Number(payrollProfile.baseSalary) || 0
      const dailyWage = employmentStatus === 'intern' || employmentStatus === 'probation'
      const savedWorkDays = payrollByEmployee.get(employee.id)?.workDays
      const workDays = dailyWage ? savedWorkDays : attendanceDays
      const salaryConfigured = Boolean(EMPLOYMENT_STATUS_LABELS[employmentStatus]) && baseSalary > 0
      const basePay = salaryConfigured && workDays != null
        ? dailyWage ? baseSalary * workDays : baseSalary
        : null
      const bonusEligible = attendanceDays > 0 && lateMinutes <= 100
      const bonus = bonusEligible ? Number(payrollProfile.attendanceBonus) || 0 : 0
      const employmentDeposit = Number(payrollProfile.employmentDeposit) || 0
      const socialSecurityDeduction = Number(payrollProfile.socialSecurityDeduction) || 0
      const netPay = basePay == null ? null : basePay + bonus - employmentDeposit - socialSecurityDeduction

      return {
        ...employee,
        employmentStatus,
        attendanceDays,
        dailyWage,
        workDays,
        lateMinutes,
        baseSalary,
        basePay,
        bonus,
        bonusEligible,
        employmentDeposit,
        socialSecurityDeduction,
        netPay,
      }
    })
  const configuredRows = rows.filter((row) => row.netPay != null)
  const totalNetPay = configuredRows.reduce((total, row) => total + row.netPay, 0)

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">เงินเดือน</h1>
          <p className="mt-1 text-sm text-ink-soft">คำนวณจากข้อมูลพนักงานและเวลาเข้างานของงวดที่เลือก</p>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold text-ink">
          งวดเดือน
          <input
            type="month"
            className="input-field w-auto"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
        </label>
      </header>

      {error && <p role="alert" className="text-sm text-clay">{error}</p>}

      <section className="grid grid-cols-1 gap-4 border-y border-ink/10 py-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-ink-soft">พนักงานที่แสดง</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink">{rows.length}</p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">ตั้งค่าฐานเงินเดือนแล้ว</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink">{configuredRows.length}</p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">ยอดรับสุทธิรวมโดยประมาณ</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink">{money.format(totalNetPay)} บาท</p>
        </div>
      </section>

      {!employeesLoaded || !attendanceLoaded || !payrollProfilesLoaded || !payrollLoaded ? (
        <p className="py-8 text-center text-sm text-ink-soft">กำลังโหลดข้อมูลเงินเดือน...</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">ไม่มีพนักงานที่เปิดใช้งาน</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 text-xs text-ink-soft">
                <th className="px-3 py-3 font-semibold">พนักงาน</th>
                <th className="px-3 py-3 text-right font-semibold">วันทำงาน</th>
                <th className="px-3 py-3 text-right font-semibold">สายเข้า</th>
                <th className="px-3 py-3 text-right font-semibold">ค่าจ้าง</th>
                <th className="px-3 py-3 text-right font-semibold">เบี้ยขยัน</th>
                <th className="px-3 py-3 text-right font-semibold">ประกันงาน</th>
                <th className="px-3 py-3 text-right font-semibold">ประกันสังคม</th>
                <th className="px-3 py-3 text-right font-semibold">รับสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ink/10 align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-ink">{row.name}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{EMPLOYMENT_STATUS_LABELS[row.employmentStatus] || 'ยังไม่ระบุสถานะ'}</p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {row.dailyWage ? (() => {
                      const recordId = `${period}_${row.id}`
                      const savedDays = payrollByEmployee.get(row.id)?.workDays
                      const inputValue = draftWorkDays[recordId] ?? (savedDays == null ? '' : String(savedDays))
                      const isDirty = draftWorkDays[recordId] !== undefined && Number(inputValue) !== Number(savedDays)
                      return (
                        <div className="flex min-w-28 flex-col items-end gap-1">
                          <input
                            type="number"
                            min="0"
                            max="31"
                            step="0.5"
                            className="input-field w-24 py-1 text-right font-mono"
                            aria-label={`จำนวนวันทำงานของ ${row.name}`}
                            value={inputValue}
                            onChange={(event) => setDraftWorkDays((current) => ({ ...current, [recordId]: event.target.value }))}
                          />
                          <span className="text-[10px] text-ink-soft">ลงเวลา {row.attendanceDays} วัน</span>
                          {isDirty && (
                            <button
                              type="button"
                              className="btn-primary px-2 py-1 text-xs"
                              disabled={savingId === recordId}
                              onClick={() => saveWorkDays(row.id)}
                            >
                              {savingId === recordId ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                          )}
                        </div>
                      )
                    })() : <span className="font-mono">{row.attendanceDays}</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{row.lateMinutes} นาที</td>
                  <td className="px-3 py-3 text-right font-mono">{row.basePay == null ? 'ตั้งค่าข้อมูล' : `${money.format(row.basePay)} บาท`}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-mono">{money.format(row.bonus)} บาท</span>
                    <p className="mt-0.5 text-xs text-ink-soft">{row.bonusEligible ? 'เข้าเงื่อนไข' : 'ไม่เข้าเงื่อนไข'}</p>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{money.format(row.employmentDeposit)} บาท</td>
                  <td className="px-3 py-3 text-right font-mono">{money.format(row.socialSecurityDeduction)} บาท</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-ink">{row.netPay == null ? 'ยังคำนวณไม่ได้' : `${money.format(row.netPay)} บาท`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink-soft">พนักงานฝึกงานและทดลองงานต้องกรอกจำนวนวันทำงานและบันทึกก่อนคำนวณค่าจ้าง ระบบแสดงจำนวนวันที่ลงเวลาไว้เพื่อใช้อ้างอิง เบี้ยขยันคิดเมื่อมีวันลงเวลาและสายเข้างานรวมไม่เกิน 100 นาที เงินประกันการทำงานและประกันสังคมหักตามยอดรายเดือนในข้อมูลพนักงาน</p>
    </main>
  )
}