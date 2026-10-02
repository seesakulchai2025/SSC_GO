import { calcDaysWithDuration, toISODate } from './dateUtils.js'

export function calculateSpecialPay(overtimeMinutes, overtimeRatePerHour, attendanceBonus) {
  const overtimePay = (Number(overtimeMinutes) || 0) / 60 * (Number(overtimeRatePerHour) || 0)
  return overtimePay + (Number(attendanceBonus) || 0)
}

export function isPayrollPeriodClosed(period, today = toISODate(new Date())) {
  if (!period) return false
  const [year, month] = period.split('-').map(Number)
  const lastDay = new Date(year, month, 0)
  return toISODate(lastDay) <= today
}

export function defaultPayrollPeriod(date = new Date()) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate() === 1 ? 0 : date.getDate())
  const year = target.getFullYear()
  const month = String(target.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function isPayrollClosingDay(date = new Date()) {
  return date.getDate() === 1
}

function daysInRange(request, rangeStart, rangeEnd, holidays) {
  if (!request.startDate || !request.endDate || request.endDate < rangeStart || request.startDate > rangeEnd) return 0
  const start = request.startDate > rangeStart ? request.startDate : rangeStart
  const end = request.endDate < rangeEnd ? request.endDate : rangeEnd
  const duration = start === request.startDate && end === request.endDate ? request.duration || 'full' : 'full'
  return calcDaysWithDuration(start, end, duration, holidays)
}

export function getMonthlyLeaveSummary(requests, employees, leaveTypes, period, holidayDates = new Set()) {
  const summary = new Map()
  if (!period) return summary

  const [year, month] = period.split('-').map(Number)
  const monthStart = `${period}-01`
  const monthEnd = toISODate(new Date(year, month, 0))
  const yearStart = `${year}-01-01`
  const previousMonthEnd = toISODate(new Date(year, month - 1, 0))
  const usage = new Map()

  requests.filter((request) => request.status === 'approved').forEach((request) => {
    if (!request.employeeId || !request.leaveTypeId) return
    const beforeDays = daysInRange(request, yearStart, previousMonthEnd, holidayDates)
    const monthDays = daysInRange(request, monthStart, monthEnd, holidayDates)
    if (beforeDays === 0 && monthDays === 0) return

    const key = `${request.employeeId}:${request.leaveTypeId}`
    const current = usage.get(key) || { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, beforeDays: 0, monthDays: 0 }
    current.beforeDays += beforeDays
    current.monthDays += monthDays
    usage.set(key, current)
  })

  usage.forEach((item) => {
    const employee = employees.find((record) => record.id === item.employeeId)
    const leaveType = leaveTypes.find((record) => record.id === item.leaveTypeId)
    if (!employee || !leaveType) return
    const quota = Number(employee.balances?.[leaveType.id] ?? leaveType.defaultDays ?? 0)
    const overBeforeMonth = Math.max(0, item.beforeDays - quota)
    const overThroughMonth = Math.max(0, item.beforeDays + item.monthDays - quota)
    const overQuotaDays = overThroughMonth - overBeforeMonth
    const employeeSummary = summary.get(employee.id) || { leaveDaysByType: {}, overQuotaByType: {}, overQuotaDays: 0 }
    employeeSummary.leaveDaysByType[leaveType.id] = item.monthDays
    employeeSummary.overQuotaByType[leaveType.id] = overQuotaDays
    employeeSummary.overQuotaDays += overQuotaDays
    summary.set(employee.id, employeeSummary)
  })

  return summary
}
