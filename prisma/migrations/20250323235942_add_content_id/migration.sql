/*
  Warnings:

  - A unique constraint covering the columns `[contentId]` on the table `Video` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `contentId` to the `Video` table without a default value. This is not possible if the table is not empty.

*/
-- First add the column as nullable
ALTER TABLE "Video" ADD COLUMN "contentId" TEXT;

-- Update existing records with a contentId based on their id and creation timestamp
UPDATE "Video" 
SET "contentId" = CONCAT(
    SUBSTRING("id" FROM 1 FOR 8),
    '-',
    EXTRACT(EPOCH FROM "createdAt")::BIGINT
)
WHERE "contentId" IS NULL;

-- Now make the column required and add the unique constraint
ALTER TABLE "Video" ALTER COLUMN "contentId" SET NOT NULL;
CREATE UNIQUE INDEX "Video_contentId_key" ON "Video"("contentId");
