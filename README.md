# `vbt`: Version Bump Tag

Lightweight CLI to bump version, replace version strings in marked files, and create git commits and tags. Works with any project: Node.js, Rust, Python, PHP, Dart, Deno, and more.

[![npm package](https://img.shields.io/badge/npm%20i%20--g-vbt-blue)](https://www.npmjs.com/package/vbt) [![version number](https://badgen.net/badge/version/2.0.0/yellow)](https://www.npmjs.com/package/vbt?activeTab=versions) [![Actions Status](https://github.com/toolsu/vbt/workflows/Test/badge.svg)](https://github.com/toolsu/vbt/actions) [![License](https://img.shields.io/badge/license-MIT-brightgreen)](https://github.com/toolsu/vbt/blob/main/LICENSE) <!-- vbt-version -->

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

### Manifest File

The manifest file is updated automatically, you don't need to add it to `files` or mark it with a comment.

### Marker

For **additional** files, mark lines with `vbt-version` (or a custom marker via the `marker` config option) to have their version updated:

JavaScript / TypeScript:
```js
const VERSION = "2.0.0"; // vbt-version
```

Markdown / HTML:

```markdown
Current version: 2.0.0 <!-- vbt-version -->
```

TOML:

```toml
version = "2.0.0" # vbt-version
```

Only the **old version** (read from the manifest file) on marked lines is replaced. Unmarked lines and other version-like strings are never touched.

#### Offset syntax

Use `+N` to replace the version N lines below the marker. This is useful for code blocks in markdown, where inline comments would be visible:

````markdown
<!-- vbt-version +2 -->
```bash
npm i -g vbt@2.0.0
```
````

The HTML comment is invisible in rendered markdown, and the version inside the code block gets updated.

### Configure files to scan

```json
{
  "files": ["src/version.ts", "README.md"]
}
```

#### JSON path replacement

For JSON files (where comments aren't supported), use object entries with `jsonPath` to specify a dot-notation path to the version value:

```jsonc
{
  "manifest": "./Cargo.toml",
  "files": [
    "README.md",                                                    // marker-based
    { "path": "package.json", "jsonPath": "version" },              // top-level key
    { "path": "src-tauri/tauri.conf.json", "jsonPath": "version" }, // top-level key
    { "path": "config.json", "jsonPath": "metadata.app.version" }   // nested path
  ]
}
```

The file is parsed as JSON, the value at the dot-notation path is replaced with the new version, and the file is written back with 2-space indentation. The target value must be a string.

## Configuration

Create `vbt.config.json` in your project root, or add a `"vbt"` key to `package.json`. Also supports `vbt.config.js` (`.mjs`, `.cjs`).

```json
{
  "push": true,
  "files": ["README.md"],
  "preBump": "npm run check && npm run test"
}
```

### Path resolution

All file paths (`manifest`, `files`, `commitFiles`, config file paths) are resolved relative to the **project root** (the nearest ancestor directory containing `package.json` or `vbt.config.json`). This means vbt works correctly when invoked from a subdirectory.

### Execution order

1. Check clean working directory (`requireCleanWorkingDirectory`)
2. Run pre-bump check hook (`preBump`)
3. Calculate new version
4. Update manifest file (`manifest`)
5. Replace versions in marked files (`files` + `marker`)
6. Sync lockfile (auto, see below)
7. Run post-version-replacement hook (`postVerRepl`)
8. Git commit (`commitMessage`, `commitFiles`)
9. Git tag (`tag`, `tagMessage`)
10. Git push (`push`)
11. Run post-bump hook (`postBump`)

**Automatic lockfile sync:** When the manifest is `Cargo.toml` and a `Cargo.lock` file exists in the project root, vbt automatically runs `cargo generate-lockfile` to keep `Cargo.lock` in sync after the version bump. The updated `Cargo.lock` is included in the commit. Projects without `Cargo.lock` (e.g., libraries that don't track it) are not affected.

Each step can be independently disabled. Note: disabling commit (`commitMessage: false`) automatically disables tag and push, since a tag without a commit would point to the wrong (pre-bump) commit.

The flow is not fully transactional: if a step fails before commit, vbt attempts to roll back file changes; if `push` or `postBump` fails later, the local commit/tag may already exist. Use `--dry-run` to preview first, and check `git status` / `git diff` to recover.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `requireCleanWorkingDirectory` | `boolean` | `true` | Require clean git working directory |
| `preBump` | `string \| false` | `false` | (Hook) Command to run before bumping |
| `manifest` | `string` | `"./package.json"` | Path to manifest file (see [supported files](#supported-manifest-files)) |
| `files` | `(string \| {path, jsonPath})[]` | `[]` | Files for version replacement (strings: marker-based, objects: JSON path) |
| `marker` | `string` | `"vbt-version"` | Marker string to identify lines for replacement |
| `commitMessage` | `string \| false` | `"chore: bump version to v{{version}}"` | Commit message template, or `false` to skip commit |
| `commitFiles` | `string[]` | `[]` | Additional files to stage for commit |
| `tag` | `string \| false` | `"v{{version}}"` | Tag name template, or `false` to skip tag |
| `tagMessage` | `string \| false` | `"chore: release v{{version}}"` | Annotated tag message, or `false` for lightweight tag |
| `push` | `boolean` | `false` | Push commits and tags to origin |
| `postVerRepl` | `string \| false` | `false` | (Hook) Command to run after version replacement, before commit |
| `postBump` | `string \| false` | `false` | (Hook) Command to run after bumping |
| `verbose` | `boolean` | `false` | Show verbose output |
| `dryRun` | `boolean` | `false` | Dry run without making changes |

Use `{{version}}` in `commitMessage`, `tag`, `tagMessage`, and `postVerRepl` templates. `{{oldVersion}}` is also available for the previous version.

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
| `Cargo.toml` | Rust (supports `[package]` and `[workspace.package]`) |
| `pyproject.toml` | Python (PEP 621 `[project]`) |
| `pubspec.yaml` | Dart / Flutter |
| `vbt.config.json` | Any (standalone) |

For non-Node.js projects, create a `vbt.config.json` with the `manifest` option:

```json
{
  "manifest": "Cargo.toml",
  "push": true,
  "files": ["src/version.rs", "README.md"],
  "preBump": "cargo test"
}
```

## License

MIT
