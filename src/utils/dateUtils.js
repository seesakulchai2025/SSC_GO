// นับจำนวนวันลา โดยไม่นับเสาร์-อาทิตย์ (วันทำงานจริง)
export function calcLeaveDays(startStr, endStr) {
  if (!startStr || !endStr) return 0
  const start = new Date(startStr)
  const end = new Date(endStr)
  if (end < start) return 0
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// รองรับการลาครึ่งวัน — ใช้ได้เฉพาะกรณีลาวันเดียว (start === end)
// duration: 'full' | 'half_morning' | 'half_afternoon'
export function calcDaysWithDuration(startStr, endStr, duration = 'full') {
  if (startStr === endStr && duration !== 'full') {
    return 0.5
  }
  return calcLeaveDays(startStr, endStr)
}

export const DURATION_LABELS = {
  full: 'เต็มวัน',
  half_morning: 'ครึ่งวันเช้า',
  half_afternoon: 'ครึ่งวันบ่าย',
}

// แสดงวันที่แบบไทย พ.ศ. เช่น 21 ส.ค. 2569
export function formatThaiDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

// แสดงวันที่แบบไทยเต็มรูปแบบ เช่น วันเสาร์ที่ 22 สิงหาคม พ.ศ. 2569
export function formatThaiDateLong(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date()
  return d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// แปลงช่วงวันที่เป็นรายการ "วันทำการ" แต่ละวัน (ไม่รวมเสาร์-อาทิตย์) — ใช้ทำปฏิทินทีม
export function expandBusinessDays(startStr, endStr) {
  const dates = []
  const start = new Date(startStr)
  const end = new Date(endStr)
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export function thaiMonthYearLabel(year, monthIndex) {
  return `${THAI_MONTHS[monthIndex]} ${year + 543}`
}

// สร้างตารางปฏิทินรายเดือน คืนค่าเป็นอาร์เรย์ของสัปดาห์ (แต่ละสัปดาห์มี 7 ช่อง อา-ส)
export function getMonthGrid(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const startDay = firstOfMonth.getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, monthIndex, d)
    const dow = dt.getDay()
    cells.push({ dateStr: dt.toISOString().slice(0, 10), dayNum: d, isWeekend: dow === 0 || dow === 6 })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
