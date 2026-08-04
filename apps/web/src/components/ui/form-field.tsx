import { forwardRef, type InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { id, label, hint, error, className = '', ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`form-field ${error ? 'form-field--error' : ''}`.trim()}>
      <label className="form-field__label" htmlFor={fieldId}>{label}</label>
      {hint && <p className="form-field__hint" id={hintId}>{hint}</p>}
      <input
        {...props}
        ref={ref}
        id={fieldId}
        className={`form-field__input ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error && <p className="form-field__error" id={errorId}><span aria-hidden="true">!</span> {error}</p>}
    </div>
  );
});
