# CLAUDE.md

## Language Preference
- Always converse, explain code, and reply to the user in Traditional Chinese (zh-TW).

## Session Start Rule
- **每次對話開始時，必須先讀取並參照 `/Users/tomoya/Desktop/Anime-Line-Bot-v1/.claude/settings.json`**，確認目前已授權的 Bash/Edit 權限範圍，再決定是否需要向使用者申請額外授權。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An anime-themed LINE Messaging API bot backed by the AniList GraphQL API. Users interact via LINE; the bot queries AniList for anime data and persists state in a PostgreSQL database hosted on Neon.

## Planned Tech Stack

- **Runtime**: Node.js (TypeScript expected)
- **LINE integration**: LINE Messaging API (webhook-based)
- **Anime data**: AniList GraphQL API — docs at https://docs.anilist.co/guide/graphql/
- **Database**: PostgreSQL via Neon (serverless)
- **Infrastructure**: GCP (project: `anime-line-bot-498503`)

## Environment

All secrets live in `.env` (never commit this file). Required variables:

- `LINE_SECRET` — used to verify webhook signatures
- `LINE_ASSESS_TOKEN` — used to reply to LINE users
- `LINE_USER_ID` — target LINE user ID for push messages
- `DATABASE_URL` — Neon PostgreSQL connection string
- `GCP_PROJECT_ID` — GCP project identifier
- `GITHUB_PERSONAL_ACCESS_TOKEN` — GitHub API access token

## Architecture Notes

- The bot is webhook-driven: LINE POSTs events to an endpoint; the server verifies the signature with `LINE_SECRET`, processes the event, and replies using `LINE_ASSESS_TOKEN`.
- AniList is a public GraphQL API (no auth required for read queries).
- The Neon connection string includes `?sslmode=require&channel_binding=require`; ensure the DB client sends SSL.
