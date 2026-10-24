import Link from 'next/link';
import { CheckInWidget } from '@/components/check-in-widget';
import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { parseDay } from '@/lib/attendance/summary';
import { can } from '@/lib/auth/can';
import { fmtTime } from '@/lib/labels';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';
import { headcount } from '@/lib/tenant/headcount';
import { employeeScope } from '@/lib/tenant/scope';
import { todayKey } from '@/lib/tenant/time';
import { selfCheckAction } from '../attendance/actions';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const actor = await requireCompanyActor();
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true, name: true },
  });
  const tz = company?.timezone ?? 'UTC';
  const day = parseDay(todayKey(tz))!;
  const scope = employeeScope(actor);

  const [hc, todayRows, onLeaveToday, pendingLeave, mine, me] = await Promise.all([
    headcount(actor.companyId),
    prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { companyId: actor.companyId, date: day, employee: { AND: [scope, { status: 'ACTIVE' }] } },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { companyId: actor.companyId, date: day, status: 'ON_LEAVE', employee: scope },
      select: { employee: { select: { name: true } } },
      take: 8,
    }),
    can(actor, 'leave:decide')
      ? prisma.leaveRequest.count({
          where: {
            companyId: actor.companyId,
            status: 'PENDING',
            employee: scope,
            ...(actor.role === 'MANAGER' && actor.employeeId ? { NOT: { employeeId: actor.employeeId } } : {}),
          },
        })
      : Promise.resolve(0),
    actor.employeeId
      ? prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: actor.employeeId, date: day } } })
      : Promise.resolve(null),
    actor.employeeId
      ? prisma.employee.findFirst({ where: { id: actor.employeeId, companyId: actor.companyId }, select: { workType: true } })
      : Promise.resolve(null),
  ]);

  const count = (s: string) => todayRows.find((r) => r.status === s)?._count._all ?? 0;
  const team =
    actor.role === 'MANAGER'
      ? await prisma.employee.count({ where: { AND: [scope, { status: 'ACTIVE' }] } })
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
