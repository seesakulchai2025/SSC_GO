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

export function calculateAttendanceLateMinutes(eventId, date, events) {
  const minuteOfDay = date.getHours() * 60 + date.getMinutes()
  if (eventId === 'checkIn') return Math.max(0, minuteOfDay - 8 * 60)
  if (eventId !== 'lunchReturn' || !events.lunchOut?.clientAt) return 0

  const lunchOutTime = new Date(events.lunchOut.clientAt).getTime()
  const elapsedAfterAllowance = date.getTime() - lunchOutTime - 60 * 60 * 1000
  return Math.max(0, Math.ceil(elapsedAfterAllowance / 60000))
}
