-- CreateEnum
CREATE TYPE "job_video_status" AS ENUM ('PENDING', 'TRANSCRIBED', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "ingestion_jobs" ADD COLUMN     "report" JSONB;

-- CreateTable
CREATE TABLE "ingestion_job_videos" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "status" "job_video_status" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "metadata" JSONB,
    "result" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_job_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_job_videos_job_id_position_key" ON "ingestion_job_videos"("job_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_job_videos_job_id_youtube_id_key" ON "ingestion_job_videos"("job_id", "youtube_id");

-- AddForeignKey
ALTER TABLE "ingestion_job_videos" ADD CONSTRAINT "ingestion_job_videos_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "ingestion_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
