import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '../src/types.js'

const VALID_KEYS = new Set(Object.keys(DEFAULT_CONFIG))
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs')

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

import { existsSync, readFileSync } from 'node:fs'
import { imports, loadConfig, validateConfig } from '../src/config.js'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(process, 'cwd').mockReturnValue('/fake/project')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('imports.dynamicImport', () => {
  it('wraps native import()', async () => {
    // Just call the real function to cover it — it will fail on a bogus path
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
})

describe('validateConfig', () => {
  function makeConfig(overrides: Partial<Config> = {}): Required<Config> {
    return { ...DEFAULT_CONFIG, ...overrides } as Required<Config>
  }

  it('accepts valid default config without warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig()
    validateConfig(config)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('throws on empty packageJson string', () => {
    const config = makeConfig({ packageJson: '' })
    expect(() => validateConfig(config)).toThrow('packageJson path cannot be an empty string')
  })

  it('does not throw when packageJson is false', () => {
    const config = makeConfig({ packageJson: false })
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
    const config = makeConfig({ commitMessage: false })
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
    const config = makeConfig({ tag: false })
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
    const config = makeConfig({ tag: false, tagMessage: 'no placeholder' })
    validateConfig(config)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('tagMessage'))
  })

  it('skips tagMessage check when tagMessage is false', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = makeConfig({ tag: 'v{{version}}', tagMessage: false })
    validateConfig(config)
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('tagMessage'))
  })
})

describe('example config files', () => {
  const examplesDir = resolve(__dirname, '..', 'examples')

  for (const file of [
    'vbt.config.json',
    'vbt.config.minimal.json',
    'vbt.config.full.json',
  ]) {
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
      const config = { ...DEFAULT_CONFIG, ...JSON.parse(content) } as Required<Config>
      expect(() => validateConfig(config)).not.toThrow()
      warnSpy.mockRestore()
    })
  }
})
