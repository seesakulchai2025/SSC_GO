import { useEffect, useRef, useState } from 'react'
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useHolidays } from '../context/HolidaysContext'
import { getAttendanceEvents } from '../utils/attendanceUtils'
import { formatThaiDate } from '../utils/dateUtils'
import { calculateSpecialPay, defaultPayrollPeriod, getMonthlyLeaveSummary, isPayrollClosingDay, isPayrollPeriodClosed } from '../utils/payrollUtils'
import PayrollSlipModal from '../components/PayrollSlipModal'
import { notifyError, notifySuccess } from '../components/ToastViewport'
import MobileSheetSection, { MobileInfo, MobileList } from '../components/MobileSheetSection'

const EMPLOYMENT_STATUS_LABELS = { intern: 'ฝึกงาน', probation: 'ทดลองงาน', permanent: 'บรรจุแล้ว', permanent_pc: 'บรรจุ(PC)' }
const EMPLOYMENT_STATUS_ORDER = { permanent: 0, probation: 1, intern: 2, permanent_pc: 3 }
const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function currentPeriod() {
  return defaultPayrollPeriod()
}

function specialPayAmount(row) {
  if (row.specialPay != null) return row.specialPay
  return calculateSpecialPay(row.overtimeMinutes, row.overtimeRatePerHour, row.bonus)
}

function comparePayrollEmployees(left, right, profileByEmployee = new Map()) {
  const leftStatus = left.employmentStatus || profileByEmployee.get(left.id)?.employmentStatus
  const rightStatus = right.employmentStatus || profileByEmployee.get(right.id)?.employmentStatus
  const leftOrder = EMPLOYMENT_STATUS_ORDER[leftStatus] ?? 1
  const rightOrder = EMPLOYMENT_STATUS_ORDER[rightStatus] ?? 1
  return leftOrder - rightOrder || (left.name || '').localeCompare(right.name || '', 'th')
}

