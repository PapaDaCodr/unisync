# package-sync

**Use any package manager. One lock file stays in charge.**

package-sync lets every developer on a team use their preferred package manager (npm, yarn, pnpm, or bun) while keeping a single canonical lock file in the git repository. No conflicts, no drift, no compromises.

## The Problem

Teams fight over package managers. Someone runs `npm install` in a yarn project and suddenly there's a `package-lock.json` alongside `yarn.lock`. Lock files conflict, CI breaks, and everyone's frustrated.

The naive fix — "just use the same manager" — ignores that developers have legitimate reasons for their choices: pnpm's disk efficiency, bun's speed, yarn's workspaces, npm's ubiquity.

## The Solution

package-sync works like how git handles line endings — transparently.

```
        ┌─────────── Git Repo ───────────┐
        │  yarn.lock  (canonical)        │
        │  package.json (pinned)         │
        └────────────┬──────────────────┘
                     │
          ┌──────────┼──────────┐
          │ pull     │ pull     │ pull
          ▼          ▼          ▼
     Dev A (bun)  Dev B (npm)  Dev C (pnpm)
     bun.lockb    package-     pnpm-lock.yaml
     (local,      lock.json    (local,
      gitignored) (local,       gitignored)
                   gitignored)
          │          │          │
          │ commit   │ commit   │ commit
          ▼          ▼          ▼
        ┌─────────── Git Repo ───────────┐
        │  yarn.lock  (updated)          │
        └────────────────────────────────┘
```

- **On commit**: git hooks pin versions in `package.json`, walk `node_modules`, and regenerate the canonical lock file
- **On pull**: git hooks detect if the canonical lock changed and run the developer's preferred manager's `install`
- **Each developer gets full native benefits** of their chosen manager — speed, disk layout, resolution strategy — while the project stays consistent

## Quick Start

### Project Owner (one-time setup)

```bash
npx package-sync init
```

This will:
1. Detect your existing lock file (or ask which manager to use)
2. Create `.psyncrc.json` with the canonical manager
3. Add non-canonical lock files to `.gitignore`
4. Install git hooks (pre-commit, post-merge, post-checkout)

### Collaborators

```bash
npx package-sync setup
```

This will:
1. Read the project's `.psyncrc.json`
2. Ask which package manager you prefer
3. Save your preference locally (gitignored)
4. Install git hooks
5. Run your preferred manager's `install`

After that, just work normally:

```bash
# You use bun, the project's canonical is yarn — doesn't matter
bun add express
git commit -m "add express"   # hook regenerates yarn.lock automatically
git pull                       # hook runs bun install if yarn.lock changed
```

## Commands

| Command | Description |
|---------|-------------|
| `psync init` | Set up canonical manager for the project (project owner) |
| `psync setup` | Configure your preferred manager (collaborators) |
| `psync detect` | Show current configuration and detected lock files |
| `psync sync` | Manually pin versions + regenerate canonical lock |
| `psync install` | Run your preferred manager's install |
| `psync hooks install` | Reinstall git hooks |
| `psync hooks uninstall` | Remove git hooks |

## Architecture

### How It Works (Detailed)

```
Developer runs: bun add express
        │
        │  (bun runs natively — full speed, native node_modules layout)
        │
        ▼
Developer runs: git commit
        │
        ▼
pre-commit hook fires
        │
        ├── 1. Pin versions in package.json
        │      "express": "^4.21.0"  →  "express": "4.21.0"
        │
        ├── 2. Walk node_modules/
        │      Read each package's package.json for:
        │        - name, version
        │        - _resolved (download URL)
        │        - _integrity (checksum)
        │        - dependencies
        │
        ├── 3. Generate canonical lock file (e.g. yarn.lock)
        │      Built from node_modules data — no yarn CLI needed
        │
        └── 4. Stage package.json + yarn.lock
              (commit proceeds with synced files)
```

### Version Pinning

package-sync strips range prefixes (`^`, `~`) from `package.json` before committing. This ensures every package manager resolves to the exact same version:

