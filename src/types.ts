/**
 * Release types supported by semver
 */
export const RELEASE_TYPES = [
  'major',
  'premajor',
  'minor',
  'preminor',
  'patch',
  'prepatch',
  'prerelease',
] as const

export type ReleaseType = (typeof RELEASE_TYPES)[number]

/**
 * A file entry for version replacement.
 * - string: marker-based replacement (scan for marker comments)
 * - object with jsonPath: JSON path-based replacement (dot-notation path to version value)
 */
export type FileEntry =
  | string
  | {
      /** File path relative to project root */
      path: string
      /** Dot-notation path to the version value in the JSON file (e.g. "version", "metadata.app.version") */
      jsonPath: string
    }

/**
 * Configuration options for vbt
 */
export interface Config {
  /**
   * Whether to check if working directory is clean before bumping
   * @default true
   */
  requireCleanWorkingDirectory?: boolean

  /**
   * Command to run before bumping (e.g., "npm test"). false to skip.
   * @default false
   */
  preBump?: string | false

  /**
   * Path to manifest file to update (relative to project root).
   * Supported: package.json, composer.json, deno.json, deno.jsonc, jsr.json, jsr.jsonc,
   * Cargo.toml, pyproject.toml, pubspec.yaml, vbt.config.json.
   * @default "./package.json"
   */
  manifest?: string

  /**
   * @deprecated Use `manifest` instead.
   */
  packageJson?: string

  /**
   * Files for version replacement. Each entry can be:
   * - A string: scan file for marker comments (existing behavior)
   * - An object with `path` and `jsonPath`: replace version at a JSON dot-notation path
   * @default []
   */
  files?: FileEntry[]

  /**
   * Marker string to identify lines for version replacement.
   * @default "vbt-version"
   */
  marker?: string

  /**
   * Git commit message template (use {{version}} placeholder), or false to skip commit.
   * @default "chore: bump version to v{{version}}"
   */
  commitMessage?: string | false

  /**
   * Additional files to stage for commit (beyond manifest and marker-replaced files).
   * @default []
   */
  commitFiles?: string[]

  /**
   * Git tag name template (use {{version}} placeholder), or false to skip tag.
   * @default "v{{version}}"
   */
  tag?: string | false

  /**
   * Git tag message template for annotated tag, or false for lightweight tag.
   * @default "chore: release v{{version}}"
   */
  tagMessage?: string | false

  /**
   * Push commits and tags to origin after tagging.
   * @default false
   */
  push?: boolean

  /**
   * Command to run after version replacement but before git commit.
   * Useful for formatting, generating files, or syncing lockfiles that need to be included in the commit.
   * Supports {{version}} and {{oldVersion}} template placeholders.
   * false to skip.
   * @default false
   */
  postVerRepl?: string | false

  /**
   * Command to run after bumping (e.g., "npm publish"). false to skip.
   * @default false
   */
  postBump?: string | false

  /**
   * Whether to show verbose output
   * @default false
   */
  verbose?: boolean

  /**
   * Whether to perform a dry run (no actual changes)
   * @default false
   */
  dryRun?: boolean
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Omit<Config, 'packageJson'>> = {
  requireCleanWorkingDirectory: true,
  preBump: false,
  manifest: './package.json',
  files: [],
  marker: 'vbt-version',
  commitMessage: 'chore: bump version to v{{version}}',
  commitFiles: [],
  tag: 'v{{version}}',
  tagMessage: 'chore: release v{{version}}',
  push: false,
  postVerRepl: false,
  postBump: false,
  verbose: false,
  dryRun: false,
}

export type ResolvedConfig = Required<Omit<Config, 'packageJson'>>
