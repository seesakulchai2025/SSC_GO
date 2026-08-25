// ตรวจว่าประเภทการลานี้ควรแสดงให้พนักงานคนนี้เห็นหรือไม่
// ตอนนี้มีกติกาเดียว: "ลาคลอดบุตร" แสดงเฉพาะพนักงานที่ระบุเพศเป็นหญิงเท่านั้น
export function isLeaveTypeVisible(employee, leaveType) {
  if (leaveType?.name === 'ลาคลอดบุตร') {
    return employee?.gender === 'female'
  }
  return true
}

export function filterVisibleLeaveTypes(employee, leaveTypes) {
  return leaveTypes.filter((t) => isLeaveTypeVisible(employee, t))
}
