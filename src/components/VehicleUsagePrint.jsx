import { useEffect, useState } from 'react'
import { formatDateTimeDMY } from '../utils/dateUtils'

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

  if (!checkout?.returnedAt) return null

  return (
    <>
      <button type="button" onClick={() => setPrinting(true)} className="btn-secondary px-3 py-2 text-xs no-print">
        พิมพ์ใบใช้รถ
      </button>
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