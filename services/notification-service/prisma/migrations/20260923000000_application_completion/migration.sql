-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "deliveryKey" TEXT;

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_deliveries_status_availableAt_idx" ON "email_deliveries"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_organizationId_userId_key" ON "notification_preferences"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_deliveryKey_key" ON "notifications"("deliveryKey");

