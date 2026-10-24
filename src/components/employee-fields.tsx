import { Field } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

type Option = { id: string; name: string };

export interface EmployeeDefaults {
  name?: string;
  code?: string;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
  workType?: 'OFFICE' | 'FIELD' | 'HYBRID';
  branchId?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
  joinedOn?: string;
}

/** Shared by the add and edit forms. */
export function EmployeeFields({
  branches,
  departments,
  managers,
  defaults = {},
  codeHint,
}: {
  branches: Option[];
  departments: Option[];
  managers: Option[];
  defaults?: EmployeeDefaults;
  codeHint?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" htmlFor="name">
        <Input id="name" name="name" defaultValue={defaults.name} required />
      </Field>
      <Field label="Employee code" htmlFor="code" hint={codeHint ?? 'Leave blank to generate one.'}>
        <Input id="code" name="code" defaultValue={defaults.code} />
      </Field>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={defaults.email ?? ''} />
      </Field>
      <Field label="Phone" htmlFor="phone">
        <Input id="phone" name="phone" inputMode="tel" defaultValue={defaults.phone ?? ''} />
      </Field>
      <Field label="Designation" htmlFor="designation">
        <Input id="designation" name="designation" defaultValue={defaults.designation ?? ''} />
      </Field>
      <Field label="Joining date" htmlFor="joinedOn">
        <Input id="joinedOn" name="joinedOn" type="date" defaultValue={defaults.joinedOn} required />
      </Field>
      <Field label="Works at" htmlFor="workType">
        <NativeSelect id="workType" name="workType" defaultValue={defaults.workType ?? 'OFFICE'}>
          <option value="OFFICE">Office</option>
          <option value="FIELD">Field</option>
          <option value="HYBRID">Hybrid (office + field)</option>
        </NativeSelect>
      </Field>
      <Field label="Branch" htmlFor="branchId">
        <NativeSelect id="branchId" name="branchId" defaultValue={defaults.branchId ?? ''}>
          <option value="">— None —</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Department" htmlFor="departmentId">
        <NativeSelect id="departmentId" name="departmentId" defaultValue={defaults.departmentId ?? ''}>
          <option value="">— None —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Reports to" htmlFor="managerId" hint="Their manager sees them in 'My team'.">
        <NativeSelect id="managerId" name="managerId" defaultValue={defaults.managerId ?? ''}>
          <option value="">— No manager —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </div>
  );
}
