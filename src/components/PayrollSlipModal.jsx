import { calculateSpecialPay } from '../utils/payrollUtils'
import { formatThaiDate } from '../utils/dateUtils'
import { notifyError, notifySuccess } from './ToastViewport'

const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const statusLabels = { permanent: 'บรรจุ', permanent_pc: 'บรรจุ(PC)', probation: 'ทดลองงาน', intern: 'ฝึกงาน' }

function escapeXml(value) {
  return String(value ?? '-').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character])
}

export default function PayrollSlipModal({ row, period, onClose }) {
  if (!row) return null

  const periodLabel = period ? formatThaiDate(`${period}-01`) : '-'
  const amount = (value) => `${money.format(value || 0)} บาท`
  const details = [
    ['ชื่อพนักงาน', row.name],
    ['สถานะ', statusLabels[row.employmentStatus] || 'ไม่ระบุ'],
    ['จำนวนวันทำงาน', row.dailyWage ? row.workDays ?? 'ยังไม่กรอก' : '-'],
    ['สายเข้างาน', `${row.lateMinutes} นาที`],
    ['หักค่าสาย', amount(row.lateDeduction ?? row.lateMinutes)],
    ['OT', `${row.overtimeMinutes || 0} นาที`],
    ['อัตราค่า OT', amount(row.overtimeRatePerHour)],
    ['ค่า OT', amount(row.overtimePay ?? ((Number(row.overtimeMinutes) || 0) / 60 * (Number(row.overtimeRatePerHour) || 0)))],
    ['วันลาเกินโควตา', `${row.leaveSummary.overQuotaDays} วัน`],
    ['ค่าจ้าง', row.companyPaidSalary ? 'บริษัทจ่าย' : row.basePay == null ? 'ยังตั้งค่าไม่ครบ' : amount(row.basePay)],
    ['เบี้ยขยัน', amount(row.bonus)],
    ['รายการพิเศษรวม', amount(row.specialPay ?? calculateSpecialPay(row.overtimeMinutes, row.overtimeRatePerHour, row.bonus))],
    ['หักลาเกินโควตา', amount(row.overQuotaLeaveDeduction)],
    ['เงินประกันการทำงาน', amount(row.employmentDeposit)],
    ['ประกันสังคม', amount(row.socialSecurityDeduction)],
    ['รับสุทธิ', row.netPay == null ? 'ยังคำนวณไม่ได้' : amount(row.netPay)],
  ]

  async function downloadExcel() {
    try {
      const XLSX = await import('xlsx')
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['สลิปเงินเดือน', periodLabel],
        ...details.map(([label, value]) => [label, value]),
      ])
      worksheet['!cols'] = [{ wch: 28 }, { wch: 36 }]
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'สลิปเงินเดือน')
      XLSX.writeFile(workbook, `สลิป_${row.name}_${period}.xlsx`)
      notifySuccess('ดาวน์โหลดสลิปเงินเดือน Excel แล้ว')
    } catch (error) {
      notifyError(`ส่งออกสลิปเงินเดือน Excel ไม่สำเร็จ (${error.message || 'unknown'})`)
    }
  }

  async function downloadImage() {
    const rows = details.map(([label, value], index) => {
      const y = 190 + index * 48
      return `<text x="64" y="${y}" class="label">${escapeXml(label)}</text><text x="836" y="${y}" class="value" text-anchor="end">${escapeXml(value)}</text>`
    }).join('')
    const rootStyles = getComputedStyle(document.documentElement)
    const primary = rootStyles.getPropertyValue('--color-primary').trim()
    const muted = rootStyles.getPropertyValue('--color-text-muted').trim()
    const card = rootStyles.getPropertyValue('--color-card').trim()
    const border = rootStyles.getPropertyValue('--color-border').trim()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${220 + details.length * 48}" viewBox="0 0 900 ${220 + details.length * 48}"><style>text{font-family:'Noto Sans Thai',sans-serif;fill:${primary}}.title{font-size:30px;font-weight:bold}.period{font-size:18px;fill:${muted}}.label,.value{font-size:19px}.value{font-weight:bold}</style><rect width="100%" height="100%" fill="${card}"/><text x="64" y="72" class="title">สลิปเงินเดือน</text><text x="64" y="112" class="period">งวด ${escapeXml(periodLabel)}</text><line x1="64" y1="145" x2="836" y2="145" stroke="${border}"/>${rows}<line x1="64" y1="${158 + details.length * 48}" x2="836" y2="${158 + details.length * 48}" stroke="${border}"/></svg>`
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 3
      canvas.width = image.width * scale
      canvas.height = image.height * scale
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) {
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = `สลิป_${row.name}_${period}.png`
          link.click()
          URL.revokeObjectURL(link.href)
          notifySuccess('ดาวน์โหลดสลิปเงินเดือน PNG แล้ว')
        } else {
          notifyError('สร้างไฟล์ภาพสลิปไม่สำเร็จ')
        }
        URL.revokeObjectURL(svgUrl)
      }, 'image/png')
    }
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      notifyError('สร้างไฟล์ภาพสลิปไม่สำเร็จ')
    }
    image.src = svgUrl
  }

  return (
    <div className="payroll-slip-overlay fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="payroll-slip-title" onClick={(event) => event.stopPropagation()} className="payroll-slip-modal card modal-frame w-full max-w-lg">
        <header className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <h2 id="payroll-slip-title" className="font-display text-lg font-semibold text-ink">สลิปเงินเดือน</h2>
            <p className="mt-1 text-xs text-ink-soft">งวด {periodLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิดสลิปเงินเดือน" className="px-2 text-xl text-ink-soft">×</button>
        </header>
        <div className="modal-scroll px-6 py-5">
          <div className="payroll-slip-content space-y-3 text-sm">
            <div className="border-b border-ink/10 pb-3">
              <p className="font-semibold text-ink">{row.name}</p>
              <p className="mt-1 text-xs text-ink-soft">{row.department || '-'} · {statusLabels[row.employmentStatus] || 'ไม่ระบุสถานะ'}</p>
            </div>
            {details.slice(2).map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 border-b border-ink/5 py-1.5">
                <span className="text-ink-soft">{label}</span>
                <span className="text-right font-mono font-semibold text-ink">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <footer className="no-print flex flex-wrap justify-end gap-2 border-t border-ink/10 p-4">
          <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={downloadImage}>บันทึก PNG</button>
          <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={downloadExcel}>Excel</button>
          <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => { window.print(); notifySuccess('เปิดหน้าต่างพิมพ์หรือบันทึก PDF แล้ว') }}>พิมพ์ / PDF</button>
        </footer>
      </section>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } body * { visibility: hidden !important; } .payroll-slip-modal, .payroll-slip-modal * { visibility: visible !important; } .payroll-slip-modal { position: fixed !important; inset: 0 !important; width: 100% !important; max-width: none !important; max-height: none !important; border: 0 !important; box-shadow: none !important; } .payroll-slip-modal .no-print { display: none !important; } }`}</style>
    </div>
  )
}
