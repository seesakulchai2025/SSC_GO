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

export function getNextAttendanceEvent(record) {
  const events = getAttendanceEvents(record)
  return ATTENDANCE_EVENTS.find((event) => !events[event.id])?.id || null
}

export function isAttendanceCheckInOpen(date) {
  return date.getHours() * 60 + date.getMinutes() >= 7 * 60 + 50
}

function clockMinutes(value, fallback) {
  const [hours, minutes] = (value || fallback).split(':').map(Number)
  return hours * 60 + minutes
}

export function isScheduledCheckInOpen(date, workStartTime = '08:00') {
  const start = clockMinutes(workStartTime, '08:00')
  return date.getHours() * 60 + date.getMinutes() >= start - 10
}

export function calculateAttendanceLateMinutes(eventId, date, events, settings = {}) {
  const minuteOfDay = date.getHours() * 60 + date.getMinutes()
  if (eventId === 'checkIn') return Math.max(0, minuteOfDay - clockMinutes(settings.workStartTime, '08:00'))
  if (eventId !== 'lunchReturn' || !events.lunchOut?.clientAt) return 0

  const lunchOutTime = new Date(events.lunchOut.clientAt).getTime()
  const elapsedAfterAllowance = date.getTime() - lunchOutTime - 60 * 60 * 1000
  return Math.max(0, Math.ceil(elapsedAfterAllowance / 60000))
}

export function calculateOvertimeMinutes(date, settings = {}) {
  if (!settings.overtimeOpen) return 0
  const minuteOfDay = date.getHours() * 60 + date.getMinutes()
  const workEnd = clockMinutes(settings.workEndTime, '17:00')
  const overtimeStart = Math.max(workEnd, clockMinutes(settings.overtimeStartTime, '17:00'))
  const overtimeEnd = clockMinutes(settings.overtimeEndTime, '20:00')
  return Math.max(0, Math.min(minuteOfDay, overtimeEnd) - overtimeStart)
}
