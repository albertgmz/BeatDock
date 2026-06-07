# BeatDock

A Discord music bot powered by Lavalink. Simple to deploy, easy to use.

[![License](https://img.shields.io/github/license/lazaroagomez/BeatDock)](LICENSE)
[![Version](https://img.shields.io/github/v/release/lazaroagomez/BeatDock?label=version)](https://github.com/lazaroagomez/BeatDock/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://github.com/lazaroagomez/BeatDock/pkgs/container/beatdock)
[![Last Commit](https://img.shields.io/github/last-commit/lazaroagomez/BeatDock)](https://github.com/lazaroagomez/BeatDock/commits/main)
[![Issues](https://img.shields.io/github/issues/lazaroagomez/BeatDock)](https://github.com/lazaroagomez/BeatDock/issues)
[![CI](https://img.shields.io/github/actions/workflow/status/lazaroagomez/BeatDock/ci.yml?label=CI)](https://github.com/lazaroagomez/BeatDock/actions/workflows/ci.yml)
[![Security](https://img.shields.io/github/actions/workflow/status/lazaroagomez/BeatDock/security.yml?label=security)](https://github.com/lazaroagomez/BeatDock/actions/workflows/security.yml)
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
    image: ghcr.io/lazaroagomez/beatdock:latest
    depends_on:
      lavalink:
        condition: service_healthy
    networks:
      - beatdock-network
    env_file: .env

  lavalink:
    container_name: beatdock-lavalink
    image: ghcr.io/lavalink-devs/lavalink:4
    ports:
      - "2333:2333"
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
      - WEB
      - ANDROID_VR

lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.16.0"
      snapshot: false
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

**5. Deploy:**

```bash
docker compose up -d
```

### Option B: Deploy from Source

```bash
git clone https://github.com/lazaroagomez/BeatDock.git
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
docker compose pull && docker compose up -d          # Update
```

## Troubleshooting

### Audio not working on Raspberry Pi

Raspberry Pi 5 (Debian 13) may use a 16KB memory page size, which is incompatible with Lavalink's DAVE encryption library. Check with:

```bash
getconf PAGE_SIZE
```

If the result is not `4096`, add `kernel=kernel8.img` under the `[all]` section in `/boot/firmware/config.txt`, then reboot and restart the containers. See [#109](https://github.com/lazaroagomez/BeatDock/issues/109) for details.

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

- [Website](https://lazaroagomez.github.io/BeatDock)
- [Issues](https://github.com/lazaroagomez/BeatDock/issues)
- [Changelog](CHANGELOG.md)

## License

[Apache-2.0](LICENSE)
