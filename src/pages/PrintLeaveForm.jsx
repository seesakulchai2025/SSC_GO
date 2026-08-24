import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { formatThaiDate, formatThaiDateLong, DURATION_LABELS } from '../utils/dateUtils'

const COMPANY_NAME = 'บริษัท สีสกุลไชย จำกัด'

function Checkbox({ checked, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 mr-6">
      <span
        className="inline-block w-4 h-4 border-2 border-ink shrink-0"
        style={{ backgroundColor: checked ? '#1B2A4A' : 'transparent' }}
      />
      {label}
    </span>
  )
}

export default function PrintLeaveForm() {
  const { id } = useParams()
  const { employee } = useAuth()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'leaveRequests', id))
      if (!snap.exists()) {
        setNotFound(true)
      } else {
        setRequest({ id: snap.id, ...snap.data() })
      }
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-ink-soft">กำลังโหลด...</div>
  }

  if (notFound) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-clay">ไม่พบใบลานี้</div>
  }

  const isOwner = request.employeeId === employee.id
  const isAdmin = employee.role === 'admin'
  if (!isOwner && !isAdmin) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-clay">คุณไม่มีสิทธิ์เข้าถึงใบลานี้</div>
  }

  const durationLabel = request.duration && request.duration !== 'full' ? ` (${DURATION_LABELS[request.duration]})` : ''
  const dateRangeText =
    request.startDate === request.endDate
      ? `วันที่ ${formatThaiDate(request.startDate)}${durationLabel}`
      : `ตั้งแต่วันที่ ${formatThaiDate(request.startDate)} ถึงวันที่ ${formatThaiDate(request.endDate)}`

  return (
    <div className="bg-paperDark min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-6 no-print flex items-center justify-between">
        <Link to="/" className="text-sm font-semibold text-ink-soft underline">
          ← กลับ
        </Link>
        <button onClick={() => window.print()} className="btn-primary py-2 px-5 text-sm">
          พิมพ์ / บันทึกเป็น PDF
        </button>
      </div>

      <div id="print-sheet" className="max-w-2xl mx-auto bg-white shadow-stamp px-10 py-10 mb-10 text-ink" style={{ fontFamily: "'IBM Plex Sans Thai', sans-serif" }}>
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
          <div className="text-center w-56">
            <p className="mb-10">ลงชื่อ .............................................</p>
            <p>({request.employeeName})</p>
            <p className="text-sm text-ink-soft mt-1">ผู้ขอลา</p>
          </div>
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
          <div className="text-center w-56">
            <p className="mb-10">ลงชื่อ .............................................</p>
            <p>( ........................................... )</p>
            <p className="text-sm text-ink-soft mt-1">ผู้ตรวจสอบ</p>
          </div>
          <div className="text-center w-56">
            <p className="mb-10">ลงชื่อ .............................................</p>
            <p>{request.reviewedBy ? `(${request.reviewedBy})` : '( ........................................... )'}</p>
            <p className="text-sm text-ink-soft mt-1">ผู้อนุมัติ</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 1.5cm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          #print-sheet { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}</style>
    </div>
  )
}
