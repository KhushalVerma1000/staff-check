'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/action-result';

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Server-action form with inline error / success feedback.
 * `resetOnSuccess` clears the inputs after a successful submit (good for "add" forms).
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  resetOnSuccess = false,
  variant = 'default',
  className,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel: string;
  resetOnSuccess?: boolean;
  variant?: 'default' | 'destructive' | 'outline';
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className ?? 'space-y-4'}>
      {children}
      {state && !state.ok && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.message}
        </p>
      )}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? 'Working…' : submitLabel}
      </Button>
    </form>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-gray-800">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
