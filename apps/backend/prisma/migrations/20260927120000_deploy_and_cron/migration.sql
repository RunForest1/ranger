-- AlterTable
ALTER TABLE "deployments" ADD COLUMN     "image_tag" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "container_port" INTEGER,
ADD COLUMN     "host_port" INTEGER;
