import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react'
import useIsMobile from '../hooks/useIsMobile'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

let lockCount = 0
let previousOverflow = ''
function lockScroll() {
  if (lockCount++ === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}
function unlockScroll() {
  if (--lockCount === 0) document.body.style.overflow = previousOverflow
}

// Sheets currently open, topmost last. Browser Back closes only the topmost one.
const openStack = []

function Chevron({ open, direction }) {
  const rotate = direction === 'down' ? (open ? 'rotate(180deg)' : 'none') : 'none'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: rotate }} className="shrink-0 text-ink-soft">
      {direction === 'down' ? <polyline points="6 9 12 15 18 9" /> : <polyline points="9 6 15 12 9 18" />}
    </svg>
  )
}

/**
 * Renders `children` exactly as-is on screens >= 640px (or when mobileMode="inline").
 * On phones:
 *  - "sheet":    a button opens a bottom sheet (children stay mounted, so state is kept)
 *  - "collapse": a button toggles an accordion
 *  - "inline":   children stay on the page
 */
export default function MobileSheetSection({
  mobileMode = 'sheet',
  title,
  label,
  icon = null,
  badge = null,
  summary = null,
  footer = null,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  triggerVariant = 'button',
  triggerClassName = '',
  ariaLabel,
  children,
}) {
  const isMobile = useIsMobile()
  const [innerOpen, setInnerOpen] = useState(defaultOpen)
  const open = controlledOpen ?? innerOpen
  const setOpen = useCallback((value) => {
    if (onOpenChange) onOpenChange(value)
    if (controlledOpen === undefined) setInnerOpen(value)
  }, [onOpenChange, controlledOpen])

  const id = useId()
  const triggerRef = useRef(null)
  const sheetRef = useRef(null)
  const returnFocusRef = useRef(null)
  const pushedRef = useRef(false)
  const isSheet = isMobile && mobileMode === 'sheet'
  const sheetOpen = isSheet && open

  const close = useCallback(() => {
    if (pushedRef.current) window.history.back()
    else setOpen(false)
  }, [setOpen])

  useEffect(() => {
    if (!sheetOpen) return undefined
    returnFocusRef.current = document.activeElement
    openStack.push(id)
    window.history.pushState({ ...(window.history.state || {}), __sheet: id }, '')
    pushedRef.current = true
    lockScroll()

    const onPop = () => {
      if (openStack[openStack.length - 1] !== id) return
      pushedRef.current = false
      setOpen(false)
    }
    window.addEventListener('popstate', onPop)

    const node = sheetRef.current
    node?.focus({ preventScroll: true })

    const vv = window.visualViewport
    const fit = () => {
      if (!node) return
      const viewport = vv ? vv.height : window.innerHeight
      const offset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
      node.style.bottom = `${offset}px`
      node.style.maxHeight = `${Math.min(window.innerHeight * 0.9, viewport - 8)}px`
    }
    fit()
    vv?.addEventListener('resize', fit)
    vv?.addEventListener('scroll', fit)

    let timer
    const onFocusIn = (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches('input,select,textarea')) return
      clearTimeout(timer)
      timer = setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
    }
    node?.addEventListener('focusin', onFocusIn)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('popstate', onPop)
      vv?.removeEventListener('resize', fit)
      vv?.removeEventListener('scroll', fit)
      node?.removeEventListener('focusin', onFocusIn)
      const index = openStack.lastIndexOf(id)
      if (index >= 0) openStack.splice(index, 1)
      unlockScroll()
      const target = triggerRef.current || returnFocusRef.current
      if (target instanceof HTMLElement) target.focus({ preventScroll: true })
    }
  }, [sheetOpen, id, setOpen])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const items = [...sheetRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
    if (!items.length) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!isMobile || mobileMode === 'inline') return <>{children}</>

  const text = label || title
  const trigger = hideTrigger ? null : triggerVariant === 'icon' ? (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={ariaLabel || text}
      aria-expanded={open}
      className={`inline-grid size-10 shrink-0 place-items-center rounded-full text-ink-soft ${triggerClassName}`}
    >
      {icon || (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="8" r="0.6" fill="currentColor" />
        </svg>
      )}
    </button>
  ) : (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-haspopup={mobileMode === 'sheet' ? 'dialog' : undefined}
      className={`flex min-h-10 w-full items-center gap-2 rounded-xl border border-border bg-white px-3 text-left text-sm font-semibold text-ink ${triggerClassName}`}
    >
      {icon && <span className="grid size-5 shrink-0 place-items-center text-brass-dark">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {summary && <span className="max-w-[45%] truncate text-xs font-normal text-ink-soft">{summary}</span>}
      {badge !== null && badge !== undefined && badge !== false && badge !== 0 && (
        <span className="grid min-w-5 place-items-center rounded-full bg-brass px-1.5 text-[11px] font-bold leading-5 text-ink">{badge}</span>
      )}
      <Chevron open={open} direction={mobileMode === 'collapse' ? 'down' : 'right'} />
    </button>
  )

  if (mobileMode === 'collapse') {
    return (
      <Fragment>
        {trigger}
        <div hidden={!open} className="mt-2">{children}</div>
      </Fragment>
    )
  }

  return (
    <Fragment>
      {trigger}
      {sheetOpen && <div className="no-print fixed inset-0 z-[70] bg-ink/40" onClick={close} aria-hidden="true" />}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={sheetOpen ? 'true' : undefined}
        aria-label={title || text}
        tabIndex={-1}
        hidden={!sheetOpen}
        onKeyDown={handleKeyDown}
        className={sheetOpen ? 'mobile-sheet no-print fixed inset-x-0 bottom-0 z-[71] flex max-h-[90vh] flex-col rounded-t-2xl bg-white shadow-2xl outline-none' : 'hidden'}
        style={sheetOpen ? { maxHeight: '90dvh' } : undefined}
      >
        <div className="shrink-0 px-3 pt-2">
          <div className="mx-auto h-1 w-10 rounded-full bg-border" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2 pb-1 pt-1">
            <h2 className="min-w-0 truncate text-base font-semibold text-ink">{title || text}</h2>
            <button type="button" onClick={close} aria-label="ปิด" className="grid size-10 shrink-0 place-items-center rounded-full text-xl leading-none text-ink-soft">×</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-white px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">{footer}</div>
        )}
      </div>
    </Fragment>
  )
}

