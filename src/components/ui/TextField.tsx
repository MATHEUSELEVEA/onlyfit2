import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface FieldWrapperProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor: string;
}

function FieldWrapper({ label, hint, error, htmlFor, children }: FieldWrapperProps & { children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block font-sans text-body-sm font-medium text-on-surface-variant">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="font-sans text-body-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p className="font-sans text-body-sm text-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClassName =
  'min-h-11 w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3.5 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, id, className, ...inputProps },
  ref,
) {
  const fieldId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <FieldWrapper label={label} hint={hint} error={error} htmlFor={fieldId}>
      <input
        {...inputProps}
        ref={ref}
        id={fieldId}
        className={clsx(inputClassName, error && 'border-error focus:border-error focus:ring-error', className)}
      />
    </FieldWrapper>
  );
});

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextAreaField({ label, hint, error, id, className, ...textareaProps }: TextAreaFieldProps) {
  const fieldId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <FieldWrapper label={label} hint={hint} error={error} htmlFor={fieldId}>
      <textarea
        {...textareaProps}
        id={fieldId}
        className={clsx(
          inputClassName,
          'min-h-[88px] resize-none py-3',
          error && 'border-error focus:border-error focus:ring-error',
          className,
        )}
      />
    </FieldWrapper>
  );
}

interface SelectFieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}

export function SelectField({ label, hint, error, id, value, onChange, disabled, options }: SelectFieldProps) {
  const fieldId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <FieldWrapper label={label} hint={hint} error={error} htmlFor={fieldId}>
      <select
        id={fieldId}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={clsx(inputClassName, 'appearance-none', error && 'border-error focus:border-error focus:ring-error')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}
