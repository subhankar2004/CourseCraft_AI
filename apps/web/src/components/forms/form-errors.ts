import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api';

/**
 * Shows an API error on the form: "field: message" validation errors go next to their field,
 * everything else (401, 409, 429, network) appears as a form-level message.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): void {
  if (!(error instanceof ApiError)) {
    setError('root', { message: 'Something went wrong. Please try again.' });
    return;
  }
  if (error.status === 0) {
    setError('root', { message: 'Cannot reach the server. Check your connection and try again.' });
    return;
  }
  if (error.status === 429) {
    setError('root', { message: 'Too many attempts. Please wait a minute and try again.' });
    return;
  }
  const messages = ([] as string[]).concat(error.body.message);
  let placed = false;
  for (const message of messages) {
    const field = fields.find((f) => message.startsWith(`${f}: `));
    if (field) {
      setError(field, { message: message.slice(field.length + 2) });
      placed = true;
    }
  }
  if (!placed) setError('root', { message: messages.join(' ') });
}
