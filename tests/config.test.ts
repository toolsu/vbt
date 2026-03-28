import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type ResolvedConfig } from '../src/types.js'
import { SUPPORTED_MANIFEST_NAMES } from '../src/manifest.js'

const VALID_KEYS = new Set([...Object.keys(DEFAULT_CONFIG), 'packageJson'])
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs')

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

import { existsSync, readFileSync } from 'node:fs'
import { findProjectRoot, imports, loadConfig, validateConfig } from '../src/config.js'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(process, 'cwd').mockReturnValue('/fake/project')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('findProjectRoot', () => {
  it('returns directory containing package.json', () => {
    mockExistsSync.mockImplementation((p) => String(p) === '/fake/project/package.json')
    expect(findProjectRoot('/fake/project')).toBe('/fake/project')
  })

  it('walks up to find package.json', () => {
    mockExistsSync.mockImplementation((p) => String(p) === '/fake/package.json')
    expect(findProjectRoot('/fake/project/nested')).toBe('/fake')
  })

  it('returns startPath when no package.json found', () => {
    mockExistsSync.mockReturnValue(false)
    expect(findProjectRoot('/fake/project')).toBe('/fake/project')
  })

  it('uses process.cwd() as default', () => {
    mockExistsSync.mockImplementation((p) => String(p) === '/fake/project/package.json')
    expect(findProjectRoot()).toBe('/fake/project')
  })

  it('finds root via vbt.config.json', () => {
    mockExistsSync.mockImplementation((p) => String(p) === '/fake/project/vbt.config.json')
    expect(findProjectRoot('/fake/project')).toBe('/fake/project')
  })

  it('walks up to find vbt.config.json', () => {
    mockExistsSync.mockImplementation((p) => String(p) === '/fake/vbt.config.json')
    expect(findProjectRoot('/fake/project/nested')).toBe('/fake')
  })

  it('prefers closer file (either package.json or vbt.config.json)', () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return (
        path === '/fake/project/nested/package.json' || path === '/fake/project/vbt.config.json'
      )
    })
    expect(findProjectRoot('/fake/project/nested')).toBe('/fake/project/nested')
  })

  it('finds nearer vbt.config.json over farther package.json', () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path === '/fake/project/vbt.config.json' || path === '/fake/package.json'
    })
    expect(findProjectRoot('/fake/project')).toBe('/fake/project')
  })

  it('finds root via vbt.config.js', () => {
    mockExistsSync.mockImplementation((p) => String(p) === '/fake/project/vbt.config.js')
    expect(findProjectRoot('/fake/project')).toBe('/fake/project')
  })

  it('finds root via vbt.config.mjs', () => {
    mockExistsSync.mockImplementation((p) => String(p) === '/fake/project/vbt.config.mjs')
    expect(findProjectRoot('/fake/project')).toBe('/fake/project')
  })

  it('finds root via vbt.config.cjs', () => {
    mockExistsSync.mockImplementation((p) => String(p) === '/fake/project/vbt.config.cjs')
    expect(findProjectRoot('/fake/project')).toBe('/fake/project')
  })
})

describe('imports.dynamicImport', () => {
  it('wraps native import()', async () => {
    await expect(imports.dynamicImport('nonexistent-module')).rejects.toThrow()
  })
})

