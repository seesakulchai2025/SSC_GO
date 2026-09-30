import { parseISODate, toISODate } from './dateUtils'

// ดึงวันหยุดราชการ/นักขัตฤกษ์ของไทยจากบริการสาธารณะฟรี Nager.Date (ไม่ต้องใช้ API key)
// หมายเหตุสำคัญ: ข้อมูลจากบริการภายนอกอาจไม่ครบ 100% โดยเฉพาะวันหยุดตามจันทรคติที่ประกาศ
// เพิ่มเติมภายหลัง หรือวันหยุดชดเชยพิเศษเฉพาะปี — แอดมินควรตรวจสอบกับประกาศราชการอย่างเป็น
// ทางการอีกครั้ง และใช้สวิตช์เปิด/ปิดที่หน้า "วันหยุด" ปรับแก้ได้ตลอดเวลา
export async function fetchThaiPublicHolidays(year) {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/TH`)
  if (!res.ok) throw new Error(`ดึงข้อมูลวันหยุดไม่สำเร็จ (${res.status})`)
  const data = await res.json()
  return data.map((h) => ({
    date: h.date,
    name: h.localName || h.name,
  }))
}

export function buildCompensatoryHolidays(holidays, year) {
  const existingDates = new Set(holidays.map((holiday) => holiday.date))
  const generated = []
  const sundayHolidays = holidays
    .filter((holiday) => holiday.enabled !== false && holiday.source !== 'compensatory' && holiday.date?.startsWith(`${year}-`))
    .filter((holiday) => parseISODate(holiday.date).getDay() === 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  sundayHolidays.forEach((holiday) => {
    const hasOfficialCompensation = holidays.some((candidate) =>
      candidate.date > holiday.date &&
      candidate.date <= toISODate(new Date(parseISODate(holiday.date).setDate(parseISODate(holiday.date).getDate() + 7))) &&
      /ชดเชย|substitut|observed|in lieu/i.test(candidate.name || '')
    )
    if (hasOfficialCompensation) return

    const date = parseISODate(holiday.date)
    date.setDate(date.getDate() + 1)
    while (date.getDay() === 0 || existingDates.has(toISODate(date))) {
      date.setDate(date.getDate() + 1)
    }
    const compensatoryDate = toISODate(date)
    existingDates.add(compensatoryDate)
    generated.push({
      date: compensatoryDate,
      name: `วันหยุดชดเชย ${holiday.name}`,
      enabled: true,
      source: 'compensatory',
      originalDate: holiday.date,
      sourceHolidayId: holiday.id || null,
      year: Number(year),
    })
  })

  return generated
}
