import { useEffect, useRef, useState, type ReactNode } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

interface SmoothScrollAreaProps {
  children: ReactNode
  className?: string
  resetKey?: string
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function SmoothScrollArea({ children, className, resetKey }: SmoothScrollAreaProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const rafRef = useRef<number | null>(null)
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion)

  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduceMotion(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const wrapper = wrapperRef.current
    const content = contentRef.current
    if (!wrapper || !content || reduceMotion) return

    const lenis = new Lenis({
      wrapper,
      content,
      eventsTarget: wrapper,
      lerp: 0.08,
      wheelMultiplier: 0.9,
      smoothWheel: true,
      syncTouch: false,
      prevent: (node) => Boolean(node.closest('[data-lenis-prevent]')),
    })
    lenisRef.current = lenis

    function raf(time: number) {
      lenis.raf(time)
      rafRef.current = requestAnimationFrame(raf)
    }
    rafRef.current = requestAnimationFrame(raf)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lenis.destroy()
      lenisRef.current = null
    }
  }, [reduceMotion])

  useEffect(() => {
    const wrapper = wrapperRef.current
    const lenis = lenisRef.current
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else if (wrapper) wrapper.scrollTop = 0
  }, [resetKey])

  return (
    <div ref={wrapperRef} className={className} data-lenis-prevent={reduceMotion ? '' : undefined}>
      <div ref={contentRef}>
        {children}
      </div>
    </div>
  )
}
