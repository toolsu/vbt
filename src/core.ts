import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { inc, valid } from 'semver-ts'
import { loadConfig, validateConfig } from './config.js'
import { RELEASE_TYPES, type ReleaseType } from './types.js'

const require = createRequire(import.meta.url)
const { version: VERSION } = require('../package.json') as { version: string }

export { VERSION }

/**
 * Generate help text
 */
export function helpText(): string {
  return `
vbt v${VERSION}

A CLI tool to bump versions, update files, create git tags, and commit changes

USAGE:
  vbt <version|release> [identifier] [options]

ARGUMENTS:
  version       Exact version number (e.g., 1.2.3)
  release       Release type: major, minor, patch, premajor, preminor, prepatch, prerelease
  identifier    Pre-release identifier (e.g., alpha, beta, rc) - used with prerelease types

OPTIONS:
  --config <path>     Path to custom config file
  --dry-run          Perform a dry run without making changes
  --no-commit        Skip git commit, tag, and push (only update files)
  --no-tag           Skip git tag and push
  --no-push          Skip git push
  --verbose          Show verbose output
  --help             Show this help message
  --version          Show version number

EXAMPLES:
  vbt patch                 # Bump patch version (1.2.3 -> 1.2.4)
  vbt minor                 # Bump minor version (1.2.3 -> 1.3.0)
  vbt major                 # Bump major version (1.2.3 -> 2.0.0)
  vbt prerelease alpha      # Create alpha prerelease (1.2.3 -> 1.2.4-alpha.0)
  vbt 1.2.3                 # Set version to 1.2.3
  vbt patch --dry-run       # Preview changes without applying them

CONFIGURATION:
  Create a config file in your project root:
  - vbt.config.json
  - vbt.config.js (.mjs, .cjs)
  - Or add "vbt" key to package.json

  See documentation for all available options.
`
}

/**
 * Parse command line arguments
 */
export function parseArgs(args: string[]): {
  versionOrRelease?: string
  identifier?: string
  config?: string
  dryRun: boolean
  verbose: boolean
  noCommit: boolean
  noTag: boolean
  noPush: boolean
  showHelp: boolean
  showVersion: boolean
} {
  const result = {
    versionOrRelease: undefined as string | undefined,
    identifier: undefined as string | undefined,
    config: undefined as string | undefined,
    dryRun: false,
    verbose: false,
    noCommit: false,
    noTag: false,
    noPush: false,
    showHelp: false,
    showVersion: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--help' || arg === '-h') {
      result.showHelp = true
    } else if (arg === '--version' || arg === '-v') {
      result.showVersion = true
    } else if (arg === '--dry-run') {
      result.dryRun = true
    } else if (arg === '--verbose') {
      result.verbose = true
    } else if (arg === '--no-commit') {
      result.noCommit = true
    } else if (arg === '--no-tag') {
      result.noTag = true
    } else if (arg === '--no-push') {
      result.noPush = true
    } else if (arg === '--config') {
      result.config = args[++i]
    } else if (!arg.startsWith('-')) {
      if (!result.versionOrRelease) {
        result.versionOrRelease = arg
      } else if (!result.identifier) {
        result.identifier = arg
      }
    }
  }

  return result
}

/**
 * Check if string is a valid release type
 */
export function isValidReleaseType(release: string): release is ReleaseType {
  return RELEASE_TYPES.includes(release as ReleaseType)
}

/**
 * Replace template placeholders with actual values
 */
export function replaceTemplate(template: string, version: string): string {
  return template.replace(/\{\{version\}\}/g, version)
}

/**
 * Detect indentation used in a JSON file
 */
export function detectIndent(content: string): string | number {
  const lines = content.split('\n')
  for (const line of lines.slice(1)) {
    const match = line.match(/^(\s+)/)
    if (match) {
      return match[1].includes('\t') ? '\t' : match[1].length
    }
  }
  return 2
}

/**
 * Replace version strings on lines containing the marker in specified files.
 * Returns the list of files that were actually modified.
 */