export default function AdminPayroll() {
  const { employee: admin } = useAuth()
  const { holidayDates } = useHolidays()
  const [period, setPeriod] = useState(currentPeriod)
  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [payrollProfiles, setPayrollProfiles] = useState([])
  const [payrollSnapshot, setPayrollSnapshot] = useState(null)
  const [employeesLoaded, setEmployeesLoaded] = useState(false)
  const [attendanceLoaded, setAttendanceLoaded] = useState(false)
  const [leaveTypesLoaded, setLeaveTypesLoaded] = useState(false)
  const [payrollProfilesLoaded, setPayrollProfilesLoaded] = useState(false)
  const [error, setError] = useState('')
  const [slipEmployeeId, setSlipEmployeeId] = useState('')
  const closeAttempted = useRef(new Set())

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
    const unsubscribeLeaveRequests = onSnapshot(
      collection(db, 'leaveRequests'),
      (snapshot) => setLeaveRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setError('โหลดข้อมูลวันลาไม่สำเร็จ')
    )
    const unsubscribeLeaveTypes = onSnapshot(
      collection(db, 'leaveTypes'),
      (snapshot) => {
        setLeaveTypes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
        setLeaveTypesLoaded(true)
      },
      () => {
        setError('โหลดประเภทการลาไม่สำเร็จ')
        setLeaveTypesLoaded(true)
      }
    )
    const unsubscribePayrollProfiles = onSnapshot(
      collection(db, 'payrollProfiles'),
      (snapshot) => {
        setPayrollProfiles(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
        setPayrollProfilesLoaded(true)
      },
      () => {
        setError('โหลดข้อมูลเงินเดือนไม่สำเร็จ กรุณาตรวจ Firestore Rules และการเชื่อมต่อ')
        setPayrollProfilesLoaded(true)
      }
    )
    return () => {
      unsubscribeEmployees()
      unsubscribeAttendance()
      unsubscribeLeaveRequests()
      unsubscribeLeaveTypes()
      unsubscribePayrollProfiles()
    }
  }, [])

  useEffect(() => {
    if (!period) {
      setPayrollSnapshot(null)
      return undefined
    }
    return onSnapshot(doc(db, 'payrollSnapshots', period), (snapshot) => {
      setPayrollSnapshot(snapshot.exists() ? snapshot.data() : null)
    }, () => setError('โหลด snapshot เงินเดือนไม่สำเร็จ'))
  }, [period])

  const periodAttendance = period
    ? attendance.filter((record) => record.attendanceDate?.startsWith(period))
    : []
  const periodIsClosed = isPayrollPeriodClosed(period)
  const leaveSummaryByEmployee = getMonthlyLeaveSummary(leaveRequests, employees, leaveTypes, period, holidayDates)
  const payrollProfileByEmployee = new Map(payrollProfiles.map((profile) => [profile.id, profile]))
  const showWorkDaysColumn = employees.some((employee) => {
    if (employee.role === 'admin') return false
    const status = employee.employmentStatus || payrollProfileByEmployee.get(employee.id)?.employmentStatus
    return ['intern', 'probation'].includes(status)
  })
  const rows = employees
    .filter((employee) => employee.active !== false && employee.role !== 'admin')
    .sort((a, b) => comparePayrollEmployees(a, b, payrollProfileByEmployee))
    .map((employee) => {
      const records = periodAttendance.filter((record) => record.employeeId === employee.id)
      const attendanceDays = new Set(records.map((record) => record.attendanceDate).filter(Boolean)).size
      const lateMinutes = records.reduce((total, record) => {
        const events = getAttendanceEvents(record)
        if (!record.events) return total + (Number(record.lateMinutes) || 0)
        return total + Object.values(events).reduce((dayTotal, scan) => dayTotal + (Number(scan.lateMinutes) || 0), 0)
      }, 0)
      const lateDeduction = lateMinutes
      const overtimeMinutes = records.reduce((total, record) => total + (Number(record.overtimeMinutes) || 0), 0)
      const payrollProfile = payrollProfileByEmployee.get(employee.id) || {}
      const employmentStatus = employee.employmentStatus || payrollProfile.employmentStatus || ''
      const companyPaidSalary = employmentStatus === 'permanent_pc'
      const baseSalary = Number(payrollProfile.baseSalary) || 0
      const dailyWage = employmentStatus === 'intern' || employmentStatus === 'probation'
      const workDays = dailyWage ? attendanceDays : null
      const salaryConfigured = companyPaidSalary || (Boolean(EMPLOYMENT_STATUS_LABELS[employmentStatus]) && baseSalary > 0)
      const basePay = companyPaidSalary ? 0 : salaryConfigured && workDays != null
        ? dailyWage ? baseSalary * workDays : baseSalary
        : null
      const bonusEligible = periodIsClosed && attendanceDays > 0 && lateMinutes <= 100
      const bonus = bonusEligible ? Number(payrollProfile.attendanceBonus) || 0 : 0
      const overtimeRatePerHour = Number(payrollProfile.overtimeRatePerHour) || 0
      const specialPay = calculateSpecialPay(overtimeMinutes, overtimeRatePerHour, bonus)
      const overtimePay = overtimeMinutes / 60 * overtimeRatePerHour
      const employmentDeposit = companyPaidSalary ? 0 : Number(payrollProfile.employmentDeposit) || 0
      const socialSecurityDeduction = companyPaidSalary ? 0 : Number(payrollProfile.socialSecurityDeduction) || 0
      const leaveSummary = leaveSummaryByEmployee.get(employee.id) || { leaveDaysByType: {}, overQuotaByType: {}, overQuotaDays: 0 }
      const dailyDeductionRate = employmentStatus === 'permanent' ? baseSalary / 30 : companyPaidSalary ? 0 : baseSalary
      const overQuotaLeaveDeduction = leaveSummary.overQuotaDays * dailyDeductionRate
      const netPay = basePay == null ? null : basePay + specialPay - lateDeduction - employmentDeposit - socialSecurityDeduction - overQuotaLeaveDeduction

      return {
        ...employee,
        employmentStatus,
        companyPaidSalary,
        attendanceDays,
        dailyWage,
        workDays,
        lateMinutes,
        lateDeduction,
          overtimeMinutes,
        baseSalary,
        basePay,
        bonus,
        bonusEligible,
        overtimeRatePerHour,
        overtimePay,
        specialPay,
        employmentDeposit,
        socialSecurityDeduction,
        leaveSummary,
        overQuotaLeaveDeduction,
        netPay,
      }
    })
  useEffect(() => {
    if (!period || !isPayrollClosingDay() || period !== defaultPayrollPeriod() || payrollSnapshot) return
    if (!employeesLoaded || !attendanceLoaded || !leaveTypesLoaded || !payrollProfilesLoaded) return
    if (closeAttempted.current.has(period)) return

    if (rows.some((row) => row.netPay == null)) {
      const message = 'ยังปิดงวดไม่ได้ กรุณากำหนดสถานะและฐานเงินเดือนของพนักงานให้ครบ'
      setError(message)
      notifyError(message)
      return
    }

    closeAttempted.current.add(period)
    setError('')
    async function closePayrollPeriod() {
      const snapshotRef = doc(db, 'payrollSnapshots', period)
      try {
        const existing = await getDoc(snapshotRef)
        if (existing.exists()) return
        await setDoc(snapshotRef, {
          period,
          rows: rows.map((row) => ({
            id: row.id,
            name: row.name,
            department: row.department || '',
            employmentStatus: row.employmentStatus,
            companyPaidSalary: row.companyPaidSalary,
            dailyWage: row.dailyWage,
            workDays: row.workDays,
            attendanceDays: row.attendanceDays,
            lateMinutes: row.lateMinutes,
            lateDeduction: row.lateDeduction,
            overtimeMinutes: row.overtimeMinutes,
            overtimeRatePerHour: row.overtimeRatePerHour,
            overtimePay: row.overtimePay,
            leaveSummary: row.leaveSummary,
            baseSalary: row.baseSalary,
            basePay: row.basePay,
            bonus: row.bonus,
            bonusEligible: row.bonusEligible,
            specialPay: row.specialPay,
            employmentDeposit: row.employmentDeposit,
            socialSecurityDeduction: row.socialSecurityDeduction,
            overQuotaLeaveDeduction: row.overQuotaLeaveDeduction,
            netPay: row.netPay,
          })),
          closedBy: admin.id,
          closedAt: serverTimestamp(),
        })
        notifySuccess(`ปิดงวดเงินเดือน ${period} เรียบร้อยแล้ว`)
      } catch (closeError) {
        closeAttempted.current.delete(period)
        const message = `ปิดงวดเงินเดือนไม่สำเร็จ (${closeError.code || closeError.message || 'unknown'})`
        setError(message)
        notifyError(message)
      }
    }
    closePayrollPeriod()
  }, [period, payrollSnapshot, employeesLoaded, attendanceLoaded, leaveTypesLoaded, payrollProfilesLoaded, rows, admin.id])

  const employeeRoles = new Map(employees.map((employee) => [employee.id, employee.role]))
  const displayedRows = (payrollSnapshot?.rows || rows)
    .filter((row) => (employeeRoles.get(row.id) || row.role) !== 'admin')
    .map((row) => {
      if (row.lateDeduction != null || row.netPay == null) return row
      const lateDeduction = Number(row.lateMinutes) || 0
      return { ...row, lateDeduction, netPay: row.netPay - lateDeduction }
    })
    .sort((a, b) => comparePayrollEmployees(a, b, payrollProfileByEmployee))
  const displayedConfiguredRows = displayedRows.filter((row) => row.netPay != null)
  const displayedTotalNetPay = displayedConfiguredRows.reduce((total, row) => total + row.netPay, 0)
  async function exportPayrollExcel() {
    try {
      const XLSX = await import('xlsx')
      const reportRows = displayedRows.map((row, index) => ({
      ลำดับ: index + 1,
      พนักงาน: row.name,
      สถานะ: EMPLOYMENT_STATUS_LABELS[row.employmentStatus] || '',
      ...(row.dailyWage ? { วันทำงาน: row.workDays ?? '' } : {}),
      ค่าจ้าง: row.companyPaidSalary ? 'บริษัทจ่าย' : row.basePay ?? '',
      สาย: row.lateMinutes,
      หักค่าสาย: row.lateDeduction,
      พิเศษ: specialPayAmount(row),
      หักลาเกินโควตา: row.overQuotaLeaveDeduction,
      เงินประกัน: row.employmentDeposit,
      ประกันสังคม: row.socialSecurityDeduction,
      รับสุทธิ: row.netPay ?? '',
      }))
      const worksheet = XLSX.utils.json_to_sheet(reportRows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'เงินเดือน')
      XLSX.writeFile(workbook, `รายงานเงินเดือน_${period}.xlsx`)
      notifySuccess('ดาวน์โหลดรายงานเงินเดือน Excel แล้ว')
    } catch (error) {
      notifyError(`ส่งออกรายงานเงินเดือนไม่สำเร็จ (${error.message || 'unknown'})`)
    }
  }

  function printPayrollReport() {
    window.print()
    notifySuccess('เปิดหน้าต่างพิมพ์หรือบันทึก PDF แล้ว')
  }

  return (
    <main className="page-container page-stack">
      <header className="page-section-head">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="font-display text-lg font-semibold text-ink sm:text-2xl">เงินเดือน</h1>
            <span className="no-print sm:hidden">
              <MobileInfo title="เงินเดือน">
                <div className="space-y-3 text-sm text-ink-soft">
                  <p>คำนวณจากข้อมูลพนักงานและเวลาเข้างานของงวดที่เลือก</p>
                  <p>พนักงานฝึกงาน/ทดลองงานคำนวณวันทำงานจากรายการลงเวลาอัตโนมัติ เบี้ยขยันประเมินเมื่อปิดงวดแล้วและมีข้อมูลลงเวลาโดยสายรวมไม่เกิน 100 นาที ลาเกินโควตาหักตามอัตรารายวัน โดยเงินเดือนพนักงานบรรจุใช้อัตราเงินเดือนหาร 30</p>
                </div>
              </MobileInfo>
            </span>
          </div>
          <p className="mt-1 hidden text-sm text-ink-soft sm:block print:block">คำนวณจากข้อมูลพนักงานและเวลาเข้างานของงวดที่เลือก</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-wrap">
          <span className="hidden text-sm font-semibold text-ink print:inline">งวดเงินเดือน {formatThaiDate(`${period}-01`)}</span>
          <label className="no-print flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-ink sm:w-48 sm:flex-none sm:flex-col sm:items-start sm:gap-1">
            <span className="shrink-0">งวดเดือน</span>
            <input type="month" className="input-field min-w-0" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </label>
          <MobileSheetSection title="ส่งออก" triggerClassName="!w-auto shrink-0">
            <div className="grid grid-cols-1 gap-2 sm:contents">
              <button type="button" className="no-print btn-secondary px-3 py-2 text-sm" onClick={exportPayrollExcel}>Excel</button>
              <button type="button" className="no-print btn-secondary px-3 py-2 text-sm" onClick={printPayrollReport}>พิมพ์ / PDF</button>
            </div>
          </MobileSheetSection>
        </div>
      </header>

      {error && <p role="alert" className="text-sm text-clay">{error}</p>}

      <section className="payroll-report-summary grid grid-cols-3 gap-2 border-y border-ink/10 py-2 sm:gap-4 sm:py-4">
        <div>
          <p className="text-xs text-ink-soft">พนักงานที่แสดง</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink">{displayedRows.length}</p>
        </div>
        <div className="payroll-configured-count">
          <p className="text-xs text-ink-soft">ตั้งค่าฐานเงินเดือนแล้ว</p>
          <p className="mt-1 font-mono text-lg font-semibold text-ink">{displayedConfiguredRows.length}</p>
        </div>
        <div className="payroll-top-total">
          <p className="text-xs text-ink-soft">ยอดรับสุทธิรวมโดยประมาณ</p>
          <p className="mt-1 font-mono text-base font-semibold text-ink sm:text-lg">{money.format(displayedTotalNetPay)} บาท</p>
        </div>
      </section>

      {!employeesLoaded || !attendanceLoaded || !leaveTypesLoaded || !payrollProfilesLoaded ? (
        <p className="py-8 text-center text-sm text-ink-soft">กำลังโหลดข้อมูลเงินเดือน...</p>
      ) : displayedRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">ไม่มีพนักงานที่เปิดใช้งาน</p>
      ) : (
        <>
        <div className="sm:hidden print:hidden">
          <MobileList
            items={displayedRows}
            limit={5}
            title="เงินเดือนพนักงานทั้งหมด"
            className="space-y-2"
            renderItem={(row) => (
              <button key={row.id} type="button" onClick={() => setSlipEmployeeId(row.id)} className="card block w-full p-3 text-left" aria-label={`เปิดสลิปเงินเดือน ${row.name}`}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{row.name}</span>
                    <span className="block text-[11px] text-ink-soft">{EMPLOYMENT_STATUS_LABELS[row.employmentStatus] || 'ยังไม่ระบุสถานะ'}</span>
                  </span>
                  <span className="shrink-0 font-mono text-sm font-semibold text-ink">{row.netPay == null ? 'ยังคำนวณไม่ได้' : `${money.format(row.netPay)} บาท`}</span>
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-ink-soft">
                  {showWorkDaysColumn && row.dailyWage ? `${payrollSnapshot ? row.workDays : row.attendanceDays} วัน · ` : ''}
                  ค่าจ้าง {row.companyPaidSalary ? 'บริษัทจ่าย' : row.basePay == null ? 'ตั้งค่าข้อมูล' : money.format(row.basePay)} · สาย {row.lateMinutes} นาที (หัก {money.format(row.lateDeduction)}) · พิเศษ {money.format(specialPayAmount(row))} · หักลาเกิน {money.format(row.overQuotaLeaveDeduction)} · ประกันงาน {money.format(row.employmentDeposit)} · ประกันสังคม {money.format(row.socialSecurityDeduction)}
                </span>
              </button>
            )}
          />
        </div>
        <div className="hidden overflow-x-auto sm:block print:block">
          <table className={`payroll-report-table w-full min-w-[1050px] border-collapse text-left text-sm ${showWorkDaysColumn ? 'has-workdays' : ''}`}>
            <thead>
              <tr className="border-b border-ink/20 text-xs text-ink-soft">
                <th className="payroll-name px-3 py-3 font-semibold">พนักงาน</th>
                {showWorkDaysColumn && <th className="payroll-days px-3 py-3 text-right font-semibold">จำนวนวัน</th>}
                <th className="payroll-wage px-3 py-3 text-right font-semibold">ค่าจ้าง</th>
                <th className="payroll-late px-3 py-3 text-right font-semibold">สาย</th>
                <th className="payroll-special px-3 py-3 text-right font-semibold">พิเศษ</th>
                <th className="payroll-overage px-3 py-3 text-right font-semibold">หักลาเกิน</th>
                <th className="payroll-deposit px-3 py-3 text-right font-semibold">ประกันงาน</th>
                <th className="payroll-social px-3 py-3 text-right font-semibold">ประกันสังคม</th>
                <th className="payroll-net px-3 py-3 text-right font-semibold">รับสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row) => (
                <tr key={row.id} className="border-b border-ink/10 align-top">
                  <td className="px-3 py-3">
                    <button type="button" className="no-print block min-h-11 text-left font-semibold text-ink underline decoration-dotted" aria-label={`เปิดสลิปเงินเดือน ${row.name}`} title="ดูสลิปเงินเดือน" onClick={() => setSlipEmployeeId(row.id)}>{row.name}</button>
                    <p className="hidden font-semibold text-ink print:block">{row.name}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{EMPLOYMENT_STATUS_LABELS[row.employmentStatus] || 'ยังไม่ระบุสถานะ'}</p>
                  </td>
                  {showWorkDaysColumn && <td className="px-3 py-3 text-right">
                    {row.dailyWage
                      ? <div><span className="font-mono">{payrollSnapshot ? row.workDays : row.attendanceDays}</span><p className="mt-1 text-[10px] text-ink-soft">จากเวลาเข้างาน</p></div>
                      : <span className="font-mono">-</span>}
                  </td>}
                  <td className="px-3 py-3 text-right font-mono">{row.companyPaidSalary ? 'บริษัทจ่าย' : row.basePay == null ? 'ตั้งค่าข้อมูล' : `${money.format(row.basePay)} บาท`}</td>
                  <td className="px-3 py-3 text-right font-mono">
                    <span>{row.lateMinutes} นาที</span>
                    <p className="mt-1 text-[10px] text-ink-soft">หัก {money.format(row.lateDeduction)} บาท</p>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{money.format(specialPayAmount(row))}</td>
                  <td className="px-3 py-3 text-right font-mono">{money.format(row.overQuotaLeaveDeduction)} บาท</td>
                  <td className="px-3 py-3 text-right font-mono">{money.format(row.employmentDeposit)} บาท</td>
                  <td className="px-3 py-3 text-right font-mono">{money.format(row.socialSecurityDeduction)} บาท</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-ink">{row.netPay == null ? 'ยังคำนวณไม่ได้' : `${money.format(row.netPay)} บาท`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <div className="payroll-report-total hidden items-center justify-end gap-6 py-3 text-sm font-semibold text-ink">
        <span>ยอดรับสุทธิรวม</span>
        <span className="font-mono text-base">{money.format(displayedTotalNetPay)} บาท</span>
      </div>
      <p className="payroll-report-note hidden text-xs text-ink-soft sm:block print:block">พนักงานฝึกงาน/ทดลองงานคำนวณวันทำงานจากรายการลงเวลาอัตโนมัติ เบี้ยขยันประเมินเมื่อปิดงวดแล้วและมีข้อมูลลงเวลาโดยสายรวมไม่เกิน 100 นาที ลาเกินโควตาหักตามอัตรารายวัน โดยเงินเดือนพนักงานบรรจุใช้อัตราเงินเดือนหาร 30</p>
      {slipEmployeeId && <PayrollSlipModal row={displayedRows.find((item) => item.id === slipEmployeeId)} period={period} onClose={() => setSlipEmployeeId('')} />}
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } .payroll-report-table:not(.has-workdays) .payroll-name { width: 22% !important; } .payroll-report-table:not(.has-workdays) .payroll-wage { width: 14% !important; } .payroll-report-table:not(.has-workdays) .payroll-late { width: 8% !important; } .payroll-report-table:not(.has-workdays) .payroll-special { width: 10% !important; } .payroll-report-table:not(.has-workdays) .payroll-overage { width: 12% !important; } .payroll-report-table:not(.has-workdays) .payroll-deposit, .payroll-report-table:not(.has-workdays) .payroll-social { width: 11% !important; } .payroll-report-table:not(.has-workdays) .payroll-net { width: 12% !important; } .payroll-report-table.has-workdays .payroll-name { width: 18% !important; } .payroll-report-table.has-workdays .payroll-days { width: 8% !important; } .payroll-report-table.has-workdays .payroll-wage { width: 13% !important; } .payroll-report-table.has-workdays .payroll-late { width: 7% !important; } .payroll-report-table.has-workdays .payroll-special { width: 9% !important; } .payroll-report-table.has-workdays .payroll-overage { width: 11% !important; } .payroll-report-table.has-workdays .payroll-deposit, .payroll-report-table.has-workdays .payroll-social { width: 11% !important; } .payroll-report-table.has-workdays .payroll-net { width: 12% !important; } }`}</style>
      <style>{`@media print { @page { size: A4 portrait; margin: 8mm; } body { background: var(--color-card) !important; } main, main * { font-family: 'Noto Sans Thai', sans-serif !important; letter-spacing: 0 !important; } main { max-width: none !important; padding: 0 !important; } main > :not([hidden]) ~ :not([hidden]) { margin-top: 6px !important; } main > header { align-items: center !important; gap: 8px !important; } main > header h1 { font-size: 18px !important; } main > header p { display: none !important; } .payroll-report-summary { display: block !important; padding: 2px 0 5px !important; border: 0 !important; } .payroll-configured-count, .payroll-top-total { display: none !important; } .payroll-report-summary p:first-child { font-size: 10px !important; } .payroll-report-summary p:last-child { font-size: 14px !important; } .payroll-report-table { min-width: 0 !important; width: 100% !important; table-layout: fixed !important; font-size: 10.5px !important; border: 0 !important; } .payroll-report-table thead { font-size: 10px !important; } .payroll-report-table tr, .payroll-report-table th, .payroll-report-table td { border: 0 !important; } .payroll-report-table th, .payroll-report-table td { padding: 4px 2px !important; line-height: 1.15 !important; } .payroll-report-table .payroll-name { width: 20%; } .payroll-report-table .payroll-days { width: 8%; } .payroll-report-table .payroll-wage { width: 13%; } .payroll-report-table .payroll-late { width: 8%; } .payroll-report-table .payroll-special { width: 10%; } .payroll-report-table .payroll-overage { width: 12%; } .payroll-report-table .payroll-deposit, .payroll-report-table .payroll-social { width: 12%; } .payroll-report-table .payroll-net { width: 15%; } .payroll-report-table tbody tr:nth-child(even) { background: var(--color-bg-muted) !important; } .payroll-report-table td p { margin-top: 1px !important; font-size: 9px !important; } .payroll-report-total { display: flex !important; margin-top: 6px !important; border: 0 !important; } .payroll-report-note { display: none !important; } .overflow-x-auto { overflow: visible !important; } .no-print { display: none !important; } }`}</style>
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } .payroll-report-table:not(.has-workdays) .payroll-name { width: 22% !important; } .payroll-report-table:not(.has-workdays) .payroll-wage { width: 14% !important; } .payroll-report-table:not(.has-workdays) .payroll-late { width: 8% !important; } .payroll-report-table:not(.has-workdays) .payroll-special { width: 10% !important; } .payroll-report-table:not(.has-workdays) .payroll-overage { width: 12% !important; } .payroll-report-table:not(.has-workdays) .payroll-deposit, .payroll-report-table:not(.has-workdays) .payroll-social { width: 11% !important; } .payroll-report-table:not(.has-workdays) .payroll-net { width: 12% !important; } .payroll-report-table.has-workdays .payroll-name { width: 18% !important; } .payroll-report-table.has-workdays .payroll-days { width: 8% !important; } .payroll-report-table.has-workdays .payroll-wage { width: 13% !important; } .payroll-report-table.has-workdays .payroll-late { width: 7% !important; } .payroll-report-table.has-workdays .payroll-special { width: 9% !important; } .payroll-report-table.has-workdays .payroll-overage { width: 11% !important; } .payroll-report-table.has-workdays .payroll-deposit, .payroll-report-table.has-workdays .payroll-social { width: 11% !important; } .payroll-report-table.has-workdays .payroll-net { width: 12% !important; } }`}</style>
    </main>
  )
}