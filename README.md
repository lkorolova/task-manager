# Task Manager API

A REST API for managing tasks, built with Node.js and no frameworks.

## Requirements

- Node.js v20+

## Setup

```bash
# Install dependencies (none required — built on Node.js core modules only)
git clone <repo-url>
cd task-manager

# Start the server
npm start
```

The server listens on `http://localhost:3000` by default. Set the `PORT` environment variable to use a different port:

```bash
PORT=8080 npm start
```

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the server with `--watch` (auto-restart on file change) |
| `npm run dev` | Same as `start` |

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
node cli.js list                        # List all tasks
node cli.js add "Task title"            # Create a task
node cli.js delete <id>                 # Delete a task by ID
node cli.js export <filename>           # Download CSV export to a local file
```

## Utilities

```bash
node utils/copy-file.js <src> <dest>    # Copy a file using streams
```

## Project Structure

```
src/
  index.js              # Entry point: audit log + server bootstrap
  server.js             # HTTP server creation + request dispatch
  router.js             # Route map, matchRoute, getAllowedMethods
  handlers/
    route-handlers.js   # One named function per route
  services/
    task.service.js     # tasks array, loadTasks, saveTasks
  events/
    task-event-bus.js   # Custom EventEmitter subclass + singleton
  utils/
    logger.js           # info / warn / error with timestamps
    id-generator.js     # generateId() via crypto.randomUUID()
    http.js             # sendJson, parseJsonBody
    csv.js              # parseCsvLine, escapeCsv, CSV_COLUMNS
data/                   # Created locally on — not committed to the repo
  tasks.json            # Persisted tasks
  audit.log             # Append-only event log
cli.js                  # CLI tool
utils/
  copy-file.js          # Stream-based file copy utility
```

## Data Persistence

Tasks are persisted to `data/tasks.json` on every write. The file is loaded into memory on startup.

All task events (`task:created`, `task:updated`, `task:deleted`) are appended to `data/audit.log` as JSON lines.
