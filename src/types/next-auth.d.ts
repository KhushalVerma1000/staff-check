import type { Role } from '@/generated/prisma/client';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** Null only for SUPER_ADMIN. */
      companyId: string | null;
      employeeId: string | null;
      mustChangePassword: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: Role;
    companyId: string | null;
    employeeId: string | null;
    mustChangePassword: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    companyId: string | null;
    employeeId: string | null;
    mustChangePassword: boolean;
    /** Set when the login was removed or its company suspended. */
    removed?: boolean;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: Role;
    companyId: string | null;
    employeeId: string | null;
    mustChangePassword: boolean;
    removed?: boolean;
  }
}
