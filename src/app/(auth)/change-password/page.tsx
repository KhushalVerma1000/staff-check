import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ActionForm, Field } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { changePasswordAction } from './actions';

export const metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Set a new password</h1>
          <p className="mt-1 text-sm text-gray-500">
            {session.user.mustChangePassword
              ? 'Your account uses a one-time password. Choose your own to continue.'
              : 'Choose a new password. You will be asked to sign in again.'}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <ActionForm action={changePasswordAction} submitLabel="Update password">
            <Field label="Current password" htmlFor="current">
              <Input id="current" name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="New password" htmlFor="next" hint="At least 10 characters, with letters and numbers.">
              <Input id="next" name="next" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
