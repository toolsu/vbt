import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type ResolvedConfig } from '../src/types.js'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('../src/config.js', () => ({
  findProjectRoot: vi.fn(),
  loadConfig: vi.fn(),
  validateConfig: vi.fn(),
}))

vi.mock('../src/manifest.js', () => ({
  getManifestHandler: vi.fn(),
}))

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { findProjectRoot, loadConfig, validateConfig } from '../src/config.js'
import {
  applyFileUpdates,
  computeFileUpdates,
  execGit,
  execShell,
  helpText,
  isValidReleaseType,
  parseArgs,
  replaceTemplate,
  run,
  VERSION,
} from '../src/core.js'
import { getManifestHandler } from '../src/manifest.js'

const mockGetManifestHandler = vi.mocked(getManifestHandler)

const mockExecFileSync = vi.mocked(execFileSync)
const mockExecSync = vi.mocked(execSync)
const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)
const mockFindProjectRoot = vi.mocked(findProjectRoot)
const mockLoadConfig = vi.mocked(loadConfig)
const mockValidateConfig = vi.mocked(validateConfig)

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    requireCleanWorkingDirectory: false,
    ...overrides,
  } as ResolvedConfig
}

/**
 * Default mock for execFileSync that simulates "tag does not exist" for rev-parse.
 * Without this, the tag existence check would think every tag already exists.
 */
function defaultExecFileSyncMock(_file: unknown, args: unknown) {
  if (args && (args as string[])[0] === 'rev-parse') {
    throw new Error('fatal: not a valid object name')
  }
  return Buffer.from('')
}

function setupMocks(config?: Partial<ResolvedConfig>, packageJson?: Record<string, unknown>) {
  const pkg = packageJson ?? { name: 'test', version: '1.0.0' }
  const content = `${JSON.stringify(pkg, null, 2)}\n`

  mockFindProjectRoot.mockReturnValue('/fake/project')
  mockLoadConfig.mockResolvedValue(makeConfig(config))
  mockExistsSync.mockReturnValue(true)
  mockReadFileSync.mockReturnValue(content)
  mockExecFileSync.mockImplementation(defaultExecFileSyncMock)
  mockExecSync.mockReturnValue(Buffer.from(''))
  mockGetManifestHandler.mockReturnValue({
    readVersion: (c: string) => {
      const data = JSON.parse(c)
      return data.version && typeof data.version === 'string' ? data.version : null
    },
    writeVersion: (c: string, _old: string, newVer: string) => {
      const data = JSON.parse(c)
      data.version = newVer
      const hasFinalNewline = c.endsWith('\n')
      let result = JSON.stringify(data, null, 2)
      if (hasFinalNewline) result += '\n'
      return result
    },
  })
}

function gitCalls(): string[][] {
  return mockExecFileSync.mock.calls.filter((c) => c[0] === 'git').map((c) => c[1] as string[])
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(process, 'cwd').mockReturnValue('/fake/project')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('VERSION', () => {
  it('is a valid semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('helpText', () => {
  it('includes version', () => {
    expect(helpText()).toContain(`vbt v${VERSION}`)
  })

  it('includes usage section', () => {
    expect(helpText()).toContain('USAGE:')
  })

  it('includes examples', () => {
    expect(helpText()).toContain('EXAMPLES:')
  })

  it('includes config section', () => {
    expect(helpText()).toContain('CONFIGURATION:')
  })

  it('mentions {{oldVersion}}', () => {
    expect(helpText()).toContain('{{oldVersion}}')
  })
})

describe('parseArgs', () => {
  it('returns defaults for empty args', () => {
    const result = parseArgs([])
    expect(result).toEqual({
      versionOrRelease: undefined,
      identifier: undefined,
      config: undefined,
      dryRun: false,
      verbose: false,
      noCommit: false,
      noTag: false,
      noPush: false,
      showHelp: false,
      showVersion: false,
    })
  })

  it('parses --help', () => {
    expect(parseArgs(['--help']).showHelp).toBe(true)
  })

  it('parses -h', () => {
    expect(parseArgs(['-h']).showHelp).toBe(true)
  })

  it('parses --version', () => {
    expect(parseArgs(['--version']).showVersion).toBe(true)
  })

  it('parses -v', () => {
    expect(parseArgs(['-v']).showVersion).toBe(true)
  })

  it('parses --dry-run', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true)
  })

  it('parses --verbose', () => {
    expect(parseArgs(['--verbose']).verbose).toBe(true)
  })

  it('parses --no-commit', () => {
    expect(parseArgs(['--no-commit']).noCommit).toBe(true)
  })

  it('parses --no-tag', () => {
    expect(parseArgs(['--no-tag']).noTag).toBe(true)
  })

  it('parses --no-push', () => {
    expect(parseArgs(['--no-push']).noPush).toBe(true)
  })

  it('parses --config with path', () => {
    expect(parseArgs(['--config', './my-config.json']).config).toBe('./my-config.json')
  })

  it('parses --config=path syntax', () => {
    expect(parseArgs(['--config=./my-config.json']).config).toBe('./my-config.json')
  })

  it('throws when --config has no value', () => {
    expect(() => parseArgs(['--config'])).toThrow('--config requires a path argument')
  })

  it('parses version or release type', () => {
    expect(parseArgs(['patch']).versionOrRelease).toBe('patch')
  })

  it('parses identifier', () => {
    const result = parseArgs(['prerelease', 'alpha'])
    expect(result.versionOrRelease).toBe('prerelease')
    expect(result.identifier).toBe('alpha')
  })

  it('throws on third positional arg', () => {
    expect(() => parseArgs(['prerelease', 'alpha', 'extra'])).toThrow(
      'Unexpected argument: "extra"',
    )
  })

  it('throws on unknown flags', () => {
    expect(() => parseArgs(['--unknown'])).toThrow('Unknown option: --unknown')
  })

  it('throws on unknown short flags', () => {
    expect(() => parseArgs(['-x'])).toThrow('Unknown option: -x')
  })

  it('parses multiple options together', () => {
    const result = parseArgs(['patch', '--dry-run', '--verbose', '--config', 'c.json'])
    expect(result.versionOrRelease).toBe('patch')
    expect(result.dryRun).toBe(true)
    expect(result.verbose).toBe(true)
    expect(result.config).toBe('c.json')
  })
})

