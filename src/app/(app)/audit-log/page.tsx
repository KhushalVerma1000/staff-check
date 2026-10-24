import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';

export const metadata = { title: 'Audit log' };

export default async function AuditLogPage() {
  const actor = await requireCompanyActor('auditLog:view');
  const entries = await prisma.auditLog.findMany({
    where: { companyId: actor.companyId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <>
      <PageHeader title="Audit log" description="The last 200 changes made in your company." />
      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Nothing recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Who</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-gray-600">{e.createdAt.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</td>
                      <td className="px-4 py-2 text-gray-900">{e.userName ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{e.action}</td>
                      <td className="px-4 py-2 text-gray-600">{e.detail ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
