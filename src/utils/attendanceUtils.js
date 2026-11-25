import { attendanceMonth, bangkokTime } from './dateUtils.js'

export const ATTENDANCE_EVENTS = [
  { id: 'checkIn', label: 'เข้างาน' },
  { id: 'lunchOut', label: 'ออกพักกลางวัน' },
  { id: 'lunchReturn', label: 'กลับจากพักกลางวัน' },
  { id: 'checkOut', label: 'เลิกงาน' },
]

export function getAttendanceEvents(record) {
  const events = { ...(record?.events || {}) }
  if (!events.checkIn && record?.checkInClientAt) {
    events.checkIn = {
      clientAt: record.checkInClientAt,
      latitude: record.latitude,
      longitude: record.longitude,
      accuracyMeters: record.accuracyMeters,
      distanceMeters: record.distanceMeters,
      radiusMeters: record.radiusMeters,
      lateMinutes: record.lateMinutes || 0,
      deductionBaht: record.deductionBaht || 0,
    }
  }
  return events
}

export function getAttendanceLateMinutes(record) {
  if (isOffsite(record)) return 0
  if (!record.events) return Number(record.lateMinutes) || 0
  return Object.values(getAttendanceEvents(record)).reduce((total, scan) => total + (Number(scan.lateMinutes) || 0), 0)
}

export function summarizeMonthlyAttendance(records, period) {
  return records.filter((record) => attendanceMonth(record.attendanceDate) === period).reduce((summary, record) => {
    const lateMinutes = getAttendanceLateMinutes(record)
    summary.lateMinutes += lateMinutes
    summary.deductionBaht += lateMinutes
    return summary
  }, { lateMinutes: 0, deductionBaht: 0 })
}

export function isOffsite(record) {
  return record?.offsite?.status === 'approved' || (!record?.offsite && record?.status === 'off-site')
}

export function hasAttendanceDeductionMismatch(record) {
  if (record.deductionBaht == null || record.deductionBaht === '') return true
  const deduction = Number(record.deductionBaht)
  return !Number.isFinite(deduction) || deduction !== getAttendanceLateMinutes(record)
}

export function getNextAttendanceEvent(record) {
  if (isOffsite(record)) return null
  const events = getAttendanceEvents(record)
  return ATTENDANCE_EVENTS.find((event) => !events[event.id])?.id || null
}

export function validateAttendanceMode(record, offSite) {
  if (offSite && record && (isOffsite(record) || Object.keys(getAttendanceEvents(record)).length)) throw new Error('วันนี้มีรายการลงเวลาแล้ว ไม่สามารถลงนอกสถานที่ซ้ำได้')
  if (!offSite && isOffsite(record)) throw new Error('วันนี้บันทึกนอกสถานที่แล้ว ไม่สามารถลงเวลาปกติทับได้')
}

export function isAttendanceCheckInOpen(date) {
  return clockMinutes(bangkokTime(date), '00:00') >= 7 * 60 + 50
}

export function attendanceTotals(events) {
  const scans = Object.values(events)
  return {
    lateMinutes: scans.reduce((total, scan) => total + (Number(scan.lateMinutes) || 0), 0),
    deductionBaht: scans.reduce((total, scan) => total + (Number(scan.deductionBaht) || 0), 0),
    overtimeMinutes: scans.reduce((total, scan) => total + (Number(scan.overtimeMinutes) || 0), 0),
  }
}

export function improvesAttendance(previous, next) {
  return next.lateMinutes < previous.lateMinutes || next.deductionBaht < previous.deductionBaht || next.overtimeMinutes > previous.overtimeMinutes
}

export function validateStepInterval(events, eventId, now, minMinutes) {
  if (!Number.isInteger(minMinutes) || minMinutes < 1) throw new Error('ตั้งค่าระยะห่างระหว่างขั้นไม่ถูกต้อง กรุณาติดต่อแอดมิน')
  const index = ATTENDANCE_EVENTS.findIndex((event) => event.id === eventId)
  if (index <= 0) return
  const previous = events[ATTENDANCE_EVENTS[index - 1].id]
  const value = previous?.serverAt?.toDate ? previous.serverAt.toDate() : new Date(previous?.clientAt)
  if (!value || Number.isNaN(value.getTime())) throw new Error('ไม่พบเวลาขั้นก่อนหน้า กรุณาแจ้งแก้ไขเวลา')
  const remaining = minMinutes * 60000 - (now.getTime() - value.getTime())
  if (remaining > 0) throw new Error(`ต้องรออีก ${Math.ceil(remaining / 60000)} นาที ก่อนลงเวลาขั้นถัดไป หรือแจ้งแก้ไขเวลา`)
}

function clockMinutes(value, fallback) {
  const [hours, minutes] = (value || fallback).split(':').map(Number)
  return hours * 60 + minutes
}

export function isScheduledCheckInOpen(date, workStartTime = '08:00') {
  const start = clockMinutes(workStartTime, '08:00')
  return clockMinutes(bangkokTime(date), '00:00') >= start - 10
}

export function calculateAttendanceLateMinutes(eventId, date, events, settings = {}) {
  const minuteOfDay = clockMinutes(bangkokTime(date), '00:00')
  if (eventId === 'checkIn') return Math.max(0, minuteOfDay - clockMinutes(settings.workStartTime, '08:00'))
  if (eventId !== 'lunchReturn' || !events.lunchOut?.clientAt) return 0

  const lunchOutTime = new Date(events.lunchOut.clientAt).getTime()
  const elapsedAfterAllowance = date.getTime() - lunchOutTime - 60 * 60 * 1000
  return Math.max(0, Math.ceil(elapsedAfterAllowance / 60000))
}

export function correctAttendanceEvents(record, attendanceDate, eventId, time, settings = {}) {
  if (!ATTENDANCE_EVENTS.some((event) => event.id === eventId) || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) || !attendanceMonth(attendanceDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('ข้อมูลวันที่ ประเภท หรือเวลาไม่ถูกต้อง')
  }
  const previous = getAttendanceEvents(record)
  const corrected = new Date(`${attendanceDate}T${time}:00+07:00`)
  if (Number.isNaN(corrected.getTime())) throw new Error('วันที่หรือเวลาไม่ถูกต้อง')
  const events = {}
  let lastTime = -Infinity
  for (const { id } of ATTENDANCE_EVENTS) {
    const scan = previous[id]
    if (id !== eventId && !scan) continue
    const date = id === eventId ? corrected : new Date(scan.clientAt)
    if (Number.isNaN(date.getTime()) || date.getTime() < lastTime) throw new Error('เวลาเข้า-ออกต้องเรียงตามลำดับเวลา')
    lastTime = date.getTime()
    const lateMinutes = calculateAttendanceLateMinutes(id, date, events, settings)
    events[id] = {
      ...scan,
      clientAt: date.toISOString(),
      lateMinutes,
      deductionBaht: lateMinutes,
      overtimeMinutes: id === 'checkOut' ? calculateOvertimeMinutes(date, settings) : 0,
    }
  }
  return events
}

export function calculateOvertimeMinutes(date, settings = {}) {
  if (!settings.overtimeOpen) return 0
  const minuteOfDay = clockMinutes(bangkokTime(date), '00:00')
  const workEnd = clockMinutes(settings.workEndTime, '17:00')
  const overtimeStart = Math.max(workEnd, clockMinutes(settings.overtimeStartTime, '17:00'))
  const overtimeEnd = clockMinutes(settings.overtimeEndTime, '20:00')
  return Math.max(0, Math.min(minuteOfDay, overtimeEnd) - overtimeStart)
}
