import { Field } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { MAX_EMPLOYEES, PLAN_LIMITS } from '@/lib/labels';

export interface CompanyDefaults {
  name?: string;
  plan?: 'STARTER' | 'GROWTH' | 'BUSINESS';
  employeeLimit?: number;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export function CompanyFields({ defaults = {} }: { defaults?: CompanyDefaults }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name" htmlFor="name">
        <Input id="name" name="name" defaultValue={defaults.name} required />
      </Field>
      <Field label="Plan" htmlFor="plan" hint={`Starter ${PLAN_LIMITS.STARTER} · Growth ${PLAN_LIMITS.GROWTH} · Business ${PLAN_LIMITS.BUSINESS} seats by default.`}>
        <NativeSelect id="plan" name="plan" defaultValue={defaults.plan ?? 'STARTER'}>
          <option value="STARTER">Starter</option>
          <option value="GROWTH">Growth</option>
          <option value="BUSINESS">Business</option>
        </NativeSelect>
      </Field>
      <Field label="Seat limit" htmlFor="employeeLimit" hint={`Active employees allowed, up to ${MAX_EMPLOYEES}.`}>
        <Input
          id="employeeLimit"
          name="employeeLimit"
          type="number"
          min={1}
          max={MAX_EMPLOYEES}
          defaultValue={defaults.employeeLimit ?? PLAN_LIMITS.STARTER}
        />
      </Field>
      <Field label="Contact person" htmlFor="contactName">
        <Input id="contactName" name="contactName" defaultValue={defaults.contactName ?? ''} />
      </Field>
      <Field label="Contact email" htmlFor="contactEmail">
        <Input id="contactEmail" name="contactEmail" type="email" defaultValue={defaults.contactEmail ?? ''} />
      </Field>
      <Field label="Contact phone" htmlFor="contactPhone">
        <Input id="contactPhone" name="contactPhone" inputMode="tel" defaultValue={defaults.contactPhone ?? ''} />
      </Field>
    </div>
  );
}
