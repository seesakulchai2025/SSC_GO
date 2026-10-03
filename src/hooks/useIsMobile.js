import { useEffect, useState } from 'react'

export const MOBILE_QUERY = '(max-width: 639px)'

function read() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(read)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isMobile
}
