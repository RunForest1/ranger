-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'viewer';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
