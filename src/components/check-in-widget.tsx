'use client';

import { useActionState, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/action-result';

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Check-in / check-out button. Field staff can attach their location; it is
 * optional and only requested when they tick the box.
 */
export function CheckInWidget({
  action,
  label,
  allowLocation,
}: {
  action: Action;
  label: string;
  allowLocation: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [share, setShare] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function submit() {
    const form = formRef.current;
    if (!form) return;
    if (!share || !navigator.geolocation) {
      form.requestSubmit();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        (form.elements.namedItem('lat') as HTMLInputElement).value = String(pos.coords.latitude);
        (form.elements.namedItem('lng') as HTMLInputElement).value = String(pos.coords.longitude);
        form.requestSubmit();
      },
      () => {
        setGeoError('Could not read your location — checking in without it.');
        form.requestSubmit();
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="lat" />
      <input type="hidden" name="lng" />
      {allowLocation && (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          Share my location with this check-in
        </label>
      )}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? 'Working…' : label}
      </Button>
      {geoError && <p className="text-xs text-amber-700">{geoError}</p>}
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="text-sm text-green-800">
          {state.message}
        </p>
      )}
    </form>
  );
}
