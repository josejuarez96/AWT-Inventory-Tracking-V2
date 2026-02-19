-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "batch_id" VARCHAR(36);

-- CreateIndex
CREATE INDEX "transactions_batch_id_idx" ON "transactions"("batch_id");