export function replaceVersionInFiles(
  files: string[],
  marker: string,
  oldVersion: string,
  newVersion: string,
  dryRun: boolean,
  verbose: boolean,
): string[] {
  const modifiedFiles: string[] = []

  for (const filePath of files) {
    const absolutePath = resolve(process.cwd(), filePath)
    if (!existsSync(absolutePath)) {
      console.warn(`Warning: File not found: ${filePath}`)
      continue
    }

    const content = readFileSync(absolutePath, 'utf8')
    const lines = content.split('\n')
    let modified = false

    const offsetRegex = new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\+(\\d+)`)

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(marker)) {
        const offsetMatch = lines[i].match(offsetRegex)
        const targetLine = offsetMatch ? i + Number.parseInt(offsetMatch[1], 10) : i

        if (targetLine < lines.length) {
          const newLine = lines[targetLine].replaceAll(oldVersion, newVersion)
          if (newLine !== lines[targetLine]) {
            lines[targetLine] = newLine
            modified = true
          }
        }
      }
    }

    if (modified) {
      if (!dryRun) {
        writeFileSync(absolutePath, lines.join('\n'), 'utf8')
        console.log(`✓ Updated version in ${filePath}`)
      } else {
        console.log(`[DRY RUN] Would update version in ${filePath}`)
      }
      modifiedFiles.push(filePath)
    } else if (verbose) {
      console.log(`No marker matches in ${filePath}`)
    }
  }

  return modifiedFiles
}

/**
 * Execute a git command safely using execFileSync (no shell interpolation)
 */
export function execGit(
  gitArgs: string[],
  description: string,
  dryRun: boolean,
  verbose: boolean,
): void {
  if (verbose || dryRun) {
    console.log(`[${dryRun ? 'DRY RUN' : 'EXEC'}] ${description}`)
    console.log(`  Command: git ${gitArgs.join(' ')}`)
  }

  if (!dryRun) {
    try {
      execFileSync('git', gitArgs, { stdio: verbose ? 'inherit' : 'pipe' })
    } catch (error) {
      throw new Error(`Failed to execute: git ${gitArgs.join(' ')}\n${error}`)
    }
  }
}

/**
 * Execute a shell command (for user-configured hooks)
 */
export function execShell(
  command: string,
  description: string,
  dryRun: boolean,
  verbose: boolean,
): void {
  if (verbose || dryRun) {
    console.log(`[${dryRun ? 'DRY RUN' : 'EXEC'}] ${description}`)
    console.log(`  Command: ${command}`)
  }

  if (!dryRun) {
    try {
      execSync(command, { stdio: verbose ? 'inherit' : 'pipe' })
    } catch (error) {
      throw new Error(`Failed to execute: ${command}\n${error}`)
    }
  }
}

/**
 * Main version bump logic
 */
export async function run(args: string[]): Promise<void> {
  const cliArgs = parseArgs(args)

  if (cliArgs.showHelp) {
    console.log(helpText())
    return
  }

  if (cliArgs.showVersion) {
    console.log(VERSION)
    return
  }

  if (!cliArgs.versionOrRelease) {
    throw new Error(
      'No version number or release type provided.\nRun "vbt --help" for usage information.',
    )
  }

  // Load configuration
  const config = await loadConfig(cliArgs.config, {
    dryRun: cliArgs.dryRun || undefined,
    verbose: cliArgs.verbose || undefined,
    ...(cliArgs.noCommit
      ? { commitMessage: false as const, tag: false as const, push: false }
      : {}),
    ...(cliArgs.noTag ? { tag: false as const, push: false } : {}),
    ...(cliArgs.noPush ? { push: false } : {}),
  })

  validateConfig(config)

  const { verbose, dryRun } = config

  if (verbose) {
    console.log('Configuration:', JSON.stringify(config, null, 2))
  }

  // Check if working directory is clean
  if (config.requireCleanWorkingDirectory && !dryRun) {
    const gitStatus = execFileSync('git', ['status', '--porcelain']).toString()
    if (gitStatus) {
      throw new Error(
        'Working directory is not clean. Please commit or stash changes first.\n' +
          'Use --dry-run to preview changes or set requireCleanWorkingDirectory to false in config.',
      )
    }
  }

  // Run pre-bump check
  if (config.preBumpCheck) {
    console.log('Running pre-bump checks...')
    execShell(config.preBumpCheck, 'Pre-bump check', dryRun, verbose)
    console.log('Pre-bump checks passed.')
  }

  // Resolve package.json path and read current version
  if (!config.packageJson) {
    throw new Error(
      'packageJson is set to false but no other version source is available.\n' +
        'Set packageJson to a valid path to read the current version.',
    )
  }

  const packageJsonPath = resolve(process.cwd(), config.packageJson)
  if (!existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`)
  }

  const packageJsonContent = readFileSync(packageJsonPath, 'utf8')
  const packageJsonData = JSON.parse(packageJsonContent)
  const oldVersion = packageJsonData.version as string

  if (!oldVersion) {
    throw new Error('No version field found in package.json')
  }

  // Calculate new version
  let newVersion: string
  const versionOrRelease = cliArgs.versionOrRelease
  const identifier = cliArgs.identifier

  if (valid(versionOrRelease)) {
    newVersion = versionOrRelease
  } else if (!isValidReleaseType(versionOrRelease)) {
    throw new Error(
      `Invalid version number or release type: ${versionOrRelease}\nValid release types: ${RELEASE_TYPES.join(', ')}`,
    )
  } else {
    const calculatedVersion = identifier
      ? inc(oldVersion, versionOrRelease, identifier)
      : inc(oldVersion, versionOrRelease)

    if (!calculatedVersion) {
      throw new Error(
        'Failed to calculate new version.\nPlease check your version number, release type, and identifier.',
      )
    }
    newVersion = calculatedVersion
  }

  console.log(`Version bump: v${oldVersion} -> v${newVersion}`)

  // Update package.json
  const hasFinalNewline = packageJsonContent.endsWith('\n')
  const indent = detectIndent(packageJsonContent)
  packageJsonData.version = newVersion

  let updatedContent = JSON.stringify(packageJsonData, null, indent)
  if (hasFinalNewline) {
    updatedContent += '\n'
  }

  if (!dryRun) {
    writeFileSync(packageJsonPath, updatedContent, 'utf8')
    console.log(`✓ Updated version in ${config.packageJson}`)
  } else {
    console.log(`[DRY RUN] Would update version in ${config.packageJson}`)
  }

  // Replace version in marked files
  const modifiedFiles = replaceVersionInFiles(
    config.files,
    config.marker,
    oldVersion,
    newVersion,
    dryRun,
    verbose,
  )

  // Git operations
  if (config.commitMessage) {
    const commitMessage = replaceTemplate(config.commitMessage as string, newVersion)

    // Stage files
    const filesToCommit = [
      config.packageJson,
      ...modifiedFiles,
      ...config.commitFiles,
    ]

    for (const file of filesToCommit) {
      execGit(['add', file], `Stage ${file}`, dryRun, verbose)
    }

    if (!dryRun) {
      console.log(`✓ Staged files: ${filesToCommit.join(', ')}`)
    }

    // Commit
    execGit(['commit', '-m', commitMessage], 'Create commit', dryRun, verbose)

    if (!dryRun) {
      console.log(`✓ Created commit: "${commitMessage}"`)
    }
  }

  if (config.tag) {
    const tagName = replaceTemplate(config.tag as string, newVersion)

    if (config.tagMessage) {
      const tagMsg = replaceTemplate(config.tagMessage as string, newVersion)
      execGit(['tag', '-a', tagName, '-m', tagMsg], 'Create annotated tag', dryRun, verbose)
    } else {
      execGit(['tag', tagName], 'Create lightweight tag', dryRun, verbose)
    }

    if (!dryRun) {
      console.log(`✓ Created tag: ${tagName}`)
    }
  }

  if (config.push) {
    execGit(['push', 'origin', '--follow-tags'], 'Push to remote', dryRun, verbose)

    if (!dryRun) {
      console.log('✓ Pushed to origin')
    }
  }

  // Run post-bump hook
  if (config.postBumpHook) {
    execShell(config.postBumpHook, 'Post-bump hook', dryRun, verbose)

    if (!dryRun) {
      console.log('✓ Ran post-bump hook')
    }
  }

  console.log(`\n✨ Successfully bumped version from v${oldVersion} to v${newVersion}`)

  if (dryRun) {
    console.log('\nThis was a dry run. No changes were made.')
    console.log('Run without --dry-run to apply changes.')
  }
}