describe('loadConfig', () => {
  it('returns defaults when no config is found', async () => {
    mockExistsSync.mockReturnValue(false)

    const config = await loadConfig()
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('loads config from package.json "vbt" key', async () => {
    mockExistsSync.mockImplementation((p) => {
      return String(p).endsWith('package.json')
    })
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        name: 'test',
        version: '1.0.0',
        vbt: { push: true },
      }),
    )

    const config = await loadConfig()
    expect(config.push).toBe(true)
  })

  it('returns null from package.json without vbt key', async () => {
    mockExistsSync.mockImplementation((p) => {
      return String(p).endsWith('package.json')
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test', version: '1.0.0' }))

    const config = await loadConfig()
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('handles package.json parse error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockExistsSync.mockImplementation((p) => String(p).endsWith('package.json'))
    mockReadFileSync.mockReturnValue('invalid json{{{')

    const config = await loadConfig()
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse package.json'))
  })

  it('loads config from vbt.config.json', async () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('vbt.config.json')
    })
    mockReadFileSync.mockImplementation((p) => {
      const path = String(p)
      if (path.endsWith('vbt.config.json')) {
        return JSON.stringify({ push: true, verbose: true })
      }
      return JSON.stringify({ name: 'test', version: '1.0.0' })
    })

    const config = await loadConfig()
    expect(config.push).toBe(true)
    expect(config.verbose).toBe(true)
  })

  it('handles invalid JSON config file gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('vbt.config.json')
    })
    mockReadFileSync.mockImplementation((p) => {
      if (String(p).endsWith('vbt.config.json')) return 'not json'
      return JSON.stringify({ name: 'test', version: '1.0.0' })
    })

    const config = await loadConfig()
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load config'))
  })

  it('loads from custom config path', async () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('my-config.json')
    })
    mockReadFileSync.mockImplementation((p) => {
      if (String(p).endsWith('my-config.json')) return JSON.stringify({ push: true })
      return JSON.stringify({ name: 'test', version: '1.0.0' })
    })

    const config = await loadConfig('./my-config.json')
    expect(config.push).toBe(true)
  })

  it('CLI overrides take precedence', async () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('package.json'))
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        name: 'test',
        version: '1.0.0',
        vbt: { verbose: false },
      }),
    )

    const config = await loadConfig(undefined, { verbose: true })
    expect(config.verbose).toBe(true)
  })

  it('file config overrides package.json config', async () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('vbt.config.json')
    })
    mockReadFileSync.mockImplementation((p) => {
      const path = String(p)
      if (path.endsWith('vbt.config.json')) return JSON.stringify({ push: true })
      return JSON.stringify({ name: 'test', version: '1.0.0', vbt: { push: false } })
    })

    const config = await loadConfig()
    expect(config.push).toBe(true)
  })

  it('loads config from JS file with default export', async () => {
    const originalImport = imports.dynamicImport
    imports.dynamicImport = vi.fn().mockResolvedValue({ default: { push: true } })

    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('vbt.config.js')
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test', version: '1.0.0' }))

    const config = await loadConfig()
    expect(config.push).toBe(true)

    imports.dynamicImport = originalImport
  })

  it('loads config from JS file without default export', async () => {
    const originalImport = imports.dynamicImport
    imports.dynamicImport = vi.fn().mockResolvedValue({ push: true, verbose: true })

    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('vbt.config.js')
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test', version: '1.0.0' }))

    const config = await loadConfig()
    expect(config.push).toBe(true)

    imports.dynamicImport = originalImport
  })

  it('handles JS config import failure gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const originalImport = imports.dynamicImport
    imports.dynamicImport = vi.fn().mockRejectedValue(new Error('import failed'))

    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('vbt.config.js')
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test', version: '1.0.0' }))

    const config = await loadConfig()
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load config'))

    imports.dynamicImport = originalImport
  })

  it('loads config from .mjs file', async () => {
    const originalImport = imports.dynamicImport
    imports.dynamicImport = vi.fn().mockResolvedValue({ default: { push: true } })

    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('vbt.config.mjs')
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test', version: '1.0.0' }))

    const config = await loadConfig()
    expect(config.push).toBe(true)

    imports.dynamicImport = originalImport
  })

  it('loads config from .cjs file', async () => {
    const originalImport = imports.dynamicImport
    imports.dynamicImport = vi.fn().mockResolvedValue({ default: { push: true } })

    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('vbt.config.cjs')
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test', version: '1.0.0' }))

    const config = await loadConfig()
    expect(config.push).toBe(true)

    imports.dynamicImport = originalImport
  })

  it('loads custom config path with .js extension', async () => {
    const originalImport = imports.dynamicImport
    imports.dynamicImport = vi.fn().mockResolvedValue({ default: { push: true } })

    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('custom.js')
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test', version: '1.0.0' }))

    const config = await loadConfig('./custom.js')
    expect(config.push).toBe(true)

    imports.dynamicImport = originalImport
  })

  it('finds project root by walking up directories', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/fake/project/nested/dir')
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      if (path === '/fake/project/package.json') return true
      if (path === '/fake/project/nested/dir/package.json') return false
      if (path === '/fake/project/nested/package.json') return false
      return false
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test', version: '1.0.0' }))

    const config = await loadConfig()
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('returns null for non-JSON non-JS files', async () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('custom.txt')
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'test', version: '1.0.0' }))

    const config = await loadConfig('./custom.txt')
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('accepts explicit projectRoot parameter', async () => {
    mockExistsSync.mockImplementation((p) => {
      return String(p) === '/custom/root/package.json'
    })
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ name: 'test', version: '1.0.0', vbt: { push: true } }),
    )

    const config = await loadConfig(undefined, undefined, '/custom/root')
    expect(config.push).toBe(true)
  })

  it('resolves custom config path relative to projectRoot', async () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path === '/fake/project/sub/my.json'
    })
    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === '/fake/project/sub/my.json') return JSON.stringify({ push: true })
      return JSON.stringify({ name: 'test', version: '1.0.0' })
    })

    const config = await loadConfig('./sub/my.json')
    expect(config.push).toBe(true)
  })

  it('maps packageJson to manifest', async () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('package.json') || path.endsWith('vbt.config.json')
    })
    mockReadFileSync.mockImplementation((p) => {
      const path = String(p)
      if (path.endsWith('vbt.config.json'))
        return JSON.stringify({ packageJson: './custom/package.json' })
      return JSON.stringify({ name: 'test', version: '1.0.0' })
    })

    const config = await loadConfig()
    expect(config.manifest).toBe('./custom/package.json')
    expect(config).not.toHaveProperty('packageJson')
  })

  it('loads config without package.json (non-Node project)', async () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p)
      return path.endsWith('vbt.config.json')
    })
    mockReadFileSync.mockImplementation((p) => {
      if (String(p).endsWith('vbt.config.json'))
        return JSON.stringify({ manifest: './Cargo.toml', push: true })
      throw new Error('file not found')
    })

    const config = await loadConfig(undefined, undefined, '/fake/project')
    expect(config.manifest).toBe('./Cargo.toml')
    expect(config.push).toBe(true)
  })
})

