-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "TextSizePreference" AS ENUM ('NORMAL', 'LARGE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT,
ADD COLUMN     "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "textSize" "TextSizePreference" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM';
