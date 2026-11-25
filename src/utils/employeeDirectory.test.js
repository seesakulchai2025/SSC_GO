import test from 'node:test'
import assert from 'node:assert/strict'
import { filterEmployeeDirectory } from './employeeDirectory.js'

test('directory filters working and inactive employees without mixing administrators', () => {
  const employees = [
    { id: 'working', role: 'employee', active: true },
    { id: 'legacy', role: 'employee' },
    { id: 'inactive', role: 'employee', active: false },
    { id: 'admin', role: 'admin', active: false },
  ]
  const ids = (directory, status) => filterEmployeeDirectory(employees, directory, status).map((employee) => employee.id)

  assert.deepEqual(ids('employees', 'all'), ['working', 'legacy', 'inactive'])
  assert.deepEqual(ids('employees', 'active'), ['working', 'legacy'])
  assert.deepEqual(ids('employees', 'inactive'), ['inactive'])
  assert.deepEqual(ids('admins', 'inactive'), ['admin'])
  assert.deepEqual(ids('admins', 'active'), [])
})
