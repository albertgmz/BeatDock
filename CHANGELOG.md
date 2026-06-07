# Changelog

All notable changes to BeatDock are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/). This project uses [Semantic Versioning](https://semver.org/).

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

[2.7.4]: https://github.com/lazaroagomez/BeatDock/compare/v2.7.3...v2.7.4
[2.7.3]: https://github.com/lazaroagomez/BeatDock/compare/v2.7.1...v2.7.3
[2.7.1]: https://github.com/lazaroagomez/BeatDock/compare/v2.7.0...v2.7.1
[2.7.0]: https://github.com/lazaroagomez/BeatDock/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/lazaroagomez/BeatDock/compare/v2.4.2...v2.6.0
[2.4.2]: https://github.com/lazaroagomez/BeatDock/compare/v2.4.0...v2.4.2
[2.4.0]: https://github.com/lazaroagomez/BeatDock/releases/tag/v2.4.0
