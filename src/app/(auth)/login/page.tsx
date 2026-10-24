import { ActionForm, Field } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { loginAction } from './actions';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            S
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Staff Check</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to manage your team.</p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <ActionForm action={loginAction} submitLabel="Sign in">
            <input type="hidden" name="from" value={from ?? ''} />
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="username" required />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
          </ActionForm>
        </div>
        <p className="text-center text-xs text-gray-500">
          Accounts are created by your company admin. Forgot your password? Ask them to reset it.
        </p>
      </div>
    </main>
  );
}
