interface MarkProps {
  size?: number
}

export function Mark({ size = 32 }: MarkProps) {
  const width = size * 2.5
  return (
    <div
      style={{
        width: '100%',
        height: size,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src="/images/logo-full.svg"
        alt="Horus Parfum"
        style={{
          width: width,
          height: size * 2,
          objectFit: 'cover',
          objectPosition: 'center',
        }}
        className="logo-theme-aware"
      />
    </div>
  )
}
