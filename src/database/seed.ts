import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { gramsToMg } from '../common/units/weight';
import { PrismaClient } from '../generated/prisma/client';
import { DRONE_SEEDS, MEDICATION_SEEDS } from './seed-data';

export async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    ...DRONE_SEEDS.map((drone) =>
      prisma.drone.upsert({
        where: { serialNumber: drone.serialNumber },
        update: {},
        create: {
          serialNumber: drone.serialNumber,
          model: drone.model,
          weightLimitMg: gramsToMg(drone.weightLimitG),
          batteryPct: drone.batteryPct,
        },
      }),
    ),
    ...MEDICATION_SEEDS.map((medication) =>
      prisma.medication.upsert({
        where: { code: medication.code },
        update: {},
        create: {
          name: medication.name,
          code: medication.code,
          weightMg: gramsToMg(medication.weightG),
          imageUrl: medication.imageUrl,
        },
      }),
    ),
  ]);
}

async function main(): Promise<void> {
  const logger = new Logger('Seed');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await seed(prisma);
    logger.log(
      `Seed data in place: ${DRONE_SEEDS.length} drones, ${MEDICATION_SEEDS.length} medications`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    new Logger('Seed').error(error);
    process.exit(1);
  });
}
