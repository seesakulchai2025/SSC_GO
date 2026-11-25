export function filterEmployeeDirectory(employees, directory, workStatus) {
  return employees.filter((employee) => {
    const matchesRole = directory === 'admins' ? employee.role === 'admin' : employee.role !== 'admin'
    const matchesStatus = workStatus === 'all' || (workStatus === 'active' ? employee.active !== false : employee.active === false)
    return matchesRole && matchesStatus
  })
}
