import React from 'react';

interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Accessible switch used by Settings, Safe Location and cookie preferences. */
export default function Toggle({ checked, onChange, label, description, disabled }: Props) {
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <div className="toggle-label">{label}</div>
        {description && <div className="toggle-desc">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`toggle${checked ? ' toggle-on' : ''}${disabled ? ' toggle-disabled' : ''}`}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
