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
