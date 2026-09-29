-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "tax" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "invoice_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "idempotencyKey" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- CreateIndex
CREATE UNIQUE INDEX "payments_organizationId_idempotencyKey_key" ON "payments"("organizationId", "idempotencyKey");

