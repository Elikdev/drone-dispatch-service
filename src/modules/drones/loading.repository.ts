import { Injectable } from '@nestjs/common';
import { Db } from '../../database/database.types';
import {
  Delivery,
  DeliveryItem,
  IdempotencyKey,
  Medication,
  Prisma,
} from '../../generated/prisma/client';

export type LoadedItem = DeliveryItem & { medication: Medication };

@Injectable()
export class LoadingRepository {
  findMedicationsByCodes(db: Db, codes: string[]): Promise<Medication[]> {
    return db.medication.findMany({ where: { code: { in: codes } } });
  }

  async findOrCreateOpenDelivery(db: Db, droneId: string): Promise<Delivery> {
    const open = await db.delivery.findFirst({
      where: { droneId, closedAt: null },
    });
    return open ?? db.delivery.create({ data: { droneId } });
  }

  async addItems(
    db: Db,
    items: Prisma.DeliveryItemCreateManyInput[],
  ): Promise<void> {
    await db.deliveryItem.createMany({ data: items });
  }

  findOpenItems(db: Db, droneId: string): Promise<LoadedItem[]> {
    return db.deliveryItem.findMany({
      where: { delivery: { droneId, closedAt: null } },
      include: { medication: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async insertKeyIfNew(
    db: Db,
    key: string,
    requestHash: string,
  ): Promise<boolean> {
    const { count } = await db.idempotencyKey.createMany({
      data: [{ key, requestHash }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  findKey(db: Db, key: string): Promise<IdempotencyKey | null> {
    return db.idempotencyKey.findUnique({ where: { key } });
  }

  async restartKey(db: Db, key: string, requestHash: string): Promise<void> {
    await db.idempotencyKey.update({
      where: { key },
      data: { requestHash, responseBody: Prisma.DbNull, createdAt: new Date() },
    });
  }

  async saveResponse(db: Db, key: string, responseBody: object): Promise<void> {
    await db.idempotencyKey.update({
      where: { key },
      data: { responseBody },
    });
  }
}
