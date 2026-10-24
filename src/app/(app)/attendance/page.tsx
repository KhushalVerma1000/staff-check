import { ActionForm } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { parseDay } from '@/lib/attendance/summary';
import { can } from '@/lib/auth/can';
import { fmtDate, fmtTime, STATUS_LABEL } from '@/lib/labels';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';
import { employeeScope } from '@/lib/tenant/scope';
import { todayKey } from '@/lib/tenant/time';
import { markAttendanceAction } from './actions';

export const metadata = { title: 'Attendance' };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; branch?: string }> }) {
  const actor = await requireCompanyActor('attendance:view');
  const sp = await searchParams;

  const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } });
  const tz = company?.timezone ?? 'UTC';
  const today = todayKey(tz);
  const dayKey = sp.date && parseDay(sp.date) && sp.date <= today ? sp.date : today;
  const day = parseDay(dayKey)!;
  const canMark = can(actor, 'attendance:mark', { companyId: actor.companyId });

  const [employees, branches] = await Promise.all([
    prisma.employee.findMany({
      where: { AND: [employeeScope(actor), { status: 'ACTIVE', ...(sp.branch ? { branchId: sp.branch } : {}) }] },
      orderBy: { name: 'asc' },
      include: {
        branch: { select: { name: true } },
        attendance: { where: { date: day }, take: 1 },
      },
    }),
    prisma.branch.findMany({ where: { companyId: actor.companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`${fmtDate(day)}${dayKey === today ? ' (today)' : ''}`}
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="date" className="mb-1 block text-xs text-gray-500">
            Date
          </label>
          <Input id="date" name="date" type="date" max={today} defaultValue={dayKey} />
        </div>
        {actor.role !== 'MANAGER' && (
          <div>
            <label htmlFor="branch" className="mb-1 block text-xs text-gray-500">
              Branch
            </label>
            <NativeSelect id="branch" name="branch" defaultValue={sp.branch ?? ''}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>

      {employees.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">No active people to show.</CardContent>
        </Card>
      ) : canMark ? (
        <Card>
          <CardContent className="p-0">
            <ActionForm action={markAttendanceAction} submitLabel="Save attendance" className="space-y-0">
              <input type="hidden" name="date" value={dayKey} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">In / out</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {employees.map((e) => {
                      const rec = e.attendance[0];
                      return (
                        <tr key={e.id}>
                          <td className="px-4 py-2 font-medium text-gray-900">{e.name}</td>
                          <td className="px-4 py-2 text-gray-600">{e.branch?.name ?? '—'}</td>
                          <td className="px-4 py-2 text-gray-600">
                            {fmtTime(rec?.checkIn, tz)} – {fmtTime(rec?.checkOut, tz)}
                          </td>
                          <td className="px-4 py-2">
                            <NativeSelect name={`status_${e.id}`} defaultValue={rec?.status ?? ''} aria-label={`Status for ${e.name}`} className="w-36">
                              <option value="">Not marked</option>
                              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </NativeSelect>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t p-4">
                <p className="mb-3 text-xs text-gray-500">People left as “Not marked” are not changed.</p>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">In / out</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.map((e) => {
                  const rec = e.attendance[0];
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-2 font-medium text-gray-900">{e.name}</td>
                      <td className="px-4 py-2 text-gray-600">{e.branch?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-600">
                        {fmtTime(rec?.checkIn, tz)} – {fmtTime(rec?.checkOut, tz)}
                      </td>
                      <td className="px-4 py-2">{rec ? <Badge variant="secondary">{STATUS_LABEL[rec.status]}</Badge> : <span className="text-gray-400">Not marked</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
