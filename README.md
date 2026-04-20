# Task Manager API

A REST API for managing tasks, built with Node.js and TypeScript — no frameworks.

## Requirements

- Node.js v20+

## Setup

```bash
git clone <repo-url>
cd task-manager
npm install

# Development (auto-restart on file change)
npm run dev

# Production (compile + run)
npm run build
npm start
```

The server listens on `http://localhost:3000` by default. Set the `PORT` environment variable to use a different port:

```bash
PORT=8080 npm run dev
```

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with `tsx watch` (auto-restart on file change) |
| `npm start` | Run compiled JS from `dist/` |
| `npm run build` | Compile TypeScript with `tsc` |
| `npm run cli` | Run CLI tool via `tsx` |

## API Endpoints

### Tasks

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `GET` | `/tasks` | List all tasks | `200` |
| `POST` | `/tasks` | Create a task | `201` |
| `GET` | `/tasks/:id` | Get a task by ID | `200` / `404` |
| `PUT` | `/tasks/:id` | Update a task by ID | `200` / `404` |
| `DELETE` | `/tasks/:id` | Delete a task by ID | `204` / `404` |
| `GET` | `/tasks/export` | Download all tasks as CSV | `200` |
| `POST` | `/tasks/import` | Import tasks from CSV body | `201` |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check — returns uptime |
| `GET` | `/info` | Node.js version, platform, memory usage |

## Task Schema

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "todo | pending",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

## CLI

```bash
npx tsx cli.ts list                        # List all tasks
npx tsx cli.ts add "Task title"            # Create a task
npx tsx cli.ts delete <id>                 # Delete a task by ID
npx tsx cli.ts export <filename>           # Download CSV export to a local file
```

## Utilities

```bash
npx tsx utils/copy-file.ts <src> <dest>    # Copy a file using streams
```

## Project Structure

```
src/
  index.ts              # Entry point: audit log + server bootstrap
  server.ts             # HTTP server creation + request dispatch
  router.ts             # Route map, matchRoute, getAllowedMethods
  handlers/
    route-handlers.ts   # One named function per route
  services/
    task.service.ts     # tasks array, loadTasks, saveTasks
  events/
    task-event-bus.ts   # Typed EventEmitter subclass + singleton
  types/
    task.ts             # Task interface, RouteHandler, TaskService types
  utils/
    logger.ts           # info / warn / error with timestamps
    id-generator.ts     # generateId() via crypto.randomUUID()
    http.ts             # sendJson, parseJsonBody
    csv.ts              # parseCsvLine, escapeCsv, CSV_COLUMNS
data/                   # Created locally — not committed to the repo
  tasks.json            # Persisted tasks
  audit.log             # Append-only event log
cli.ts                  # CLI tool
utils/
  copy-file.ts          # Stream-based file copy utility
tsconfig.json           # TypeScript configuration
```

## Data Persistence

Tasks are persisted to `data/tasks.json` on every write. The file is loaded into memory on startup.

All task events (`task:created`, `task:updated`, `task:deleted`) are appended to `data/audit.log` as JSON lines.
