# `vbt`: Version Bump Tag

A CLI tool to bump versions in `package.json` and any marked files, create git tags, and commit changes.

## Install

```bash
npm install -g vbt
# or
npm install --save-dev vbt
```

## Usage

```bash
vbt patch                 # 1.2.3 -> 1.2.4
vbt minor                 # 1.2.3 -> 1.3.0
vbt major                 # 1.2.3 -> 2.0.0
vbt 1.2.3                 # Set exact version
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

Mark lines in any file with `vbt-version` to have their version updated automatically:

```js
const VERSION = "1.2.3"; // vbt-version
```

```toml
version = "1.2.3" # vbt-version
```

```markdown
Current version: 1.2.3 <!-- vbt-version -->
```

Only the **old version** (read from `package.json`) on marked lines is replaced. Unmarked lines and other version-like strings are never touched.

### Offset syntax

Use `+N` to replace the version N lines below the marker. This is useful for code blocks in markdown, where inline comments would be visible:

```markdown
<!-- vbt-version +2 -->
` `` bash
npm install my-pkg@1.2.3
` ``
```

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
  "files": ["src/version.ts", "README.md"],
  "push": true,
  "preBumpCheck": "npm test",
  "postBumpHook": "npm publish"
}
```

### Execution order

1. Check clean working directory (`requireCleanWorkingDirectory`)
2. Run pre-bump check (`preBumpCheck`)
3. Calculate new version
4. Update `package.json` (`packageJson`)
5. Replace versions in marked files (`files` + `marker`)
6. Git commit (`commitMessage`, `commitFiles`)
7. Git tag (`tag`, `tagMessage`)
8. Git push (`push`)
9. Run post-bump hook (`postBumpHook`)

Each step can be independently disabled.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `requireCleanWorkingDirectory` | `boolean` | `true` | Require clean git working directory |
| `preBumpCheck` | `string \| false` | `false` | Command to run before bumping |
| `packageJson` | `string \| false` | `"./package.json"` | Path to package.json, or `false` to skip update |
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

Use `{{version}}` in `commitMessage`, `tag`, and `tagMessage` templates.

### CLI flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Preview all changes without applying them |
| `--no-commit` | Only update files, skip commit, tag, and push |
| `--no-tag` | Commit but skip tag and push |
| `--no-push` | Commit and tag but skip push |
| `--verbose` | Show detailed output |
| `--config <path>` | Use a custom config file |
| `--help` | Show help message |
| `--version` | Show version number |

## License

MIT
