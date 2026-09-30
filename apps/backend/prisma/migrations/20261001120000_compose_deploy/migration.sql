-- CreateEnum
CREATE TYPE "DeployMode" AS ENUM ('container', 'compose');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "deploy_mode" "DeployMode" NOT NULL DEFAULT 'container',
ADD COLUMN "compose_file" TEXT NOT NULL DEFAULT 'docker-compose.yml';
