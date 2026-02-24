-- CreateTable
CREATE TABLE "item_vendors" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "item_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_vendors_item_id_idx" ON "item_vendors"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_vendors_item_id_vendor_id_key" ON "item_vendors"("item_id", "vendor_id");

-- AddForeignKey
ALTER TABLE "item_vendors" ADD CONSTRAINT "item_vendors_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_vendors" ADD CONSTRAINT "item_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