describe('validateConfig', () => {
  function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
    return { ...DEFAULT_CONFIG, ...overrides } as ResolvedConfig
  }

  /** Like makeConfig but accepts arbitrary values for testing type validation */
  function makeInvalidConfig(overrides: Record<string, unknown>): ResolvedConfig {
    return { ...DEFAULT_CONFIG, ...overrides } as ResolvedConfig
  }

  it('accepts valid default config without warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig()
    validateConfig(config)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('throws on empty manifest string', () => {
    const config = makeConfig({ manifest: '' })
    expect(() => validateConfig(config)).toThrow('manifest')
  })

  it('throws on unknown config keys', () => {
    const config = { ...DEFAULT_CONFIG, unknownKey: true } as ResolvedConfig
    expect(() => validateConfig(config)).toThrow('Unknown configuration option: "unknownKey"')
  })

  it('throws on multiple unknown keys (reports first)', () => {
    const config = { ...DEFAULT_CONFIG, foo: 1, bar: 2 } as ResolvedConfig
    expect(() => validateConfig(config)).toThrow('Unknown configuration option')
  })

  it('throws when requireCleanWorkingDirectory is not boolean', () => {
    const config = makeInvalidConfig({ requireCleanWorkingDirectory: 'yes' })
    expect(() => validateConfig(config)).toThrow('"requireCleanWorkingDirectory" must be a boolean')
  })

  it('throws when preBumpCheck is not string or false', () => {
    const config = makeInvalidConfig({ preBumpCheck: 123 })
    expect(() => validateConfig(config)).toThrow('"preBumpCheck" must be a string or false')
  })

  it('throws when manifest is not string', () => {
    const config = makeInvalidConfig({ manifest: false })
    expect(() => validateConfig(config)).toThrow('"manifest" must be a string')
  })

  it('throws when files is not string array', () => {
    const config = makeInvalidConfig({ files: 'README.md' })
    expect(() => validateConfig(config)).toThrow('"files" must be an array of strings')
  })

  it('throws when files contains non-string', () => {
    const config = makeInvalidConfig({ files: [1, 2] })
    expect(() => validateConfig(config)).toThrow('"files" must be an array of strings')
  })

  it('throws when marker is not string', () => {
    const config = makeInvalidConfig({ marker: true })
    expect(() => validateConfig(config)).toThrow('"marker" must be a string')
  })

  it('throws when commitMessage is not string or false', () => {
    const config = makeInvalidConfig({ commitMessage: 42 })
    expect(() => validateConfig(config)).toThrow('"commitMessage" must be a string or false')
  })

  it('throws when commitFiles is not string array', () => {
    const config = makeInvalidConfig({ commitFiles: 'file.txt' })
    expect(() => validateConfig(config)).toThrow('"commitFiles" must be an array of strings')
  })

  it('throws when tag is not string or false', () => {
    const config = makeInvalidConfig({ tag: 123 })
    expect(() => validateConfig(config)).toThrow('"tag" must be a string or false')
  })

  it('throws when tagMessage is not string or false', () => {
    const config = makeInvalidConfig({ tagMessage: [] })
    expect(() => validateConfig(config)).toThrow('"tagMessage" must be a string or false')
  })

  it('throws when push is not boolean', () => {
    const config = makeInvalidConfig({ push: 'true' })
    expect(() => validateConfig(config)).toThrow('"push" must be a boolean')
  })

  it('throws when postBumpHook is not string or false', () => {
    const config = makeInvalidConfig({ postBumpHook: {} })
    expect(() => validateConfig(config)).toThrow('"postBumpHook" must be a string or false')
  })

  it('throws when verbose is not boolean', () => {
    const config = makeInvalidConfig({ verbose: 'true' })
    expect(() => validateConfig(config)).toThrow('"verbose" must be a boolean')
  })

  it('throws when dryRun is not boolean', () => {
    const config = makeInvalidConfig({ dryRun: 1 })
    expect(() => validateConfig(config)).toThrow('"dryRun" must be a boolean')
  })

  it('throws on unsupported manifest filename', () => {
    const config = makeConfig({ manifest: './unknown.xml' })
    expect(() => validateConfig(config)).toThrow('Unsupported manifest file')
  })

  it('accepts all supported manifest filenames', () => {
    for (const name of SUPPORTED_MANIFEST_NAMES) {
      const config = makeConfig({ manifest: `./${name}` })
      expect(() => validateConfig(config)).not.toThrow()
    }
  })

  it('accepts manifest with directory prefix', () => {
    const config = makeConfig({ manifest: './some/path/package.json' })
    expect(() => validateConfig(config)).not.toThrow()
  })

  it('allows version key (for vbt.config.json as manifest)', () => {
    const config = { ...DEFAULT_CONFIG, version: '1.0.0' } as unknown as ResolvedConfig
    expect(() => validateConfig(config)).not.toThrow()
  })

  it('warns and resets commitMessage without {{version}}', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ commitMessage: 'no placeholder' })
    validateConfig(config)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('commitMessage'))
    expect(config.commitMessage).toBe(DEFAULT_CONFIG.commitMessage)
  })

  it('skips commitMessage check when false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ commitMessage: false, tag: false })
    validateConfig(config)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('commitMessage'))
  })

  it('warns and resets tag without {{version}}', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ tag: 'latest' })
    validateConfig(config)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tag'))
    expect(config.tag).toBe(DEFAULT_CONFIG.tag)
  })

  it('skips tag check when false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ tag: false, commitMessage: false })
    validateConfig(config)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('tag should'))
  })

  it('warns and resets tagMessage without {{version}} when tag is set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ tag: 'v{{version}}', tagMessage: 'no placeholder' })
    validateConfig(config)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tagMessage'))
    expect(config.tagMessage).toBe(DEFAULT_CONFIG.tagMessage)
  })

  it('skips tagMessage check when tag is false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ tag: false, tagMessage: 'no placeholder', commitMessage: false })
    validateConfig(config)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('tagMessage'))
  })

  it('skips tagMessage check when tagMessage is false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ tag: 'v{{version}}', tagMessage: false })
    validateConfig(config)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('tagMessage'))
  })

  it('disables tag when commitMessage is false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ commitMessage: false, tag: 'v{{version}}' })
    validateConfig(config)
    expect(config.tag).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tag is disabled'))
  })

  it('disables push when commitMessage is false', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ commitMessage: false, push: true })
    validateConfig(config)
    expect(config.push).toBe(false)
  })

  it('does not warn about tag when commitMessage is false and tag is already false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ commitMessage: false, tag: false })
    validateConfig(config)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('tag is disabled'))
  })
})

