import { useCallback, useState } from 'react';
import { ApiError, describeError } from '@/api/http';
import { useToast } from '@/ui/Toast';

/**
 * Save-button plumbing for forms: tracks "saving", maps the API's field-level validation errors onto
 * inputs, and turns a version conflict (someone else edited the record) into an explicit flag.
 */
export function useSave() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setSaving(true);
    setErrors({});
    setConflict(false);
    setFormError(null);
    setErrorCode(null);
    try {
      const result = await action();
      if (success) toast.success(success);
      return result;
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorCode(err.code);
        if (err.code === 'STALE_VERSION') setConflict(true);
        else if (err.fields && Object.keys(err.fields).length > 0) { setErrors(err.fields); setFormError('Please fix the highlighted fields.'); }
        else setFormError(describeError(err));
      } else {
        setFormError(describeError(err));
      }
      return undefined;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  return { saving, errors, conflict, formError, errorCode, run, setErrors, clearError: (key: string) => setErrors((e) => { if (!(key in e)) return e; const { [key]: _removed, ...rest } = e; return rest; }) };
}
