# Changelog

All notable changes to BeatDock are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/). This project uses [Semantic Versioning](https://semver.org/).

## [2.11.0] - 2026-08-21

### Fixed
- YouTube playback failing with "All clients failed to load the item" (`This video requires
  login` / `Sign in to confirm you're not a bot`). Two causes: YouTube has blocked every client
  the plugin could still reach anonymously, and stacks updated in place were never picking up
  the 2.10.0 config at all - `application.yml` is bind-mounted as a single file, and Docker
  binds single files by inode, so `docker compose restart` and a plain `docker compose up -d`
  both keep serving the pre-update file indefinitely
- Documented update command now uses `--force-recreate`, and the Portainer equivalent
  ("Pull and redeploy" with "Re-pull image and redeploy") is spelled out. A `docker:update`
  npm script wraps the correct invocation
- A queue that ends on a track that could not be played no longer reports that it "finished"
- README's example `docker-compose.yml` no longer publishes Lavalink's port `2333` to the host,
  matching the real compose file. The example previously exposed the control API - including the
  poToken hot-swap route - with a default password

### Changed
- Lavalink `youtube-plugin` pinned to upstream snapshot `f45bbb7a`, which carries the `IOS`
  client fixes absent from release 1.18.2. `IOS` is now the primary stream provider and needs no
  poToken; `WEB`/`WEBEMBEDDED`/`ANDROID_VR` stay in the list so playback self-heals when they are
  unblocked. Revert to a release pin once one ships these fixes. Note that `IOS` serves no Opus
  formats, so Lavalink now transcodes AAC to Opus for tracks it handles - a small but real CPU
  cost on constrained hosts such as a Raspberry Pi
- `bgutil-ytdlp-pot-provider` bumped to `1.3.2`, which mints WebPO tokens from the homepage
  challenge to work around the 403s in the same YouTube change
- `trackStuck` now feeds the same failure handling as `trackError` instead of only logging

### Added
- Playback failure breaker: after 3 consecutive failures in a guild the bot says so once in the
  channel, stops the queue and turns off autoplay, instead of silently skipping every track and
  letting autoplay refill the queue from the same dead source
- Startup warning when the Lavalink node's loaded plugin versions do not match the ones this
  release pins, with the command to recreate the container
- `scripts/test-resilience.js`, and CI now runs `npm test`

## [2.10.0] - 2026-07-06

### Added
- Automated, credential-free YouTube **poToken** refresh for the self-hosted Docker stack.
  Two new services — `bgutil-provider` (mints the token on the host's own IP) and
  `pot-refresher` (pushes it to Lavalink's `POST /youtube` hot-swap route every
  `POT_REFRESH_INTERVAL` seconds) — restore playback of non-music videos and autoplay/RD-mix
  recommendations without any Google account, API key, or manual token pasting
- `POT_REFRESH_INTERVAL` environment variable to tune the refresh cadence (default: 1800s)

### Changed
- Lavalink `youtube` clients are now `MUSIC, WEB, WEBEMBEDDED, ANDROID_VR`. The `WEB` client
  (backed by the auto-refreshed poToken) handles arbitrary videos and RD mixes; dropped
  `TVHTML5_SIMPLY`, which triggered YouTube's "Sign in to confirm you're not a bot" detection

### Fixed
- Non-music videos (film/movie clips) that failed with "This video is not available" now play
- Autoplay no longer silently stops on tracks whose RD mix only `ANDROID_VR` could not resolve
  ("Could not find tracks from mix")

## [2.9.0] - 2026-06-07

### Changed
- Autoplay recommendations now rely solely on YouTube's native radio (RD mix), seeded from
  recent tracks, replacing the previous custom `ytmsearch:` text-search heuristic
- Autoplay now queues up to 25 related tracks per refill (configurable via `AUTOPLAY_TARGET_COUNT`)

### Fixed
- Autoplay no longer repeats the same song: hardened deduplication (within-batch checking,
  wider history window, and version-variant title matching such as `(Live)` vs `(Official Video)`)
- Removed the random no-dedup fallback that could re-add recently played tracks

### Added
- `AUTOPLAY_TARGET_COUNT` environment variable to control how many tracks autoplay queues
- Light non-music filter to skip reactions, trailers, interviews and live streams in autoplay

## [2.7.4] - 2026-03-22

### Added
- Default search platform configuration via `DEFAULT_SEARCH_PLATFORM` environment variable
- Search platform documentation added to website

### Changed
- Default search platform changed from `ytsearch` (YouTube) to `ytmsearch` (YouTube Music)

## [2.7.3] - 2026-03-16

### Changed
- Slash commands are now auto-deployed on startup, no more manual `npm run deploy` step
- Removed `CLIENT_ID` environment variable requirement, only `TOKEN` is needed now
- Removed `deploy-commands.js` script and related documentation

## [2.7.1] - 2025-06-15

### Fixed
- Code review improvements and security hardening
- Player display now updates correctly after volume and shuffle commands

## [2.7.0] - 2025-06-08

### Added
- `/invite` command to generate a bot invite link with only the required permissions
- Startup invite URL logged to container output on every boot
- Welcome embed sent when the bot joins a new server
- Autoplay mode that plays related tracks when the queue empties (`/autoplay`)
- `AUTOPLAY_DEFAULT` environment variable to enable autoplay by default
- Public Lavalink server fallback, no self-hosted server needed
- Automatic node rotation when a public server goes down

## [2.6.0] - 2025-05-20

### Added
- Italian translation (`it`)
- `next` option on `/play` to add tracks to the front of the queue
- Unified search/queue UI with dropdown track selection menu

## [2.4.2] - 2025-04-28

### Fixed
- Duplicate command names detected and skipped during deploy
- Switched to non-Alpine Lavalink image for DAVE and ARM64 support
- Expired Discord interaction handling

### Changed
- Bumped lavalink-client from 2.7.7 to 2.9.7
- Bumped dotenv from 17.2.3 to 17.3.1

## [2.4.0] - 2025-03-15

### Added
- Multi-arch Docker builds (amd64, arm64)
- Trivy security scanning in CI
- Dependabot for npm, Docker, and GitHub Actions
- CODEOWNERS, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY files

### Changed
- Rewrote README for clarity

[2.9.0]: https://github.com/albertgmz/BeatDock/compare/v2.8.0...v2.9.0
[2.7.4]: https://github.com/albertgmz/BeatDock/compare/v2.7.3...v2.7.4
[2.7.3]: https://github.com/albertgmz/BeatDock/compare/v2.7.1...v2.7.3
[2.7.1]: https://github.com/albertgmz/BeatDock/compare/v2.7.0...v2.7.1
[2.7.0]: https://github.com/albertgmz/BeatDock/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/albertgmz/BeatDock/compare/v2.4.2...v2.6.0
[2.4.2]: https://github.com/albertgmz/BeatDock/compare/v2.4.0...v2.4.2
[2.4.0]: https://github.com/albertgmz/BeatDock/releases/tag/v2.4.0
