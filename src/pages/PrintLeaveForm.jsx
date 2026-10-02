import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { notifySuccess } from '../components/ToastViewport'
import { formatThaiDate, formatThaiDateLong, DURATION_LABELS } from '../utils/dateUtils'

const COMPANY_NAME = 'บริษัท สีสกุลไชย จำกัด'

function Checkbox({ checked, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 mr-6">
      <span
        className="inline-block w-4 h-4 border-2 border-ink shrink-0"
        style={{ backgroundColor: checked ? 'var(--color-primary)' : 'transparent' }}
      />
      {label}
    </span>
  )
}

function SignatureBlock({ signatureData, name, role, fallbackName }) {
  return (
    <div className="text-center w-56">
      <div className="h-16 flex items-end justify-center mb-1">
        {signatureData ? (
          <img src={signatureData} alt="ลายเซ็น" className="max-h-16 max-w-full object-contain" />
        ) : (
          <p className="w-full">ลงชื่อ .............................................</p>
        )}
      </div>
      <p>{name ? `(${name})` : fallbackName ? `(${fallbackName})` : '( ........................................... )'}</p>
      <p className="text-sm text-ink-soft mt-1">{role}</p>
    </div>
  )
}

export default function PrintLeaveForm({ requestId, onClose }) {
  const { id: routeId } = useParams()
  const id = requestId || routeId
  const isModal = Boolean(onClose)
  const { employee } = useAuth()
  const [request, setRequest] = useState(null)
  const [reviewerSignature, setReviewerSignature] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'leaveRequests', id))
      if (!snap.exists()) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const data = { id: snap.id, ...snap.data() }
      setRequest(data)

      if (data.reviewedById) {
        const reviewerSnap = await getDoc(doc(db, 'employees', data.reviewedById)).catch(() => null)
        if (reviewerSnap?.exists()) setReviewerSignature(reviewerSnap.data().signature || null)
      }

      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return <div className={isModal ? 'fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 text-ink-soft' : 'max-w-2xl mx-auto px-4 py-10 text-center text-ink-soft'}>{isModal ? <div className="card modal-frame w-full max-w-md items-center justify-center px-4">กำลังโหลด...</div> : 'กำลังโหลด...'}</div>
  }

  if (notFound) {
    return <div className={isModal ? 'fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 text-clay' : 'max-w-2xl mx-auto px-4 py-10 text-center text-clay'}>{isModal ? <div className="card modal-frame w-full max-w-md items-center justify-center px-4">ไม่พบใบลานี้</div> : 'ไม่พบใบลานี้'}</div>
  }

  const isOwner = request.employeeId === employee.id
  const isAdmin = employee.role === 'admin'
  if (!isOwner && !isAdmin) {
    return <div className={isModal ? 'fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 text-clay' : 'max-w-2xl mx-auto px-4 py-10 text-center text-clay'}>{isModal ? <div className="card modal-frame w-full max-w-md items-center justify-center px-4">คุณไม่มีสิทธิ์เข้าถึงใบลานี้</div> : 'คุณไม่มีสิทธิ์เข้าถึงใบลานี้'}</div>
  }

  const durationLabel = request.duration && request.duration !== 'full' ? ` (${DURATION_LABELS[request.duration]})` : ''
  const dateRangeText =
    request.startDate === request.endDate
      ? `วันที่ ${formatThaiDate(request.startDate)}${durationLabel}`
      : `ตั้งแต่วันที่ ${formatThaiDate(request.startDate)} ถึงวันที่ ${formatThaiDate(request.endDate)}`

  return (
    <div className={isModal ? 'print-leave-overlay fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink/50 p-3 sm:p-6' : 'bg-paperDark min-h-screen'} onClick={isModal ? onClose : undefined}>
      <div
        role={isModal ? 'dialog' : undefined}
        aria-modal={isModal ? 'true' : undefined}
        aria-label={isModal ? `แบบฟอร์มใบลา ${request.employeeName}` : undefined}
        onClick={isModal ? (event) => event.stopPropagation() : undefined}
        className={isModal ? 'print-leave-dialog modal-frame w-full max-w-3xl bg-paperDark' : 'min-h-screen'}
      >
        <div className="max-w-2xl mx-auto w-full shrink-0 px-4 py-4 no-print flex items-center justify-between">
          {isModal ? (
            <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-soft underline">ปิด</button>
          ) : (
            <Link to="/" className="text-sm font-semibold text-ink-soft underline">← กลับ</Link>
          )}
          <button onClick={() => { window.print(); notifySuccess('เปิดหน้าต่างพิมพ์หรือบันทึก PDF แล้ว') }} className="btn-primary py-2 px-5 text-sm">
            พิมพ์ / บันทึกเป็น PDF
          </button>
        </div>
        <p className="max-w-2xl mx-auto w-full shrink-0 px-4 pb-3 no-print text-xs text-ink-soft">
          หลังพิมพ์แล้ว กรุณาเซ็นชื่อในช่อง "ผู้ขอลา" ด้วยตนเองก่อนส่งเก็บเป็นหลักฐาน — ลายเซ็นฝั่งผู้อนุมัติจะแสดงให้อัตโนมัติแล้ว
        </p>

        <div className={isModal ? 'modal-scroll' : undefined}>
        <div id="print-sheet" className="max-w-2xl mx-auto bg-white shadow-stamp px-10 py-10 mb-10 text-ink" style={{ fontFamily: "'Noto Sans Thai', sans-serif" }}>
        {/* หัวข้อกระดาษ */}
        <div className="text-center border-b-2 border-ink pb-4 mb-6">
          <p className="font-display text-xl font-bold">{COMPANY_NAME}</p>
          <p className="font-display text-lg font-semibold text-ink-soft mt-1">ใบขออนุญาตลางาน</p>
        </div>

        <div className="text-right text-sm mb-4">วันที่ออกเอกสาร: {formatThaiDateLong()}</div>

        <p className="mb-2">
          <span className="font-semibold">เรื่อง</span> ขออนุญาตลางาน
        </p>
        <p className="mb-4">
          <span className="font-semibold">เรียน</span> ฝ่ายบริหาร {COMPANY_NAME}
        </p>

        <p className="leading-relaxed mb-6">
          ข้าพเจ้า <span className="font-semibold">{request.employeeName}</span>{' '}
          {request.department && <>แผนก/ตำแหน่ง <span className="font-semibold">{request.department}</span> </>}
          มีความประสงค์ขอลา <span className="font-semibold">{request.leaveTypeName}</span> {dateRangeText}{' '}
          รวมเป็นจำนวน <span className="font-semibold">{request.days}</span> วัน
        </p>

        <div className="mb-6">
          <p className="font-semibold mb-1">รายละเอียดการลา:</p>
          <div className="border border-ink/20 rounded-md p-3 min-h-[3rem] text-sm">{request.reason || '-'}</div>
        </div>

        <div className="mb-8">
          <p className="font-semibold mb-1">เอกสาร/หลักฐานแนบ:</p>
          <p className="text-sm text-ink-soft">
            {request.attachmentData ? `แนบไฟล์: ${request.attachmentName || 'มีไฟล์แนบ'}` : 'ไม่มีเอกสารแนบ'}
          </p>
        </div>

        <div className="flex justify-end mb-2">
          <SignatureBlock signatureData={null} name={request.employeeName} role="ผู้ขอลา" />
        </div>

        {/* เส้นแบ่งส่วนพนักงาน / ฝ่ายบริหาร */}
        <div className="my-8 border-t-2 border-dashed border-ink/40 relative">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-3 text-xs text-ink-soft">
            ✂ ตัดตามรอยประ — สำหรับฝ่ายบริหาร
          </span>
        </div>

        <p className="font-display font-semibold text-lg mb-4">สำหรับฝ่ายบริหาร</p>

        <div className="mb-6 text-sm">
          <Checkbox checked={request.status === 'approved'} label="อนุมัติ" />
          <Checkbox checked={request.status === 'rejected'} label="ไม่อนุมัติ" />
        </div>

        <div className="mb-8">
          <p className="font-semibold mb-1 text-sm">กรณีไม่อนุมัติ เหตุผล:</p>
          <div className="border border-ink/20 rounded-md p-3 min-h-[2.5rem] text-sm">
            {request.status === 'rejected' ? request.reviewNote || '-' : ''}
          </div>
        </div>

        <div className="flex justify-between mt-10">
          <SignatureBlock signatureData={null} name={null} role="ผู้ตรวจสอบ" />
          <SignatureBlock signatureData={reviewerSignature} name={request.reviewedBy} role="ผู้อนุมัติ" />
        </div>
        </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 1.5cm; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          #print-sheet, #print-sheet * { visibility: visible !important; }
          .no-print { display: none !important; }
          .print-leave-overlay, .print-leave-dialog { position: static !important; display: block !important; overflow: visible !important; height: auto !important; min-height: 0 !important; max-height: none !important; max-width: none !important; margin: 0 !important; padding: 0 !important; background: white !important; }
          .modal-scroll { overflow: visible !important; flex: none !important; }
          #print-sheet { position: absolute !important; top: 0 !important; left: 0 !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
        }
      `}</style>
    </div>
  )
}
