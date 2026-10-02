import { useEffect, useRef, useState } from 'react'
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { formatDateDMY, formatDateTimeDMY, todayISO } from '../utils/dateUtils'
import { notifyError, notifySuccess } from '../components/ToastViewport'
import VehicleUsagePrint from '../components/VehicleUsagePrint'

const MAX_USE_HOURS = 12
const AUTOPLAY_MS = 5000
const RING_RADIUS = 84
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function useNow() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return now
}

function timestampToMillis(value) {
  if (value == null) return null
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCountdown(milliseconds) {
  const seconds = Math.floor(Math.abs(milliseconds) / 1000)
  const hours = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const remainder = String(seconds % 60).padStart(2, '0')
  return `${hours}:${minutes}:${remainder}`
}

function getVehicleNameParts(vehicle) {
  const legacyParts = (vehicle.name || '').trim().split(/\s+/).filter(Boolean)
  const brand = vehicle.brand?.trim() || legacyParts.shift() || ''
  const model = vehicle.model?.trim() || legacyParts.join(' ')
  return { brand, model }
}

function formatInsuranceExpiry(value) {
  return value ? formatDateDMY(value) : ''
}

export function CheckoutTimerRing({ vehicle, checkout, now }) {
  const active = Boolean(vehicle.activeCheckoutId)
  const checkoutAt = timestampToMillis(checkout?.checkoutAt)
  const maxDuration = MAX_USE_HOURS * 60 * 60 * 1000
  const remaining = active && checkoutAt != null ? checkoutAt + maxDuration - now : null
  const overdue = remaining != null && remaining <= 0
  const elapsed = checkoutAt == null ? 0 : Math.min(Math.max((now - checkoutAt) / maxDuration, 0), 1)
  const strokeColor = !active
    ? 'var(--color-approved-bg)'
    : overdue
      ? 'var(--color-rejected)'
      : 'var(--color-pending)'
  const dashOffset = !active || overdue || checkoutAt == null ? 0 : RING_CIRCUMFERENCE * (1 - elapsed)
  const ariaLabel = !active
    ? 'ว่าง'
    : overdue
      ? `เกินเวลา ${formatCountdown(-remaining)}`
      : remaining == null
        ? 'ไม่ว่าง ไม่พบเวลาเบิก'
        : `ไม่ว่าง เหลือเวลา ${formatCountdown(remaining)}`

  return (
    <div className="relative grid size-20 shrink-0 place-items-center sm:size-28" role="img" aria-label={ariaLabel}>
      <svg aria-hidden="true" viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90">
        <circle cx="100" cy="100" r={RING_RADIUS} fill="none" stroke="var(--color-border)" strokeWidth="12" />
        <circle
          cx="100"
          cy="100"
          r={RING_RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={overdue ? 0 : dashOffset}
          className="transition-[stroke-dashoffset,stroke] duration-1000 ease-linear"
        />
      </svg>
      <div className="relative flex max-w-16 flex-col items-center gap-1 text-center sm:max-w-24">
        {!active ? (
          <span className="text-xs font-semibold" style={{ color: 'var(--color-approved)' }}>ว่าง</span>
        ) : overdue ? (
          <>
            <span className="text-[10px] font-semibold sm:text-xs" style={{ color: 'var(--color-rejected-text)' }}>เกินเวลา</span>
            <span className="font-mono text-[10px] font-semibold tabular-nums sm:text-xs" style={{ color: 'var(--color-rejected-text)' }}>+{formatCountdown(-remaining)}</span>
          </>
        ) : (
          <>
            <span className="text-xs font-semibold" style={{ color: 'var(--color-pending-text)' }}>ไม่ว่าง</span>
            <span className="font-mono text-[10px] font-semibold tabular-nums sm:text-xs" style={{ color: 'var(--color-pending-text)' }}>{remaining == null ? '--:--:--' : formatCountdown(remaining)}</span>
          </>
        )}
      </div>
    </div>
  )
}

function scrollToVehicle(container, index, behavior = 'smooth') {
  const slide = container?.children[index]
  if (!container || !slide) return
  const left = slide.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft
  container.scrollTo({ left, behavior })
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function localDateKey(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDateTime(value) {
  return formatDateTimeDMY(value)
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
  const now = useNow()
  const carouselRef = useRef(null)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [selectedAction, setSelectedAction] = useState('checkout')
  const [purpose, setPurpose] = useState('')
  const [checkoutAt, setCheckoutAt] = useState(toLocalInput(new Date()))
  const [bookingAt, setBookingAt] = useState(toLocalInput(new Date(Date.now() + 3600000)))
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [showDailyUsage, setShowDailyUsage] = useState(false)
  const [viewDate, setViewDate] = useState(todayISO())
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [activeSlide, setActiveSlide] = useState(0)
  const [autoPlayReset, setAutoPlayReset] = useState(0)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [isHoveringCarousel, setIsHoveringCarousel] = useState(false)
  const [isFocusedCarousel, setIsFocusedCarousel] = useState(false)
  const [isTouchingCarousel, setIsTouchingCarousel] = useState(false)
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')

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
  const ownBookings = bookings.filter((item) => isAdmin || item.employeeId === employee.id)
  const myActiveCheckout = checkouts.find((item) => item.employeeId === employee.id && !item.returnedAt)
  const dailyCheckouts = checkouts.filter((item) => {
    if (localDateKey(item.checkoutAt) !== viewDate) return false
    const search = employeeSearch.trim().toLocaleLowerCase()
    return !search || `${item.employeeName || ''} ${item.employeeId || ''}`.toLocaleLowerCase().includes(search)
  })

  useEffect(() => {
    const updateVisibility = () => setIsPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const disableAutoplay = (event) => {
      if (event.matches) setAutoPlayEnabled(false)
    }
    reducedMotion.addEventListener?.('change', disableAutoplay)
    return () => reducedMotion.removeEventListener?.('change', disableAutoplay)
  }, [])

  useEffect(() => {
    if (!autoPlayEnabled || activeVehicles.length < 2 || isHoveringCarousel || isFocusedCarousel || isTouchingCarousel || !isPageVisible) return undefined
    const timer = window.setTimeout(() => {
      const nextSlide = (activeSlide + 1) % activeVehicles.length
      setActiveSlide(nextSlide)
      scrollToVehicle(carouselRef.current, nextSlide)
    }, AUTOPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [activeSlide, activeVehicles.length, autoPlayEnabled, autoPlayReset, isFocusedCarousel, isHoveringCarousel, isPageVisible, isTouchingCarousel])

  useEffect(() => {
    if (activeSlide >= activeVehicles.length && activeVehicles.length > 0) {
      setActiveSlide(0)
      scrollToVehicle(carouselRef.current, 0, 'auto')
    }
  }, [activeSlide, activeVehicles.length])

  useEffect(() => {
    if (!myActiveCheckout) return
    const employeeRef = doc(db, 'employees', employee.id)
    const checkoutRef = doc(db, 'vehicleCheckouts', myActiveCheckout.id)
    runTransaction(db, async (transaction) => {
      const [employeeSnapshot, checkoutSnapshot] = await Promise.all([
        transaction.get(employeeRef),
        transaction.get(checkoutRef),
      ])
      if (
        employeeSnapshot.exists() &&
        !employeeSnapshot.data().activeVehicleCheckoutId &&
        checkoutSnapshot.exists() &&
        !checkoutSnapshot.data().returnedAt
      ) {
        transaction.update(employeeRef, { activeVehicleCheckoutId: myActiveCheckout.id, updatedAt: serverTimestamp() })
      }
    }).catch((error) => notifyError(describeError('ตรวจสอบรถที่ยังไม่คืน', error)))
  }, [employee.id, myActiveCheckout?.id])

  function openCheckoutModal() {
    setSelectedVehicle(activeVehicles.find((vehicle) => !vehicle.activeCheckoutId) || activeVehicles[0] || null)
    setSelectedAction('checkout')
    setCheckoutAt(toLocalInput(new Date()))
    setBookingAt(toLocalInput(new Date(Date.now() + 3600000)))
    setPurpose('')
    setShowCheckoutModal(true)
  }

  function goToSlide(index) {
    if (activeVehicles.length < 1) return
    const nextSlide = (index + activeVehicles.length) % activeVehicles.length
    setActiveSlide(nextSlide)
    setAutoPlayReset((value) => value + 1)
    scrollToVehicle(carouselRef.current, nextSlide)
  }

  function updateActiveSlide(event) {
    const container = event.currentTarget
    const slides = Array.from(container.children)
    if (slides.length < 1) return
    const center = container.getBoundingClientRect().left + container.clientWidth / 2
    const nearest = slides.reduce((bestIndex, slide, index) => {
      const distance = Math.abs(slide.getBoundingClientRect().left + slide.clientWidth / 2 - center)
      const bestDistance = Math.abs(slides[bestIndex].getBoundingClientRect().left + slides[bestIndex].clientWidth / 2 - center)
      return distance < bestDistance ? index : bestIndex
    }, 0)
    setActiveSlide((current) => current === nearest ? current : nearest)
  }

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
      const employeeRef = doc(db, 'employees', employee.id)
      await runTransaction(db, async (transaction) => {
        const [vehicleSnapshot, employeeSnapshot] = await Promise.all([
          transaction.get(vehicleRef),
          transaction.get(employeeRef),
        ])
        if (employeeSnapshot.exists() && employeeSnapshot.data().activeVehicleCheckoutId) throw new Error('คุณยังไม่ได้คืนรถคันก่อน กรุณาคืนรถก่อนเบิกคันใหม่')
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
        if (employeeSnapshot.exists()) transaction.update(employeeRef, { activeVehicleCheckoutId: checkoutRef.id, updatedAt: serverTimestamp() })
      })
      setSelectedVehicle(null)
      setShowCheckoutModal(false)
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
      setShowCheckoutModal(false)
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
    if (myActiveCheckout) {
      notifyError('คุณยังไม่ได้คืนรถคันก่อน กรุณาคืนรถก่อนเริ่มใช้รถคันใหม่')
      return
    }
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
      const employeeRef = doc(db, 'employees', booking.employeeId)
      await runTransaction(db, async (transaction) => {
        const [bookingSnapshot, vehicleSnapshot, employeeSnapshot] = await Promise.all([
          transaction.get(bookingRef),
          transaction.get(vehicleRef),
          transaction.get(employeeRef),
        ])
        if (employeeSnapshot.exists() && employeeSnapshot.data().activeVehicleCheckoutId) throw new Error('คุณยังไม่ได้คืนรถคันก่อน กรุณาคืนรถก่อนเริ่มใช้รถคันใหม่')
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
        if (employeeSnapshot.exists()) transaction.update(employeeRef, { activeVehicleCheckoutId: checkoutRef.id, updatedAt: serverTimestamp() })
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
        const employeeRef = doc(db, 'employees', checkout.employeeId)
        const [checkoutSnapshot, vehicleSnapshot, employeeSnapshot] = await Promise.all([transaction.get(checkoutRef), transaction.get(vehicleRef), transaction.get(employeeRef)])
        if (!checkoutSnapshot.exists() || checkoutSnapshot.data().returnedAt) throw new Error('รายการนี้ถูกรถคืนไปแล้ว')
        transaction.update(checkoutRef, { returnedAt: new Date().toISOString(), updatedAt: serverTimestamp() })
        if (employeeSnapshot.exists() && employeeSnapshot.data().activeVehicleCheckoutId === checkout.id) {
          transaction.update(employeeRef, { activeVehicleCheckoutId: null, updatedAt: serverTimestamp() })
        }
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
        const employeeRef = doc(db, 'employees', editing.employeeId)
        const [checkoutSnapshot, vehicleSnapshot, employeeSnapshot] = await Promise.all([transaction.get(checkoutRef), transaction.get(vehicleRef), transaction.get(employeeRef)])
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
        if (employeeSnapshot.exists()) {
          if (!returnTime) transaction.update(employeeRef, { activeVehicleCheckoutId: editing.id, updatedAt: serverTimestamp() })
          else if (employeeSnapshot.data().activeVehicleCheckoutId === editing.id) transaction.update(employeeRef, { activeVehicleCheckoutId: null, updatedAt: serverTimestamp() })
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
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-soft">กำหนดเวลาคืนไม่เกิน {maxHours} ชั่วโมง</p>
          <button type="button" onClick={() => setShowDailyUsage(true)} className="btn-secondary px-3 py-2 text-sm">รายการใช้รถรายวัน</button>
          <button type="button" onClick={openCheckoutModal} className="btn-primary px-4 py-2 text-sm">＋ เบิก / จองรถ</button>
        </div>
      </header>

      {myActiveCheckout && (
        <section className={`border-l-4 p-4 ${new Date(myActiveCheckout.expectedReturnAt).getTime() < now ? 'border-clay bg-clay-light' : 'border-brass bg-brass/10'}`} role="status">
          <p className="font-semibold text-ink">{new Date(myActiveCheckout.expectedReturnAt).getTime() < now ? 'เกินกำหนดคืนรถ: ' : 'คุณมีรถที่ยังไม่ได้คืน: '}{myActiveCheckout.vehicleName} · {myActiveCheckout.plate}</p>
          <p className="mt-1 text-sm text-ink-soft">กำหนดคืน {formatDateTime(myActiveCheckout.expectedReturnAt)}</p>
        </section>
      )}

      <section
        aria-label="สถานะรถบริษัท"
        onMouseEnter={() => setIsHoveringCarousel(true)}
        onMouseLeave={() => setIsHoveringCarousel(false)}
        onFocusCapture={() => setIsFocusedCarousel(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setIsFocusedCarousel(false)
        }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">สถานะรถบริษัท</h2>
            <p className="text-xs text-ink-soft">ใช้งานอยู่ {activeVehicles.filter((vehicle) => vehicle.activeCheckoutId).length} จาก {activeVehicles.length} คัน</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setAutoPlayEnabled((enabled) => !enabled); setAutoPlayReset((value) => value + 1) }} disabled={activeVehicles.length < 2} className="btn-secondary px-3 py-2 text-xs" aria-label={autoPlayEnabled ? 'หยุดสไลด์อัตโนมัติ' : 'เล่นสไลด์อัตโนมัติ'}>
              {autoPlayEnabled ? 'หยุดอัตโนมัติ' : 'เล่นอัตโนมัติ'}
            </button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => goToSlide(activeSlide - 1)} disabled={activeVehicles.length < 2} aria-label="รถคันก่อนหน้า" className="btn-secondary grid size-10 place-items-center p-0 text-lg">←</button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => goToSlide(activeSlide + 1)} disabled={activeVehicles.length < 2} aria-label="รถคันถัดไป" className="btn-secondary grid size-10 place-items-center p-0 text-lg">→</button>
          </div>
        </div>
        {activeVehicles.length === 0 ? (
          <p className="border border-dashed border-ink/20 p-6 text-center text-sm text-ink-soft">ยังไม่มีข้อมูลรถ กรุณาให้แอดมินเพิ่มรายชื่อรถก่อนใช้งาน</p>
        ) : (
          <>
            <div
              ref={carouselRef}
              role="region"
              aria-label="รายการรถบริษัท เลื่อนเพื่อดูรถคันอื่น"
              onScroll={updateActiveSlide}
              onTouchStart={() => setIsTouchingCarousel(true)}
              onTouchEnd={() => setIsTouchingCarousel(false)}
              onTouchCancel={() => setIsTouchingCarousel(false)}
              className="scrollbar-hidden grid grid-flow-col auto-cols-[100%] gap-4 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-2 sm:auto-cols-[calc((100%-1rem)/2)] lg:auto-cols-[calc((100%-2rem)/3)]"
            >
              {activeVehicles.map((vehicle) => {
                const current = checkouts.find((item) => item.id === vehicle.activeCheckoutId)
                const { brand, model } = getVehicleNameParts(vehicle)
                const insuranceExpiry = formatInsuranceExpiry(vehicle.insuranceExpiry)
                return (
                  <article key={vehicle.id} className="card grid h-36 min-w-0 snap-start grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-2xl p-4 text-left shadow-stamp sm:h-44 sm:gap-5 sm:p-5">
                    <CheckoutTimerRing vehicle={vehicle} checkout={current} now={now} />
                    <div className="flex min-w-0 flex-col justify-center gap-1">
                      <p title={brand} className="truncate text-sm font-bold text-ink sm:text-base">{brand || '-'}</p>
                      <p title={model} className="truncate text-xs text-ink-soft sm:text-sm">{model || '-'}</p>
                      <p className="truncate font-mono text-xs text-ink-soft sm:text-sm">ทะเบียน {vehicle.plate || '-'}</p>
                      <p title={insuranceExpiry || undefined} className="truncate text-[10px] text-ink-soft sm:text-xs">{insuranceExpiry ? `ประกันหมดอายุ ${insuranceExpiry}` : 'ประกัน: ไม่ระบุ'}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </section>

      {showCheckoutModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={() => setShowCheckoutModal(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="vehicle-action-title" onClick={(event) => event.stopPropagation()} className="card modal-frame w-full max-w-lg">
            <header className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <div>
                <h2 id="vehicle-action-title" className="font-display text-lg font-semibold text-ink">เบิกหรือจองรถ</h2>
                <p className="mt-1 text-xs text-ink-soft">กำหนดเวลาคืนไม่เกิน {maxHours} ชั่วโมงต่อรายการ</p>
              </div>
              <button type="button" onClick={() => setShowCheckoutModal(false)} aria-label="ปิดหน้าต่าง" className="px-2 text-xl text-ink-soft">×</button>
            </header>
            {activeVehicles.length === 0 ? (
              <p className="p-6 text-sm text-ink-soft">ยังไม่มีรถที่เปิดใช้งาน</p>
            ) : (
              <form onSubmit={selectedAction === 'booking' ? reserveVehicle : startCheckout} className="modal-scroll space-y-4 px-5 py-4">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="เลือกการทำรายการ">
                  <button type="button" aria-pressed={selectedAction === 'checkout'} onClick={() => setSelectedAction('checkout')} className={`rounded-md border px-3 py-2 text-sm font-semibold ${selectedAction === 'checkout' ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white text-ink-soft'}`}>เบิกรถ</button>
                  <button type="button" aria-pressed={selectedAction === 'booking'} onClick={() => setSelectedAction('booking')} className={`rounded-md border px-3 py-2 text-sm font-semibold ${selectedAction === 'booking' ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white text-ink-soft'}`}>จองล่วงหน้า</button>
                </div>
                <label className="block text-sm font-medium text-ink">เลือกรถ
                  <select value={selectedVehicle?.id || ''} onChange={(event) => setSelectedVehicle(activeVehicles.find((vehicle) => vehicle.id === event.target.value) || null)} className="input-field mt-1" required>
                    <option value="" disabled>เลือกรถบริษัท</option>
                    {activeVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.plate}{vehicle.activeCheckoutId ? ' · กำลังใช้งาน' : ' · ว่าง'}</option>)}
                  </select>
                </label>
                {myActiveCheckout && selectedAction === 'checkout' && <p role="status" className="border-l-2 border-clay bg-clay-light px-3 py-2 text-sm text-ink">คุณยังไม่ได้คืน {myActiveCheckout.vehicleName} · {myActiveCheckout.plate} จึงยังเบิกรถคันอื่นไม่ได้</p>}
                <label className="block text-sm font-medium text-ink">{selectedAction === 'booking' ? 'วันและเวลาเริ่มจอง' : 'วันและเวลาเบิก'}
                  <input type="datetime-local" value={selectedAction === 'booking' ? bookingAt : checkoutAt} onChange={(event) => selectedAction === 'booking' ? setBookingAt(event.target.value) : setCheckoutAt(event.target.value)} className="input-field mt-1" required />
                </label>
                <label className="block text-sm font-medium text-ink">วัตถุประสงค์ / สถานที่ใช้งาน
                  <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} className="input-field mt-1 min-h-24" placeholder="เช่น ส่งสินค้าให้ลูกค้า" required />
                </label>
                <p className="text-xs text-ink-soft">กำหนดคืน {formatDateTime((selectedAction === 'booking' ? bookingAt : checkoutAt) ? new Date(new Date(selectedAction === 'booking' ? bookingAt : checkoutAt).getTime() + maxHours * 3600000) : null)}</p>
                <footer className="flex justify-end gap-2 border-t border-ink/10 pt-4">
                  <button type="button" onClick={() => setShowCheckoutModal(false)} className="btn-secondary px-4 py-2 text-sm">ยกเลิก</button>
                  <button type="submit" disabled={saving || !selectedVehicle || Boolean(selectedVehicle.activeCheckoutId) || (selectedAction === 'checkout' && Boolean(myActiveCheckout))} className="btn-primary px-4 py-2 text-sm">{saving ? 'กำลังบันทึก...' : selectedAction === 'booking' ? 'ยืนยันจองรถ' : 'ยืนยันเบิกรถ'}</button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">{isAdmin ? 'รายการจองรถ' : 'การจองของฉัน'}</h2>
        {ownBookings.length === 0 ? <p className="py-4 text-sm text-ink-soft">ยังไม่มีรายการจองรถ</p> : (
          <div className="space-y-2">
            {ownBookings.slice(0, 30).map((booking) => {
              const canStart = booking.status === 'reserved' && !myActiveCheckout && Date.now() >= new Date(booking.startAt).getTime() && Date.now() < new Date(booking.endAt).getTime() && booking.employeeId === employee.id
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

      {showDailyUsage && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6" onClick={() => setShowDailyUsage(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="daily-vehicle-usage-title" onClick={(event) => event.stopPropagation()} className="card modal-frame w-full max-w-5xl">
            <div className="modal-scroll space-y-4 p-4 sm:p-6">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="daily-vehicle-usage-title" className="font-display text-lg font-semibold text-ink">รายการใช้รถรายวัน</h2>
            <p className="text-sm text-ink-soft">{dailyCheckouts.length} รายการ · แสดงสถานะและผู้ใช้รถทุกคน</p>
          </div>
          <button type="button" onClick={() => setShowDailyUsage(false)} aria-label="ปิดรายการใช้รถรายวัน" className="grid size-11 place-items-center text-xl text-ink-soft">×</button>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
            <label className="text-xs font-medium text-ink-soft">วันที่
              <input type="date" value={viewDate} onChange={(event) => setViewDate(event.target.value)} className="input-field mt-1 py-2" />
            </label>
            <label className="text-xs font-medium text-ink-soft">ค้นหาพนักงาน
              <input value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} className="input-field mt-1 py-2" placeholder="ชื่อหรือรหัสพนักงาน" />
            </label>
          </div>
        </div>
        {dailyCheckouts.length === 0 ? <p className="border-y border-ink/10 py-8 text-center text-sm text-ink-soft">ไม่พบรายการใช้รถในวันที่เลือก</p> : (
          <div className="space-y-3">
            {dailyCheckouts.map((item) => {
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
                      {!item.returnedAt && (isAdmin || item.employeeId === employee.id) && <button type="button" disabled={saving} onClick={() => returnVehicle(item)} className="min-h-11 px-2 text-sm font-semibold text-sage underline">คืนรถ</button>}
                      {item.returnedAt && <VehicleUsagePrint checkout={item} />}
                      {canEdit && <button type="button" onClick={() => beginEdit(item)} className="min-h-11 px-2 text-sm font-semibold text-ink-soft underline">แก้ไข</button>}
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
            </div>
          </section>
        </div>
      )}
    </main>
  )
}