import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { notifyError, notifySuccess } from '../components/ToastViewport'

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function describeError(action, error) {
  if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
    return `${action}ไม่สำเร็จ: Firestore Rules ยังไม่ถูก Publish ให้รัน npm run deploy:firestore หลังเข้าสู่ระบบ Firebase CLI`
  }
  return `${action}ไม่สำเร็จ (${error.message || 'unknown'})`
}

export default function VehicleLog() {
  const { employee } = useAuth()
  const isAdmin = employee?.role === 'admin'
  const [vehicles, setVehicles] = useState([])
  const [checkouts, setCheckouts] = useState([])
  const [bookings, setBookings] = useState([])
  const [maxHours, setMaxHours] = useState(8)
  const [now, setNow] = useState(() => Date.now())
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [selectedAction, setSelectedAction] = useState('checkout')
  const [purpose, setPurpose] = useState('')
  const [checkoutAt, setCheckoutAt] = useState(toLocalInput(new Date()))
  const [bookingAt, setBookingAt] = useState(toLocalInput(new Date(Date.now() + 3600000)))
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const stopVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      setVehicles(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th')))
    }, (error) => notifyError(describeError('โหลดรายชื่อรถ', error)))
    const stopCheckouts = onSnapshot(collection(db, 'vehicleCheckouts'), (snapshot) => {
      setCheckouts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (b.checkoutAt || '').localeCompare(a.checkoutAt || '')))
    }, (error) => notifyError(describeError('โหลดประวัติใช้รถ', error)))
    const stopBookings = onSnapshot(collection(db, 'vehicleBookings'), (snapshot) => {
      setBookings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.startAt || '').localeCompare(b.startAt || '')))
    }, (error) => notifyError(describeError('โหลดรายการจองรถ', error)))
    const stopSettings = onSnapshot(doc(db, 'systemSettings', 'vehicleLog'), (snapshot) => {
      if (snapshot.exists()) setMaxHours(Number(snapshot.data().maxCheckoutHours) || 8)
    }, (error) => notifyError(describeError('โหลดการตั้งค่า', error)))
    return () => {
      stopVehicles()
      stopCheckouts()
      stopBookings()
      stopSettings()
    }
  }, [])

  const activeVehicles = vehicles.filter((vehicle) => vehicle.active !== false)
  const ownHistory = checkouts.filter((item) => isAdmin || item.employeeId === employee.id)
  const ownBookings = bookings.filter((item) => isAdmin || item.employeeId === employee.id)
  const myActiveCheckout = checkouts.find((item) => item.employeeId === employee.id && !item.returnedAt)

  async function startCheckout(event) {
    event.preventDefault()
    if (!selectedVehicle || !purpose.trim() || !checkoutAt) return
    const startTime = new Date(checkoutAt)
    if (Number.isNaN(startTime.getTime())) {
      notifyError('วันและเวลาเบิกรถไม่ถูกต้อง')
      return
    }
    setSaving(true)
    try {
      const vehicleRef = doc(db, 'vehicles', selectedVehicle.id)
      const checkoutRef = doc(collection(db, 'vehicleCheckouts'))
      await runTransaction(db, async (transaction) => {
        const vehicleSnapshot = await transaction.get(vehicleRef)
        if (!vehicleSnapshot.exists() || vehicleSnapshot.data().active === false) throw new Error('รถคันนี้ถูกปิดใช้งานแล้ว')
        if (vehicleSnapshot.data().activeCheckoutId) throw new Error('รถคันนี้มีผู้ใช้งานอยู่แล้ว กรุณาเลือกรถคันอื่น')
        const startIso = startTime.toISOString()
        const endIso = new Date(startTime.getTime() + maxHours * 3600000).toISOString()
        const conflictingBooking = (vehicleSnapshot.data().reservations || []).find((booking) =>
          booking.endAt > new Date().toISOString() && booking.startAt < endIso && booking.endAt > startIso
        )
        if (conflictingBooking) throw new Error('ช่วงเวลานี้มีผู้จองรถแล้ว กรุณาเลือกเวลาอื่น')
        transaction.set(checkoutRef, {
          vehicleId: selectedVehicle.id,
          vehicleName: vehicleSnapshot.data().name,
          plate: vehicleSnapshot.data().plate,
          employeeId: employee.id,
          employeeName: employee.name,
          purpose: purpose.trim(),
          checkoutAt: startIso,
          expectedReturnAt: endIso,
          returnedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        transaction.update(vehicleRef, { activeCheckoutId: checkoutRef.id, updatedAt: serverTimestamp() })
      })
      setSelectedVehicle(null)
      setPurpose('')
      setCheckoutAt(toLocalInput(new Date()))
      notifySuccess('บันทึกการเบิกรถเรียบร้อยแล้ว')
    } catch (error) {
      notifyError(error.message || 'เบิกรถไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function reserveVehicle(event) {
    event.preventDefault()
    const startTime = new Date(bookingAt)
    if (!selectedVehicle || !purpose.trim() || Number.isNaN(startTime.getTime())) {
      notifyError('กรุณากรอกเวลาและวัตถุประสงค์การจอง')
      return
    }
    if (startTime.getTime() <= Date.now() || startTime.getTime() > Date.now() + 30 * 86400000) {
      notifyError('จองล่วงหน้าได้ตั้งแต่วันเวลาถัดไปจนถึง 30 วัน')
      return
    }
    setSaving(true)
    try {
      const vehicleRef = doc(db, 'vehicles', selectedVehicle.id)
      const bookingRef = doc(collection(db, 'vehicleBookings'))
      const startIso = startTime.toISOString()
      const endIso = new Date(startTime.getTime() + maxHours * 3600000).toISOString()
      await runTransaction(db, async (transaction) => {
        const vehicleSnapshot = await transaction.get(vehicleRef)
        if (!vehicleSnapshot.exists() || vehicleSnapshot.data().active === false) throw new Error('รถคันนี้ถูกปิดใช้งานแล้ว')
        if (vehicleSnapshot.data().activeCheckoutId) throw new Error('รถคันนี้กำลังถูกใช้งาน จึงยังจองล่วงหน้าไม่ได้')
        const reservations = (vehicleSnapshot.data().reservations || []).filter((booking) => booking.endAt > new Date().toISOString())
        if (reservations.some((booking) => booking.startAt < endIso && booking.endAt > startIso)) {
          throw new Error('ช่วงเวลานี้มีผู้จองรถแล้ว กรุณาเลือกเวลาอื่น')
        }
        if (reservations.length >= 100) throw new Error('รถคันนี้มีรายการจองล่วงหน้ามากเกินไป กรุณาติดต่อแอดมิน')
        const reservation = { id: bookingRef.id, startAt: startIso, endAt: endIso, employeeId: employee.id, employeeName: employee.name }
        transaction.set(bookingRef, {
          ...reservation,
          vehicleId: selectedVehicle.id,
          vehicleName: vehicleSnapshot.data().name,
          plate: vehicleSnapshot.data().plate,
          purpose: purpose.trim(),
          status: 'reserved',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        transaction.update(vehicleRef, { reservations: [...reservations, reservation], updatedAt: serverTimestamp() })
      })
      setSelectedVehicle(null)
      setPurpose('')
      notifySuccess('จองรถล่วงหน้าเรียบร้อยแล้ว')
    } catch (error) {
      notifyError(error.message || 'จองรถไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function cancelBooking(booking) {
    if (!confirm(`ยกเลิกการจอง ${booking.vehicleName} (${booking.plate}) ใช่หรือไม่?`)) return
    setSaving(true)
    try {
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, 'vehicleBookings', booking.id)
        const vehicleRef = doc(db, 'vehicles', booking.vehicleId)
        const [bookingSnapshot, vehicleSnapshot] = await Promise.all([transaction.get(bookingRef), transaction.get(vehicleRef)])
        if (!bookingSnapshot.exists() || bookingSnapshot.data().status !== 'reserved') throw new Error('รายการนี้ไม่อยู่ในสถานะที่ยกเลิกได้')
        transaction.update(bookingRef, { status: 'cancelled', updatedAt: serverTimestamp() })
        if (vehicleSnapshot.exists()) {
          transaction.update(vehicleRef, {
            reservations: (vehicleSnapshot.data().reservations || []).filter((item) => item.id !== booking.id),
            updatedAt: serverTimestamp(),
          })
        }
      })
      notifySuccess('ยกเลิกการจองเรียบร้อยแล้ว')
    } catch (error) {
      notifyError(error.message || 'ยกเลิกการจองไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function startBooking(booking) {
    const nowTime = Date.now()
    if (nowTime < new Date(booking.startAt).getTime() || nowTime >= new Date(booking.endAt).getTime()) {
      notifyError('เริ่มใช้รถได้ตั้งแต่เวลาเริ่มจองจนถึงกำหนดคืน')
      return
    }
    setSaving(true)
    try {
      const bookingRef = doc(db, 'vehicleBookings', booking.id)
      const vehicleRef = doc(db, 'vehicles', booking.vehicleId)
      const checkoutRef = doc(collection(db, 'vehicleCheckouts'))
      await runTransaction(db, async (transaction) => {
        const [bookingSnapshot, vehicleSnapshot] = await Promise.all([transaction.get(bookingRef), transaction.get(vehicleRef)])
        if (!bookingSnapshot.exists() || bookingSnapshot.data().status !== 'reserved') throw new Error('รายการจองนี้ถูกยกเลิกหรือเริ่มใช้งานไปแล้ว')
        if (!vehicleSnapshot.exists() || vehicleSnapshot.data().activeCheckoutId) throw new Error('รถคันนี้ยังไม่พร้อมใช้งาน')
        const vehicle = vehicleSnapshot.data()
        if (!(vehicle.reservations || []).some((item) => item.id === booking.id)) throw new Error('ไม่พบรายการจองในตารางรถ กรุณาติดต่อแอดมิน')
        transaction.set(checkoutRef, {
          vehicleId: booking.vehicleId,
          vehicleName: booking.vehicleName,
          plate: booking.plate,
          employeeId: booking.employeeId,
          employeeName: booking.employeeName,
          purpose: booking.purpose,
          checkoutAt: new Date().toISOString(),
          expectedReturnAt: booking.endAt,
          returnedAt: null,
          bookingId: booking.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        transaction.update(bookingRef, { status: 'started', checkoutId: checkoutRef.id, updatedAt: serverTimestamp() })
        transaction.update(vehicleRef, {
          activeCheckoutId: checkoutRef.id,
          reservations: (vehicle.reservations || []).filter((item) => item.id !== booking.id),
          updatedAt: serverTimestamp(),
        })
      })
      notifySuccess('เริ่มใช้งานรถตามรายการจองแล้ว')
    } catch (error) {
      notifyError(error.message || 'เริ่มใช้งานรถไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function returnVehicle(checkout) {
    if (!confirm(`ยืนยันคืนรถ ${checkout.vehicleName} (${checkout.plate}) ใช่หรือไม่?`)) return
    setSaving(true)
    try {
      await runTransaction(db, async (transaction) => {
        const checkoutRef = doc(db, 'vehicleCheckouts', checkout.id)
        const vehicleRef = doc(db, 'vehicles', checkout.vehicleId)
        const [checkoutSnapshot, vehicleSnapshot] = await Promise.all([transaction.get(checkoutRef), transaction.get(vehicleRef)])
        if (!checkoutSnapshot.exists() || checkoutSnapshot.data().returnedAt) throw new Error('รายการนี้ถูกรถคืนไปแล้ว')
        transaction.update(checkoutRef, { returnedAt: new Date().toISOString(), updatedAt: serverTimestamp() })
        if (vehicleSnapshot.exists() && vehicleSnapshot.data().activeCheckoutId === checkout.id) {
          transaction.update(vehicleRef, { activeCheckoutId: null, updatedAt: serverTimestamp() })
        }
      })
      notifySuccess('บันทึกการคืนรถเรียบร้อยแล้ว')
    } catch (error) {
      notifyError(error.message || 'บันทึกการคืนรถไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  function beginEdit(checkout) {
    setEditing({
      ...checkout,
      checkoutInput: toLocalInput(checkout.checkoutAt),
      returnInput: toLocalInput(checkout.returnedAt),
    })
  }

  async function saveEdit(event) {
    event.preventDefault()
    const startTime = new Date(editing.checkoutInput)
    const returnTime = editing.returnInput ? new Date(editing.returnInput) : null
    if (!editing.purpose.trim() || Number.isNaN(startTime.getTime()) || (returnTime && Number.isNaN(returnTime.getTime()))) {
      notifyError('กรุณาตรวจสอบรายละเอียดและวันเวลา')
      return
    }
    if (returnTime && returnTime < startTime) {
      notifyError('เวลาคืนรถต้องไม่ก่อนเวลาเบิก')
      return
    }
    setSaving(true)
    try {
      await runTransaction(db, async (transaction) => {
        const checkoutRef = doc(db, 'vehicleCheckouts', editing.id)
        const vehicleRef = doc(db, 'vehicles', editing.vehicleId)
        const [checkoutSnapshot, vehicleSnapshot] = await Promise.all([transaction.get(checkoutRef), transaction.get(vehicleRef)])
        if (!checkoutSnapshot.exists()) throw new Error('ไม่พบรายการใช้รถนี้')
        const vehicle = vehicleSnapshot.exists() ? vehicleSnapshot.data() : null
        if (!returnTime && vehicle?.activeCheckoutId && vehicle.activeCheckoutId !== editing.id) {
          throw new Error('รถคันนี้มีรายการเบิกใหม่อยู่ จึงไม่สามารถเปิดรายการเดิมค้างไว้ได้')
        }
        transaction.update(checkoutRef, {
          checkoutAt: startTime.toISOString(),
          expectedReturnAt: new Date(startTime.getTime() + maxHours * 3600000).toISOString(),
          returnedAt: returnTime ? returnTime.toISOString() : null,
          purpose: editing.purpose.trim(),
          updatedAt: serverTimestamp(),
        })
        if (vehicleSnapshot.exists()) {
          if (!returnTime) transaction.update(vehicleRef, { activeCheckoutId: editing.id, updatedAt: serverTimestamp() })
          else if (vehicle.activeCheckoutId === editing.id) transaction.update(vehicleRef, { activeCheckoutId: null, updatedAt: serverTimestamp() })
        }
      })
      setEditing(null)
      notifySuccess('แก้ไขรายการใช้รถเรียบร้อยแล้ว')
    } catch (error) {
      notifyError(error.message || 'แก้ไขรายการไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-4">
        <div>
          <p className="font-mono text-xs uppercase text-brass-dark">Fleet log</p>
          <h1 className="font-display text-2xl font-semibold text-ink">ใช้รถบริษัท</h1>
        </div>
        <p className="text-sm text-ink-soft">กำหนดเวลาคืนไม่เกิน {maxHours} ชั่วโมงต่อรายการ</p>
      </header>

      {myActiveCheckout && (
        <section className={`border-l-4 p-4 ${new Date(myActiveCheckout.expectedReturnAt).getTime() < now ? 'border-clay bg-clay-light' : 'border-brass bg-brass/10'}`} role="status">
          <p className="font-semibold text-ink">{new Date(myActiveCheckout.expectedReturnAt).getTime() < now ? 'เกินกำหนดคืนรถ: ' : 'คุณมีรถที่ยังไม่ได้คืน: '}{myActiveCheckout.vehicleName} · {myActiveCheckout.plate}</p>
          <p className="mt-1 text-sm text-ink-soft">กำหนดคืน {formatDateTime(myActiveCheckout.expectedReturnAt)}</p>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">รถพร้อมใช้งาน</h2>
          <span className="font-mono text-xs text-ink-soft">{activeVehicles.filter((v) => !v.activeCheckoutId).length} / {activeVehicles.length} คัน</span>
        </div>
        {activeVehicles.length === 0 ? (
          <p className="border border-dashed border-ink/20 p-6 text-center text-sm text-ink-soft">ยังไม่มีข้อมูลรถ กรุณาให้แอดมินเพิ่มรายชื่อรถก่อนใช้งาน</p>
        ) : (
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {activeVehicles.map((vehicle) => {
              const current = checkouts.find((item) => item.id === vehicle.activeCheckoutId)
              const overdue = current?.expectedReturnAt && new Date(current.expectedReturnAt).getTime() < now
              return (
                <div key={vehicle.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-semibold text-ink">{vehicle.name}</p>
                    <p className="font-mono text-sm text-ink-soft">{vehicle.plate}</p>
                    {current && <p className={`mt-1 text-xs ${overdue ? 'font-semibold text-clay' : 'text-ink-soft'}`}>{overdue ? 'เกินกำหนด: ' : 'กำลังใช้: '}{current.employeeName} · กำหนดคืน {formatDateTime(current.expectedReturnAt)}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={Boolean(vehicle.activeCheckoutId) || Boolean(myActiveCheckout) || saving} onClick={() => { setSelectedVehicle(vehicle); setSelectedAction('checkout'); setCheckoutAt(toLocalInput(new Date())) }} className="btn-secondary px-3 py-2 text-sm">
                      {vehicle.activeCheckoutId ? 'ไม่ว่าง' : myActiveCheckout ? 'คืนรถก่อน' : 'เบิกรถ'}
                    </button>
                    <button type="button" disabled={Boolean(vehicle.activeCheckoutId) || saving} onClick={() => { setSelectedVehicle(vehicle); setSelectedAction('booking'); setBookingAt(toLocalInput(new Date(Date.now() + 3600000))) }} className="btn-secondary px-3 py-2 text-sm">จองล่วงหน้า</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {selectedVehicle && (
        <form onSubmit={selectedAction === 'booking' ? reserveVehicle : startCheckout} className="card space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="font-semibold text-ink">{selectedAction === 'booking' ? 'จองล่วงหน้า' : 'เบิก'} {selectedVehicle.name}</h2><p className="text-sm text-ink-soft">{selectedVehicle.plate}</p></div>
            <button type="button" onClick={() => setSelectedVehicle(null)} className="text-sm text-ink-soft underline">ยกเลิก</button>
          </div>
          <label className="block text-sm font-medium text-ink">{selectedAction === 'booking' ? 'วันและเวลาเริ่มจอง' : 'วันและเวลาเบิก'}<input type="datetime-local" value={selectedAction === 'booking' ? bookingAt : checkoutAt} onChange={(event) => selectedAction === 'booking' ? setBookingAt(event.target.value) : setCheckoutAt(event.target.value)} className="input-field mt-1" required /></label>
          <label className="block text-sm font-medium text-ink">วัตถุประสงค์ / สถานที่ใช้งาน<textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} className="input-field mt-1 min-h-24" placeholder="เช่น ส่งสินค้าให้ลูกค้า" required /></label>
          <p className="text-xs text-ink-soft">กำหนดคืน {formatDateTime((selectedAction === 'booking' ? bookingAt : checkoutAt) ? new Date(new Date(selectedAction === 'booking' ? bookingAt : checkoutAt).getTime() + maxHours * 3600000) : null)}</p>
          <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? 'กำลังบันทึก...' : selectedAction === 'booking' ? 'ยืนยันจองรถ' : 'ยืนยันเบิกรถ'}</button>
        </form>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">{isAdmin ? 'รายการจองรถ' : 'การจองของฉัน'}</h2>
        {ownBookings.length === 0 ? <p className="py-4 text-sm text-ink-soft">ยังไม่มีรายการจองรถ</p> : (
          <div className="space-y-2">
            {ownBookings.slice(0, 30).map((booking) => {
              const canStart = booking.status === 'reserved' && Date.now() >= new Date(booking.startAt).getTime() && Date.now() < new Date(booking.endAt).getTime() && booking.employeeId === employee.id
              return (
                <article key={booking.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-3">
                  <div><p className="font-semibold text-ink">{booking.vehicleName} · {booking.plate} <span className="ml-1 text-xs font-normal text-ink-soft">{booking.status === 'reserved' ? 'จองแล้ว' : booking.status === 'started' ? 'เริ่มใช้งานแล้ว' : 'ยกเลิก'}</span></p><p className="mt-1 text-sm text-ink-soft">{booking.employeeName} · {booking.purpose}</p><p className="mt-1 text-xs text-ink-soft">{formatDateTime(booking.startAt)} ถึง {formatDateTime(booking.endAt)}</p></div>
                  {booking.status === 'reserved' && <div className="flex gap-3">{canStart && <button type="button" disabled={saving} onClick={() => startBooking(booking)} className="text-sm font-semibold text-sage underline">เริ่มใช้รถ</button>}{(isAdmin || booking.employeeId === employee.id) && <button type="button" disabled={saving} onClick={() => cancelBooking(booking)} className="text-sm font-semibold text-clay underline">ยกเลิกจอง</button>}</div>}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">{isAdmin ? 'ประวัติการใช้รถทั้งหมด' : 'ประวัติการใช้รถของฉัน'}</h2>
        {ownHistory.length === 0 ? <p className="py-6 text-center text-sm text-ink-soft">ยังไม่มีรายการใช้รถ</p> : (
          <div className="space-y-3">
            {ownHistory.slice(0, 40).map((item) => {
              const late = !item.returnedAt && item.expectedReturnAt && new Date(item.expectedReturnAt).getTime() < now
              const canEdit = isAdmin || item.employeeId === employee.id
              return (
                <article key={item.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{item.vehicleName} · {item.plate}</h3><span className={`text-xs font-semibold ${item.returnedAt ? 'text-sage' : late ? 'text-clay' : 'text-brass-dark'}`}>{item.returnedAt ? 'คืนแล้ว' : late ? 'เกินกำหนด' : 'กำลังใช้งาน'}</span></div>
                      <p className="mt-1 text-sm text-ink-soft">{item.employeeName} · {item.purpose}</p>
                      <p className="mt-2 text-xs text-ink-soft">เบิก {formatDateTime(item.checkoutAt)}{item.returnedAt ? ` · คืน ${formatDateTime(item.returnedAt)}` : ` · กำหนดคืน ${formatDateTime(item.expectedReturnAt)}`}</p>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      {!item.returnedAt && (isAdmin || item.employeeId === employee.id) && <button type="button" disabled={saving} onClick={() => returnVehicle(item)} className="text-sm font-semibold text-sage underline">คืนรถ</button>}
                      {canEdit && <button type="button" onClick={() => beginEdit(item)} className="text-sm font-semibold text-ink-soft underline">แก้ไข</button>}
                    </div>
                  </div>
                  {editing?.id === item.id && (
                    <form onSubmit={saveEdit} className="mt-4 grid gap-3 border-t border-ink/10 pt-4 sm:grid-cols-2">
                      <label className="text-sm font-medium text-ink">เวลาเบิก<input type="datetime-local" value={editing.checkoutInput} onChange={(event) => setEditing({ ...editing, checkoutInput: event.target.value })} className="input-field mt-1" required /></label>
                      <label className="text-sm font-medium text-ink">เวลาคืน (เว้นว่างหากยังไม่คืน)<input type="datetime-local" value={editing.returnInput} onChange={(event) => setEditing({ ...editing, returnInput: event.target.value })} className="input-field mt-1" /></label>
                      <label className="text-sm font-medium text-ink sm:col-span-2">วัตถุประสงค์<textarea value={editing.purpose} onChange={(event) => setEditing({ ...editing, purpose: event.target.value })} className="input-field mt-1 min-h-20" required /></label>
                      <div className="flex gap-2 sm:col-span-2"><button disabled={saving} className="btn-primary px-4 py-2 text-sm">บันทึก</button><button type="button" onClick={() => setEditing(null)} className="btn-secondary px-4 py-2 text-sm">ยกเลิก</button></div>
                    </form>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}