import { useEffect, useState } from 'react'

const EVENT_NAME = 'ssc:toast'
let nextToastId = 0

export function notifySuccess(message) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { type: 'success', message } }))
}

export function notifyError(message) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { type: 'error', message } }))
}

export default function ToastViewport() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    function handleToast(event) {
      const toast = { id: ++nextToastId, ...event.detail }
      setToasts((current) => [...current, toast])
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id))
      }, 4200)
    }
    window.addEventListener(EVENT_NAME, handleToast)
    return () => window.removeEventListener(EVENT_NAME, handleToast)
  }, [])

  return (
    <div aria-live="polite" className="toast-viewport no-print pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
      {toasts.map((toast) => {
        const success = toast.type === 'success'
        return (
          <div
            key={toast.id}
            role={success ? 'status' : 'alert'}
            className={`pointer-events-auto flex items-start gap-3 border px-4 py-3 shadow-lg ${success ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-red-700 bg-red-700 text-white'}`}
          >
            <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/70 font-bold leading-none">
              {success ? '✓' : '×'}
            </span>
            <p className="min-w-0 flex-1 text-sm font-semibold">{toast.message}</p>
            <button
              type="button"
              aria-label="ปิดการแจ้งเตือน"
              className="pointer-events-auto -mr-1 -mt-1 px-1 text-lg leading-6 text-white/80 hover:text-white"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
