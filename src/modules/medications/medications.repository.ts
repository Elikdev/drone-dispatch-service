import { Injectable } from '@nestjs/common';
import { PageRequest } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { Medication, Prisma } from '../../generated/prisma/client';

@Injectable()
export class MedicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    page: PageRequest,
  ): Promise<{ medications: Medication[]; total: number }> {
    const [medications, total] = await Promise.all([
      this.prisma.medication.findMany({
        orderBy: { code: 'asc' },
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.medication.count(),
    ]);
    return { medications, total };
  }

  create(data: Prisma.MedicationCreateInput): Promise<Medication> {
    return this.prisma.medication.create({ data });
  }
}