describe('isValidReleaseType', () => {
  it('returns true for valid release types', () => {
    expect(isValidReleaseType('major')).toBe(true)
    expect(isValidReleaseType('premajor')).toBe(true)
    expect(isValidReleaseType('minor')).toBe(true)
    expect(isValidReleaseType('preminor')).toBe(true)
    expect(isValidReleaseType('patch')).toBe(true)
    expect(isValidReleaseType('prepatch')).toBe(true)
    expect(isValidReleaseType('prerelease')).toBe(true)
  })

  it('returns false for invalid types', () => {
    expect(isValidReleaseType('invalid')).toBe(false)
    expect(isValidReleaseType('')).toBe(false)
    expect(isValidReleaseType('MAJOR')).toBe(false)
  })
})

describe('replaceTemplate', () => {
  it('replaces {{version}} placeholder', () => {
    expect(replaceTemplate('v{{version}}', '1.2.3')).toBe('v1.2.3')
  })

  it('replaces multiple placeholders', () => {
    expect(replaceTemplate('{{version}}-{{version}}', '1.0.0')).toBe('1.0.0-1.0.0')
  })

  it('returns unchanged string without placeholder', () => {
    expect(replaceTemplate('no placeholder', '1.0.0')).toBe('no placeholder')
  })

  it('handles empty strings', () => {
    expect(replaceTemplate('', '1.0.0')).toBe('')
  })

  it('replaces {{oldVersion}} placeholder', () => {
    expect(replaceTemplate('bump from {{oldVersion}} to {{version}}', '2.0.0', '1.0.0')).toBe(
      'bump from 1.0.0 to 2.0.0',
    )
  })

  it('leaves {{oldVersion}} intact when oldVersion not provided', () => {
    expect(replaceTemplate('v{{oldVersion}}', '1.0.0')).toBe('v{{oldVersion}}')
  })
})

