import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { can } from '@/lib/auth/can';
import { fmtDate, LEAVE_TYPE_LABEL } from '@/lib/labels';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';
import { employeeScope } from '@/lib/tenant/scope';
import { cancelLeaveAction, decideLeaveAction, requestLeaveAction } from './actions';

export const metadata = { title: 'Leave' };

const STATUS_VARIANT = { PENDING: 'outline', APPROVED: 'default', REJECTED: 'destructive', CANCELLED: 'secondary' } as const;

export default async function LeavePage() {
  const actor = await requireCompanyActor('leave:view');
  const canDecide = can(actor, 'leave:decide', { companyId: actor.companyId });

  const [pending, mine] = await Promise.all([
    canDecide
      ? prisma.leaveRequest.findMany({
          where: {
            companyId: actor.companyId,
            status: 'PENDING',
            employee: employeeScope(actor),
            // Managers don't see (or decide) their own request in the queue.
            ...(actor.role === 'MANAGER' && actor.employeeId ? { NOT: { employeeId: actor.employeeId } } : {}),
          },
          orderBy: { fromDate: 'asc' },
          include: { employee: { select: { name: true, code: true } } },
        })
      : Promise.resolve([]),
    actor.employeeId
      ? prisma.leaveRequest.findMany({
          where: { companyId: actor.companyId, employeeId: actor.employeeId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Leave" description="Request time off and review your team's requests." />

      {canDecide && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Waiting for your decision ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing to review.</p>
            ) : (
              <ul className="divide-y">
                {pending.map((r) => (
                  <li key={r.id} className="space-y-2 py-3">
                    <p className="font-medium text-gray-900">
                      {r.employee.name} <span className="text-sm font-normal text-gray-500">({r.employee.code})</span>
                    </p>
                    <p className="text-sm text-gray-600">
                      {LEAVE_TYPE_LABEL[r.type]} · {fmtDate(r.fromDate)}
                      {r.fromDate.getTime() !== r.toDate.getTime() && ` – ${fmtDate(r.toDate)}`} · {r.days} {r.days === 1 ? 'day' : 'days'}
                    </p>
                    {r.reason && <p className="text-sm text-gray-500">“{r.reason}”</p>}
                    <form action={decideLeaveAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <Input name="note" placeholder="Note (optional)" className="max-w-xs" />
                      <Button type="submit" name="decision" value="APPROVED" size="sm">
                        Approve
                      </Button>
                      <Button type="submit" name="decision" value="REJECTED" size="sm" variant="outline">
                        Reject
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {actor.employeeId ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">My requests</CardTitle>
            </CardHeader>
            <CardContent>
              {mine.length === 0 ? (
                <p className="text-sm text-gray-500">You have not requested any leave yet.</p>
              ) : (
                <ul className="divide-y">
                  {mine.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {LEAVE_TYPE_LABEL[r.type]} · {fmtDate(r.fromDate)}
                          {r.fromDate.getTime() !== r.toDate.getTime() && ` – ${fmtDate(r.toDate)}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {r.days} {r.days === 1 ? 'day' : 'days'}
                          {r.decisionNote ? ` · “${r.decisionNote}”` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANT[r.status]}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>
                        {r.status === 'PENDING' && (
                          <form action={cancelLeaveAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <Button type="submit" variant="outline" size="sm">
                              Cancel
                            </Button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request leave</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={requestLeaveAction} submitLabel="Send request" resetOnSuccess>
                <Field label="Type" htmlFor="type">
                  <NativeSelect id="type" name="type" defaultValue="CASUAL">
                    {Object.entries(LEAVE_TYPE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="From" htmlFor="from">
                  <Input id="from" name="from" type="date" defaultValue={today} required />
                </Field>
                <Field label="To" htmlFor="to" hint="Leave blank for a single day.">
                  <Input id="to" name="to" type="date" />
                </Field>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="halfDay" /> Half day (single day only)
                </label>
                <Field label="Reason" htmlFor="reason">
                  <Textarea id="reason" name="reason" />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Your login is not linked to a staff record, so you cannot request leave. Ask your admin to link it.</p>
      )}
    </>
  );
}
