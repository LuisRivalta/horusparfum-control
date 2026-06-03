import './DayNightSwitch.css'

interface DayNightSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
}

export function DayNightSwitch({ checked, onChange, id = 'dn' }: DayNightSwitchProps) {
  return (
    <div className="daynight-toggleWrapper">
      <input
        className="daynight-input"
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label className="daynight-toggle" htmlFor={id}>
        <span className="daynight-toggle__handler">
          <span className="daynight-crater daynight-crater--1" />
          <span className="daynight-crater daynight-crater--2" />
          <span className="daynight-crater daynight-crater--3" />
        </span>
        <span className="daynight-star daynight-star--1" />
        <span className="daynight-star daynight-star--2" />
        <span className="daynight-star daynight-star--3" />
        <span className="daynight-star daynight-star--4" />
        <span className="daynight-star daynight-star--5" />
        <span className="daynight-star daynight-star--6" />
      </label>
    </div>
  )
}
