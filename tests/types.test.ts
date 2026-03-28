import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, RELEASE_TYPES } from '../src/types.js'

describe('RELEASE_TYPES', () => {
  it('contains exactly 7 release types', () => {
    expect(RELEASE_TYPES).toHaveLength(7)
  })

  it('contains all expected types', () => {
    expect(RELEASE_TYPES).toContain('major')
    expect(RELEASE_TYPES).toContain('premajor')
    expect(RELEASE_TYPES).toContain('minor')
    expect(RELEASE_TYPES).toContain('preminor')
    expect(RELEASE_TYPES).toContain('patch')
    expect(RELEASE_TYPES).toContain('prepatch')
    expect(RELEASE_TYPES).toContain('prerelease')
  })
})

describe('DEFAULT_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_CONFIG.requireCleanWorkingDirectory).toBe(true)
    expect(DEFAULT_CONFIG.preBumpCheck).toBe(false)
    expect(DEFAULT_CONFIG.packageJson).toBe('./package.json')
    expect(DEFAULT_CONFIG.files).toEqual([])
    expect(DEFAULT_CONFIG.marker).toBe('vbt-version')
    expect(DEFAULT_CONFIG.commitMessage).toBe('chore: bump version to v{{version}}')
    expect(DEFAULT_CONFIG.commitFiles).toEqual([])
    expect(DEFAULT_CONFIG.tag).toBe('v{{version}}')
    expect(DEFAULT_CONFIG.tagMessage).toBe('chore: release v{{version}}')
    expect(DEFAULT_CONFIG.push).toBe(false)
    expect(DEFAULT_CONFIG.postBumpHook).toBe(false)
    expect(DEFAULT_CONFIG.verbose).toBe(false)
    expect(DEFAULT_CONFIG.dryRun).toBe(false)
  })

  it('has no undefined values', () => {
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      expect(value, `DEFAULT_CONFIG.${key} should not be undefined`).not.toBeUndefined()
    }
  })

  it('packageJson is a string (not string|false)', () => {
    expect(typeof DEFAULT_CONFIG.packageJson).toBe('string')
  })
})
