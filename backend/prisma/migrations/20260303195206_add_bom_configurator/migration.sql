-- AlterTable
ALTER TABLE "bom_lines" ADD COLUMN     "cut_details" JSONB,
ADD COLUMN     "scrap_percent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "allow_decimal_qty" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stock_length" DECIMAL(10,4);

-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "configuration_key" VARCHAR(200),
ADD COLUMN     "configuration_snapshot" JSONB,
ADD COLUMN     "vin_reference" VARCHAR(50);

-- CreateTable
CREATE TABLE "option_groups" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" VARCHAR(50),
    "selection_type" VARCHAR(20) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_packages" (
    "id" SERIAL NOT NULL,
    "option_group_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "allow_quantity" BOOLEAN NOT NULL DEFAULT false,
    "min_quantity" INTEGER NOT NULL DEFAULT 1,
    "max_quantity" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_lines" (
    "id" SERIAL NOT NULL,
    "option_package_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "quantity_per" DECIMAL(10,4) NOT NULL,
    "scrap_percent" DECIMAL(5,2),
    "cut_details" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "option_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "option_groups_bom_id_idx" ON "option_groups"("bom_id");

-- CreateIndex
CREATE UNIQUE INDEX "option_groups_bom_id_name_key" ON "option_groups"("bom_id", "name");

-- CreateIndex
CREATE INDEX "option_packages_option_group_id_idx" ON "option_packages"("option_group_id");

-- CreateIndex
CREATE INDEX "option_packages_status_idx" ON "option_packages"("status");

-- CreateIndex
CREATE INDEX "option_packages_option_group_id_is_default_idx" ON "option_packages"("option_group_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "option_packages_option_group_id_name_key" ON "option_packages"("option_group_id", "name");

-- CreateIndex
CREATE INDEX "option_lines_option_package_id_idx" ON "option_lines"("option_package_id");

-- CreateIndex
CREATE UNIQUE INDEX "option_lines_option_package_id_item_id_action_key" ON "option_lines"("option_package_id", "item_id", "action");

-- CreateIndex
CREATE INDEX "production_orders_configuration_key_idx" ON "production_orders"("configuration_key");

-- AddForeignKey
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_packages" ADD CONSTRAINT "option_packages_option_group_id_fkey" FOREIGN KEY ("option_group_id") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_packages" ADD CONSTRAINT "option_packages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_packages" ADD CONSTRAINT "option_packages_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_lines" ADD CONSTRAINT "option_lines_option_package_id_fkey" FOREIGN KEY ("option_package_id") REFERENCES "option_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_lines" ADD CONSTRAINT "option_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
