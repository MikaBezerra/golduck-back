-- CreateEnum
CREATE TYPE "SummaryChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "SummaryDispatchStatus" AS ENUM ('RUNNING', 'DONE', 'INTERRUPTED');

-- CreateEnum
CREATE TYPE "SummaryDispatchItemStatus" AS ENUM ('SENT', 'SKIPPED_NO_EMAIL', 'FAILED');

-- CreateTable
CREATE TABLE "SummaryDispatch" (
    "id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "channel" "SummaryChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "SummaryDispatchStatus" NOT NULL DEFAULT 'RUNNING',
    "runningMonth" DATE,
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SummaryDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SummaryDispatchItem" (
    "id" UUID NOT NULL,
    "dispatchId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "recipient" VARCHAR(254),
    "status" "SummaryDispatchItemStatus" NOT NULL,
    "errorCode" VARCHAR(60),
    "message" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SummaryDispatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SummaryDispatch_runningMonth_key" ON "SummaryDispatch"("runningMonth");

-- CreateIndex
CREATE UNIQUE INDEX "SummaryDispatch_idempotencyKey_key" ON "SummaryDispatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SummaryDispatch_month_startedAt_idx" ON "SummaryDispatch"("month", "startedAt");

-- CreateIndex
CREATE INDEX "SummaryDispatchItem_dispatchId_idx" ON "SummaryDispatchItem"("dispatchId");

-- CreateIndex
CREATE INDEX "SummaryDispatchItem_personId_idx" ON "SummaryDispatchItem"("personId");

-- AddForeignKey
ALTER TABLE "SummaryDispatchItem" ADD CONSTRAINT "SummaryDispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "SummaryDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummaryDispatchItem" ADD CONSTRAINT "SummaryDispatchItem_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
