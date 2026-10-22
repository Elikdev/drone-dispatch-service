import { execSync } from 'node:child_process';
import './setup-env';

export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', { env: process.env });
}
