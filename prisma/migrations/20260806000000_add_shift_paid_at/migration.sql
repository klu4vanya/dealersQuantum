ALTER TABLE "Shift" ADD COLUMN "paidAt" TIMESTAMP(3);

CREATE INDEX "Shift_paidAt_idx" ON "Shift"("paidAt");
