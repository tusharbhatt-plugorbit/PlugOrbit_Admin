import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'lime' | 'ghost' | 'ghost-danger';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label?: string;
  children?: ReactNode;
  icon?: IconName;
  variant?: ButtonVariant;
  small?: boolean;
  loading?: boolean;
  block?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: '', secondary: 'btn--secondary', danger: 'btn--danger', lime: 'btn--lime', ghost: 'btn--ghost', 'ghost-danger': 'btn--ghost-danger',
};

/** Primary = dark fill + white label (the mobile "PrimaryButton"); lime is only for dark surfaces. */
export function Button({ label, children, icon, variant = 'primary', small, loading, block, disabled, className = '', type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', VARIANT_CLASS[variant], small ? 'btn--sm' : '', block ? 'btn--block' : '', className].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={small ? 15 : 17} /> : null}
      {label ?? children}
    </button>
  );
}

/** Icon-only button. `label` is required so every control has an accessible name. */
export function IconButton({ icon, label, small, variant = 'secondary', ...rest }: Omit<ButtonProps, 'children' | 'label'> & { icon: IconName; label: string }) {
  const cls = ['btn', 'btn--icon', VARIANT_CLASS[variant], small ? 'btn--sm' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" {...rest} className={cls} aria-label={label} title={label}>
      <Icon name={icon} size={small ? 15 : 17} />
    </button>
  );
}
