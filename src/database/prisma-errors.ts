import { Prisma } from '../generated/prisma/client';

const LOCK_NOT_AVAILABLE = '55P03';

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export function isLockTimeout(error: unknown): boolean {
  return error instanceof Error && error.message.includes(LOCK_NOT_AVAILABLE);
}
