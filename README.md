# Troll Master

A cross-platform desktop app for managing and automating social media accounts across
Instagram, X/Twitter, Facebook, TikTok, LinkedIn, and YouTube — built with Tauri (Rust) +
React/TypeScript, driving a real browser per profile via Playwright. No platform APIs are
used; every action runs through an isolated browser context with its own fingerprint,
proxy, and session, the same way a human would use the site.

> Local-first. Your session data, proxies, and rules live in a local SQLite database on
> your machine — nothing is sent to a remote server.

## Features

**Platforms**: Instagram, X/Twitter, Facebook, TikTok, LinkedIn, YouTube — each with its
own isolated browser fingerprint (user agent, timezone, locale, viewport) and a
cosmetic device identity (device name + IMEI-shaped device ID) per profile.

**Automation**
- Standalone action rules per profile: follow/unfollow, like/unlike, comment, save,
  DM, story/reel view + react, retweet (X), subscribe (YouTube) — sourced from an
  explicit list, a hashtag, a seed account's followers, or "non-follow-backs" (smart
  unfollow).
- **Campaigns** — shared rule templates you enroll many profiles into live; editing the
  campaign updates every enrolled profile immediately.
- **DM drip sequences** — multi-step, timed DM sequences per target, with per-target
  progress tracking.
- **Comment-reply automation** — watches a monitored post's comments and auto-replies
  from a spintax pool.
- **Engagement pods** — groups of your own profiles that auto-detect each other's newest
  post and mutually like/comment within a configured time window.
- Warmup ramp-up for new profiles, exponential backoff on errors, jittered delay
  windows, and a global blacklist — all applied uniformly across every automation type.

**Management at scale**
- Bulk multi-select actions on Profiles (enable/disable, assign group/proxy, delete,
  add to campaign/pod, create one rule across many profiles at once) and on each
  profile's Rules panel (enable/disable/delete).
- Duplicate/clone a profile (same fingerprint, proxy, and rules; fresh device ID, no
  session copied).
- Full-app JSON backup/restore, plus per-section export/import on the Profiles,
  Campaigns, Pods, Proxies, and Blacklist pages.
- CSV/TXT bulk import for proxies, blacklist usernames, profile shells, and rule
  target lists — no need to go through JSON for a quick list paste.

**Monitoring & analytics**
- Track engagement (likes/comments/shares/views) on any public post over time using a
  viewer profile's session.
- Overview dashboard with per-platform activity charts and health status.
- Action log with per-rule health (cooling down / recent errors / ok).

**Operational**
- Per-profile login: manual capture, password-based auto-login, or cookie import.
- Local master-password lock screen (convenience lock, not a hard security boundary —
  session data is protected by your OS keychain regardless).
- In-app auto-updater with an in-app Changelog page rendering GitHub release notes.
- Single-instance enforcement — installing a new version replaces the old one; only
  one instance runs at a time.

## Architecture

```
src/            React + TypeScript frontend (Vite)
src-tauri/      Rust backend — Tauri commands, SQLite (rusqlite), the scheduler,
                encryption (AES-256-GCM + OS keychain), JSON-RPC client to the sidecar
sidecar/        Node.js + Playwright sidecar — one process per app, JSON-RPC over
                stdio, all real browser automation lives here (per-platform actions,
                scraping, login capture, detection)
```

The Rust core and the Node sidecar communicate over newline-delimited JSON-RPC on
stdio. Rust never launches a browser itself — it decrypts a profile's session state to
a temp file, asks the sidecar to run an action against it, then re-encrypts and
discards the plaintext. A single `tokio::time::interval` scheduler loop drives every
automation type (standalone rules, campaigns, monitoring, comment-replies, DM
sequences, pods) each tick, applying warmup/backoff/blacklist/delay gating uniformly.

## Development

```bash
npm install
cd sidecar && npm install && npm run build && cd ..
npm run tauri dev
```

The sidecar must be built (`sidecar/dist/index.js`) before `tauri dev` — the Rust side
launches it as a subprocess at that path in development.

### Verifying changes

```bash
npx tsc --noEmit          # frontend typecheck
cd src-tauri && cargo build   # backend build
```

There is no automated test suite; changes are verified by building both sides clean
and a manual dev-mode walkthrough of the affected flow.

## Releasing

Releases build on GitHub Actions (`.github/workflows/release.yml`) across
`macos-latest`, `windows-latest`, and `ubuntu-latest` in parallel, triggered by pushing
a tag matching `v*.*.*`. Tauri can't cross-compile between OSes, so this is the only
way to produce all three platforms' installers from one machine.

1. Bump `version` in `package.json`, `src-tauri/tauri.conf.json`, and
   `src-tauri/Cargo.toml` (kept in sync).
2. Commit and push to `main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z` — this triggers the workflow.
4. Watch with `gh run list` / `gh run watch <id>`. Each platform job vendors its own
   Node runtime as the Tauri `externalBin`, builds, signs, and uploads to the release
   matching the tag — including a merged multi-platform `latest.json` for the
   in-app updater.

No manual `latest.json` crafting or `gh release create` is needed — `tauri-action`
handles all of it per-platform and merges the results.

## Tech stack

- **Frontend**: React 19, TypeScript, Vite — no UI framework, hand-rolled dark
  ops-console styling and dependency-free SVG charts.
- **Backend**: Rust, Tauri v2, `rusqlite` (bundled SQLite), `aes-gcm` + `keyring` for
  session encryption, `tauri-plugin-updater`/`-process`/`-dialog`/`-single-instance`.
- **Sidecar**: Node.js + Playwright, TypeScript.
