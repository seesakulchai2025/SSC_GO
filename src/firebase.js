import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'

const requiredEnvironment = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const missingFirebaseConfig = Object.entries(requiredEnvironment)
  .filter(([, value]) => !value)
  .map(([key]) => key)

const firebaseConfig = {
  apiKey: requiredEnvironment.VITE_FIREBASE_API_KEY,
  authDomain: requiredEnvironment.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: requiredEnvironment.VITE_FIREBASE_PROJECT_ID,
  storageBucket: requiredEnvironment.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: requiredEnvironment.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: requiredEnvironment.VITE_FIREBASE_APP_ID,
}

export const app = missingFirebaseConfig.length === 0 ? initializeApp(firebaseConfig) : null
export const db = app ? getFirestore(app) : null

// ประเภทการลาที่ระบบรองรับ — กำหนดตายตัวไว้ 3 ประเภทเท่านั้น
// ลากิจ/ลาป่วย มีโควตามาตรฐานต่อปี ส่วนลาคลอดไม่ตั้งค่าเริ่มต้นไว้
// เพราะต้องกำหนดจำนวนวันเพิ่มเติมเป็นรายบุคคล (ดูหน้า "พนักงาน" ในระบบแอดมิน)
export const FIXED_LEAVE_TYPES = [
  { name: 'ลาป่วย', defaultDays: 14, order: 0 },
  { name: 'ลากิจ', defaultDays: 7, order: 1 },
  { name: 'ลาคลอดบุตร', defaultDays: 0, order: 2 },
]

// เราใช้ PIN ของบริษัทเองเป็นระบบล็อกอินหลัก (ไม่ใช้อีเมล/รหัสผ่านของ Firebase)
// แต่ Firestore ยังต้องการให้ผู้ใช้ "sign in" แบบใดแบบหนึ่งก่อนถึงจะอ่าน/เขียนข้อมูลได้ตาม Security Rules
// จึงใช้ Anonymous Auth เป็นตั๋วผ่านประตูเบื้องหลัง โดยผู้ใช้ไม่เห็นขั้นตอนนี้เลย
export async function ensureAnonymousSession() {
  if (!app) {
    throw new Error(`ตั้งค่า Firebase ไม่ครบ: ${missingFirebaseConfig.join(', ')}`)
  }
  const auth = getAuth(app)
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }
  return auth.currentUser
}
