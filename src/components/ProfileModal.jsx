import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import SignaturePad from './SignaturePad'
import { notifyError, notifySuccess } from './ToastViewport'

export default function ProfileModal({ onClose }) {
  const { employee, updateOwnProfile } = useAuth()
  const [name, setName] = useState(employee.name)
  const [department, setDepartment] = useState(employee.department || '')
  const [pin, setPin] = useState(employee.pin)
  const [signature, setSignature] = useState(employee.signature || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('กรุณากรอกชื่อ-นามสกุล')
      notifyError('กรุณากรอกชื่อ-นามสกุล')
      return
    }
    if (pin.length < 4) {
      setError('PIN ต้องมีอย่างน้อย 4 หลัก')
      notifyError('PIN ต้องมีอย่างน้อย 4 หลัก')
      return
    }
    setBusy(true)
    try {
      await updateOwnProfile({ name, department, pin, signature })
      setSuccess(true)
      notifySuccess('บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว')
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      const message = err.message || 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'
      setError(message)
      notifyError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink/50 p-3 no-print sm:p-6" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSave} className="card modal-frame w-full max-w-md">
        <header className="flex shrink-0 items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">ข้อมูลของฉัน</h2>
          <button type="button" onClick={onClose} aria-label="ปิดข้อมูลของฉัน" className="px-2 text-xl leading-none text-ink-soft">
            ×
          </button>
        </header>

        <div className="modal-scroll space-y-4 px-5 py-4">
        <div>
          <label className="text-sm text-ink-soft mb-1 block">ชื่อ-นามสกุล</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" required />
        </div>
        <div>
          <label className="text-sm text-ink-soft mb-1 block">แผนก</label>
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="text-sm text-ink-soft mb-1 block">PIN (4-6 หลัก)</label>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="input-field font-mono"
            pattern="[0-9]{4,6}"
            required
          />
        </div>

        {employee.role === 'admin' && (
          <div>
            <label className="text-sm text-ink-soft mb-1 block">ลายเซ็นอิเล็กทรอนิกส์ (สำหรับผู้อนุมัติ)</label>
            <SignaturePad initialData={signature} onChange={setSignature} />
            <p className="text-xs text-ink-soft mt-1">
              เซ็นไว้ครั้งเดียว ระบบจะนำไปใส่ในช่อง "ผู้อนุมัติ" ของใบลาที่พิมพ์ให้อัตโนมัติทุกครั้งที่กดอนุมัติ/ปฏิเสธ
            </p>
          </div>
        )}

        {error && <p className="text-clay text-sm">{error}</p>}
        {success && <p className="text-sage text-sm font-semibold">บันทึกเรียบร้อย</p>}

        </div>
        <footer className="shrink-0 border-t border-ink/10 p-4">
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </footer>
      </form>
    </div>
  )
}
