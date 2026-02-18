-- AlterTable
ALTER TABLE "items" ADD COLUMN     "item_type" VARCHAR(20) NOT NULL DEFAULT 'RAW';

-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "deviation_notes" TEXT,
ADD COLUMN     "has_deviations" BOOLEAN NOT NULL DEFAULT false;
