-- AlterTable
ALTER TABLE "cycle_count_lines" ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(10,4);

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "conversion_factor" DECIMAL(10,4),
ADD COLUMN     "purchase_uom" VARCHAR(20);

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(10,4);
