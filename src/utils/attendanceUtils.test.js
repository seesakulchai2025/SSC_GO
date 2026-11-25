import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { attendanceTotals, correctAttendanceEvents, getAttendanceLateMinutes, getNextAttendanceEvent, hasAttendanceDeductionMismatch, improvesAttendance, isOffsite, summarizeMonthlyAttendance, validateAttendanceMode, validateStepInterval } from './attendanceUtils.js'

test('correcting check-in recalculates late minutes without changing other scans', () => {
  const record = { events: { checkIn: { clientAt: '2026-11-01T01:30:00Z' }, lunchOut: { clientAt: '2026-11-01T05:00:00Z' } } }
  const events = correctAttendanceEvents(record, '2026-11-01', 'checkIn', '08:05')
  assert.equal(events.checkIn.lateMinutes, 5)
  assert.equal(new Date(events.lunchOut.clientAt).getTime(), new Date(record.events.lunchOut.clientAt).getTime())
})

test('monthly summary excludes prior month and handles old dates and offsite', () => {
  const records = [
    { attendanceDate: '31/10/2569', lateMinutes: 45 },
    { attendanceDate: '2026-11-01', lateMinutes: 5 },
    { attendanceDate: new Date('2026-10-31T17:00:00Z'), events: { checkIn: { lateMinutes: 7 } } },
    { attendanceDate: '2026-11-02', offsite: { status: 'approved' }, lateMinutes: 99 },
  ]
  assert.deepEqual(summarizeMonthlyAttendance(records, '2026-11'), { lateMinutes: 12, deductionBaht: 12 })
  assert.deepEqual(summarizeMonthlyAttendance(records, '2026-10'), { lateMinutes: 45, deductionBaht: 45 })
  assert.equal(isOffsite({ offsite: { status: 'cancelled' }, status: 'off-site' }), false)
})

test('step interval checks the previous server timestamp and exact two-minute boundary', () => {
  const events = { checkIn: { clientAt: '2026-11-01T01:00:00Z', serverAt: { toDate: () => new Date('2026-11-01T01:00:00Z') } } }
  assert.throws(() => validateStepInterval(events, 'lunchOut', new Date('2026-11-01T01:01:59Z'), 2), /ต้องรอ/)
  assert.doesNotThrow(() => validateStepInterval(events, 'lunchOut', new Date('2026-11-01T01:02:00Z'), 2))
  assert.throws(() => validateStepInterval(events, 'lunchOut', new Date('2026-11-01T01:02:00Z'), 'invalid'), /ตั้งค่า/)
})

test('financially favourable corrections require approval', () => {
  const before = { lateMinutes: 10, deductionBaht: 10, overtimeMinutes: 30 }
  assert.equal(improvesAttendance(before, { lateMinutes: 9, deductionBaht: 10, overtimeMinutes: 30 }), true)
  assert.equal(improvesAttendance(before, { lateMinutes: 10, deductionBaht: 10, overtimeMinutes: 31 }), true)
  assert.equal(improvesAttendance(before, { lateMinutes: 11, deductionBaht: 11, overtimeMinutes: 30 }), false)
  assert.deepEqual(attendanceTotals({ checkIn: { lateMinutes: 5, deductionBaht: 5 }, checkOut: { overtimeMinutes: 60 } }), { lateMinutes: 5, deductionBaht: 5, overtimeMinutes: 60 })
})

test('off-site attendance is complete without the four normal scans', () => {
  assert.equal(getNextAttendanceEvent({ status: 'off-site', events: {} }), null)
  assert.equal(getNextAttendanceEvent(null), 'checkIn')
  assert.doesNotThrow(() => validateAttendanceMode(null, true))
  assert.throws(() => validateAttendanceMode({ events: { checkIn: {} } }, true), /รายการลงเวลาแล้ว/)
  assert.throws(() => validateAttendanceMode({ status: 'off-site' }, true), /รายการลงเวลาแล้ว/)
  assert.throws(() => validateAttendanceMode({ status: 'off-site' }, false), /นอกสถานที่แล้ว/)
})

test('corrections can create a missing record but reject out-of-order scans', () => {
  const events = correctAttendanceEvents(null, '2026-11-01', 'checkIn', '08:00')
  assert.equal(events.checkIn.lateMinutes, 0)
  assert.throws(() => correctAttendanceEvents({ events }, '2026-11-01', 'lunchOut', '07:59'), /เรียงตามลำดับ/)
  assert.throws(() => correctAttendanceEvents(null, '2026-02-30', 'checkIn', '08:00'), /ไม่ถูกต้อง/)
})

test('recorded deductions that differ from payroll late minutes are flagged', () => {
  const record = { events: { checkIn: { lateMinutes: 20 }, lunchReturn: { lateMinutes: 5 } }, deductionBaht: 20 }
  assert.equal(getAttendanceLateMinutes(record), 25)
  assert.equal(hasAttendanceDeductionMismatch(record), true)
  assert.equal(hasAttendanceDeductionMismatch({ ...record, deductionBaht: '25' }), false)
  assert.equal(hasAttendanceDeductionMismatch({ lateMinutes: 10, deductionBaht: null }), true)
  assert.equal(hasAttendanceDeductionMismatch({ lateMinutes: 10, deductionBaht: 'invalid' }), true)
})
