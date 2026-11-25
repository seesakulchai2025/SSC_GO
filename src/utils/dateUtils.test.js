import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { attendanceDay, attendanceMonth, filterAttendanceByMonth } from './dateUtils.js'

test('attendance dates are assigned to their Bangkok month and year', () => {
  assert.equal(attendanceMonth('2026-10-31'), '2026-10')
  assert.equal(attendanceMonth('01/11/2569'), '2026-11')
  assert.equal(attendanceDay('01/11/2569'), '2026-11-01')
  assert.equal(attendanceMonth('2026-10-31T16:59:59Z'), '2026-10')
  assert.equal(attendanceMonth('2026-10-31T17:00:00Z'), '2026-11')
  assert.equal(attendanceMonth(new Date('2026-12-31T17:00:00Z')), '2027-01')
  assert.equal(attendanceMonth({ toDate: () => new Date('2026-10-31T17:00:00Z') }), '2026-11')
})

test('invalid or ambiguous dates cannot be assigned to a payroll month', () => {
  assert.equal(attendanceMonth('31/11/2569'), null)
  assert.equal(attendanceMonth('2026-02-29'), null)
  assert.equal(attendanceMonth('2026-02-30T00:00:00Z'), null)
  assert.equal(attendanceMonth('2026-11-01T00:00:00'), null)
  assert.equal(attendanceMonth(''), null)
})

test('only attendance in the selected month contributes to late deductions', () => {
  const records = [
    { attendanceDate: '31/10/2569', late: 30 },
    { attendanceDate: '01/11/2569', late: 5 },
    { attendanceDate: new Date('2026-10-31T17:10:00Z'), late: 7 },
    { attendanceDate: '01/11/2568', late: 40 },
  ]
  const late = filterAttendanceByMonth(records, '2026-11').reduce((sum, record) => sum + record.late, 0)
  assert.equal(late, 12)
})

test('filtering retains records beyond the previous 200-record limit', () => {
  const records = Array.from({ length: 205 }, (_, index) => ({ attendanceDate: index === 204 ? '2026-10-31' : '2026-11-01' }))
  assert.equal(filterAttendanceByMonth(records, '2026-11').length, 204)
  assert.equal(filterAttendanceByMonth(records, '2026-10').length, 1)
})
