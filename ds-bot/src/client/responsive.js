// Responsive and mobile environment helpers for ds-bot
export function isMobileEnvironment() {
  if (typeof window === 'undefined') return false
  if (window.__DSH_MOBILE_FRONTEND__ === 'dedicated') return true
  if (document.documentElement.classList.contains('dsh-native-mobile-active')) return true
  if (window.matchMedia?.('(max-width: 768px)').matches) return true
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function useIsMobile() {
  if (typeof window === 'undefined') return false
  const [mobile, setMobile] = useState(() => isMobileEnvironment())
  useEffect(() => {
    const check = () => setMobile(isMobileEnvironment())
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return mobile
}
