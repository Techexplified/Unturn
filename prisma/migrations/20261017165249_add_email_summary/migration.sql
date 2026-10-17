-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "name" TEXT,
    "currency" TEXT,
    "ianaTimezone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dateRangeAnalysis" TEXT NOT NULL DEFAULT 'Last 90 days',
    "emailSummary" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Shop" ("createdAt", "currency", "dateRangeAnalysis", "ianaTimezone", "id", "installedAt", "isActive", "name", "shopDomain", "uninstalledAt", "updatedAt") SELECT "createdAt", "currency", "dateRangeAnalysis", "ianaTimezone", "id", "installedAt", "isActive", "name", "shopDomain", "uninstalledAt", "updatedAt" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");
CREATE INDEX "Shop_shopDomain_idx" ON "Shop"("shopDomain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
