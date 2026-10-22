import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/env.validation';
import { Db } from '../../database/database.types';
import { PrismaService } from '../../database/prisma.service';

const RUN_TIMEOUT_MS = 60_000;
const FIRST_ID = '00000000-0000-0000-0000-000000000000';

export interface AuditRunResult {
  checked: number;
  low: number;
}

@Injectable()
export class BatteryAuditJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BatteryAuditJob.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onModuleInit(): void {
    if (this.config.get('BATTERY_AUDIT_ENABLED', { infer: true })) {
      this.timer = setInterval(
        () => void this.runOnce(),
        this.config.get('BATTERY_CHECK_INTERVAL_MS', { infer: true }),
      );
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async runOnce(): Promise<AuditRunResult | null> {
    if (this.running) {
      this.logger.warn('Battery audit skipped: the last run is still going');
      return null;
    }

    this.running = true;
    const startedAt = Date.now();
    try {
      const result = await this.prisma.$transaction(
        async (tx) => ((await this.tryLock(tx)) ? this.writeLogs(tx) : null),
        { timeout: RUN_TIMEOUT_MS },
      );
      if (result) {
        this.logger.log(
          `Battery audit done: ${result.checked} drones checked, ${result.low} low, ${Date.now() - startedAt}ms`,
        );
      } else {
        this.logger.log(
          'Battery audit skipped: another instance is running it',
        );
      }
      return result;
    } catch (error) {
      this.logger.error(
        'Battery audit failed',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    } finally {
      this.running = false;
    }
  }

  private async tryLock(tx: Db): Promise<boolean> {
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtext('battery_audit')) AS locked`;
    return locked;
  }

  private async writeLogs(tx: Db): Promise<AuditRunResult> {
    const batchSize = this.config.get('BATTERY_AUDIT_BATCH_SIZE', {
      infer: true,
    });
    const minBatteryPct = this.config.get('MIN_LOADING_BATTERY_PCT', {
      infer: true,
    });
    const checkedAt = new Date();
    const result: AuditRunResult = { checked: 0, low: 0 };
    let lastId = FIRST_ID;

    for (;;) {
      const rows = await tx.$queryRaw<{ drone_id: string; is_low: boolean }[]>`
        INSERT INTO battery_audit_logs (drone_id, battery_pct, drone_state, is_low, checked_at)
        SELECT id, battery_pct, state, battery_pct < ${minBatteryPct}, ${checkedAt}
        FROM drones
        WHERE id > ${lastId}::uuid
        ORDER BY id
        LIMIT ${batchSize}
        RETURNING drone_id, is_low`;

      result.checked += rows.length;
      result.low += rows.filter((row) => row.is_low).length;
      if (rows.length < batchSize) {
        return result;
      }
      lastId = rows.reduce(
        (max, row) => (row.drone_id > max ? row.drone_id : max),
        lastId,
      );
    }
  }
}
