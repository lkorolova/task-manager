# Task Manager API

A REST API for managing tasks, built with Node.js, TypeScript, Express, and PostgreSQL.

## Requirements

- Node.js v20+
- PostgreSQL (any recent version)

## Setup

```bash
git clone <repo-url>
cd task-manager
npm install
```

### Database setup

PostgreSQL must be installed and running before starting the app.

**1. Start PostgreSQL** (Homebrew on macOS):

```bash
brew services start postgresql
```

**2. Create the database:**

```bash
psql -U <your_macos_username> -d postgres -c "CREATE DATABASE task_manager;"
```

Replace `<your_macos_username>` with the output of `whoami`. On macOS with Homebrew, the default superuser matches your system username.

**3. Create a `.env` file** in the project root:

```
DATABASE_URL=postgresql://<your_macos_username>@localhost:5432/task_manager
```

**4. Run migrations** to create the tables:

```bash
npm run migrate
```

### Start the server

```bash
# Development (auto-restart on file change)
npm run dev

# Production (compile + run)
npm run build
npm start
```

The server listens on `http://localhost:3000` by default. Set the `PORT` environment variable to use a different port — either inline or in `.env`:

```bash
PORT=8080 npm run dev
```

```
# .env
PORT=8080
```

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with `tsx watch` (auto-restart on file change) |
| `npm start` | Run compiled JS from `dist/` |
| `npm run build` | Compile TypeScript with `tsc` |
| `npm run typecheck` | Run TypeScript checks without emitting files |
| `npm run migrate` | Run SQL migrations from `migrations/` |
| `npm run cli` | Run CLI tool via `tsx` |

## API Endpoints

### Tasks

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `GET` | `/tasks` | List tasks (supports `?page=` and `?limit=`) | `200` |
| `POST` | `/tasks` | Create a task | `201` |
| `GET` | `/tasks/:id` | Get a task by ID | `200` / `404` |
| `PUT` | `/tasks/:id` | Update a task by ID | `200` / `404` |
| `DELETE` | `/tasks/:id` | Delete a task by ID | `204` / `404` |
| `GET` | `/tasks/export` | Download all tasks as CSV | `200` |
| `POST` | `/tasks/import` | Import tasks from CSV body | `201` / `415` |
| `POST` | `/tasks/:id/attachments` | Upload attachment (`multipart/form-data`, `file`) | `201` / `400` / `404` / `415` |
| `GET` | `/tasks/:id/attachments/:filename` | Download task attachment | `200` / `400` / `404` |

### Comments

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `GET` | `/tasks/:id/comments` | List comments for a task | `200` / `404` |
| `POST` | `/tasks/:id/comments` | Create comment for a task | `201` / `404` |

### Users

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `GET` | `/users/:id/tasks` | List tasks for a specific user | `200` |

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
  "status": "todo | in-progress | done",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

## Comment Schema

```json
{
  "id": "uuid",
  "taskId": "uuid",
  "body": "string",
  "createdAt": "ISO 8601"
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
node utils/copy-file.js <src> <dest>    # Copy a file using streams
```

## Project Structure

```
src/
  index.ts              # Entry point: audit log + server bootstrap
  app.ts                # Express app + middleware setup
  server.ts             # HTTP server creation
  router.ts             # Allowed-method detection for 405 responses
  db/
    pg-database.ts      # PostgreSQL connection pool
    migrate.ts          # SQL migration runner
  routes/
    task.route.ts       # Express route definitions
  handlers/
    route-handlers.ts   # Route handlers and SQL query helpers
  middleware/
    request-id.ts       # Attach request id
    response-time.ts    # Request timing logger
    validate.ts         # Zod-based body validation
    upload.ts           # Multer upload + task existence checks
    error-handler.ts    # Centralized error handler
  validators/
    task.validator.ts   # Zod schemas for task create/update
  events/
    task-event-bus.ts   # Typed EventEmitter subclass + singleton
  types/
    task.ts             # Task interface
    user.ts             # User interface
    comment.ts          # Comment interface
    express.d.ts        # Express Request type augmentation
  utils/
    logger.ts           # info / warn / error with timestamps
    id-generator.ts     # generateId() via crypto.randomUUID()
    csv.ts              # parseCsvLine, escapeCsv, CSV_COLUMNS
data/                   # Created locally — not committed to the repo
  audit.log             # Append-only event log
uploads/                # File uploads grouped by task id
cli.ts                  # CLI tool
utils/
  copy-file.js          # Stream-based file copy utility
tsconfig.json           # TypeScript configuration
```

## Data Persistence

Application data is stored in PostgreSQL (`tasks`, `users`, `comments`).

All task events (`task:created`, `task:updated`, `task:deleted`) are appended to `data/audit.log` as JSON lines.