```json
// Before (what bun/npm/yarn writes)
"express": "^4.21.0"

// After (what gets committed)
"express": "4.21.0"
```

This eliminates version drift across managers entirely.

### Lightweight Lock File Generation

package-sync generates canonical lock files **without needing that manager installed**. It reads the data directly from `node_modules/*/package.json`, where package managers store `_resolved` and `_integrity` fields during install.

Supported canonical formats:
- `package-lock.json` (npm, lockfileVersion 3)
- `yarn.lock` (yarn v1)
- `pnpm-lock.yaml` (pnpm, lockfileVersion 9)
- `bun.lock` (bun, text-based JSON)

### Project Structure

```
src/
├── cli.ts              # CLI entry point (init, setup, detect, sync, install)
├── config.ts           # .psyncrc.json + .psyncrc.local.json management
├── detector.ts         # Lock file detection + package manager identification
├── executor.ts         # Spawn package manager commands
├── hooks.ts            # Git hook installation/removal
├── pinner.ts           # Strip ^/~ from package.json versions
├── sync.ts             # Orchestrator: resolve → generate → write
├── index.ts            # Public API exports
└── lockfile/
    ├── types.ts        # ResolvedPackage, DependencyGraph interfaces
    ├── resolver.ts     # Walk node_modules, extract installed package data
    ├── npm.ts          # package-lock.json generator + parser
    ├── yarn.ts         # yarn.lock generator + parser
    ├── pnpm.ts         # pnpm-lock.yaml generator + parser
    └── bun.ts          # bun.lock generator + parser
```

### Configuration Files

**`.psyncrc.json`** — committed to git (project-wide):
```json
{
  "canonicalManager": "yarn"
}
```

**`.psyncrc.local.json`** — gitignored (per-developer):
```json
{
  "preferredManager": "bun"
}
```

### Git Hooks

package-sync installs three hooks. They append to existing hooks — compatible with husky, lint-staged, etc.

| Hook | Trigger | Action |
|------|---------|--------|
| `pre-commit` | `git commit` | Pin versions + regenerate canonical lock |
| `post-merge` | `git pull` | Run preferred manager's install if lock changed |
| `post-checkout` | `git checkout` (branch switch) | Same as post-merge |

## Design Decisions

### Why not translate commands?

The first approach was to intercept `npm install express` and convert it to `yarn add express`. This is simpler but **defeats the purpose** — the developer chose npm for a reason (speed, disk layout, familiarity). Translating commands strips away those benefits.

package-sync lets every manager run natively. Only the lock file is synchronized.

### Why pin versions?

If `package.json` says `"express": "^4.21.0"`, npm might resolve to `4.21.0` while yarn resolves to `4.21.1` (if a patch was released between installs). Pinning to exact versions (`"4.21.0"`) eliminates this class of drift entirely.

### Why generate lock files without the CLI?

Requiring every developer to have the canonical manager installed defeats the purpose. A pnpm user shouldn't need yarn installed just because the project uses `yarn.lock` as canonical. package-sync reads the universal data from `node_modules` and writes the lock format directly.

### Zero runtime dependencies

package-sync has **zero runtime dependencies** — only TypeScript and `@types/node` as dev dependencies. This is intentional:
- Smaller install footprint
- No supply chain risk from transitive dependencies
- Higher scores on security auditing tools (Socket.dev, Snyk)
- Lock file parsing uses built-in Node.js modules (fs, path, child_process)

## Socket.dev Security

This project targets a 98%+ Socket.dev score. The `socket.yml` policy enforces:

- **Blocked**: malware, telemetry, hidden code, typosquatting, network access, CVEs, unclear licenses
- **Warned**: install scripts, non-permissive licenses

```yaml
# socket.yml
version: 2
issueRules:
  malware: error
  telemetry: error
  networkAccess: error
  hiddenCode: error
  typosquat: error
  cve: error
```

## Requirements

- Node.js >= 18.0.0
- Git (for hooks)

## License

MIT
