# `vbt`: Version Bump Tag

Lightweight CLI to bump version, replace version strings in marked files, and create git commits and tags. Works with any project — Node.js, Rust, Python, PHP, Dart, Deno, and more.

[![npm package](https://img.shields.io/badge/npm%20i%20--g-vbt-blue)](https://www.npmjs.com/package/vbt) [![version number](https://img.shields.io/npm/v/vbt)](https://www.npmjs.com/package/vbt?activeTab=versions) [![Actions Status](https://github.com/toolsu/vbt/workflows/Test/badge.svg)](https://github.com/toolsu/vbt/actions) [![License](https://img.shields.io/badge/license-MIT-brightgreen)](https://github.com/toolsu/vbt/blob/main/LICENSE)<!-- vbt-version -->

## Install

Prerequisites: Node.js, git

```bash
npm i -g vbt
# or
npm i --D vbt
```

## Usage

```bash
vbt patch                 # 1.2.3 -> 1.2.4
vbt minor                 # 1.2.3 -> 1.3.0
vbt major                 # 1.2.3 -> 2.0.0
vbt 1.2.3                 # Set exact version
vbt v1.2.3                # Leading "v" is stripped automatically
vbt prerelease alpha      # 1.2.3 -> 1.2.4-alpha.0
vbt prerelease            # 1.2.4-alpha.0 -> 1.2.4-alpha.1
vbt prepatch rc           # 1.2.3 -> 1.2.4-rc.0
vbt premajor beta         # 1.2.3 -> 2.0.0-beta.0
vbt patch --dry-run       # Preview without changes
vbt patch --no-commit     # Only update files, skip all git operations
vbt patch --no-tag        # Commit but skip tag and push
vbt patch --no-push       # Commit and tag but skip push
vbt patch --verbose       # Show detailed output
vbt patch --config x.json # Use custom config file
```

## File Version Replacement

Mark lines in any file with `vbt-version` (or a custom marker via the `marker` config option) to have their version updated automatically:

JavaScript / TypeScript:
```js
const VERSION = "1.1.1"; // vbt-version
```

Markdown / HTML:

```markdown
Current version: 1.1.1 <!-- vbt-version -->
```

TOML:

```toml
version = "1.1.1" # vbt-version
```

Only the **old version** (read from the manifest file) on marked lines is replaced. Unmarked lines and other version-like strings are never touched.

### Offset syntax

Use `+N` to replace the version N lines below the marker. This is useful for code blocks in markdown, where inline comments would be visible:

````markdown
<!-- vbt-version +2 -->
```bash
npm i -g vbt@1.1.1
```
````

The HTML comment is invisible in rendered markdown, and the version inside the code block gets updated.

### Configure files to scan

```json
{
  "files": ["src/version.ts", "Cargo.toml", "README.md"]
}
```

## Configuration

Create `vbt.config.json` in your project root, or add a `"vbt"` key to `package.json`. Also supports `vbt.config.js` (`.mjs`, `.cjs`).

```json
{
  "manifest": "Cargo.toml",
  "files": ["src/version.rs", "README.md"],
  "push": true,
  "preBumpCheck": "cargo test"
}
```

### Path resolution

All file paths (`manifest`, `files`, `commitFiles`, config file paths) are resolved relative to the **project root** (the nearest ancestor directory containing `package.json` or `vbt.config.json`). This means vbt works correctly when invoked from a subdirectory.

### Execution order

1. Check clean working directory (`requireCleanWorkingDirectory`)
2. Run pre-bump check (`preBumpCheck`)
3. Calculate new version
4. Update manifest file (`manifest`)
5. Replace versions in marked files (`files` + `marker`)
6. Git commit (`commitMessage`, `commitFiles`)
7. Git tag (`tag`, `tagMessage`)
8. Git push (`push`)
9. Run post-bump hook (`postBumpHook`)

Each step can be independently disabled. Note: disabling commit (`commitMessage: false`) automatically disables tag and push, since a tag without a commit would point to the wrong (pre-bump) commit.

The flow is not fully transactional: if a step fails before commit, vbt attempts to roll back file changes; if `push` or `postBumpHook` fails later, the local commit/tag may already exist. Use `--dry-run` to preview first, and check `git status` / `git diff` to recover.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `requireCleanWorkingDirectory` | `boolean` | `true` | Require clean git working directory |
| `preBumpCheck` | `string \| false` | `false` | Command to run before bumping |
| `manifest` | `string` | `"./package.json"` | Path to manifest file (see supported files above) |
| `files` | `string[]` | `[]` | Files to scan for marker-based version replacement |
| `marker` | `string` | `"vbt-version"` | Marker string to identify lines for replacement |
| `commitMessage` | `string \| false` | `"chore: bump version to v{{version}}"` | Commit message template, or `false` to skip commit |
| `commitFiles` | `string[]` | `[]` | Additional files to stage for commit |
| `tag` | `string \| false` | `"v{{version}}"` | Tag name template, or `false` to skip tag |
| `tagMessage` | `string \| false` | `"chore: release v{{version}}"` | Annotated tag message, or `false` for lightweight tag |
| `push` | `boolean` | `false` | Push commits and tags to origin |
| `postBumpHook` | `string \| false` | `false` | Command to run after bumping |
| `verbose` | `boolean` | `false` | Show verbose output |
| `dryRun` | `boolean` | `false` | Dry run without making changes |

Use `{{version}}` in `commitMessage`, `tag`, and `tagMessage` templates. `{{oldVersion}}` is also available for the previous version.

Unknown configuration keys and invalid types are rejected with an error.

### CLI flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Preview all changes without applying them |
| `--no-commit` | Only update files, skip commit, tag, and push |
| `--no-tag` | Commit but skip tag and push |
| `--no-push` | Commit and tag but skip push |
| `--verbose` | Show detailed output |
| `--config <path>` | Use a custom config file (also `--config=<path>`) |
| `--help` | Show help message |
| `--version` | Show version number |

Unknown flags and unexpected arguments are rejected with an error.

## Supported Manifest Files

| File | Ecosystem |
|------|-----------|
| `package.json` (default) | Node.js |
| `composer.json` | PHP |
| `deno.json` / `deno.jsonc` | Deno |
| `jsr.json` / `jsr.jsonc` | JSR |
| `Cargo.toml` | Rust |
| `pyproject.toml` | Python (PEP 621 `[project]`) |
| `pubspec.yaml` | Dart / Flutter |
| `vbt.config.json` | Any (standalone) |

For non-Node.js projects, create a `vbt.config.json` with the `manifest` option:

```json
{
  "manifest": "Cargo.toml"
}
```

## License

MIT
