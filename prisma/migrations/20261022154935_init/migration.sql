-- CreateEnum
CREATE TYPE "drone_state" AS ENUM ('IDLE', 'LOADING', 'LOADED', 'DELIVERING', 'DELIVERED', 'RETURNING');

-- CreateTable
CREATE TABLE "drones" (
    "id" UUID NOT NULL,
    "serial_number" VARCHAR(100) NOT NULL,
    "model" VARCHAR(32) NOT NULL,
    "weight_limit_mg" INTEGER NOT NULL,
    "loaded_weight_mg" INTEGER NOT NULL DEFAULT 0,
    "battery_pct" INTEGER NOT NULL,
    "state" "drone_state" NOT NULL DEFAULT 'IDLE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "drones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medications" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "weight_mg" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "drone_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_items" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "medication_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_weight_mg" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drones_serial_number_key" ON "drones"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "medications_code_key" ON "medications"("code");

-- CreateIndex
CREATE INDEX "delivery_items_delivery_id_idx" ON "delivery_items"("delivery_id");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_drone_id_fkey" FOREIGN KEY ("drone_id") REFERENCES "drones"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "drones" ADD CONSTRAINT "drones_loaded_weight_within_limit" CHECK ("loaded_weight_mg" >= 0 AND "loaded_weight_mg" <= "weight_limit_mg");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_one_open_per_drone" ON "deliveries"("drone_id") WHERE "closed_at" IS NULL;
