-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "daily_anime" (
    "push_date" DATE NOT NULL,
    "media_id" INTEGER NOT NULL,
    "chinese_title" TEXT NOT NULL,
    "native_title" TEXT NOT NULL,
    "cover_image" TEXT,
    "studio" TEXT,
    "voice_actors" TEXT[],
    "season" INTEGER,
    "episode" INTEGER,
    "airing_at" BIGINT,

    CONSTRAINT "daily_anime_pkey" PRIMARY KEY ("push_date","media_id")
);

