import { cn } from '@/lib/utils'

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  swap: <><path d="M7 7h12l-3-3" /><path d="M17 17H5l3 3" /></>,
  up: <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>,
  down: <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>,
  report: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  goal: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>,
  box: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  supplier: <><path d="M3 21V8l7-4 7 4v13" /><path d="M3 21h18" /><path d="M9 21v-5h4v5" /></>,
  alert: <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  bell: <><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 004 0" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  download: <><path d="M12 4v11M7 11l5 5 5-5" /><path d="M5 20h14" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>,
  filter: <><path d="M4 5h16l-6 7v6l-4 2v-8z" /></>,
  chevron: <><path d="M9 6l6 6-6 6" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M14 6l4 4" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  warn: <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
}

interface IconProps {
  name: string
  size?: number
  gold?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Icon({ name, size = 18, gold = false, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={gold ? 'var(--color-gold)' : 'currentColor'}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      style={style}
    >
      {ICONS[name]}
    </svg>
  )
}
