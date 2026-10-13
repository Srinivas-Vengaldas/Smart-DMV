-- AlterTable
ALTER TABLE "DocumentVerification" ADD COLUMN     "aiExplanation" TEXT,
ADD COLUMN     "mismatchSummary" JSONB;
