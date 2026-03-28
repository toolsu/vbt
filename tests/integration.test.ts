import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const PROJECT_ROOT = resolve(__dirname, '..')
const VBT_BIN = resolve(PROJECT_ROOT, 'dist', 'index.js')

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vbt-integration-'))
  execSync('git init', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'test-pkg', version: '1.0.0' }, null, 2)}\n`,
  )
  execSync('git add -A && git commit -m "init"', { cwd: dir, stdio: 'pipe' })
  return dir
}

function readPkg(dir: string): { version: string; [key: string]: unknown } {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
}

function runVbt(args: string, cwd: string): string {
  return execSync(`node ${VBT_BIN} ${args}`, { cwd, encoding: 'utf8', stdio: 'pipe' })
}

function getTags(cwd: string): string[] {
  const out = execSync('git tag', { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
  return out ? out.split('\n') : []
}

function getLastCommitMessage(cwd: string): string {
  return execSync('git log -1 --pretty=%s', { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
}

describe('integration', () => {
  let tempDir: string

  beforeAll(() => {
    // Ensure the project is built
    if (!existsSync(VBT_BIN)) {
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' })
    }
  })

  beforeEach(() => {
    tempDir = createTempRepo()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('bumps patch version from project root', () => {
    runVbt('patch', tempDir)

    expect(readPkg(tempDir).version).toBe('1.0.1')
    expect(getTags(tempDir)).toContain('v1.0.1')
    expect(getLastCommitMessage(tempDir)).toBe('chore: bump version to v1.0.1')
  })

  it('bumps minor version', () => {
    runVbt('minor', tempDir)
    expect(readPkg(tempDir).version).toBe('1.1.0')
  })

  it('bumps major version', () => {
    runVbt('major', tempDir)
    expect(readPkg(tempDir).version).toBe('2.0.0')
  })

  it('sets exact version', () => {
    runVbt('5.0.0', tempDir)
    expect(readPkg(tempDir).version).toBe('5.0.0')
  })

  it('strips v prefix from exact version', () => {
    runVbt('v5.0.0', tempDir)
    expect(readPkg(tempDir).version).toBe('5.0.0')
  })

  it('handles prerelease with identifier', () => {
    runVbt('prerelease alpha', tempDir)
    expect(readPkg(tempDir).version).toBe('1.0.1-alpha.0')
  })

  it('bumps from subdirectory', () => {
    const subDir = join(tempDir, 'src', 'nested')
    mkdirSync(subDir, { recursive: true })

    runVbt('patch', subDir)

    expect(readPkg(tempDir).version).toBe('1.0.1')
    expect(getTags(tempDir)).toContain('v1.0.1')
  })

  it('dry run does not modify anything', () => {
    runVbt('patch --dry-run', tempDir)

    expect(readPkg(tempDir).version).toBe('1.0.0')
    expect(getTags(tempDir)).toEqual([])
  })

  it('--no-commit only updates files', () => {
    runVbt('patch --no-commit', tempDir)

    expect(readPkg(tempDir).version).toBe('1.0.1')
    expect(getTags(tempDir)).toEqual([])
    expect(getLastCommitMessage(tempDir)).toBe('init')
  })

  it('--no-tag commits but does not create tag', () => {
    runVbt('patch --no-tag', tempDir)

    expect(readPkg(tempDir).version).toBe('1.0.1')
    expect(getTags(tempDir)).toEqual([])
    expect(getLastCommitMessage(tempDir)).toBe('chore: bump version to v1.0.1')
  })

  it('replaces version in marked files', () => {
    // Create a file with version marker
    const versionFile = join(tempDir, 'version.ts')
    writeFileSync(
      versionFile,
      'export const VERSION = "1.0.0"; // vbt-version\nexport const OTHER = "1.0.0";\n',
    )

    // Create config
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ files: ['version.ts'] }))

    execSync('git add -A && git commit -m "add files"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    const content = readFileSync(versionFile, 'utf8')
    expect(content).toContain('VERSION = "1.0.1"')
    expect(content).toContain('OTHER = "1.0.0"') // unmarked line not changed
  })

  it('replaces version with offset syntax', () => {
    const readmeFile = join(tempDir, 'README.md')
    writeFileSync(readmeFile, '<!-- vbt-version +2 -->\n```bash\nnpm install test-pkg@1.0.0\n```\n')

    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ files: ['README.md'] }))

    execSync('git add -A && git commit -m "add files"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    const content = readFileSync(readmeFile, 'utf8')
    expect(content).toContain('test-pkg@1.0.1')
    expect(content).toContain('<!-- vbt-version +2 -->') // marker untouched
  })

  it('rejects unknown config keys', () => {
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ unknownOption: true }))

    execSync('git add -A && git commit -m "add config"', { cwd: tempDir, stdio: 'pipe' })

    expect(() => runVbt('patch', tempDir)).toThrow()
  })

  it('rejects invalid config types', () => {
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ push: 'yes' }))

    execSync('git add -A && git commit -m "add config"', { cwd: tempDir, stdio: 'pipe' })

    expect(() => runVbt('patch', tempDir)).toThrow()
  })

  it('rejects unknown CLI flags', () => {
    expect(() => runVbt('patch --foobar', tempDir)).toThrow()
  })

  it('rejects extra positional args', () => {
    expect(() => runVbt('prerelease alpha extra', tempDir)).toThrow()
  })

  it('rejects --config without value', () => {
    expect(() => runVbt('patch --config', tempDir)).toThrow()
  })

  it('commitMessage:false disables tag via validation', () => {
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ commitMessage: false }))

    execSync('git add -A && git commit -m "add config"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    expect(readPkg(tempDir).version).toBe('1.0.1')
    expect(getTags(tempDir)).toEqual([]) // no tag because commitMessage is false
    expect(getLastCommitMessage(tempDir)).toBe('add config') // no new commit
  })

  it('rejects duplicate tag', () => {
    runVbt('patch', tempDir)
    expect(readPkg(tempDir).version).toBe('1.0.1')
    expect(getTags(tempDir)).toContain('v1.0.1')

    // Try to bump to same version
    expect(() => runVbt('1.0.1', tempDir)).toThrow()
  })

  it('preserves package.json formatting', () => {
    // Overwrite with 4-space indent
    writeFileSync(
      join(tempDir, 'package.json'),
      '{\n    "name": "test-pkg",\n    "version": "1.0.0"\n}\n',
    )
    execSync('git add -A && git commit -m "reformat"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    const content = readFileSync(join(tempDir, 'package.json'), 'utf8')
    expect(content).toContain('    "name"') // 4-space indent preserved
    expect(content.endsWith('\n')).toBe(true) // final newline preserved
  })

  it('bumps from subdirectory with marker files at project root', () => {
    const versionFile = join(tempDir, 'src', 'version.ts')
    mkdirSync(join(tempDir, 'src'))
    writeFileSync(versionFile, 'export const V = "1.0.0"; // vbt-version\n')

    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ files: ['src/version.ts'] }))

    execSync('git add -A && git commit -m "add files"', { cwd: tempDir, stdio: 'pipe' })

    const subDir = join(tempDir, 'src')
    runVbt('patch', subDir)

    expect(readPkg(tempDir).version).toBe('1.0.1')
    const content = readFileSync(versionFile, 'utf8')
    expect(content).toContain('"1.0.1"')
  })
})

describe('manifest types', () => {
  let tempDir: string

  beforeAll(() => {
    if (!existsSync(VBT_BIN)) {
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' })
    }
  })

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vbt-manifest-'))
    execSync('git init', { cwd: tempDir, stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' })
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('bumps Cargo.toml', () => {
    writeFileSync(
      join(tempDir, 'Cargo.toml'),
      '[package]\nname = "my-crate"\nversion = "1.0.0"\nedition = "2021"\n',
    )
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ manifest: 'Cargo.toml' }))
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    const content = readFileSync(join(tempDir, 'Cargo.toml'), 'utf8')
    expect(content).toContain('version = "1.0.1"')
    expect(getTags(tempDir)).toContain('v1.0.1')
  })

  it('bumps pyproject.toml', () => {
    writeFileSync(
      join(tempDir, 'pyproject.toml'),
      [
        '[build-system]',
        'requires = ["setuptools"]',
        '',
        '[project]',
        'name = "my-pkg"',
        'version = "1.0.0"',
        '',
        '[tool.pytest]',
        'addopts = "-v"',
        '',
      ].join('\n'),
    )
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ manifest: 'pyproject.toml' }))
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    const content = readFileSync(join(tempDir, 'pyproject.toml'), 'utf8')
    expect(content).toContain('version = "1.0.1"')
    // Other sections untouched
    expect(content).toContain('[build-system]')
    expect(content).toContain('requires = ["setuptools"]')
    expect(content).toContain('[tool.pytest]')
    expect(content).toContain('addopts = "-v"')
  })

  it('bumps pubspec.yaml', () => {
    writeFileSync(
      join(tempDir, 'pubspec.yaml'),
      'name: my_app\nversion: 1.0.0\ndescription: A test app\n',
    )
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ manifest: 'pubspec.yaml' }))
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    const content = readFileSync(join(tempDir, 'pubspec.yaml'), 'utf8')
    expect(content).toContain('version: 1.0.1')
    expect(getTags(tempDir)).toContain('v1.0.1')
  })

  it('bumps composer.json', () => {
    writeFileSync(
      join(tempDir, 'composer.json'),
      `${JSON.stringify({ name: 'vendor/pkg', version: '1.0.0' }, null, 2)}\n`,
    )
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ manifest: 'composer.json' }))
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    const content = JSON.parse(readFileSync(join(tempDir, 'composer.json'), 'utf8'))
    expect(content.version).toBe('1.0.1')
    expect(content.name).toBe('vendor/pkg')
    expect(getTags(tempDir)).toContain('v1.0.1')
  })

  it('bumps deno.json', () => {
    writeFileSync(
      join(tempDir, 'deno.json'),
      `${JSON.stringify({ name: 'my-deno-pkg', version: '1.0.0' }, null, 2)}\n`,
    )
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ manifest: 'deno.json' }))
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    const content = JSON.parse(readFileSync(join(tempDir, 'deno.json'), 'utf8'))
    expect(content.version).toBe('1.0.1')
    expect(content.name).toBe('my-deno-pkg')
    expect(getTags(tempDir)).toContain('v1.0.1')
  })

  it('bumps vbt.config.json as manifest', () => {
    writeFileSync(
      join(tempDir, 'vbt.config.json'),
      `${JSON.stringify({ manifest: 'vbt.config.json', version: '1.0.0' }, null, 2)}\n`,
    )
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    const content = JSON.parse(readFileSync(join(tempDir, 'vbt.config.json'), 'utf8'))
    expect(content.version).toBe('1.0.1')
    expect(content.manifest).toBe('vbt.config.json')
    expect(getTags(tempDir)).toContain('v1.0.1')
  })

  it('backward compat: packageJson alias works', () => {
    writeFileSync(
      join(tempDir, 'package.json'),
      `${JSON.stringify({ name: 'test-pkg', version: '1.0.0' }, null, 2)}\n`,
    )
    writeFileSync(
      join(tempDir, 'vbt.config.json'),
      JSON.stringify({ packageJson: './package.json' }),
    )
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' })

    runVbt('patch', tempDir)

    expect(readPkg(tempDir).version).toBe('1.0.1')
    expect(getTags(tempDir)).toContain('v1.0.1')
  })

  it('rejects both manifest and packageJson set', () => {
    writeFileSync(
      join(tempDir, 'package.json'),
      `${JSON.stringify({ name: 'test-pkg', version: '1.0.0' }, null, 2)}\n`,
    )
    writeFileSync(
      join(tempDir, 'vbt.config.json'),
      JSON.stringify({ manifest: './package.json', packageJson: './package.json' }),
    )
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' })

    expect(() => runVbt('patch', tempDir)).toThrow()
  })

  it('rejects unsupported manifest', () => {
    writeFileSync(join(tempDir, 'setup.py'), 'version = "1.0.0"\n')
    writeFileSync(join(tempDir, 'vbt.config.json'), JSON.stringify({ manifest: 'setup.py' }))
    execSync('git add -A && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' })

    expect(() => runVbt('patch', tempDir)).toThrow()
  })
})
