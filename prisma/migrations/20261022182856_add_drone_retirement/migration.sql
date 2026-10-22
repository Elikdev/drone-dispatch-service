-- AlterTable
ALTER TABLE "drones" ADD COLUMN     "retired_at" TIMESTAMPTZ(3),
ADD COLUMN     "retired_reason" VARCHAR(255);
