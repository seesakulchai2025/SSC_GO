import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { fileToAttachment } from '../utils/attachmentStorage'
import { notifyError, notifySuccess } from './ToastViewport'

export default function AttachmentUploader({ requestId, existing }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const { data, name, type } = await fileToAttachment(file)
      await updateDoc(doc(db, 'leaveRequests', requestId), {
        attachmentData: data,
        attachmentName: name,
        attachmentType: type,
      })
      notifySuccess('แนบไฟล์เรียบร้อยแล้ว')
    } catch (err) {
      const message = err.message || 'แนบไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง'
      setError(message)
      notifyError(message)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {existing?.attachmentData && (
        <a
          href={existing.attachmentData}
          download={existing.attachmentName || 'evidence'}
          className="text-xs text-brass-dark font-semibold underline"
        >
          ดูหลักฐานที่แนบ
        </a>
      )}
      <label className="text-xs font-semibold text-ink-soft border-2 border-dashed border-ink/20 rounded-md px-2.5 py-1.5 cursor-pointer hover:border-brass transition-colors">
        {busy ? 'กำลังประมวลผล...' : existing?.attachmentData ? 'เปลี่ยนไฟล์แนบ' : '+ แนบหลักฐาน'}
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} disabled={busy} />
      </label>
      {error && <p className="text-clay text-xs max-w-[10rem] text-right">{error}</p>}
    </div>
  )
}
