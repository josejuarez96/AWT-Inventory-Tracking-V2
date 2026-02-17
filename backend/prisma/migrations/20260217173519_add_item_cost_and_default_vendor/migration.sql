-- AlterTable
ALTER TABLE "items" ADD COLUMN     "default_vendor_id" INTEGER,
ADD COLUMN     "last_purchase_cost" DECIMAL(10,2),
ADD COLUMN     "standard_cost" DECIMAL(10,2);

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_default_vendor_id_fkey" FOREIGN KEY ("default_vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
