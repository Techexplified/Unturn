-- CreateTable
CREATE TABLE "Intervention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "actionType" TEXT,
    "expectedOutcome" TEXT,
    "cause" TEXT,
    "productId" TEXT,
    "variantId" TEXT,
    "recommendationId" TEXT,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetCompletionDate" DATETIME,
    "completedAt" DATETIME,
    "notes" TEXT,
    "baselineReturnRate" REAL,
    "baselineReturnedUnits" INTEGER,
    "baselineUnitsSold" INTEGER,
    "baselineCauseFrequency" INTEGER,
    "baselinePeriod" TEXT,
    "baselineReliable" BOOLEAN NOT NULL DEFAULT true,
    "baselineNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Intervention_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Intervention_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Intervention_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Intervention_shopId_idx" ON "Intervention"("shopId");

-- CreateIndex
CREATE INDEX "Intervention_status_idx" ON "Intervention"("status");

-- CreateIndex
CREATE INDEX "Intervention_productId_idx" ON "Intervention"("productId");

-- CreateIndex
CREATE INDEX "Intervention_variantId_idx" ON "Intervention"("variantId");
