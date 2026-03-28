import { describe, expect, it } from 'vitest'
import { getManifestHandler } from '../src/manifest.js'

describe('JsonManifestHandler', () => {
  const handler = getManifestHandler('package.json')

  describe('readVersion', () => {
    it('reads version from JSON', () => {
      const content = '{\n  "name": "test",\n  "version": "1.2.3"\n}\n'
      expect(handler.readVersion(content)).toBe('1.2.3')
    })

    it('returns null when no version field', () => {
      const content = '{\n  "name": "test"\n}\n'
      expect(handler.readVersion(content)).toBeNull()
    })

    it('returns null for empty version', () => {
      const content = '{\n  "version": ""\n}\n'
      expect(handler.readVersion(content)).toBeNull()
    })
  })

  describe('writeVersion', () => {
    it('writes version preserving 2-space indent', () => {
      const content = '{\n  "name": "test",\n  "version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toBe('{\n  "name": "test",\n  "version": "2.0.0"\n}\n')
    })

    it('preserves 4-space indent', () => {
      const content = '{\n    "name": "test",\n    "version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('    "name"')
      expect(result).toContain('"version": "2.0.0"')
    })

    it('preserves tab indent', () => {
      const content = '{\n\t"name": "test",\n\t"version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('\t"name"')
    })

    it('defaults to 2-space indent for minified JSON', () => {
      const content = '{"name":"test","version":"1.0.0"}'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('  "version": "2.0.0"')
    })

    it('defaults to 2-space indent when lines have no leading whitespace', () => {
      const content = '{\n"name": "test",\n"version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('  "version": "2.0.0"')
    })

    it('preserves trailing newline', () => {
      const content = '{\n  "version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result.endsWith('\n')).toBe(true)
    })

    it('preserves absence of trailing newline', () => {
      const content = '{\n  "version": "1.0.0"\n}'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result.endsWith('\n')).toBe(false)
    })
  })
})

describe('JsoncManifestHandler', () => {
  const handler = getManifestHandler('deno.jsonc')

  describe('readVersion', () => {
    it('reads version from JSONC with line comments', () => {
      const content = '{\n  // Deno config\n  "name": "@scope/pkg",\n  "version": "1.2.3"\n}\n'
      expect(handler.readVersion(content)).toBe('1.2.3')
    })

    it('reads version from JSONC with block comments', () => {
      const content = '{\n  /* name */ "name": "pkg",\n  "version": "1.2.3"\n}\n'
      expect(handler.readVersion(content)).toBe('1.2.3')
    })

    it('reads version with trailing commas', () => {
      const content = '{\n  "version": "1.2.3",\n}\n'
      expect(handler.readVersion(content)).toBe('1.2.3')
    })

    it('reads version from JSONC with escape sequences in strings', () => {
      const content = '{\n  "desc": "line1\\nline2",\n  "version": "1.2.3"\n}\n'
      expect(handler.readVersion(content)).toBe('1.2.3')
    })

    it('returns null when no version', () => {
      const content = '{\n  // no version\n  "name": "pkg"\n}\n'
      expect(handler.readVersion(content)).toBeNull()
    })
  })

  describe('writeVersion', () => {
    it('replaces version preserving comments', () => {
      const content = '{\n  // Deno config\n  "version": "1.0.0",\n  "tasks": {}\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toBe('{\n  // Deno config\n  "version": "2.0.0",\n  "tasks": {}\n}\n')
    })

    it('preserves block comments', () => {
      const content = '{\n  /* version */ "version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('/* version */ "version": "2.0.0"')
    })

    it('handles comment between key and colon', () => {
      const content = '{\n  "version" /* c */ : "1.0.0",\n  "name": "demo"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('"version" /* c */ : "2.0.0"')
    })

    it('handles line comment between key and colon', () => {
      const content = '{\n  "version" // comment\n  : "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain(': "2.0.0"')
    })

    it('handles escaped characters in value strings', () => {
      const content = '{\n  "desc": "line1\\nline2",\n  "version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('"version": "2.0.0"')
      expect(result).toContain('"desc": "line1\\nline2"')
    })

    it('handles escaped characters in key names at depth 1', () => {
      const content = '{\n  "a\\nb": "x",\n  "version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('"version": "2.0.0"')
    })

    it('handles escaped characters in nested value strings', () => {
      // Content has literal \n escape sequence inside a JSON string value
      const content = '{\n  "a": { "b": "line1\\nline2" },\n  "version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('"version": "2.0.0"')
      expect(result).toContain('"b": "line1\\nline2"')
    })

    it('handles version value with escape sequence', () => {
      // Content has literal \n inside the version value; parser reads the char after backslash
      const content = '{\n  "version": "1.0.0\\n"\n}\n'
      const result = handler.writeVersion(content, '1.0.0n', '2.0.0')
      expect(result).toContain('"version": "2.0.0"')
    })

    it('returns content unchanged when version value is not a string', () => {
      const content = '{\n  "version": 123\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toBe(content)
    })

    it('returns content unchanged when version does not match', () => {
      const content = '{\n  "version": "3.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toBe(content)
    })

    it('replaces only top-level version, not nested', () => {
      const content = '{\n  "tasks": { "version": "1.0.0" },\n  "version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('"tasks": { "version": "1.0.0" }')
      expect(result).toContain('"version": "2.0.0"\n}')
    })

    it('replaces only top-level version with deeply nested same value', () => {
      const content = '{\n  "a": { "b": { "version": "1.0.0" } },\n  "version": "1.0.0"\n}\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('"b": { "version": "1.0.0" }')
      expect(result).toMatch(/"version": "2\.0\.0"\n}/)
    })
  })
})

