import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { COMPANY_ROLES } from '@/lib/auth/can';
import { ROLE_LABEL } from '@/lib/labels';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';
import { changeRoleAction, createUserAction, removeUserAction, resetPasswordAction } from './actions';

export const metadata = { title: 'Logins' };

export default async function UsersPage() {
  const actor = await requireCompanyActor('user:manage');
  const [users, unlinked] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: actor.companyId, deletedAt: null },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      include: { employee: { select: { name: true, code: true } } },
    }),
    prisma.employee.findMany({
      where: { companyId: actor.companyId, status: 'ACTIVE', user: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Logins"
        description="Who can sign in to your company, and what they can do. Link a login to a staff record so managers see their team and people can check in and request leave."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {u.name} {u.id === actor.id && <span className="text-xs text-gray-500">(you)</span>}
                    </p>
                    <p className="text-sm text-gray-500">
                      {u.email}
                      {u.employee ? ` · ${u.employee.name} (${u.employee.code})` : ' · not linked to a staff record'}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {u.lastLoginAt ? `Last sign-in ${u.lastLoginAt.toLocaleDateString('en-GB')}` : 'Never signed in'}
                  </p>
                </div>
                {u.id !== actor.id && (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={changeRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <NativeSelect name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} className="w-40">
                        {COMPANY_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </NativeSelect>
                      <Button type="submit" variant="outline" size="sm">
                        Change role
                      </Button>
                    </form>
                    <form action={removeUserAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Remove login
                      </Button>
                    </form>
                  </div>
                )}
                {u.id !== actor.id && (
                  <ActionForm action={resetPasswordAction} submitLabel="Reset password" variant="outline" className="space-y-2">
                    <input type="hidden" name="id" value={u.id} />
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Add a login</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createUserAction} submitLabel="Create login" resetOnSuccess>
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field label="Role" htmlFor="role">
                <NativeSelect id="role" name="role" defaultValue="MANAGER">
                  {COMPANY_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Link to staff record" htmlFor="employeeId" hint="Optional. Needed for check-in, leave and 'My team'.">
                <NativeSelect id="employeeId" name="employeeId" defaultValue="">
                  <option value="">— Not linked —</option>
                  {unlinked.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.code})
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
