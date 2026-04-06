# Configuration Examples

This directory contains example configuration files for vbt.

## Files

### Basic Examples

- **[vbt.config.json](vbt.config.json)** - Default configuration with all options
- **[vbt.config.minimal.json](vbt.config.minimal.json)** - Minimal configuration example
- **[vbt.config.js](vbt.config.js)** - JavaScript configuration with comments

### Advanced Examples

- **[vbt.config.full.json](vbt.config.full.json)** - Full-featured configuration for production use
- **[package.json](package.json)** - Configuration embedded in package.json

## Usage

### Copy a Configuration File

```bash
# Copy the minimal config
cp examples/vbt.config.minimal.json ./vbt.config.json

# Or the full config
cp examples/vbt.config.full.json ./vbt.config.json

# Or the JS config
cp examples/vbt.config.js ./vbt.config.js
```

### Using package.json Configuration

Add the `vbt` key to your package.json:

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "vbt": {
    "commitMessage": "chore: release v{{version}}",
    "push": true
  }
}
```

## Configuration Scenarios

### Scenario 1: Basic Local Development

No configuration file needed. Just run:

```bash
vbt patch
```

This uses all defaults (commit + tag, no push).

### Scenario 2: Automated CI/CD Release

Use [vbt.config.full.json](vbt.config.full.json):

```json
{
  "preBump": "npm run lint && npm test && npm run build",
  "push": true,
  "postBump": "npm publish"
}
```

### Scenario 3: Manual Release without Git

```json
{
  "commitMessage": false,
  "tag": false
}
```

This only updates package.json and marked files without git operations.
Note: setting `commitMessage` to `false` automatically disables `tag` and `push`.

### Scenario 4: Changelog + Lock File

```json
{
  "commitFiles": ["CHANGELOG.md", "package-lock.json"],
  "push": true
}
```

This commits package.json, CHANGELOG.md, and package-lock.json together.

### Scenario 5: Custom Tag Format

```json
{
  "tag": "release-{{version}}",
  "tagMessage": "Release {{version}}"
}
```

Creates tags like `release-1.2.3` instead of `v1.2.3`.

### Scenario 6: Lightweight Tags

```json
{
  "tagMessage": false
}
```

Creates lightweight git tags instead of annotated ones.

## Testing Configurations

Always test your configuration with dry run first:

```bash
vbt patch --dry-run
```

This shows what would happen without making any changes.

## Common Patterns

### Pattern 1: Pre-release Workflow

```json
{
  "push": true,
  "commitMessage": "chore: {{version}} [skip ci]"
}
```

Use with:
```bash
npm run vbt:alpha  # 1.0.0 -> 1.0.1-alpha.0
npm run vbt:beta   # 1.0.1-alpha.0 -> 1.0.1-beta.0
npm run vbt:rc     # 1.0.1-beta.0 -> 1.0.1-rc.0
npm run vbt:patch  # 1.0.1-rc.0 -> 1.0.1
```

### Pattern 2: Multi-package Monorepo

For individual packages in a monorepo, run vbt from each package directory (where its `package.json` lives):

```json
{
  "tag": "my-package-v{{version}}",
  "commitMessage": "chore(my-package): release v{{version}}"
}
```

### Pattern 3: Documentation Updates

```json
{
  "commitFiles": ["README.md"],
  "commitMessage": "docs: update for v{{version}}"
}
```

## Tips

1. Start with minimal configuration and add options as needed
2. Use `--dry-run` to test configurations
3. Use `--verbose` to debug issues
4. Keep sensitive operations (like `npm publish`) in post-bump hooks
5. Add `[skip ci]` to commit messages if you don't want CI to run
6. Unknown config keys will cause an error — check for typos

## More Information

See the main [README.md](../README.md) for complete documentation.
