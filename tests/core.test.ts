import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '../src/types.js'

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
  loadConfig: vi.fn(),
  validateConfig: vi.fn(),
}))

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { loadConfig, validateConfig } from '../src/config.js'
import {
  detectIndent,
  execGit,
  execShell,
  helpText,
  isValidReleaseType,
  parseArgs,
  replaceTemplate,
  replaceVersionInFiles,
  run,
  VERSION,
} from '../src/core.js'

const mockExecFileSync = vi.mocked(execFileSync)
const mockExecSync = vi.mocked(execSync)
const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)
const mockLoadConfig = vi.mocked(loadConfig)
const mockValidateConfig = vi.mocked(validateConfig)

function makeConfig(overrides: Partial<Config> = {}): Required<Config> {
  return {
    ...DEFAULT_CONFIG,
    requireCleanWorkingDirectory: false,
    ...overrides,
  } as Required<Config>
}

function setupMocks(config?: Partial<Config>, packageJson?: Record<string, unknown>) {
  const pkg = packageJson ?? { name: 'test', version: '1.0.0' }
  const content = `${JSON.stringify(pkg, null, 2)}\n`

  mockLoadConfig.mockResolvedValue(makeConfig(config))
  mockExistsSync.mockReturnValue(true)
  mockReadFileSync.mockReturnValue(content)
  mockExecFileSync.mockReturnValue(Buffer.from(''))
  mockExecSync.mockReturnValue(Buffer.from(''))
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

  it('parses version or release type', () => {
    expect(parseArgs(['patch']).versionOrRelease).toBe('patch')
  })

  it('parses identifier', () => {
    const result = parseArgs(['prerelease', 'alpha'])
    expect(result.versionOrRelease).toBe('prerelease')
    expect(result.identifier).toBe('alpha')
  })

  it('ignores third positional arg', () => {
    const result = parseArgs(['prerelease', 'alpha', 'extra'])
    expect(result.versionOrRelease).toBe('prerelease')
    expect(result.identifier).toBe('alpha')
  })

  it('ignores unknown flags', () => {
    const result = parseArgs(['--unknown', 'patch'])
    expect(result.versionOrRelease).toBe('patch')
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
})

describe('detectIndent', () => {
  it('detects 2-space indent', () => {
    expect(detectIndent('{\n  "name": "test"\n}')).toBe(2)
  })

  it('detects 4-space indent', () => {
    expect(detectIndent('{\n    "name": "test"\n}')).toBe(4)
  })

  it('detects tab indent', () => {
    expect(detectIndent('{\n\t"name": "test"\n}')).toBe('\t')
  })

  it('returns 2 as default when no indent found', () => {
    expect(detectIndent('{}')).toBe(2)
  })
})

describe('replaceVersionInFiles', () => {
  it('replaces version on marked lines', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      'const VERSION = "1.0.0"; // vbt-version\nconst OTHER = "1.0.0";\n',
    )

    const modified = replaceVersionInFiles(
      ['index.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual(['index.js'])
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('index.js'),
      'const VERSION = "2.0.0"; // vbt-version\nconst OTHER = "1.0.0";\n',
      'utf8',
    )
  })

  it('skips lines without marker', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('const OTHER = "1.0.0";\n')

    const modified = replaceVersionInFiles(
      ['index.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual([])
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('warns on missing file', () => {
    mockExistsSync.mockReturnValue(false)

    const modified = replaceVersionInFiles(
      ['missing.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual([])
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
    )
  })

  it('does not write in dry run', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('version = "1.0.0" # vbt-version\n')

    const modified = replaceVersionInFiles(
      ['file.toml'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      true,
      false,
    )

    expect(modified).toEqual(['file.toml'])
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('logs verbose when no matches', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('no markers here\n')

    replaceVersionInFiles(['file.txt'], 'vbt-version', '1.0.0', '2.0.0', false, true)

    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      expect.stringContaining('No marker matches'),
    )
  })

  it('handles multiple files', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((p) => {
      if (String(p).includes('a.js')) return 'v = "1.0.0"; // vbt-version\n'
      return 'no marker\n'
    })

    const modified = replaceVersionInFiles(
      ['a.js', 'b.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual(['a.js'])
  })

  it('skips marker line when old version not present', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('some text // vbt-version\n')

    const modified = replaceVersionInFiles(
      ['file.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual([])
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('replaces version on offset line with +N syntax', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      '<!-- vbt-version +2 -->\n```bash\nnpm install pkg@1.0.0\n```\n',
    )

    const modified = replaceVersionInFiles(
      ['README.md'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual(['README.md'])
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('README.md'),
      '<!-- vbt-version +2 -->\n```bash\nnpm install pkg@2.0.0\n```\n',
      'utf8',
    )
  })

  it('handles +1 offset', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('# vbt-version +1\nversion = "1.0.0"\n')

    const modified = replaceVersionInFiles(
      ['file.toml'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual(['file.toml'])
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('file.toml'),
      '# vbt-version +1\nversion = "2.0.0"\n',
      'utf8',
    )
  })

  it('ignores offset beyond file length', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('<!-- vbt-version +99 -->\n')

    const modified = replaceVersionInFiles(
      ['file.md'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual([])
  })

  it('does not replace marker line itself when offset is used', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      'x = "1.0.0" // vbt-version +1\ny = "1.0.0"\n',
    )

    const modified = replaceVersionInFiles(
      ['file.js'],
      'vbt-version',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual(['file.js'])
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('file.js'),
      'x = "1.0.0" // vbt-version +1\ny = "2.0.0"\n',
      'utf8',
    )
  })

  it('uses custom marker', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('v = "1.0.0" # my-marker\n')

    const modified = replaceVersionInFiles(
      ['file.py'],
      'my-marker',
      '1.0.0',
      '2.0.0',
      false,
      false,
    )

    expect(modified).toEqual(['file.py'])
  })
})

describe('execGit', () => {
  it('executes git command when not dry run', () => {
    execGit(['status'], 'test', false, false)
    expect(mockExecFileSync).toHaveBeenCalledWith('git', ['status'], { stdio: 'pipe' })
  })

  it('does not execute during dry run', () => {
    execGit(['status'], 'test', true, false)
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('uses inherit stdio when verbose', () => {
    execGit(['status'], 'test', false, true)
    expect(mockExecFileSync).toHaveBeenCalledWith('git', ['status'], { stdio: 'inherit' })
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
})

describe('execShell', () => {
  it('executes shell command when not dry run', () => {
    execShell('npm test', 'test', false, false)
    expect(mockExecSync).toHaveBeenCalledWith('npm test', { stdio: 'pipe' })
  })

  it('does not execute during dry run', () => {
    execShell('npm test', 'test', true, false)
    expect(mockExecSync).not.toHaveBeenCalled()
  })

  it('uses inherit stdio when verbose', () => {
    execShell('npm test', 'test', false, true)
    expect(mockExecSync).toHaveBeenCalledWith('npm test', { stdio: 'inherit' })
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

  it('throws when package.json has no version', async () => {
    setupMocks(undefined, { name: 'test' })
    await expect(run(['patch'])).rejects.toThrow('No version field found in package.json')
  })

  it('throws when package.json not found', async () => {
    mockLoadConfig.mockResolvedValue(makeConfig())
    mockExistsSync.mockReturnValue(false)

    await expect(run(['patch'])).rejects.toThrow('package.json not found')
  })

  it('throws when packageJson is false', async () => {
    setupMocks({ packageJson: false })
    await expect(run(['patch'])).rejects.toThrow('packageJson is set to false')
  })

  it('checks clean working directory', async () => {
    mockLoadConfig.mockResolvedValue(makeConfig({ requireCleanWorkingDirectory: true }))
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"1.0.0"}\n')
    mockExecFileSync.mockImplementation((_file, args) => {
      if (args && (args as string[])[0] === 'status') return Buffer.from('M file.ts\n')
      return Buffer.from('')
    })

    await expect(run(['patch'])).rejects.toThrow('not clean')
  })

  it('skips clean check when requireCleanWorkingDirectory is false', async () => {
    setupMocks({ requireCleanWorkingDirectory: false })
    await run(['patch'])

    const statusCalls = gitCalls().filter((args) => args[0] === 'status')
    expect(statusCalls).toHaveLength(0)
  })

  it('skips clean check during dry run', async () => {
    setupMocks({ requireCleanWorkingDirectory: true, dryRun: true })
    await run(['patch'])

    const statusCalls = gitCalls().filter((args) => args[0] === 'status')
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
    setupMocks({ commitMessage: false })
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

  it('--no-commit skips commit', async () => {
    setupMocks({ commitMessage: false })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls.some((a) => a[0] === 'commit')).toBe(false)
    expect(calls.some((a) => a[0] === 'add')).toBe(false)
  })

  it('--no-tag skips tag', async () => {
    setupMocks({ tag: false })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls.some((a) => a[0] === 'tag')).toBe(false)
    expect(calls.some((a) => a[0] === 'commit')).toBe(true)
  })

  it('--no-push overrides push config', async () => {
    setupMocks({ push: false })
    await run(['patch'])

    const calls = gitCalls()
    expect(calls.some((a) => a[0] === 'push')).toBe(false)
  })

  it('--no-commit passes commitMessage:false, tag:false, push:false to loadConfig', async () => {
    setupMocks()
    await run(['patch', '--no-commit'])

    expect(mockLoadConfig).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ commitMessage: false, tag: false, push: false }),
    )
  })

  it('--no-tag passes tag:false, push:false to loadConfig', async () => {
    setupMocks()
    await run(['patch', '--no-tag'])

    expect(mockLoadConfig).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ tag: false, push: false }),
    )
  })

  it('--no-push passes push:false to loadConfig', async () => {
    setupMocks()
    await run(['patch', '--no-push'])

    expect(mockLoadConfig).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ push: false }),
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
    mockLoadConfig.mockResolvedValue(makeConfig())
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"1.0.0"}')
    mockExecFileSync.mockReturnValue(Buffer.from(''))

    await run(['patch'])

    const writtenContent = mockWriteFileSync.mock.calls[0][1] as string
    expect(writtenContent.endsWith('\n')).toBe(false)
  })

  it('auto-detects indent', async () => {
    mockLoadConfig.mockResolvedValue(makeConfig())
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{\n    "name": "test",\n    "version": "1.0.0"\n}\n')
    mockExecFileSync.mockReturnValue(Buffer.from(''))

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
    mockLoadConfig.mockResolvedValue(
      makeConfig({ files: ['version.rs'], marker: 'vbt-version' }),
    )
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((p) => {
      if (String(p).includes('version.rs'))
        return 'pub const VERSION: &str = "1.0.0"; // vbt-version\n'
      return '{\n  "name": "test",\n  "version": "1.0.0"\n}\n'
    })
    mockExecFileSync.mockReturnValue(Buffer.from(''))

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

  it('passes config path and CLI overrides to loadConfig', async () => {
    setupMocks()
    await run(['patch', '--config', './custom.json', '--dry-run', '--verbose'])

    expect(mockLoadConfig).toHaveBeenCalledWith('./custom.json', {
      dryRun: true,
      verbose: true,
    })
  })

  it('calls validateConfig', async () => {
    setupMocks()
    await run(['patch'])

    expect(mockValidateConfig).toHaveBeenCalled()
  })

  it('handles clean working directory check passing', async () => {
    mockLoadConfig.mockResolvedValue(makeConfig({ requireCleanWorkingDirectory: true }))
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"1.0.0"}\n')
    mockExecFileSync.mockReturnValue(Buffer.from(''))

    await run(['patch'])
    expect(mockWriteFileSync).toHaveBeenCalled()
  })

  it('handles inc returning null', async () => {
    mockLoadConfig.mockResolvedValue(makeConfig())
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{"name":"test","version":"invalid"}\n')
    mockExecFileSync.mockReturnValue(Buffer.from(''))

    await expect(run(['patch'])).rejects.toThrow('Failed to calculate new version')
  })
})
