import Link from 'next/link';
import { and, count as sqlCount, eq, ne } from 'drizzle-orm';
import { db, attendanceRecord, company as companyTable, employee, leaveRequest } from '@/db';
import { CheckInWidget } from '@/components/check-in-widget';
import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { parseDay } from '@/lib/attendance/summary';
import { can } from '@/lib/auth/can';
import { fmtTime } from '@/lib/labels';
import { requireCompanyActor } from '@/lib/session';
import { headcount } from '@/lib/tenant/headcount';
import { employeeFilter } from '@/lib/tenant/sql';
import { todayKey } from '@/lib/tenant/time';
import { selfCheckAction } from '../attendance/actions';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const actor = await requireCompanyActor();
  const [company] = await db
    .select({ timezone: companyTable.timezone, name: companyTable.name })
    .from(companyTable)
    .where(eq(companyTable.id, actor.companyId))
    .limit(1);
  const tz = company?.timezone ?? 'UTC';
  const day = parseDay(todayKey(tz))!;
  const scope = employeeFilter(actor);

  const [hc, todayRows, onLeaveToday, pendingLeave, mine, me] = await Promise.all([
    headcount(actor.companyId),
    db
      .select({ status: attendanceRecord.status, n: sqlCount() })
      .from(attendanceRecord)
      .innerJoin(employee, eq(employee.id, attendanceRecord.employeeId))
      .where(
        and(eq(attendanceRecord.companyId, actor.companyId), eq(attendanceRecord.date, day), scope, eq(employee.status, 'ACTIVE')),
      )
      .groupBy(attendanceRecord.status)
      .then((rows) => rows.map((r) => ({ status: r.status as string, _count: { _all: r.n } }))),
    db
      .select({ name: employee.name })
      .from(attendanceRecord)
      .innerJoin(employee, eq(employee.id, attendanceRecord.employeeId))
      .where(
        and(eq(attendanceRecord.companyId, actor.companyId), eq(attendanceRecord.date, day), eq(attendanceRecord.status, 'ON_LEAVE'), scope),
      )
      .limit(8)
      .then((rows) => rows.map((r) => ({ employee: { name: r.name } }))),
    can(actor, 'leave:decide')
      ? db
          .select({ n: sqlCount() })
          .from(leaveRequest)
          .innerJoin(employee, eq(employee.id, leaveRequest.employeeId))
          .where(
            and(
              eq(leaveRequest.companyId, actor.companyId),
              eq(leaveRequest.status, 'PENDING'),
              scope,
              actor.role === 'MANAGER' && actor.employeeId ? ne(leaveRequest.employeeId, actor.employeeId) : undefined,
            ),
          )
          .then((r) => r[0]?.n ?? 0)
      : Promise.resolve(0),
    actor.employeeId
      ? db
          .select()
          .from(attendanceRecord)
          .where(and(eq(attendanceRecord.employeeId, actor.employeeId), eq(attendanceRecord.date, day)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    actor.employeeId
      ? db
          .select({ workType: employee.workType })
          .from(employee)
          .where(and(eq(employee.id, actor.employeeId), eq(employee.companyId, actor.companyId)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const count = (s: string) => todayRows.find((r) => r.status === s)?._count._all ?? 0;
  const team =
    actor.role === 'MANAGER'
      ? ((await db.select({ n: sqlCount() }).from(employee).where(and(scope, eq(employee.status, 'ACTIVE'))))[0]?.n ?? 0)
      : hc.active;
  const marked = todayRows.reduce((n, r) => n + r._count._all, 0);

  const checkLabel = !mine?.checkIn ? 'Check in' : !mine.checkOut ? 'Check out' : null;

  return (
    <>
      <PageHeader
        title={`Hello, ${actor.name.split(' ')[0]}`}
        description={`${company?.name} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={actor.role === 'MANAGER' ? 'People in your team' : 'Active employees'} value={String(team)} hint={actor.role === 'MANAGER' ? undefined : `of ${hc.limit} seats`} />
        <Stat label="Present today" value={String(count('PRESENT') + count('HALF_DAY'))} />
        <Stat label="Not marked yet" value={String(Math.max(0, team - marked))} />
        <Stat label="On leave today" value={String(count('ON_LEAVE'))} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {actor.employeeId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My attendance today</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-600">
                In {fmtTime(mine?.checkIn, tz)} · Out {fmtTime(mine?.checkOut, tz)}
              </p>
              {checkLabel ? (
                <CheckInWidget action={selfCheckAction} label={checkLabel} allowLocation={me?.workType !== 'OFFICE'} />
              ) : (
                <p className="text-sm text-green-800">You are done for today.</p>
              )}
            </CardContent>
          </Card>
        )}

        {can(actor, 'leave:decide') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leave to review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-3xl font-semibold text-gray-900">{pendingLeave}</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/leave">Open leave</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {onLeaveToday.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Away today</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-gray-700">
                {onLeaveToday.map((r, i) => (
                  <li key={i}>{r.employee.name}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}