describe('TomlManifestHandler', () => {
  describe('Cargo.toml', () => {
    const handler = getManifestHandler('Cargo.toml')

    describe('readVersion', () => {
      it('reads version from Cargo.toml', () => {
        const content = '[package]\nname = "my-crate"\nversion = "1.2.3"\nedition = "2021"\n'
        expect(handler.readVersion(content)).toBe('1.2.3')
      })

      it('reads version with single quotes', () => {
        const content = "[package]\nversion = '1.2.3'\n"
        expect(handler.readVersion(content)).toBe('1.2.3')
      })

      it('reads version with spaces around equals', () => {
        const content = '[package]\nversion  =  "1.2.3"\n'
        expect(handler.readVersion(content)).toBe('1.2.3')
      })

      it('returns null when no version field', () => {
        const content = '[package]\nname = "my-crate"\n'
        expect(handler.readVersion(content)).toBeNull()
      })
    })

    describe('writeVersion', () => {
      it('replaces version in Cargo.toml', () => {
        const content = '[package]\nname = "my-crate"\nversion = "1.0.0"\nedition = "2021"\n'
        const result = handler.writeVersion(content, '1.0.0', '2.0.0')
        expect(result).toBe('[package]\nname = "my-crate"\nversion = "2.0.0"\nedition = "2021"\n')
      })

      it('does not touch version in [dependencies]', () => {
        const content =
          '[package]\nversion = "1.0.0"\n\n[dependencies]\nserde = { version = "1.0.0" }\n'
        const result = handler.writeVersion(content, '1.0.0', '2.0.0')
        expect(result).toContain('[package]\nversion = "2.0.0"')
        expect(result).toContain('serde = { version = "1.0.0" }')
      })

      it('does not touch version in [workspace.package]', () => {
        const content =
          '[workspace.package]\nversion = "1.0.0"\n\n[package]\nname = "my-crate"\nversion = "1.0.0"\n'
        const result = handler.writeVersion(content, '1.0.0', '2.0.0')
        expect(result).toContain('[workspace.package]\nversion = "1.0.0"')
        expect(result).toContain('[package]\nname = "my-crate"\nversion = "2.0.0"')
      })

      it('preserves single quotes', () => {
        const content = "[package]\nversion = '1.0.0'\n"
        const result = handler.writeVersion(content, '1.0.0', '2.0.0')
        expect(result).toBe("[package]\nversion = '2.0.0'\n")
      })
    })
  })

  describe('pyproject.toml', () => {
    const handler = getManifestHandler('pyproject.toml')

    describe('readVersion', () => {
      it('reads version from [project] section', () => {
        const content =
          '[build-system]\nrequires = ["hatchling"]\n\n[project]\nname = "my-pkg"\nversion = "1.2.3"\n'
        expect(handler.readVersion(content)).toBe('1.2.3')
      })

      it('returns null when version not in [project]', () => {
        const content = '[tool.other]\nversion = "1.2.3"\n\n[project]\nname = "my-pkg"\n'
        expect(handler.readVersion(content)).toBeNull()
      })
    })

    describe('writeVersion', () => {
      it('replaces version only in [project] section', () => {
        const content =
          '[build-system]\nrequires = ["hatchling"]\nbuild-backend = "hatchling.build"\n\n[project]\nname = "my-pkg"\nversion = "1.0.0"\n\n[tool.hatch]\nversion = "1.0.0"\n'
        const result = handler.writeVersion(content, '1.0.0', '2.0.0')
        expect(result).toContain('[project]\nname = "my-pkg"\nversion = "2.0.0"')
        expect(result).toContain('[tool.hatch]\nversion = "1.0.0"')
      })
    })
  })
})

