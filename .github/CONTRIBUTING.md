# Contributing to BeatDock

Thanks for taking the time to contribute! Here are the basics to get you started.

## Getting started

```bash
# Fork the repo then clone your fork
git clone https://github.com/<your-username>/BeatDock.git
cd BeatDock
npm install
```

Copy `.env.example` to `.env` and fill in your Discord bot token. See the [README](../README.md#configuration) for all available options.

## Available scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the bot |
| `npm run docker:build` | Build the Docker image locally |
| `npm run docker:up` | Start services with Docker Compose |
| `npm run docker:down` | Stop services |
| `npm run docker:logs` | Tail container logs |

## Pull-request workflow

1. Create a topic branch: `git checkout -b my-fix`.
2. Make your changes and test manually.
3. Commit with a clear message (see below).
4. Push and open a PR against `main`.
5. Fill out the PR template and link any related Issue.

## Commit style

Use the [Conventional Commits](https://www.conventionalcommits.org) standard:

```
feat(player): add seek command
fix(search): handle empty results gracefully
docs: update configuration table
chore: bump Node version in Dockerfile
```

## Project structure

```
src/
  commands/      Slash command definitions
  events/        Discord event handlers
  handlers/      Dynamic module loaders
  interactions/  Component interaction handlers (buttons, menus)
  utils/         Shared utilities and business logic
  index.js       Application entry point
locales/         Translation files (en, es, tr, it)
docs/            GitHub Pages website
```

## Need help?

Open an [Issue](https://github.com/albertgmz/BeatDock/issues), happy to help.
