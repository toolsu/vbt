import { basename } from 'node:path'

/**
 * Interface for reading/writing version from manifest files
 */
export interface ManifestHandler {
  readVersion(content: string): string | null
  writeVersion(content: string, oldVersion: string, newVersion: string): string
}

/**
 * Detect indentation used in a JSON file
 */
function detectIndent(content: string): string | number {
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
 * JSON manifest handler for package.json, composer.json, deno.json, jsr.json, vbt.config.json
 */
class JsonManifestHandler implements ManifestHandler {
  readVersion(content: string): string | null {
    const data = JSON.parse(content)
    return data.version && typeof data.version === 'string' ? data.version : null
  }

  writeVersion(content: string, _oldVersion: string, newVersion: string): string {
    const hasFinalNewline = content.endsWith('\n')
    const indent = detectIndent(content)
    const data = JSON.parse(content)
    data.version = newVersion
    let result = JSON.stringify(data, null, indent)
    if (hasFinalNewline) {
      result += '\n'
    }
    return result
  }
}

/**
 * Strip JSON comments (// and /* ... *\/) and trailing commas for JSONC support.
 */
function stripJsonComments(content: string): string {
  let result = ''
  let i = 0
  let inString = false

  while (i < content.length) {
    if (inString) {
      if (content[i] === '\\') {
        result += content[i] + (content[i + 1] ?? '')
        i += 2
        continue
      }
      if (content[i] === '"') {
        inString = false
      }
      result += content[i]
      i++
      continue
    }

    // Line comment
    if (content[i] === '/' && content[i + 1] === '/') {
      while (i < content.length && content[i] !== '\n') i++
      continue
    }

    // Block comment
    if (content[i] === '/' && content[i + 1] === '*') {
      i += 2
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++
      i += 2
      continue
    }

    if (content[i] === '"') {
      inString = true
    }

    result += content[i]
    i++
  }

  // Remove trailing commas before } or ]
  return result.replace(/,(\s*[}\]])/g, '$1')
}

/**
 * JSONC manifest handler for deno.jsonc, jsr.jsonc.
 * Strips comments for parsing but uses regex replacement to preserve original formatting.
 */
class JsoncManifestHandler implements ManifestHandler {
  readVersion(content: string): string | null {
    const data = JSON.parse(stripJsonComments(content))
    return data.version && typeof data.version === 'string' ? data.version : null
  }

  writeVersion(content: string, oldVersion: string, newVersion: string): string {
    // Walk the original content tracking brace depth and string/comment state.
    // Only replace the "version" value at depth 1 (top-level object).
    let i = 0
    let depth = 0
    let inString = false

    const skipLineComment = () => {
      while (i < content.length && content[i] !== '\n') i++
    }
    const skipBlockComment = () => {
      i += 2
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++
      i += 2
    }

    while (i < content.length) {
      // Inside a JSON string
      if (inString) {
        if (content[i] === '\\') {
          i += 2
          continue
        }
        if (content[i] === '"') inString = false
        i++
        continue
      }

      // Comments
      if (content[i] === '/' && content[i + 1] === '/') {
        skipLineComment()
        continue
      }
      if (content[i] === '/' && content[i + 1] === '*') {
        skipBlockComment()
        continue
      }

      // Track nesting
      if (content[i] === '{' || content[i] === '[') {
        depth++
        i++
        continue
      }
      if (content[i] === '}' || content[i] === ']') {
        depth--
        i++
        continue
      }

      // At depth 1, look for "version" key
      if (content[i] === '"' && depth === 1) {
        i++ // skip opening quote
        let key = ''
        while (i < content.length && content[i] !== '"') {
          if (content[i] === '\\') {
            key += content[i + 1]
            i += 2
          } else {
            key += content[i]
            i++
          }
        }
        i++ // skip closing quote

        if (key === 'version') {
          // Skip whitespace, colon, and comments (in any order) to reach the value
          while (i < content.length) {
            if (content[i] === '/' && content[i + 1] === '/') {
              skipLineComment()
              continue
            }
            if (content[i] === '/' && content[i + 1] === '*') {
              skipBlockComment()
              continue
            }
            if (/[\s:]/.test(content[i])) {
              i++
              continue
            }
            break
          }
          // Now at the value — expect a quoted string
          if (content[i] === '"') {
            const valStart = i
            i++ // skip opening quote
            let val = ''
            while (i < content.length && content[i] !== '"') {
              if (content[i] === '\\') {
                val += content[i + 1]
                i += 2
              } else {
                val += content[i]
                i++
              }
            }
            i++ // skip closing quote
            if (val === oldVersion) {
              return content.slice(0, valStart + 1) + newVersion + content.slice(i - 1)
            }
          }
        } else {
          // Not the "version" key — the cursor already moved past the key string
          inString = false
        }
      } else {
        if (content[i] === '"') inString = true
        i++
      }
    }
    return content
  }
}

