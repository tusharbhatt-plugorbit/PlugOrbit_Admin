import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';

interface FieldShellProps { label?: ReactNode; help?: ReactNode; error?: string | null; required?: boolean; children: (id: string, describedBy: string | undefined) => ReactNode; className?: string }

/** Label + control + help/error, wired together for screen readers (the mobile TextField contract). */
export function Field({ label, help, error, required, children, className = '' }: FieldShellProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : help ? `${id}-help` : undefined;
  return (
    <div className={`field ${className}`}>
      {label && <label className="field__label" htmlFor={id}>{label}{required && <span className="field__req" aria-hidden="true">*</span>}</label>}
      {children(id, describedBy)}
      {error ? <div id={`${id}-err`} className="field__error" role="alert">{error}</div> : help ? <div id={`${id}-help`} className="field__help">{help}</div> : null}
    </div>
  );
}

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label?: ReactNode; help?: ReactNode; error?: string | null; value: string | number | null | undefined; onChange: (value: string) => void; prefixIcon?: boolean; affix?: string;
};

export function TextField({ label, help, error, value, onChange, className, affix, required, ...rest }: TextProps) {
  return (
    <Field label={label} help={help} error={error} required={required} className={className}>
      {(id, describedBy) => (
        <div className="input-wrap">
          <input {...rest} id={id} className={`input ${error ? 'input--error' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} style={affix ? { paddingRight: 44 } : undefined} />
          {affix && <span className="input-affix">{affix}</span>}
        </div>
      )}
    </Field>
  );
}

/** A number input that keeps what you type (including "12.") and reports a number or null. */
export function NumberField({ value, onChange, ...rest }: Omit<TextProps, 'value' | 'onChange' | 'type'> & { value: number | null | undefined; onChange: (value: number | null) => void; min?: number; max?: number; step?: number | string }) {
  return (
    <TextField {...rest} type="number" inputMode="decimal" value={value ?? ''} onChange={(v) => onChange(v === '' ? null : Number(v))} />
  );
}

export function TextArea({ label, help, error, value, onChange, className, required, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  label?: ReactNode; help?: ReactNode; error?: string | null; value: string | null | undefined; onChange: (value: string) => void;
}) {
  return (
    <Field label={label} help={help} error={error} required={required} className={className}>
      {(id, describedBy) => (
        <textarea {...rest} id={id} className={`textarea ${error ? 'textarea--error' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      )}
    </Field>
  );
}

export interface Option<T extends string = string> { value: T; label: string; disabled?: boolean }

export function SelectField<T extends string>({ label, help, error, value, onChange, options, placeholder, className, required, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  label?: ReactNode; help?: ReactNode; error?: string | null; value: T | '' | null | undefined; onChange: (value: T) => void; options: readonly Option<T>[]; placeholder?: string;
}) {
  return (
    <Field label={label} help={help} error={error} required={required} className={className}>
      {(id, describedBy) => (
        <select {...rest} id={id} className={`select ${error ? 'select--error' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value as T)}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

/** Compact select for filter bars (pill-shaped, no label: the placeholder names it). */
export function FilterSelect<T extends string>({ value, onChange, options, label }: { value: T | ''; onChange: (value: T | '') => void; options: readonly Option<T>[]; label: string }) {
  return (
    <select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T | '')}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, title, description, disabled }: { checked: boolean; onChange: (value: boolean) => void; title: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" />
      <span className="toggle__text">
        <span className="toggle__title">{title}</span>
        {description && <span className="caption">{description}</span>}
      </span>
    </label>
  );
}

/** Selectable chip (filters, amenities): lime when selected, same as the mobile Chip. */
export function Chip({ label, selected, onClick, count, icon }: { label: string; selected?: boolean; onClick?: () => void; count?: number; icon?: ReactNode }) {
  return (
    <button type="button" className={`chip ${selected ? 'chip--selected' : ''}`} aria-pressed={!!selected} onClick={onClick}>
      {icon}{label}{count !== undefined && <span className="chip__count">{count}</span>}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly Option<T>[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`segmented__item ${o.value === value ? 'segmented__item--active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label?: string }) {
  return (
    <div className="search" role="search">
      <Icon name="search" size={18} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} autoComplete="off" spellCheck={false} />
      {value && <button type="button" className="search__clear" onClick={() => onChange('')} aria-label="Clear search"><Icon name="x" size={16} /></button>}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filterbar">{children}</div>;
}
