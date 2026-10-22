CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameKey" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_nameKey_key" ON "Category"("nameKey");
CREATE INDEX "Category_active_name_idx" ON "Category"("active", "name");
CREATE UNIQUE INDEX "Category_one_default_idx" ON "Category"("isDefault") WHERE "isDefault" = true;

INSERT INTO "Category" ("id", "name", "nameKey", "active", "isDefault", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Outros', 'outros', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
