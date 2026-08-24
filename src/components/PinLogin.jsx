import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

function Keypad({ value, onChange, maxLen = 6 }) {
  function press(k) {
    if (k === '') return
    if (k === 'del') {
      onChange(value.slice(0, -1))
      return
    }
    if (value.length < maxLen) onChange(value + k)
  }
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto">
      {KEYS.map((k, i) => (
        <button
          key={i}
          type="button"
          disabled={k === ''}
          onClick={() => press(k)}
          className={`h-16 rounded-xl text-xl font-mono font-semibold transition-all active:scale-95 ${
            k === ''
              ? 'invisible'
              : k === 'del'
              ? 'bg-white border-2 border-ink/15 text-clay'
              : 'bg-white border-2 border-ink/15 text-ink hover:border-brass'
          }`}
        >
          {k === 'del' ? '⌫' : k}
        </button>
      ))}
    </div>
  )
}

function PinDots({ value, maxLen = 6 }) {
  return (
    <div className="flex justify-center gap-2.5 my-6">
      {Array.from({ length: maxLen }).map((_, i) => (
        <div
          key={i}
          className={`w-3.5 h-3.5 rounded-full border-2 border-ink transition-colors ${
            i < value.length ? 'bg-ink' : 'bg-transparent'
          }`}
        />
      ))}
    </div>
  )
}

export default function PinLogin() {
  const { loginWithPin, needsSetup, createFirstAdmin } = useAuth()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // first-run setup state
  const [setupName, setSetupName] = useState('')
  const [setupPinCode, setSetupPinCode] = useState('')
  const [setupGateCode, setSetupGateCode] = useState('')

  async function handleSubmit() {
    if (pin.length < 4) return
    setBusy(true)
    setError('')
    try {
      await loginWithPin(pin)
    } catch (e) {
      setError(e.message)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  async function handleSetupSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createFirstAdmin({ name: setupName, pin: setupPinCode, setupPin: setupGateCode })
    } catch (e2) {
      setError(e2.message)
    } finally {
      setBusy(false)
    }
  }

  if (needsSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-paper">
        <div className="card w-full max-w-sm p-8">
          <p className="font-mono text-xs tracking-widest text-brass-dark uppercase mb-1">ตั้งค่าครั้งแรก</p>
          <h1 className="font-display text-2xl font-semibold text-ink mb-6">สร้างบัญชีผู้ดูแลระบบ</h1>
          <form onSubmit={handleSetupSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-ink-soft mb-1 block">ชื่อ-นามสกุล</label>
              <input required value={setupName} onChange={(e) => setSetupName(e.target.value)} className="input-field" placeholder="เช่น สมชาย ใจดี" />
            </div>
            <div>
              <label className="text-sm text-ink-soft mb-1 block">ตั้ง PIN สำหรับเข้าระบบ (4-6 หลัก)</label>
              <input required pattern="[0-9]{4,6}" value={setupPinCode} onChange={(e) => setSetupPinCode(e.target.value.replace(/\D/g, ''))} className="input-field font-mono" placeholder="เช่น 1234" />
            </div>
            <div>
              <label className="text-sm text-ink-soft mb-1 block">รหัสตั้งค่าระบบ (ตั้งไว้ใน .env)</label>
              <input required value={setupGateCode} onChange={(e) => setSetupGateCode(e.target.value)} className="input-field font-mono" placeholder="VITE_SETUP_PIN" />
            </div>
            {error && <p className="text-clay text-sm">{error}</p>}
            <button disabled={busy} className="btn-primary w-full">{busy ? 'กำลังสร้าง...' : 'สร้างบัญชีผู้ดูแลระบบ'}</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-paper">
      <div className="card w-full max-w-xs p-8 text-center">
        <p className="font-mono text-xs tracking-widest text-brass-dark uppercase mb-1">ระบบลงเวลาลา</p>
        <h1 className="font-display text-xl font-semibold text-ink mb-2">กรอก PIN เพื่อเข้าสู่ระบบ</h1>
        <PinDots value={pin} />
        {error && <p className="text-clay text-sm mb-3">{error}</p>}
        <Keypad value={pin} onChange={setPin} />
        <button
          onClick={handleSubmit}
          disabled={pin.length < 4 || busy}
          className="btn-primary w-full mt-6"
        >
          {busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
        </button>
      </div>
    </div>
  )
}
