/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Like` table. All the data in the column will be lost.
  - You are about to drop the column `completed` on the `Mission` table. All the data in the column will be lost.
  - You are about to drop the column `progress` on the `Mission` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Mission` table. All the data in the column will be lost.
  - You are about to alter the column `reward` on the `Mission` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `target` on the `Mission` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to drop the column `videoId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to drop the column `worldId` on the `User` table. All the data in the column will be lost.
  - You are about to alter the column `tokenBalance` on the `User` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to drop the column `comments` on the `Video` table. All the data in the column will be lost.
  - You are about to drop the column `contentId` on the `Video` table. All the data in the column will be lost.
  - You are about to drop the column `likes` on the `Video` table. All the data in the column will be lost.
  - You are about to drop the column `tokenReward` on the `Video` table. All the data in the column will be lost.
  - You are about to drop the column `videoUrl` on the `Video` table. All the data in the column will be lost.
  - Changed the type of `type` on the `Transaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `username` on table `User` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `url` to the `Video` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Mission" DROP CONSTRAINT "Mission_userId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_videoId_fkey";

-- DropIndex
DROP INDEX "User_worldId_key";

-- DropIndex
DROP INDEX "Video_contentId_key";

-- AlterTable
ALTER TABLE "Like" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "Mission" DROP COLUMN "completed",
DROP COLUMN "progress",
DROP COLUMN "userId",
ALTER COLUMN "reward" SET DATA TYPE INTEGER,
ALTER COLUMN "target" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "videoId",
ADD COLUMN     "description" TEXT,
ALTER COLUMN "amount" SET DATA TYPE INTEGER,
DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "worldId",
ADD COLUMN     "followers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "following" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isInfluencer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalEarnings" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "username" SET NOT NULL,
ALTER COLUMN "tokenBalance" SET DEFAULT 0,
ALTER COLUMN "tokenBalance" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "comments",
DROP COLUMN "contentId",
DROP COLUMN "likes",
DROP COLUMN "tokenReward",
DROP COLUMN "videoUrl",
ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "url" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
