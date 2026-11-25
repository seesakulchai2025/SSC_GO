import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { calculateAttendanceBonus, calculateBasePay, calculateSpecialPay, defaultPayrollPeriod, isPayrollClosingDay, missingSalaryMessage, normalizeEmploymentStatus, parseBaseSalary } from './payrollUtils.js'
import { summarizeMonthlyAttendance } from './attendanceUtils.js'

test('attendance bonus applies through 100 late minutes and is included in special pay', () => {
  const qualifying = calculateAttendanceBonus(1, 100, '500')
  assert.deepEqual(qualifying, { bonusEligible: true, bonus: 500 })
  assert.equal(calculateSpecialPay(60, 100, qualifying.bonus), 600)
  assert.deepEqual(calculateAttendanceBonus(1, 101, '500'), { bonusEligible: false, bonus: 0 })
  assert.equal(calculateSpecialPay(60, 100, calculateAttendanceBonus(1, 101, '500').bonus), 100)
  assert.deepEqual(calculateAttendanceBonus(0, 0, '500'), { bonusEligible: false, bonus: 0 })
})

test('bonus eligibility uses late minutes from the selected Bangkok month only', () => {
  const records = [
    { attendanceDate: '31/10/2569', lateMinutes: 101 },
    { attendanceDate: '2026-11-01', lateMinutes: 100 },
  ]
  const october = summarizeMonthlyAttendance(records, '2026-10')
  const november = summarizeMonthlyAttendance(records, '2026-11')
  assert.equal(calculateAttendanceBonus(1, october.lateMinutes, 500).bonus, 0)
  assert.equal(calculateAttendanceBonus(1, november.lateMinutes, 500).bonus, 500)
})

test('monthly salary is paid without depending on work-day count', () => {
  const status = normalizeEmploymentStatus(' PERMANENT ')
  const salary = parseBaseSalary(' 18,500.50 ')
  assert.equal(calculateBasePay(status, salary, 0), 18500.5)
  assert.equal(calculateBasePay(status, salary, 24), 18500.5)
})

test('closing day and default period follow Bangkok instead of device timezone', () => {
  const atBangkokMonthStart = new Date('2026-10-31T17:00:00Z')
  assert.equal(isPayrollClosingDay(atBangkokMonthStart), true)
  assert.equal(defaultPayrollPeriod(atBangkokMonthStart), '2026-10')
})

test('daily and company-paid salaries retain their existing calculation', () => {
  assert.equal(calculateBasePay('probation', parseBaseSalary('500'), 12), 6000)
  assert.equal(calculateBasePay('intern', 500, 0), 0)
  assert.equal(calculateBasePay('permanent_pc', null, 0), 0)
  assert.equal(calculateBasePay('permanent', parseBaseSalary('18,50'), 24), null)
  assert.equal(calculateBasePay('unknown', 18500, 24), null)
  assert.equal(missingSalaryMessage({ employmentStatus: '' }), 'ยังไม่ระบุสถานะ')
  assert.equal(missingSalaryMessage({ employmentStatus: 'permanent' }), 'ยังไม่ใส่ฐานเงินเดือน')
})
