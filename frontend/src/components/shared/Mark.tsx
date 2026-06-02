interface MarkProps {
  size?: number
}

export function Mark({ size = 32 }: MarkProps) {
  const width = size * 4
  return (
    <img
      src="/images/logo-full.svg"
      alt="Horus Parfum"
      width={width}
      height={size}
      style={{ width, height: size }}
      className="object-contain"
    />
  )
}
