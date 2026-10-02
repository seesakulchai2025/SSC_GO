// นับจำนวนวันลา — วันทำการของร้านคือ จันทร์-เสาร์ หยุดเฉพาะวันอาทิตย์
// holidaySet (Set ของ 'YYYY-MM-DD') คือวันหยุดราชการ/นักขัตฤกษ์ที่เปิดใช้งานอยู่ ณ ตอนนั้น
export function parseISODate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateValue(value) {
  if (value == null || value === '') return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateDMY(value) {
  const date = parseDateValue(value)
  if (!date || Number.isNaN(date.getTime())) return '-'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear() + 543}`
}

export function formatDateTimeDMY(value, { seconds = false } = {}) {
  const date = parseDateValue(value)
  if (!date || Number.isNaN(date.getTime())) return '-'
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const time = seconds ? `${hours}:${minutes}:${String(date.getSeconds()).padStart(2, '0')}` : `${hours}:${minutes}`
  return `${formatDateDMY(date)} ${time}`
}

export function calcLeaveDays(startStr, endStr, holidaySet = new Set()) {
  if (!startStr || !endStr) return 0
  const start = parseISODate(startStr)
  const end = parseISODate(endStr)
  if (end < start) return 0
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    const dateStr = toISODate(cur)
    if (day !== 0 && !holidaySet.has(dateStr)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// รองรับการลาครึ่งวัน — ใช้ได้เฉพาะกรณีลาวันเดียว (start === end)
// duration: 'full' | 'half_morning' | 'half_afternoon'
export function calcDaysWithDuration(startStr, endStr, duration = 'full', holidaySet = new Set()) {
  if (startStr === endStr && duration !== 'full') {
    return calcLeaveDays(startStr, endStr, holidaySet) > 0 ? 0.5 : 0
  }
  return calcLeaveDays(startStr, endStr, holidaySet)
}

export const DURATION_LABELS = {
  full: 'เต็มวัน',
  half_morning: 'ครึ่งวันเช้า',
  half_afternoon: 'ครึ่งวันบ่าย',
}

// แสดงวันที่แบบไทย พ.ศ. ในรูปแบบ dd/mm/yyyy
export function formatThaiDate(dateStr) {
  return formatDateDMY(dateStr)
}

// Alias used by document/report headings to keep the same date format.
export function formatThaiDateLong(dateStr) {
  return formatDateDMY(dateStr || new Date())
}

// แปลงช่วงวันที่เป็นรายการ "วันทำการ" แต่ละวัน (จ-ส ไม่รวมวันอาทิตย์และวันหยุดที่เปิดใช้งาน) — ใช้ทำปฏิทินทีม
export function expandBusinessDays(startStr, endStr, holidaySet = new Set()) {
  const dates = []
  const start = parseISODate(startStr)
  const end = parseISODate(endStr)
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    const dateStr = toISODate(cur)
    if (day !== 0 && !holidaySet.has(dateStr)) dates.push(dateStr)
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
// isWeekend หมายถึงวันอาทิตย์เท่านั้น (ร้านหยุดเฉพาะวันอาทิตย์)
export function getMonthGrid(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const startDay = firstOfMonth.getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, monthIndex, d)
    const dow = dt.getDay()
    cells.push({ dateStr: toISODate(dt), dayNum: d, isWeekend: dow === 0 })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function todayISO() {
  return toISODate(new Date())
}
