import { useState, useEffect, useRef } from 'react'
import './UserMenu.css'

interface UserMenuProps {
  initials: string
  userEmail?: string
  onSignOut: () => void
}

export function UserMenu({ initials, userEmail, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="user-menu" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="user-menu-trigger"
        title={userEmail || 'Conta'}
      >
        {initials}
      </button>

      {open && (
        <div className="user-menu-dropdown">
          {userEmail && (
            <div className="user-menu-info">
              <div className="user-menu-email" title={userEmail}>{userEmail}</div>
            </div>
          )}
          <button className="user-menu-logout" onClick={() => { setOpen(false); onSignOut() }}>
            <svg viewBox="0 0 512 512" width="16" height="16">
              <path
                fill="currentColor"
                d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"
              />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  )
}
