import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db, ensureAnonymousSession, FIXED_LEAVE_TYPES } from '../firebase'

const AuthContext = createContext(null)
const STORAGE_KEY = 'leave-tracker-employee-id'

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [initError, setInitError] = useState('')

  useEffect(() => {
    async function init() {
      try {
        await ensureAnonymousSession()
        const snap = await getDocs(collection(db, 'employees'))
        if (snap.empty) {
          setNeedsSetup(true)
          return
        }
        const savedId = localStorage.getItem(STORAGE_KEY)
        if (savedId) {
          const found = snap.docs.find((d) => d.id === savedId)
          if (found && found.data().active !== false) {
            setEmployee({ id: found.id, ...found.data() })
          } else {
            localStorage.removeItem(STORAGE_KEY)
          }
        }
      } catch (error) {
        setInitError(error.message || 'ไม่สามารถเชื่อมต่อ Firebase ได้')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const loginWithPin = useCallback(async (pin) => {
    await ensureAnonymousSession()
    const q = query(collection(db, 'employees'), where('pin', '==', pin))
    const snap = await getDocs(q)
    const match = snap.docs.find((d) => d.data().active !== false)
    if (!match) {
      throw new Error('ไม่พบ PIN นี้ในระบบ หรือบัญชีถูกระงับการใช้งาน')
    }
    const data = { id: match.id, ...match.data() }
    setEmployee(data)
    localStorage.setItem(STORAGE_KEY, match.id)
    return data
  }, [])

  const logout = useCallback(() => {
    setEmployee(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const createFirstAdmin = useCallback(async ({ name, pin, setupPin }) => {
    await ensureAnonymousSession()
    if (setupPin !== import.meta.env.VITE_SETUP_PIN) {
      throw new Error('รหัสตั้งค่าระบบไม่ถูกต้อง')
    }
    const docRef = await addDoc(collection(db, 'employees'), {
      name,
      pin,
      role: 'admin',
      department: 'ผู้ดูแลระบบ',
      active: true,
      balances: {},
      createdAt: serverTimestamp(),
    })

    // สร้างประเภทการลาทั้ง 3 แบบให้อัตโนมัติในการตั้งค่าครั้งแรก (เฉพาะตอนที่ยังไม่มี)
    const existingTypes = await getDocs(collection(db, 'leaveTypes'))
    if (existingTypes.empty) {
      for (const t of FIXED_LEAVE_TYPES) {
        await addDoc(collection(db, 'leaveTypes'), t)
      }
    }

    const data = { id: docRef.id, name, pin, role: 'admin', department: 'ผู้ดูแลระบบ', active: true, balances: {} }
    setEmployee(data)
    localStorage.setItem(STORAGE_KEY, docRef.id)
    setNeedsSetup(false)
    return data
  }, [])

  // พนักงานลงทะเบียนบัญชีของตัวเอง (ใช้รหัสของบริษัทกันคนนอกสมัครมั่ว)
  const registerSelf = useCallback(async ({ name, department, pin, companyCode }) => {
    await ensureAnonymousSession()
    if (companyCode !== import.meta.env.VITE_SETUP_PIN) {
      throw new Error('รหัสของบริษัทไม่ถูกต้อง กรุณาสอบถามแอดมิน')
    }
    if (!name.trim()) {
      throw new Error('กรุณากรอกชื่อ-นามสกุล')
    }
    const existing = await getDocs(query(collection(db, 'employees'), where('pin', '==', pin)))
    if (!existing.empty) {
      throw new Error('PIN นี้ถูกใช้แล้ว กรุณาเลือก PIN อื่น')
    }
    const docRef = await addDoc(collection(db, 'employees'), {
      name: name.trim(),
      pin,
      role: 'employee',
      department: department || '',
      gender: '',
      active: true,
      balances: {},
      createdAt: serverTimestamp(),
    })
    const data = { id: docRef.id, name: name.trim(), pin, role: 'employee', department: department || '', gender: '', active: true, balances: {} }
    setEmployee(data)
    localStorage.setItem(STORAGE_KEY, docRef.id)
    return data
  }, [])

  // พนักงานแก้ไขข้อมูล, PIN, และลายเซ็นของตัวเอง
  const updateOwnProfile = useCallback(
    async ({ name, department, pin, signature }) => {
      if (pin !== employee.pin) {
        const dup = await getDocs(query(collection(db, 'employees'), where('pin', '==', pin)))
        if (dup.docs.some((d) => d.id !== employee.id)) {
          throw new Error('PIN นี้ถูกใช้แล้ว กรุณาเลือก PIN อื่น')
        }
      }
      const patch = { name: name.trim(), department: department || '', pin, signature: signature || null }
      await updateDoc(doc(db, 'employees', employee.id), patch)
      const updated = { ...employee, ...patch }
      setEmployee(updated)
      return updated
    },
    [employee]
  )

  return (
    <AuthContext.Provider
      value={{ employee, loading, needsSetup, initError, loginWithPin, logout, createFirstAdmin, registerSelf, updateOwnProfile, setNeedsSetup }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
