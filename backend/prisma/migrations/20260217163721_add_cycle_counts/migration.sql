-- CreateTable
CREATE TABLE "cycle_counts" (
    "id" SERIAL NOT NULL,
    "count_number" VARCHAR(20) NOT NULL,
    "location" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "blind_count" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "assigned_to" INTEGER,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_count_lines" (
    "id" SERIAL NOT NULL,
    "cycle_count_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "system_qty" DECIMAL(10,2) NOT NULL,
    "counted_qty" DECIMAL(10,2),
    "unit_cost" DECIMAL(10,2),
    "variance" DECIMAL(10,2),
    "variance_value" DECIMAL(10,2),
    "adjustment_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cycle_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cycle_counts_count_number_key" ON "cycle_counts"("count_number");

-- CreateIndex
CREATE INDEX "cycle_counts_status_idx" ON "cycle_counts"("status");

-- CreateIndex
CREATE INDEX "cycle_counts_location_idx" ON "cycle_counts"("location");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_count_lines_adjustment_id_key" ON "cycle_count_lines"("adjustment_id");

-- CreateIndex
CREATE INDEX "cycle_count_lines_cycle_count_id_idx" ON "cycle_count_lines"("cycle_count_id");

-- CreateIndex
CREATE INDEX "cycle_count_lines_item_id_idx" ON "cycle_count_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_count_lines_cycle_count_id_item_id_key" ON "cycle_count_lines"("cycle_count_id", "item_id");

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_lines" ADD CONSTRAINT "cycle_count_lines_cycle_count_id_fkey" FOREIGN KEY ("cycle_count_id") REFERENCES "cycle_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_lines" ADD CONSTRAINT "cycle_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_lines" ADD CONSTRAINT "cycle_count_lines_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