const TOML_VERSION_RE = /^(\s*version\s*=\s*)(["'])([^"']+)\2(.*)$/

/**
 * TOML manifest handler for Cargo.toml, pyproject.toml
 */
class TomlManifestHandler implements ManifestHandler {
  constructor(private readonly section: string | null) {}

  readVersion(content: string): string | null {
    const lines = content.split('\n')
    let inSection = this.section === null

    for (const line of lines) {
      if (line.match(/^\s*\[/)) {
        inSection = this.section === null || line.trim() === `[${this.section}]`
      }
      if (inSection) {
        const match = line.match(TOML_VERSION_RE)
        if (match) {
          return match[3]
        }
      }
    }
    return null
  }

  writeVersion(content: string, oldVersion: string, newVersion: string): string {
    const lines = content.split('\n')
    let inSection = this.section === null
    let replaced = false

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\s*\[/)) {
        inSection = this.section === null || lines[i].trim() === `[${this.section}]`
      }
      if (inSection && !replaced) {
        const match = lines[i].match(TOML_VERSION_RE)
        if (match && match[3] === oldVersion) {
          lines[i] = `${match[1]}${match[2]}${newVersion}${match[2]}${match[4]}`
          replaced = true
        }
      }
    }
    return lines.join('\n')
  }
}

const YAML_VERSION_RE = /^(version:\s*)(["']?)([^"'\s#]+)\2(.*)$/

/**
 * YAML manifest handler for pubspec.yaml
 */
class YamlManifestHandler implements ManifestHandler {
  readVersion(content: string): string | null {
    for (const line of content.split('\n')) {
      if (line.startsWith(' ') || line.startsWith('\t')) continue
      const match = line.match(YAML_VERSION_RE)
      if (match) {
        return match[3]
      }
    }
    return null
  }

  writeVersion(content: string, oldVersion: string, newVersion: string): string {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(' ') || lines[i].startsWith('\t')) continue
      const match = lines[i].match(YAML_VERSION_RE)
      if (match && match[3] === oldVersion) {
        lines[i] = `${match[1]}${match[2]}${newVersion}${match[2]}${match[4]}`
        break
      }
    }
    return lines.join('\n')
  }
}

/**
 * Supported manifest filenames mapped to their format
 */
const SUPPORTED_MANIFESTS: Record<string, 'json' | 'jsonc' | 'toml' | 'yaml'> = {
  'package.json': 'json',
  'composer.json': 'json',
  'deno.json': 'json',
  'deno.jsonc': 'jsonc',
  'jsr.json': 'json',
  'jsr.jsonc': 'jsonc',
  'vbt.config.json': 'json',
  'Cargo.toml': 'toml',
  'pyproject.toml': 'toml',
  'pubspec.yaml': 'yaml',
}

export const SUPPORTED_MANIFEST_NAMES = Object.keys(SUPPORTED_MANIFESTS)

/**
 * Get the appropriate manifest handler for a given filename
 */
export function getManifestHandler(filename: string): ManifestHandler {
  const base = basename(filename)
  const format = SUPPORTED_MANIFESTS[base]

  if (!format) {
    throw new Error(
      `Unsupported manifest file: "${base}".\nSupported: ${SUPPORTED_MANIFEST_NAMES.join(', ')}`,
    )
  }

  switch (format) {
    case 'json':
      return new JsonManifestHandler()
    case 'jsonc':
      return new JsoncManifestHandler()
    case 'toml': {
      const section = base === 'pyproject.toml' ? 'project' : 'package'
      return new TomlManifestHandler(section)
    }
    case 'yaml':
      return new YamlManifestHandler()
    default:
      throw new Error(
        `Unsupported manifest file: "${base}".\nSupported: ${SUPPORTED_MANIFEST_NAMES.join(', ')}`,
      )
  }
}
