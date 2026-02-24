-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "order_type" VARCHAR(20) NOT NULL DEFAULT 'STAGED',
ADD COLUMN     "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "total_quantity" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "production_order_lines" (
    "id" SERIAL NOT NULL,
    "production_order_id" INTEGER NOT NULL,
    "line_number" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'STAGED',
    "component_snapshot" JSONB NOT NULL,
    "line_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "posted_at" TIMESTAMP(3),
    "posted_by" INTEGER,
    "voided_at" TIMESTAMP(3),
    "voided_by" INTEGER,
    "reversed_at" TIMESTAMP(3),
    "reversed_by" INTEGER,
    "notes" TEXT,
    "batch_id" VARCHAR(36),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_order_lines_production_order_id_idx" ON "production_order_lines"("production_order_id");

-- CreateIndex
CREATE INDEX "production_order_lines_status_idx" ON "production_order_lines"("status");

-- CreateIndex
CREATE UNIQUE INDEX "production_order_lines_production_order_id_line_number_key" ON "production_order_lines"("production_order_id", "line_number");

-- CreateIndex
CREATE INDEX "production_orders_status_idx" ON "production_orders"("status");

-- CreateIndex
CREATE INDEX "production_orders_order_type_idx" ON "production_orders"("order_type");

-- AddForeignKey
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
