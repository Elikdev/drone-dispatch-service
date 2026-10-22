-- CreateTable
CREATE TABLE "battery_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "drone_id" UUID NOT NULL,
    "battery_pct" INTEGER NOT NULL,
    "drone_state" "drone_state" NOT NULL,
    "is_low" BOOLEAN NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "battery_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "battery_audit_logs_drone_id_checked_at_id_idx" ON "battery_audit_logs"("drone_id", "checked_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "battery_audit_logs" ADD CONSTRAINT "battery_audit_logs_drone_id_fkey" FOREIGN KEY ("drone_id") REFERENCES "drones"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
