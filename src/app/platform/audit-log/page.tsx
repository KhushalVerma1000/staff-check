import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/session';

export const metadata = { title: 'Platform activity' };

export default async function PlatformAuditPage() {
  await requireSuperAdmin();
  const entries = await prisma.auditLog.findMany({ where: { companyId: null }, orderBy: { createdAt: 'desc' }, take: 200 });

  return (
    <>
      <PageHeader title="Platform activity" description="Actions taken by super admins on client companies." />
      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Nothing recorded yet.</p>
          ) : (
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
                    <td className="px-4 py-2">{e.userName ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{e.action}</td>
                    <td className="px-4 py-2 text-gray-600">{e.detail ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