describe('example config files', () => {
  const examplesDir = resolve(__dirname, '..', 'examples')

  for (const file of ['vbt.config.json', 'vbt.config.minimal.json', 'vbt.config.full.json']) {
    it(`${file} has only valid keys`, () => {
      const content = actualFs.readFileSync(resolve(examplesDir, file), 'utf8')
      const config = JSON.parse(content) as Record<string, unknown>
      for (const key of Object.keys(config)) {
        expect(VALID_KEYS, `unexpected key "${key}" in ${file}`).toContain(key)
      }
    })

    it(`${file} passes validation when merged with defaults`, () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const content = actualFs.readFileSync(resolve(examplesDir, file), 'utf8')
      const config = { ...DEFAULT_CONFIG, ...JSON.parse(content) } as ResolvedConfig
      expect(() => validateConfig(config)).not.toThrow()
      warnSpy.mockRestore()
    })
  }

  it('examples/package.json vbt key has only valid keys', () => {
    const content = actualFs.readFileSync(resolve(examplesDir, 'package.json'), 'utf8')
    const pkg = JSON.parse(content) as { vbt?: Record<string, unknown> }
    expect(pkg.vbt).toBeDefined()
    for (const key of Object.keys(pkg.vbt as Record<string, unknown>)) {
      expect(VALID_KEYS, `unexpected key "${key}" in examples/package.json`).toContain(key)
    }
  })

  it('examples/package.json vbt config passes validation', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const content = actualFs.readFileSync(resolve(examplesDir, 'package.json'), 'utf8')
    const pkg = JSON.parse(content) as { vbt?: Record<string, unknown> }
    const config = { ...DEFAULT_CONFIG, ...pkg.vbt } as ResolvedConfig
    expect(() => validateConfig(config)).not.toThrow()
    warnSpy.mockRestore()
  })
})
