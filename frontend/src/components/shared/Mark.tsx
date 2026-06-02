interface MarkProps {
  size?: number
}

export function Mark({ size = 32 }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="var(--color-gold)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Horus"
    >
      <path d="M6 22c5-6 13-6 19-6s12 2 16 6c-4 4-10 6-16 6S11 28 6 22z" />
      <circle cx="23" cy="22" r="3.4" fill="var(--color-gold)" stroke="none" />
      <path d="M11 29c-1 4-1 7 .5 9.5" />
      <path d="M30 28c4 1.5 7 1.5 9.5-.5" />
    </svg>
  )
}
