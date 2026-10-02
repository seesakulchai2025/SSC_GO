import { useEffect, useState } from 'react'
import { formatDateTimeDMY } from '../utils/dateUtils'
import { notifyError, notifySuccess } from './ToastViewport'

function escapeXml(value) {
  return String(value ?? '-').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character])
}

function wrapSvgText(value, maxLength = 42) {
  const text = String(value || '-').replace(/\s+/g, ' ').trim()
  const characters = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text)].map((part) => part.segment)
    : Array.from(text)
  const lines = []
  for (let index = 0; index < characters.length; index += maxLength) {
    lines.push(characters.slice(index, index + maxLength).join(''))
  }
  return lines.length ? lines : ['-']
}

export default function VehicleUsagePrint({ checkout }) {
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!printing) return undefined
    const finishPrinting = () => setPrinting(false)
    const timer = window.setTimeout(() => window.print(), 100)
    window.addEventListener('afterprint', finishPrinting)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', finishPrinting)
    }
  }, [printing])

  function downloadImage() {
    const fields = [
      ['รถ / ทะเบียน', `${checkout.vehicleName || '-'} · ${checkout.plate || '-'}`],
      ['ผู้ใช้รถ', checkout.employeeName],
      ['รหัสพนักงาน', checkout.employeeId],
      ['วัตถุประสงค์ / สถานที่ใช้งาน', checkout.purpose],
      ['เวลาเบิก', formatDateTimeDMY(checkout.checkoutAt)],
      ['กำหนดคืน', formatDateTimeDMY(checkout.expectedReturnAt)],
      ['คืนรถจริง', formatDateTimeDMY(checkout.returnedAt)],
    ]
    let rowY = 206
    const rows = fields.map(([label, value]) => {
      const lines = wrapSvgText(value)
      const markup = `<text x="72" y="${rowY}" class="label">${escapeXml(label)}</text><text x="390" y="${rowY}" class="value">${lines.map((line, index) => `<tspan x="390" dy="${index === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`).join('')}</text>`
      rowY += Math.max(lines.length, 1) * 34 + 30
      return markup
    }).join('')
    const height = rowY + 210
    const styles = getComputedStyle(document.documentElement)
    const primary = styles.getPropertyValue('--color-primary').trim()
    const muted = styles.getPropertyValue('--color-text-muted').trim()
    const card = styles.getPropertyValue('--color-card').trim()
    const border = styles.getPropertyValue('--color-border').trim()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}"><style>text{font-family:'Noto Sans Thai',sans-serif;fill:${primary}}.company{font-size:20px;fill:${muted}}.title{font-size:34px;font-weight:bold}.label{font-size:18px;fill:${muted}}.value{font-size:20px;font-weight:bold}</style><rect width="100%" height="100%" fill="${card}"/><text x="500" y="66" text-anchor="middle" class="company">บริษัท สีสกุลไชย จำกัด</text><text x="500" y="122" text-anchor="middle" class="title">ใบการใช้รถบริษัท</text><line x1="72" y1="158" x2="928" y2="158" stroke="${border}" stroke-width="2"/>${rows}<line x1="72" y1="${height - 150}" x2="928" y2="${height - 150}" stroke="${border}"/><text x="280" y="${height - 112}" text-anchor="middle" class="label">ผู้เบิกรถ</text><text x="720" y="${height - 112}" text-anchor="middle" class="label">ผู้รับคืนรถ</text><text x="928" y="${height - 44}" text-anchor="end" class="label">พิมพ์เมื่อ ${escapeXml(formatDateTimeDMY(new Date()))}</text></svg>`
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = image.width * scale
      canvas.height = image.height * scale
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(svgUrl)
        notifyError('สร้างไฟล์ภาพใบใช้รถไม่สำเร็จ')
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(svgUrl)
        if (!blob) {
          notifyError('สร้างไฟล์ภาพใบใช้รถไม่สำเร็จ')
          return
        }
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `ใบใช้รถ_${checkout.employeeName || 'พนักงาน'}_${checkout.plate || ''}.png`.replace(/[\\/:*?"<>|]/g, '_')
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
        notifySuccess('ดาวน์โหลดใบใช้รถ PNG แล้ว')
      }, 'image/png')
    }
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      notifyError('สร้างไฟล์ภาพใบใช้รถไม่สำเร็จ')
    }
    image.src = svgUrl
  }

  if (!checkout?.returnedAt) return null

  return (
    <>
      <div className="no-print flex flex-wrap gap-2">
        <button type="button" onClick={downloadImage} className="btn-secondary px-3 py-2 text-xs">ดาวน์โหลด PNG</button>
        <button type="button" onClick={() => setPrinting(true)} className="btn-secondary px-3 py-2 text-xs">พิมพ์ / PDF</button>
      </div>
      {printing && (
        <>
          <section className="vehicle-usage-print" aria-label="ใบการใช้รถบริษัท">
            <header className="border-b-2 border-ink pb-4 text-center">
              <p className="text-sm font-semibold text-ink-soft">บริษัท สีสกุลไชย จำกัด</p>
              <h1 className="mt-2 font-display text-2xl font-bold text-ink">ใบการใช้รถบริษัท</h1>
            </header>
            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 text-sm">
              <div><dt className="text-ink-soft">รถ</dt><dd className="mt-1 font-semibold text-ink">{checkout.vehicleName || '-'}</dd></div>
              <div><dt className="text-ink-soft">ทะเบียน</dt><dd className="mt-1 font-semibold text-ink">{checkout.plate || '-'}</dd></div>
              <div><dt className="text-ink-soft">ผู้ใช้รถ</dt><dd className="mt-1 font-semibold text-ink">{checkout.employeeName || '-'}</dd></div>
              <div><dt className="text-ink-soft">รหัสพนักงาน</dt><dd className="mt-1 font-semibold text-ink">{checkout.employeeId || '-'}</dd></div>
              <div className="col-span-2"><dt className="text-ink-soft">วัตถุประสงค์ / สถานที่ใช้งาน</dt><dd className="mt-1 whitespace-pre-wrap font-semibold text-ink">{checkout.purpose || '-'}</dd></div>
              <div><dt className="text-ink-soft">เวลาเบิก</dt><dd className="mt-1 font-semibold text-ink">{formatDateTimeDMY(checkout.checkoutAt)}</dd></div>
              <div><dt className="text-ink-soft">กำหนดคืน</dt><dd className="mt-1 font-semibold text-ink">{formatDateTimeDMY(checkout.expectedReturnAt)}</dd></div>
              <div><dt className="text-ink-soft">คืนรถจริง</dt><dd className="mt-1 font-semibold text-ink">{formatDateTimeDMY(checkout.returnedAt)}</dd></div>
            </dl>
            <footer className="mt-24 grid grid-cols-2 gap-16 text-center text-sm text-ink">
              <div className="border-t border-ink/40 pt-2">ผู้เบิกรถ</div>
              <div className="border-t border-ink/40 pt-2">ผู้รับคืนรถ</div>
            </footer>
            <p className="mt-10 text-right text-xs text-ink-soft">พิมพ์เมื่อ {formatDateTimeDMY(new Date())}</p>
          </section>
          <style>{`
            @media screen { .vehicle-usage-print { display: none !important; } }
            @media print {
              @page { size: A4 portrait; margin: 16mm; }
              body * { visibility: hidden !important; }
              .vehicle-usage-print, .vehicle-usage-print * { visibility: visible !important; }
              .vehicle-usage-print { display: block !important; position: fixed !important; inset: 0 !important; width: 100% !important; min-height: 100vh !important; padding: 16mm !important; background: var(--color-card) !important; color: var(--color-text) !important; }
              .no-print { display: none !important; }
            }
          `}</style>
        </>
      )}
    </>
  )
}