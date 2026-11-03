import { and, desc, eq } from 'drizzle-orm';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { db, attendanceCorrection, company, employee } from '@/db';
import { can } from '@/lib/auth/can';
import { fmtDate, fmtTime, STATUS_LABEL } from '@/lib/labels';
import { requireCompanyActor } from '@/lib/session';
import { employeeFilter } from '@/lib/tenant/sql';
import { todayKey } from '@/lib/tenant/time';
import { cancelCorrectionAction, decideCorrectionAction, requestCorrectionAction } from './actions';

export const metadata = { title: 'Attendance corrections' };

export default async function CorrectionsPage() {
  const actor = await requireCompanyActor('attendance:selfCheckIn');
  const [co] = await db.select({ tz: company.timezone }).from(company).where(eq(company.id, actor.companyId)).limit(1);
  const tz = co?.tz ?? 'UTC';
  const canDecide = can(actor, 'attendance:mark');

  const mine = actor.employeeId
    ? await db
        .select()
        .from(attendanceCorrection)
        .where(and(eq(attendanceCorrection.companyId, actor.companyId), eq(attendanceCorrection.employeeId, actor.employeeId)))
        .orderBy(desc(attendanceCorrection.createdAt))
        .limit(20)
    : [];

  const waiting = canDecide
    ? await db
        .select({ c: attendanceCorrection, name: employee.name, code: employee.code })
        .from(attendanceCorrection)
        .innerJoin(employee, eq(employee.id, attendanceCorrection.employeeId))
        .where(and(eq(attendanceCorrection.companyId, actor.companyId), eq(attendanceCorrection.status, 'PENDING'), employeeFilter(actor)))
        .orderBy(attendanceCorrection.createdAt)
    : [];
  const decidable = waiting.filter((w) => w.c.employeeId !== actor.employeeId || actor.role === 'ADMIN');

  return (
    <>
      <PageHeader title="Attendance corrections" description="Missed a check-in, or marked wrong? Ask for the day to be fixed. Your approver decides." />
      {decidable.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Waiting for your decision</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {decidable.map(({ c, name, code }) => (
              <div key={c.id} className="space-y-2 py-3 text-sm">
                <p className="font-medium text-gray-900">
                  {name} <span className="font-normal text-gray-500">({code})</span> · {fmtDate(c.date)} → {STATUS_LABEL[c.requestedStatus]}
                  {c.requestedCheckIn ? ` · ${fmtTime(c.requestedCheckIn, tz)}–${fmtTime(c.requestedCheckOut, tz)}` : ''}
                </p>
                <p className="text-gray-600">{c.reason}</p>
                <form action={decideCorrectionAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <Input name="note" placeholder="Note (optional)" aria-label={`Note for ${name}`} className="max-w-xs" />
                  <Button type="submit" name="decision" value="APPROVED" size="sm">
                    Approve
                  </Button>
                  <Button type="submit" name="decision" value="REJECTED" size="sm" variant="outline">
                    Reject
                  </Button>
                </form>
              </div>
            ))}
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
                <p className="text-sm text-gray-500">No requests yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {mine.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {fmtDate(c.date)} → {STATUS_LABEL[c.requestedStatus]}
                        </p>
                        <p className="text-gray-600">{c.reason}</p>
                        {c.decisionNote && <p className="text-xs text-gray-500">Note: {c.decisionNote}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.status === 'APPROVED' ? 'default' : c.status === 'REJECTED' ? 'destructive' : 'secondary'}>{c.status.toLowerCase()}</Badge>
                        {c.status === 'PENDING' && (
                          <form action={cancelCorrectionAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Withdraw
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
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Ask for a correction</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={requestCorrectionAction} submitLabel="Send for approval" resetOnSuccess>
                <Field label="Day" htmlFor="date" hint="Up to 31 days back.">
                  <Input id="date" name="date" type="date" max={todayKey(tz)} required />
                </Field>
                <Field label="It should be" htmlFor="status">
                  <NativeSelect id="status" name="status" defaultValue="PRESENT">
                    <option value="PRESENT">Present</option>
                    <option value="HALF_DAY">Half day</option>
                    <option value="ON_LEAVE">On leave</option>
                    <option value="ABSENT">Absent</option>
                  </NativeSelect>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="In" htmlFor="checkIn">
                    <Input id="checkIn" name="checkIn" type="time" />
                  </Field>
                  <Field label="Out" htmlFor="checkOut">
                    <Input id="checkOut" name="checkOut" type="time" />
                  </Field>
                </div>
                <Field label="Reason" htmlFor="reason">
                  <Textarea id="reason" name="reason" rows={3} required />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-gray-600">Your login is not linked to a staff record, so you cannot request corrections.</p>
      )}
    </>
  );
}