/** Long explanatory text: inline on desktop, an ⓘ button + sheet on phones. */
export function MobileInfo({ title = 'รายละเอียด', children, className = '' }) {
  return (
    <MobileSheetSection title={title} triggerVariant="icon" triggerClassName={className}>
      {children}
    </MobileSheetSection>
  )
}

/**
 * Long lists: everything on desktop; on phones the first `limit` rows plus a
 * "ดูทั้งหมด (n)" button that opens a scrollable sheet with the full list.
 */
export function MobileList({ items, limit = 5, renderItem, title = 'รายการทั้งหมด', moreLabel, mobileMode = 'sheet', className = '', as: Tag = 'div' }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const collapsed = isMobile && mobileMode !== 'inline' && items.length > limit
  const visible = collapsed ? items.slice(0, limit) : items

  return (
    <>
      <Tag className={className}>{visible.map((item, index) => renderItem(item, index))}</Tag>
      {collapsed && (
        <MobileSheetSection
          title={title}
          label={moreLabel || `ดูทั้งหมด (${items.length})`}
          open={open}
          onOpenChange={setOpen}
          triggerClassName="mt-2 justify-center text-center"
        >
          {open && <Tag className={className}>{items.map((item, index) => renderItem(item, index))}</Tag>}
        </MobileSheetSection>
      )}
    </>
  )
}
