-- AlterTable: колонка сначала nullable, чтобы заполнить существующие сборки веткой их проекта
ALTER TABLE "builds" ADD COLUMN "branch" TEXT;

UPDATE "builds" SET "branch" = "projects"."branch"
FROM "projects"
WHERE "builds"."project_id" = "projects"."id";

ALTER TABLE "builds" ALTER COLUMN "branch" SET NOT NULL;
