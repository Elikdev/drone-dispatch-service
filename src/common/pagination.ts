import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export interface PageRequest {
  page: number;
  limit: number;
  skip: number;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
}

export interface PaginationLimits {
  defaultLimit: number;
  maxLimit: number;
}

export function resolvePage(
  query: PaginationQueryDto,
  { defaultLimit, maxLimit }: PaginationLimits,
): PageRequest {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? defaultLimit, maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}