describe('computeFileUpdates', () => {
  it('computes replacement on marked lines', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      'const VERSION = "1.0.0"; // vbt-version\nconst OTHER = "1.0.0";\n',
    )

    const { updates, modifiedFiles } = computeFileUpdates(
      ['index.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(modifiedFiles).toEqual(['index.js'])
    expect(updates).toHaveLength(1)
    expect(updates[0].content).toBe(
      'const VERSION = "2.0.0"; // vbt-version\nconst OTHER = "1.0.0";\n',
    )
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('skips lines without marker', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('const OTHER = "1.0.0";\n')

    const { modifiedFiles } = computeFileUpdates(
      ['index.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(modifiedFiles).toEqual([])
  })

  it('warns on missing file', () => {
    mockExistsSync.mockReturnValue(false)

    const { modifiedFiles } = computeFileUpdates(
      ['missing.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(modifiedFiles).toEqual([])
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith(expect.stringContaining('File not found'))
  })

  it('handles multiple files', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((p) => {
      if (String(p).includes('a.js')) return 'v = "1.0.0"; // vbt-version\n'
      return 'no marker\n'
    })

    const { modifiedFiles } = computeFileUpdates(
      ['a.js', 'b.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(modifiedFiles).toEqual(['a.js'])
  })

  it('skips marker line when old version not present', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('some text // vbt-version\n')

    const { modifiedFiles } = computeFileUpdates(
      ['file.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(modifiedFiles).toEqual([])
  })

  it('replaces version on offset line with +N syntax', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      '<!-- vbt-version +2 -->\n```bash\nnpm install pkg@1.0.0\n```\n',
    )

    const { updates, modifiedFiles } = computeFileUpdates(
      ['README.md'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(modifiedFiles).toEqual(['README.md'])
    expect(updates[0].content).toBe(
      '<!-- vbt-version +2 -->\n```bash\nnpm install pkg@2.0.0\n```\n',
    )
  })

  it('handles +1 offset', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('# vbt-version +1\nversion = "1.0.0"\n')

    const { updates } = computeFileUpdates(
      ['file.toml'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(updates[0].content).toBe('# vbt-version +1\nversion = "2.0.0"\n')
  })

  it('ignores offset beyond file length', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('<!-- vbt-version +99 -->\n')

    const { modifiedFiles } = computeFileUpdates(
      ['file.md'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(modifiedFiles).toEqual([])
  })

  it('does not replace marker line itself when offset is used', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('x = "1.0.0" // vbt-version +1\ny = "1.0.0"\n')

    const { updates } = computeFileUpdates(
      ['file.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(updates[0].content).toBe('x = "1.0.0" // vbt-version +1\ny = "2.0.0"\n')
  })

  it('uses custom marker', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('v = "1.0.0" # my-marker\n')

    const { modifiedFiles } = computeFileUpdates(
      ['file.py'],
      'my-marker',
      '1.0.0',
      '2.0.0',
      '/fake/project',
    )

    expect(modifiedFiles).toEqual(['file.py'])
  })

  it('resolves paths relative to baseDir', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('v = "1.0.0" // vbt-version\n')

    computeFileUpdates(['src/version.ts'], 'vbt-version', '1.0.0', '2.0.0', '/my/project')

    expect(mockExistsSync).toHaveBeenCalledWith('/my/project/src/version.ts')
  })
})

describe('applyFileUpdates', () => {
  it('writes files when not dry run', () => {
    const updates = [
      { filePath: 'a.js', absolutePath: '/p/a.js', content: 'new', originalContent: 'old' },
    ]
    applyFileUpdates(updates, false, false)
    expect(mockWriteFileSync).toHaveBeenCalledWith('/p/a.js', 'new', 'utf8')
  })

  it('does not write in dry run', () => {
    const updates = [
      { filePath: 'a.js', absolutePath: '/p/a.js', content: 'new', originalContent: 'old' },
    ]
    applyFileUpdates(updates, true, false)
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('logs verbose when no updates', () => {
    applyFileUpdates([], false, true)
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      expect.stringContaining('No marker matches'),
    )
  })
})

describe('execGit', () => {
  it('executes git command when not dry run', () => {
    execGit(['status'], 'test', false, false)
    expect(mockExecFileSync).toHaveBeenCalledWith('git', ['status'], {
      stdio: 'pipe',
      cwd: undefined,
    })
  })

  it('does not execute during dry run', () => {
    execGit(['status'], 'test', true, false)
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('uses inherit stdio when verbose', () => {
    execGit(['status'], 'test', false, true)
    expect(mockExecFileSync).toHaveBeenCalledWith('git', ['status'], {
      stdio: 'inherit',
      cwd: undefined,
    })
  })

  it('logs during dry run', () => {
    const logSpy = vi.mocked(console.log)
    execGit(['add', 'file.txt'], 'test desc', true, false)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('git add file.txt'))
  })

  it('logs when verbose', () => {
    const logSpy = vi.mocked(console.log)
    execGit(['status'], 'test desc', false, true)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[EXEC]'))
  })

  it('throws wrapped error on command failure', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command failed')
    })
    expect(() => execGit(['bad-cmd'], 'test', false, false)).toThrow(
      'Failed to execute: git bad-cmd',
    )
  })

  it('passes cwd option', () => {
    execGit(['status'], 'test', false, false, '/my/project')
    expect(mockExecFileSync).toHaveBeenCalledWith('git', ['status'], {
      stdio: 'pipe',
      cwd: '/my/project',
    })
  })
})

describe('execShell', () => {
  it('executes shell command when not dry run', () => {
    execShell('npm test', 'test', false, false)
    expect(mockExecSync).toHaveBeenCalledWith('npm test', { stdio: 'pipe', cwd: undefined })
  })

  it('does not execute during dry run', () => {
    execShell('npm test', 'test', true, false)
    expect(mockExecSync).not.toHaveBeenCalled()
  })

  it('uses inherit stdio when verbose', () => {
    execShell('npm test', 'test', false, true)
    expect(mockExecSync).toHaveBeenCalledWith('npm test', { stdio: 'inherit', cwd: undefined })
  })

  it('logs during dry run', () => {
    const logSpy = vi.mocked(console.log)
    execShell('npm test', 'test desc', true, false)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('npm test'))
  })

  it('logs when verbose', () => {
    const logSpy = vi.mocked(console.log)
    execShell('npm test', 'test desc', false, true)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[EXEC]'))
  })

  it('throws wrapped error on command failure', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('command failed')
    })
    expect(() => execShell('bad-cmd', 'test', false, false)).toThrow('Failed to execute: bad-cmd')
  })

  it('passes cwd option', () => {
    execShell('npm test', 'test', false, false, '/my/project')
    expect(mockExecSync).toHaveBeenCalledWith('npm test', {
      stdio: 'pipe',
      cwd: '/my/project',
    })
  })
})

describe('run', () => {
  it('shows help with --help', async () => {
    await run(['--help'])
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringContaining('USAGE:'))
  })

  it('shows version with --version', async () => {
    await run(['--version'])
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(VERSION)
  })

  it('throws when no args provided', async () => {
    await expect(run([])).rejects.toThrow('No version number or release type provided')
  })

  it('bumps patch version', async () => {
    setupMocks()
    await run(['patch'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "1.0.1"'),
      'utf8',
    )
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(expect.stringContaining('v1.0.0 -> v1.0.1'))
  })

  it('bumps minor version', async () => {
    setupMocks()
    await run(['minor'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "1.1.0"'),
      'utf8',
    )
  })

  it('bumps major version', async () => {
    setupMocks()
    await run(['major'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "2.0.0"'),
      'utf8',
    )
  })

  it('sets exact version', async () => {
    setupMocks()
    await run(['3.5.7'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "3.5.7"'),
      'utf8',
    )
  })

  it('strips v prefix from exact version', async () => {
    setupMocks()
    await run(['v3.5.7'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "3.5.7"'),
      'utf8',
    )
  })

  it('handles prerelease with identifier', async () => {
    setupMocks()
    await run(['prerelease', 'alpha'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "1.0.1-alpha.0"'),
      'utf8',
    )
  })

  it('handles prerelease without identifier', async () => {
    setupMocks(undefined, { name: 'test', version: '1.0.1-alpha.0' })
    await run(['prerelease'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "1.0.1-alpha.1"'),
      'utf8',
    )
  })

  it('throws on invalid release type', async () => {
    setupMocks()
    await expect(run(['foobar'])).rejects.toThrow('Invalid version number or release type: foobar')
  })

  it('throws when manifest has no version', async () => {
    setupMocks(undefined, { name: 'test' })
    await expect(run(['patch'])).rejects.toThrow('No version field found')
  })

  it('throws when manifest not found', async () => {
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockLoadConfig.mockResolvedValue(makeConfig())
    mockExistsSync.mockReturnValue(false)

    await expect(run(['patch'])).rejects.toThrow('Manifest file not found')
  })

  it('checks clean working directory', async () => {
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockLoadConfig.mockResolvedValue(makeConfig({ requireCleanWorkingDirectory: true }))
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"1.0.0"}\n')
    mockExecFileSync.mockImplementation((_file, args) => {
      if (args && (args as string[])[0] === 'status') return Buffer.from('M file.ts\n')
      if (args && (args as string[])[0] === 'rev-parse')
        throw new Error('fatal: not a valid object name')
      return Buffer.from('')
    })

    await expect(run(['patch'])).rejects.toThrow('not clean')
  })

  it('warns on dirty directory during dry run instead of skipping', async () => {
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockLoadConfig.mockResolvedValue(
      makeConfig({ requireCleanWorkingDirectory: true, dryRun: true }),
    )
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"1.0.0"}\n')
    mockExecFileSync.mockImplementation((_file, args) => {
      if (args && (args as string[])[0] === 'status') return Buffer.from('M file.ts\n')
      if (args && (args as string[])[0] === 'rev-parse')
        throw new Error('fatal: not a valid object name')
      return Buffer.from('')
    })
    mockGetManifestHandler.mockReturnValue({
      readVersion: () => '1.0.0',
      writeVersion: (c: string, _old: string, newVer: string) => {
        const data = JSON.parse(c)
        data.version = newVer
        return `${JSON.stringify(data, null, 2)}\n`
      },
    })

    await run(['patch'])

    expect(vi.mocked(console.warn)).toHaveBeenCalledWith('Warning: Working directory is not clean.')
  })

  it('skips clean check when requireCleanWorkingDirectory is false', async () => {
    setupMocks({ requireCleanWorkingDirectory: false })
    await run(['patch'])

    const statusCalls = mockExecFileSync.mock.calls.filter(
      (c) => c[0] === 'git' && (c[1] as string[])[0] === 'status',
    )
    expect(statusCalls).toHaveLength(0)
  })

  it('runs pre-bump check', async () => {
    setupMocks({ preBumpCheck: 'npm test' })
    await run(['patch'])

    expect(mockExecSync).toHaveBeenCalledWith('npm test', expect.anything())
  })

  it('does not run pre-bump check when false', async () => {
    setupMocks({ preBumpCheck: false })
    await run(['patch'])

    expect(mockExecSync).not.toHaveBeenCalled()
  })

  it('creates commit and tag by default', async () => {
    setupMocks()
    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(['add', './package.json'])
    expect(calls).toContainEqual(['commit', '-m', 'chore: bump version to v1.0.1'])
    expect(calls).toContainEqual(expect.arrayContaining(['tag', '-a', 'v1.0.1']))
  })

  it('skips commit when commitMessage is false', async () => {
    setupMocks({ commitMessage: false, tag: false })
    await run(['patch'])

    const calls = gitCalls()
    const hasCommit = calls.some((args) => args[0] === 'commit')
    const hasAdd = calls.some((args) => args[0] === 'add')
    expect(hasCommit).toBe(false)
    expect(hasAdd).toBe(false)
  })

  it('skips tag when tag is false', async () => {
    setupMocks({ tag: false })
    await run(['patch'])

    const calls = gitCalls()
    const hasTag = calls.some((args) => args[0] === 'tag')
    expect(hasTag).toBe(false)
  })

  it('creates lightweight tag when tagMessage is false', async () => {
    setupMocks({ tagMessage: false })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(['tag', 'v1.0.1'])
    const hasAnnotated = calls.some((args) => args[0] === 'tag' && args[1] === '-a')
    expect(hasAnnotated).toBe(false)
  })

  it('creates annotated tag by default', async () => {
    setupMocks()
    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(['tag', '-a', 'v1.0.1', '-m', 'chore: release v1.0.1'])
  })

  it('pushes when enabled', async () => {
    setupMocks({ push: true })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(['push', 'origin', '--follow-tags'])
  })

  it('does not push when disabled', async () => {
    setupMocks({ push: false })
    await run(['patch'])

    const calls = gitCalls()
    const hasPush = calls.some((args) => args[0] === 'push')
    expect(hasPush).toBe(false)
  })

  it('--no-commit passes commitMessage:false, tag:false, push:false to loadConfig', async () => {
    setupMocks()
    await run(['patch', '--no-commit'])

    expect(mockLoadConfig).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ commitMessage: false, tag: false, push: false }),
      '/fake/project',
    )
  })

  it('--no-tag passes tag:false, push:false to loadConfig', async () => {
    setupMocks()
    await run(['patch', '--no-tag'])

    expect(mockLoadConfig).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ tag: false, push: false }),
      '/fake/project',
    )
  })

  it('--no-push passes push:false to loadConfig', async () => {
    setupMocks()
    await run(['patch', '--no-push'])

    expect(mockLoadConfig).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ push: false }),
      '/fake/project',
    )
  })

  it('runs post-bump hook', async () => {
    setupMocks({ postBumpHook: 'npm publish' })
    await run(['patch'])

    expect(mockExecSync).toHaveBeenCalledWith('npm publish', expect.anything())
  })

  it('does not run post-bump hook when false', async () => {
    setupMocks({ postBumpHook: false })
    await run(['patch'])

    expect(mockExecSync).not.toHaveBeenCalled()
  })

  it('preserves final newline', async () => {
    setupMocks()
    await run(['patch'])

    const writtenContent = mockWriteFileSync.mock.calls[0][1] as string
    expect(writtenContent.endsWith('\n')).toBe(true)
  })

  it('does not add newline when original had none', async () => {
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockLoadConfig.mockResolvedValue(makeConfig())
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"1.0.0"}')
    mockExecFileSync.mockImplementation(defaultExecFileSyncMock)
    mockGetManifestHandler.mockReturnValue({
      readVersion: () => '1.0.0',
      writeVersion: (c: string, _old: string, newVer: string) => {
        const data = JSON.parse(c)
        data.version = newVer
        const hasFinalNewline = c.endsWith('\n')
        let result = JSON.stringify(data, null, 2)
        if (hasFinalNewline) result += '\n'
        return result
      },
    })

    await run(['patch'])

    const writtenContent = mockWriteFileSync.mock.calls[0][1] as string
    expect(writtenContent.endsWith('\n')).toBe(false)
  })

  it('auto-detects indent', async () => {
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockLoadConfig.mockResolvedValue(makeConfig())
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{\n    "name": "test",\n    "version": "1.0.0"\n}\n')
    mockExecFileSync.mockImplementation(defaultExecFileSyncMock)
    mockGetManifestHandler.mockReturnValue({
      readVersion: () => '1.0.0',
      writeVersion: (c: string, _old: string, newVer: string) => {
        const data = JSON.parse(c)
        data.version = newVer
        const hasFinalNewline = c.endsWith('\n')
        let result = JSON.stringify(data, null, 4)
        if (hasFinalNewline) result += '\n'
        return result
      },
    })

    await run(['patch'])

    const writtenContent = mockWriteFileSync.mock.calls[0][1] as string
    expect(writtenContent).toContain('    "name"')
  })

  it('dry run does not write files', async () => {
    setupMocks({ dryRun: true })
    await run(['patch'])

    expect(mockWriteFileSync).not.toHaveBeenCalled()
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      expect.stringContaining('[DRY RUN] Would update version'),
    )
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      expect.stringContaining('This was a dry run'),
    )
  })

  it('verbose mode logs configuration', async () => {
    setupMocks({ verbose: true })
    await run(['patch'])

    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      'Configuration:',
      expect.stringContaining('"verbose": true'),
    )
  })

  it('includes commit files in staging', async () => {
    setupMocks({ commitFiles: ['CHANGELOG.md', 'package-lock.json'] })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(['add', './package.json'])
    expect(calls).toContainEqual(['add', 'CHANGELOG.md'])
    expect(calls).toContainEqual(['add', 'package-lock.json'])
  })

  it('stages marker-replaced files for commit', async () => {
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockLoadConfig.mockResolvedValue(makeConfig({ files: ['version.rs'], marker: 'vbt-version' }))
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((p) => {
      if (String(p).includes('version.rs'))
        return 'pub const VERSION: &str = "1.0.0"; // vbt-version\n'
      return '{\n  "name": "test",\n  "version": "1.0.0"\n}\n'
    })
    mockExecFileSync.mockImplementation(defaultExecFileSyncMock)
    mockGetManifestHandler.mockReturnValue({
      readVersion: () => '1.0.0',
      writeVersion: (c: string, _old: string, newVer: string) => {
        const data = JSON.parse(c)
        data.version = newVer
        return `${JSON.stringify(data, null, 2)}\n`
      },
    })

    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(['add', 'version.rs'])
  })

  it('uses custom commit message template', async () => {
    setupMocks({ commitMessage: 'release: v{{version}}' })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(['commit', '-m', 'release: v1.0.1'])
  })

  it('uses {{oldVersion}} in commit message', async () => {
    setupMocks({ commitMessage: 'bump from {{oldVersion}} to {{version}}' })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(['commit', '-m', 'bump from 1.0.0 to 1.0.1'])
  })

  it('uses custom tag name template', async () => {
    setupMocks({ tag: 'release-{{version}}' })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(expect.arrayContaining(['tag', '-a', 'release-1.0.1']))
  })

  it('uses custom tag message template', async () => {
    setupMocks({ tagMessage: 'Release {{version}}' })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls).toContainEqual(
      expect.arrayContaining(['tag', '-a', 'v1.0.1', '-m', 'Release 1.0.1']),
    )
  })

  it('checks tag existence before creating', async () => {
    setupMocks()
    // Simulate tag already existing (rev-parse succeeds)
    mockExecFileSync.mockImplementation((_file, args) => {
      if (args && (args as string[])[0] === 'rev-parse' && (args as string[])[1] === 'v1.0.1') {
        return Buffer.from('abc123\n')
      }
      return Buffer.from('')
    })

    await expect(run(['patch'])).rejects.toThrow('Tag "v1.0.1" already exists')
    // Verify no files were written (preflight catches it before writes)
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('dry run with push enabled does not log push success', async () => {
    setupMocks({ push: true, dryRun: true })
    await run(['patch'])

    const logCalls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]))
    expect(logCalls).not.toContainEqual(expect.stringContaining('Pushed to'))
  })

  it('dry run with post-bump hook does not log hook success', async () => {
    setupMocks({ postBumpHook: 'npm publish', dryRun: true })
    await run(['patch'])

    const logCalls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]))
    expect(logCalls).not.toContainEqual(expect.stringContaining('Ran post-bump hook'))
  })

  it('passes config path, CLI overrides, and projectRoot to loadConfig', async () => {
    setupMocks()
    await run(['patch', '--config', './custom.json', '--dry-run', '--verbose'])

    expect(mockLoadConfig).toHaveBeenCalledWith(
      './custom.json',
      expect.objectContaining({ dryRun: true, verbose: true }),
      '/fake/project',
    )
  })

  it('does not pass dryRun/verbose when flags are not set', async () => {
    setupMocks()
    await run(['patch'])

    const overrides = mockLoadConfig.mock.calls[0][1] as Record<string, unknown>
    expect(overrides).not.toHaveProperty('dryRun')
    expect(overrides).not.toHaveProperty('verbose')
  })

  it('calls validateConfig', async () => {
    setupMocks()
    await run(['patch'])

    expect(mockValidateConfig).toHaveBeenCalled()
  })

  it('handles clean working directory check passing', async () => {
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockLoadConfig.mockResolvedValue(makeConfig({ requireCleanWorkingDirectory: true }))
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"1.0.0"}\n')
    mockExecFileSync.mockImplementation(defaultExecFileSyncMock)
    mockGetManifestHandler.mockReturnValue({
      readVersion: () => '1.0.0',
      writeVersion: (c: string, _old: string, newVer: string) => {
        const data = JSON.parse(c)
        data.version = newVer
        return `${JSON.stringify(data, null, 2)}\n`
      },
    })

    await run(['patch'])
    expect(mockWriteFileSync).toHaveBeenCalled()
  })

  it('handles inc returning null', async () => {
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockLoadConfig.mockResolvedValue(makeConfig())
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"invalid"}\n')
    mockExecFileSync.mockImplementation(defaultExecFileSyncMock)
    mockGetManifestHandler.mockReturnValue({
      readVersion: () => 'invalid',
      writeVersion: (c: string, _old: string, newVer: string) => {
        const data = JSON.parse(c)
        data.version = newVer
        return `${JSON.stringify(data, null, 2)}\n`
      },
    })

    await expect(run(['patch'])).rejects.toThrow('Failed to calculate new version')
  })

  it('passes projectRoot as cwd to git commands', async () => {
    setupMocks()
    await run(['patch'])

    // Check that git add is called with cwd
    const addCalls = mockExecFileSync.mock.calls.filter(
      (c) => c[0] === 'git' && (c[1] as string[])[0] === 'add',
    )
    for (const call of addCalls) {
      expect((call[2] as { cwd?: string }).cwd).toBe('/fake/project')
    }
  })

  it('passes projectRoot as cwd to shell hooks', async () => {
    setupMocks({ preBumpCheck: 'npm test' })
    await run(['patch'])

    expect(mockExecSync).toHaveBeenCalledWith(
      'npm test',
      expect.objectContaining({
        cwd: '/fake/project',
      }),
    )
  })

  it('resolves manifest relative to projectRoot', async () => {
    mockFindProjectRoot.mockReturnValue('/my/root')
    mockLoadConfig.mockResolvedValue(makeConfig({ manifest: './sub/package.json' }))
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"1.0.0"}\n')
    mockExecFileSync.mockImplementation(defaultExecFileSyncMock)
    mockGetManifestHandler.mockReturnValue({
      readVersion: () => '1.0.0',
      writeVersion: (c: string, _old: string, newVer: string) => {
        const data = JSON.parse(c)
        data.version = newVer
        return `${JSON.stringify(data, null, 2)}\n`
      },
    })

    await run(['patch'])

    expect(mockReadFileSync).toHaveBeenCalledWith('/my/root/sub/package.json', 'utf8')
  })

  it('bumps same version (no-op version)', async () => {
    setupMocks()
    await run(['1.0.0'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "1.0.0"'),
      'utf8',
    )
  })

  it('handles premajor with identifier', async () => {
    setupMocks()
    await run(['premajor', 'beta'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "2.0.0-beta.0"'),
      'utf8',
    )
  })

  it('handles preminor with identifier', async () => {
    setupMocks()
    await run(['preminor', 'rc'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "1.1.0-rc.0"'),
      'utf8',
    )
  })

  it('handles prepatch with identifier', async () => {
    setupMocks()
    await run(['prepatch', 'alpha'])

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.stringContaining('"version": "1.0.1-alpha.0"'),
      'utf8',
    )
  })

  it('rolls back files when git commit fails', async () => {
    const originalContent = '{\n  "name": "test",\n  "version": "1.0.0"\n}\n'
    setupMocks()
    // Make git commit fail
    mockExecFileSync.mockImplementation((_file, args) => {
      if (args && (args as string[])[0] === 'rev-parse')
        throw new Error('fatal: not a valid object name')
      if (args && (args as string[])[0] === 'commit') throw new Error('commit failed')
      return Buffer.from('')
    })
    mockReadFileSync.mockReturnValue(originalContent)

    await expect(run(['patch'])).rejects.toThrow('commit failed')

    // Verify rollback: last writeFileSync call should restore original content
    const writeCalls = mockWriteFileSync.mock.calls
    const lastWrite = writeCalls[writeCalls.length - 1]
    expect(lastWrite[1]).toBe(originalContent)
    expect(vi.mocked(console.error)).toHaveBeenCalledWith('Rolled back file changes due to error.')
  })

  it('prints recovery hints when push fails', async () => {
    setupMocks({ push: true })
    mockExecFileSync.mockImplementation((_file, args) => {
      if (args && (args as string[])[0] === 'rev-parse')
        throw new Error('fatal: not a valid object name')
      if (args && (args as string[])[0] === 'push') throw new Error('push failed')
      return Buffer.from('')
    })

    await expect(run(['patch'])).rejects.toThrow('push failed')

    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining('commit and tag were created locally'),
    )
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining('git push origin --follow-tags'),
    )
  })

  it('rollback is best-effort when restore also fails', async () => {
    setupMocks({ files: ['src/v.ts'], marker: 'vbt-version' })
    let writeCount = 0
    mockReadFileSync.mockImplementation((p) => {
      if (String(p).includes('v.ts')) return 'x = "1.0.0"; // vbt-version\n'
      return '{\n  "name": "test",\n  "version": "1.0.0"\n}\n'
    })
    mockExecFileSync.mockImplementation((_file, args) => {
      if (args && (args as string[])[0] === 'rev-parse')
        throw new Error('fatal: not a valid object name')
      if (args && (args as string[])[0] === 'commit') throw new Error('commit failed')
      return Buffer.from('')
    })
    // Let initial writes succeed, fail on rollback writes
    mockWriteFileSync.mockImplementation(() => {
      writeCount++
      if (writeCount > 2) throw new Error('disk full')
    })

    await expect(run(['patch'])).rejects.toThrow('commit failed')
    expect(vi.mocked(console.error)).toHaveBeenCalledWith('Rolled back file changes due to error.')
  })

  it('does not rollback files when push fails (commit already done)', async () => {
    const originalContent = '{\n  "name": "test",\n  "version": "1.0.0"\n}\n'
    setupMocks({ push: true })
    mockExecFileSync.mockImplementation((_file, args) => {
      if (args && (args as string[])[0] === 'rev-parse')
        throw new Error('fatal: not a valid object name')
      if (args && (args as string[])[0] === 'push') throw new Error('push failed')
      return Buffer.from('')
    })
    mockReadFileSync.mockReturnValue(originalContent)

    await expect(run(['patch'])).rejects.toThrow('push failed')

    // Should NOT see rollback message
    expect(vi.mocked(console.error)).not.toHaveBeenCalledWith(
      'Rolled back file changes due to error.',
    )
  })

  it('recovery hints without tag when push fails and tag is disabled', async () => {
    setupMocks({ push: true, tag: false })
    mockExecFileSync.mockImplementation((_file, args) => {
      if (args && (args as string[])[0] === 'rev-parse')
        throw new Error('fatal: not a valid object name')
      if (args && (args as string[])[0] === 'push') throw new Error('push failed')
      return Buffer.from('')
    })

    await expect(run(['patch'])).rejects.toThrow('push failed')

    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining('commit and tag were created locally'),
    )
    // Should NOT mention tag commands since no tag was created
    expect(vi.mocked(console.error)).not.toHaveBeenCalledWith(expect.stringContaining('git tag -d'))
  })
})
