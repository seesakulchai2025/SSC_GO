// ตรวจว่าประเภทการลานี้ควรแสดงให้พนักงานคนนี้เห็นหรือไม่
// ตอนนี้มีกติกาเดียว: "ลาคลอดบุตร" แสดงเฉพาะพนักงานที่ระบุเพศเป็นหญิงเท่านั้น
export function isLeaveTypeVisible(employee, leaveType) {
  const leaveName = String(leaveType?.name || '').trim().toLocaleLowerCase()
  if (leaveName.includes('คลอด') || leaveName.includes('maternity')) {
    const gender = String(employee?.gender || '').trim().toLocaleLowerCase()
    return ['female', 'หญิง', 'f', 'woman', 'women'].includes(gender)
  }
  return true
}

export function filterVisibleLeaveTypes(employee, leaveTypes) {
  return leaveTypes.filter((t) => isLeaveTypeVisible(employee, t))
}
