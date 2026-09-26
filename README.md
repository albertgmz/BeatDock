# BeatDock

A Discord music bot powered by Lavalink. Simple to deploy, easy to use.

[![License](https://img.shields.io/github/license/albertgmz/BeatDock)](LICENSE)
[![Version](https://img.shields.io/github/v/release/albertgmz/BeatDock?label=version)](https://github.com/albertgmz/BeatDock/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://github.com/albertgmz/BeatDock/pkgs/container/beatdock)
[![Last Commit](https://img.shields.io/github/last-commit/albertgmz/BeatDock)](https://github.com/albertgmz/BeatDock/commits/main)
[![Issues](https://img.shields.io/github/issues/albertgmz/BeatDock)](https://github.com/albertgmz/BeatDock/issues)
[![CI](https://img.shields.io/github/actions/workflow/status/albertgmz/BeatDock/ci.yml?label=CI)](https://github.com/albertgmz/BeatDock/actions/workflows/ci.yml)
[![Security](https://img.shields.io/github/actions/workflow/status/albertgmz/BeatDock/security.yml?label=security)](https://github.com/albertgmz/BeatDock/actions/workflows/security.yml)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/lazaroagomez)

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Configuration](#configuration)
- [Managing the Bot](#managing-the-bot)
- [Troubleshooting](#troubleshooting)
- [Built With](#built-with)
- [Contributing](#contributing)
- [Links](#links)
- [License](#license)

## Features

- Play music from YouTube, SoundCloud, Bandcamp, Twitch, and Vimeo
- Optional Spotify support (search and resolve via YouTube)
- Autoplay mode for continuous music playback
- Queue management with shuffle, loop, and play-next
- Interactive search with track selection
- Deploy-time language selection (English, Spanish, Turkish, Italian, Brazilian Portuguese)
- Role-based access control
- Runs entirely in Docker, no host dependencies
- Works without a self-hosted Lavalink server (automatic public server fallback)

## Quick Start

### Prerequisites

- A Discord bot token from the [Developer Portal](https://discord.com/developers/applications)
- [Docker](https://docs.docker.com/get-docker/) installed

When creating your bot, enable **all 3 Privileged Gateway Intents** (Presence, Server Members, Message Content).

### Option A: Deploy with Docker (recommended)

Uses the pre-built GHCR image, no cloning needed.

**1. Create a project directory:**

```bash
mkdir beatdock && cd beatdock
```

**2. Create `.env`:**

```env
TOKEN=your_discord_bot_token
```

**3. Create `docker-compose.yml`:**

```yaml
services:
  bot:
    container_name: beatdock
    image: ghcr.io/albertgmz/beatdock:latest
    depends_on:
      lavalink:
        condition: service_healthy
    networks:
      - beatdock-network
    env_file: .env

  lavalink:
    container_name: beatdock-lavalink
    image: ghcr.io/lavalink-devs/lavalink:4
    networks:
      - beatdock-network
    volumes:
      - ./application.yml:/opt/Lavalink/application.yml:ro
    environment:
      - LAVALINK_PASSWORD=${LAVALINK_PASSWORD:-youshallnotpass}
      - SPOTIFY_ENABLED=${SPOTIFY_ENABLED:-false}
      - SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID:-}
      - SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET:-}
    healthcheck:
      test: ["CMD", "/bin/bash", "-c", "echo > /dev/tcp/localhost/2333"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  # Mints the YouTube poToken on your own IP (credential-free). See "YouTube poToken auto-refresh".
  bgutil-provider:
    container_name: beatdock-bgutil
    image: brainicism/bgutil-ytdlp-pot-provider:1.3.2
    init: true
    networks:
      - beatdock-network

  # Pushes a fresh poToken to Lavalink's POST /youtube hot-swap route on a loop.
  pot-refresher:
    container_name: beatdock-pot-refresher
    image: alpine:3
    init: true
    depends_on:
      lavalink:
        condition: service_healthy
      bgutil-provider:
        condition: service_started
    networks:
      - beatdock-network
    volumes:
      # Long syntax: fail loudly if the script is missing instead of creating a junk dir.
      - type: bind
        source: ./scripts/pot-refresher.sh
        target: /pot-refresher.sh
        read_only: true
        bind:
          create_host_path: false
    environment:
      - LAVALINK_PASSWORD=${LAVALINK_PASSWORD:-youshallnotpass}
      - POT_REFRESH_INTERVAL=${POT_REFRESH_INTERVAL:-1800}
    command: sh -c "apk add --no-cache curl jq >/dev/null && exec sh /pot-refresher.sh"

networks:
  beatdock-network:
    name: beatdock_network
```

**4. Create `application.yml`:**

```yaml
server:
  port: 2333
  address: 0.0.0.0

plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients:
      - MUSIC
      - IOS
      - WEB
      - WEBEMBEDDED
      - ANDROID_VR

lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:f45bbb7aebfcbc1c553769e04af6cd43afa8b7c3"
      snapshot: true
  server:
    password: "${LAVALINK_PASSWORD:youshallnotpass}"
    sources:
      youtube: false
      soundcloud: true
      bandcamp: true
      twitch: true
      vimeo: true
      http: false
      local: false
    bufferDurationMs: 200
    frameBufferDurationMs: 1000
    youtubePlaylistLoadLimit: 3
    playerUpdateInterval: 2
    trackStuckThresholdMs: 5000
    useSeekGhosting: true
    ratelimit:
      retryLimit: 5

logging:
  level:
    root: INFO
    lavalink: INFO
```

**5. Add the poToken refresher script:**

Download [`scripts/pot-refresher.sh`](scripts/pot-refresher.sh) into a `scripts/` folder next to your `docker-compose.yml`. It mints a fresh YouTube poToken and hot-pushes it to Lavalink (see [YouTube poToken auto-refresh](#youtube-potoken-auto-refresh)).

**6. Deploy:**

```bash
docker compose up -d
```

### YouTube poToken auto-refresh

Playing arbitrary (non-music) videos and autoplay/RD-mix recommendations requires YouTube's `WEB` client, which needs a short-lived **poToken**. BeatDock keeps this fully automated and **credential-free** — no Google account, no API key, no manual pasting:

- **`bgutil-provider`** mints a `{poToken, visitorData}` pair on your server's own IP.
- **`pot-refresher`** pushes it to Lavalink's `POST /youtube` hot-swap route (no restart) and re-pushes every `POT_REFRESH_INTERVAL` seconds (default `1800`), covering both token expiry and Lavalink restarts.

Music keeps working through the `MUSIC`/`ANDROID_VR` clients even if the refresher is temporarily down. Age-restricted videos may still be unavailable.

> **Note:** this only applies to the **self-hosted** stack. If BeatDock connects to public Lavalink nodes (no `LAVALINK_HOST` set), tokens are managed by each node's operator, so the `bgutil-provider` and `pot-refresher` services are not used and non-music playback depends on the node.

### Option B: Deploy from Source

```bash
git clone https://github.com/albertgmz/BeatDock.git
cd BeatDock
```

Create `.env` with your credentials (see [`.env.example`](.env.example) for all options):

```env
TOKEN=your_discord_bot_token
```

```bash
docker compose up -d
```

### No Self-Hosted Lavalink Required

BeatDock can run **without a self-hosted Lavalink server**. If `LAVALINK_HOST`, `LAVALINK_PORT`, and `LAVALINK_PASSWORD` are not set, the bot automatically fetches free public Lavalink v4 servers and connects to one. User search queries and track requests are sent to the selected public node. Set `PUBLIC_NODE_HOST_ALLOWLIST` if you only trust specific public Lavalink hosts.

On public nodes the [YouTube poToken auto-refresh](#youtube-potoken-auto-refresh) does not apply: each node manages its own tokens, so whether non-music videos and autoplay mixes play depends on that node's setup.

To use public servers, simply comment out the Lavalink variables in your `.env`:

```env
# LAVALINK_HOST=lavalink
# LAVALINK_PORT=2333
# LAVALINK_PASSWORD=youshallnotpass
```

## Commands

| Command | Description |
|---------|-------------|
| `/play <query> [next]` | Play a song (optionally add to front of queue) |
| `/search <query>` | Search and select tracks |
| `/pause` | Pause/resume |
| `/skip` | Skip track |
| `/back` | Previous track |
| `/stop` | Stop and disconnect |
| `/queue` | Show queue |
| `/shuffle` | Shuffle queue |
| `/autoplay` | Toggle autoplay mode |
| `/loop` | Toggle loop mode |
| `/clear` | Clear queue |
| `/volume <1-100>` | Set volume |
| `/lyrics` | Show lyrics for the current song |
| `/filter` | Apply audio effects and EQ presets |
| `/nowplaying` | Current track info |
| `/invite` | Get bot invite link |
| `/about` | Bot info |

## Configuration

All configuration is done through the `.env` file. Only `TOKEN` is required.

| Variable | Default | Description |
|----------|---------|-------------|
| `TOKEN` | - | Discord bot token (**required**) |
| `SPOTIFY_ENABLED` | `false` | Enable Spotify search support |
| `SPOTIFY_CLIENT_ID` | - | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | - | Spotify app client secret |
| `DEFAULT_LANGUAGE` | `en` | Global bot language for this deployment (`en`, `es`, `tr`, `it`, `pt-BR`) |
| `DEFAULT_VOLUME` | `80` | Default playback volume (0-100) |
| `AUTOPLAY_DEFAULT` | `false` | Enable autoplay by default when music starts |
| `ALLOWED_ROLES` | - | Comma-separated role IDs to restrict access |
| `DEFAULT_SEARCH_PLATFORM` | `ytmsearch` | Default search platform for user queries | 
| `LAVALINK_PASSWORD` | `youshallnotpass` | Lavalink server password |
| `PUBLIC_NODE_HOST_ALLOWLIST` | - | Optional comma-separated host or `*.domain` allowlist for public Lavalink fallback |
| `QUEUE_EMPTY_DESTROY_MS` | `30000` | Disconnect after queue empties (ms) |
| `EMPTY_CHANNEL_DESTROY_MS` | `60000` | Disconnect from empty channel (ms) |

## Managing the Bot

```bash
docker compose logs -f                              # View logs
docker compose restart                              # Restart
docker compose down                                 # Stop
docker compose pull && docker compose up -d --force-recreate   # Update
```

`--force-recreate` is required, not optional: `application.yml` is bind-mounted as a single
file, and Docker binds single files by inode. `docker compose restart` reuses the container,
and a plain `docker compose up -d` only recreates services whose image or compose config
changed - so neither picks up an edited `application.yml`, and Lavalink keeps serving the old
one indefinitely.

On **Portainer**, use **Pull and redeploy** with **Re-pull image and redeploy** enabled; that
is the only stack action that recreates every container and remounts the bind against the
freshly cloned repository. If you use GitOps auto-updates, enable **Force redeployment** too,
otherwise config-only changes will never reach the container.

## Troubleshooting

### All YouTube tracks fail to play

YouTube periodically blocks the clients Lavalink uses. Check which clients loaded and whether
they are being blocked:

```bash
docker compose logs lavalink | grep -i "YouTube source initialised with clients"
docker compose logs lavalink | grep -iE "AllClientsFailedException|Sign in to confirm|requires login"
```

If the client list does not match [`application.yml`](application.yml), the container is still
running an old config - recreate it (see [Managing the Bot](#managing-the-bot)):

```bash
docker compose up -d --force-recreate lavalink
```

Note that `MUSIC` initialises under the name `WEB_REMIX`; that is expected, not drift.

To keep the bot usable while waiting on an upstream fix, switch the default source to
SoundCloud in `.env` and restart the bot:

```env
DEFAULT_SEARCH_PLATFORM=scsearch
```

```bash
docker compose restart bot
```

Autoplay is YouTube-only and stays idle while SoundCloud is the default source.

### A video plays an English AI dub instead of its original audio

YouTube attaches auto-dubbed audio tracks to some spoken videos (podcasts, vlogs, Shorts) and
marks the track in the requester's language as the default. Lavalink's `youtube-plugin` sends no
language, so YouTube picks English, and the plugin only ever plays the default track. Music is
not affected. The bug is upstream, in `youtube-plugin`; until a fix is released there, you can
run a patched build. See [#160](https://github.com/albertgmz/BeatDock/issues/160) for the root
cause and the patch, which makes the plugin prefer the track YouTube labels "original".

1. Build the patched plugin with JDK 17 or 21 (the project's Gradle 8.10 does not run on newer
   JDKs). Save the diff
   from #160 as `dub.patch`, then:

   ```bash
   git clone https://github.com/lavalink-devs/youtube-source.git
   cd youtube-source
   git checkout f45bbb7aebfcbc1c553769e04af6cd43afa8b7c3
   git apply ../dub.patch
   ./gradlew :plugin:jar
   ```

   Leave the patch uncommitted: the jar then reports the pinned version, and the startup plugin
   check stays quiet.

2. Put `plugin/build/libs/youtube-plugin-f45bbb7aebfcbc1c553769e04af6cd43afa8b7c3.jar` in a
   `lavalink-plugins/` folder next to `docker-compose.yml`, together with the stock
   [`lavasrc-plugin-4.8.1.jar`](https://maven.lavalink.dev/releases/com/github/topi314/lavasrc/lavasrc-plugin/4.8.1/lavasrc-plugin-4.8.1.jar)
   (SHA-1 `f60d5c01da5b91bf1028c3d5e1a665c24f2ebfc6`). The folder and jars must be readable by
   the container's non-root user (default `755`/`644` permissions are fine).

3. In `application.yml`, delete the whole `lavalink.plugins:` block so Lavalink uses the jars in
   the folder as they are. Otherwise, when a later BeatDock release bumps the pin, Lavalink tries
   to replace the patched jar: on the read-only mount below it fails to start.

4. Mount the whole folder, read-only, on the `lavalink` service. With the plugins block gone,
   Lavalink downloads nothing, so `lavasrc` has to be in the folder too.

   ```yaml
       volumes:
         - ./application.yml:/opt/Lavalink/application.yml:ro
         - ./lavalink-plugins:/opt/Lavalink/plugins:ro
   ```

5. Recreate Lavalink (see [Managing the Bot](#managing-the-bot)). On Portainer, use an absolute
   host path for the plugins folder instead of `./lavalink-plugins`. If the stack deploys from
   this repository, make the edits from steps 3 and 4 in a fork and deploy from that, since
   **Pull and redeploy** replaces local edits with the repository's files.

Undo these steps once a `youtube-plugin` release carries the fix, since the manual setup also
opts you out of the plugin pins that future BeatDock releases ship.

### Audio not working on Raspberry Pi

Raspberry Pi 5 (Debian 13) may use a 16KB memory page size, which is incompatible with Lavalink's DAVE encryption library. Check with:

```bash
getconf PAGE_SIZE
```

If the result is not `4096`, add `kernel=kernel8.img` under the `[all]` section in `/boot/firmware/config.txt`, then reboot and restart the containers. See [#109](https://github.com/albertgmz/BeatDock/issues/109) for details.

## Built With

- [discord.js](https://discord.js.org/) - Discord API client
- [Lavalink](https://github.com/lavalink-devs/Lavalink) - Audio player server
- [lavalink-client](https://github.com/Tomato6966/lavalink-client) - Lavalink client library
- [Docker](https://www.docker.com/) - Containerized deployment
- [Node.js](https://nodejs.org/) 22+ - Runtime

## Contributing

Contributions are welcome. Bug fixes, new features, translations, docs - all good. Check the guide below to get started.

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for setup instructions and guidelines.

## Links

- [Website](https://albertgmz.github.io/BeatDock)
- [Issues](https://github.com/albertgmz/BeatDock/issues)
- [Changelog](CHANGELOG.md)

## License

[Apache-2.0](LICENSE)
