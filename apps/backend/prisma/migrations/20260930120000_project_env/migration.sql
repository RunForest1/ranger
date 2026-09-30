-- AlterTable
ALTER TABLE "projects" ADD COLUMN "env_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "encrypted_env" TEXT;