describe('YamlManifestHandler', () => {
  const handler = getManifestHandler('pubspec.yaml')

  describe('readVersion', () => {
    it('reads top-level version', () => {
      const content = 'name: my_app\nversion: 1.2.3\ndescription: A Flutter app\n'
      expect(handler.readVersion(content)).toBe('1.2.3')
    })

    it('reads quoted version', () => {
      const content = 'name: my_app\nversion: "1.2.3"\n'
      expect(handler.readVersion(content)).toBe('1.2.3')
    })

    it('reads single-quoted version', () => {
      const content = "name: my_app\nversion: '1.2.3'\n"
      expect(handler.readVersion(content)).toBe('1.2.3')
    })

    it('reads version with build metadata (Flutter style)', () => {
      const content = 'name: my_app\nversion: 1.2.3+4\n'
      expect(handler.readVersion(content)).toBe('1.2.3+4')
    })

    it('ignores indented version (nested)', () => {
      const content = 'dependencies:\n  version: 1.2.3\n'
      expect(handler.readVersion(content)).toBeNull()
    })

    it('ignores tab-indented version', () => {
      const content = 'dependencies:\n\tversion: 1.2.3\n'
      expect(handler.readVersion(content)).toBeNull()
    })

    it('returns null when no version', () => {
      const content = 'name: my_app\n'
      expect(handler.readVersion(content)).toBeNull()
    })
  })

  describe('writeVersion', () => {
    it('replaces top-level version', () => {
      const content = 'name: my_app\nversion: 1.0.0\ndescription: A Flutter app\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toBe('name: my_app\nversion: 2.0.0\ndescription: A Flutter app\n')
    })

    it('preserves quoted style', () => {
      const content = 'name: my_app\nversion: "1.0.0"\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toBe('name: my_app\nversion: "2.0.0"\n')
    })

    it('does not touch nested version', () => {
      const content = 'version: 1.0.0\ndependencies:\n  some_pkg:\n    version: 1.0.0\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toContain('version: 2.0.0\n')
      expect(result).toContain('    version: 1.0.0')
    })

    it('does not touch tab-indented nested version', () => {
      const content = 'dependencies:\n\tversion: 1.0.0\nversion: 1.0.0\n'
      const result = handler.writeVersion(content, '1.0.0', '2.0.0')
      expect(result).toBe('dependencies:\n\tversion: 1.0.0\nversion: 2.0.0\n')
    })
  })
})

describe('getManifestHandler', () => {
  it('returns JSON handler for package.json', () => {
    expect(getManifestHandler('package.json')).toBeDefined()
  })

  it('returns JSON handler for composer.json', () => {
    expect(getManifestHandler('composer.json')).toBeDefined()
  })

  it('returns JSON handler for deno.json', () => {
    expect(getManifestHandler('deno.json')).toBeDefined()
  })

  it('returns JSON handler for deno.jsonc', () => {
    expect(getManifestHandler('deno.jsonc')).toBeDefined()
  })

  it('returns JSON handler for jsr.json', () => {
    expect(getManifestHandler('jsr.json')).toBeDefined()
  })

  it('returns JSON handler for jsr.jsonc', () => {
    expect(getManifestHandler('jsr.jsonc')).toBeDefined()
  })

  it('returns JSON handler for vbt.config.json', () => {
    expect(getManifestHandler('vbt.config.json')).toBeDefined()
  })

  it('returns JSON handler for path with directory', () => {
    expect(getManifestHandler('./sub/package.json')).toBeDefined()
  })

  it('throws for unsupported filename', () => {
    expect(() => getManifestHandler('unknown.txt')).toThrow()
    expect(() => getManifestHandler('unknown.txt')).toThrow(/Supported/)
  })
})
