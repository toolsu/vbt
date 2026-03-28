import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Config } from './types.js'
import { DEFAULT_CONFIG } from './types.js'

/**
 * Possible configuration file names (checked in order)
 */
const CONFIG_FILE_NAMES = ['vbt.config.json', 'vbt.config.js', 'vbt.config.mjs', 'vbt.config.cjs']

const VALID_CONFIG_KEYS = new Set(Object.keys(DEFAULT_CONFIG))

/**
 * Find the project root by looking for package.json
 */
export function findProjectRoot(startPath: string = process.cwd()): string {
  let currentPath = startPath
  while (currentPath !== dirname(currentPath)) {
    if (existsSync(resolve(currentPath, 'package.json'))) {
      return currentPath
    }
    currentPath = dirname(currentPath)
  }
  return startPath
}

/**
 * Load configuration from package.json
 */
function loadConfigFromPackageJson(projectRoot: string): Partial<Config> | null {
  const packageJsonPath = resolve(projectRoot, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return null
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    return packageJson.vbt || null
  } catch (error) {
    console.warn(`Warning: Failed to parse package.json: ${error}`)
    return null
  }
}

/**
 * Dynamic import wrapper (overridable for testing)
 */
export const imports = {
  dynamicImport: (path: string): Promise<Record<string, unknown>> => import(path),
}

/**
 * Load configuration from a standalone config file
 */
async function loadConfigFromFile(configPath: string): Promise<Partial<Config> | null> {
  if (!existsSync(configPath)) {
    return null
  }

  try {
    // For JSON files, read directly
    if (configPath.endsWith('.json')) {
      const content = readFileSync(configPath, 'utf8')
      return JSON.parse(content)
    }

    // For JS files, use dynamic import
    if (configPath.endsWith('.js') || configPath.endsWith('.mjs') || configPath.endsWith('.cjs')) {
      const imported = await imports.dynamicImport(pathToFileURL(configPath).href)
      return imported.default || imported
    }

    return null
  } catch (error) {
    console.warn(`Warning: Failed to load config from ${configPath}: ${error}`)
    return null
  }
}

/**
 * Find and load configuration file
 */
async function findConfigFile(projectRoot: string): Promise<Partial<Config> | null> {
  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = resolve(projectRoot, fileName)
    const config = await loadConfigFromFile(configPath)
    if (config) {
      return config
    }
  }
  return null
}

/**
 * Load configuration from custom path
 */
async function loadCustomConfig(
  customPath: string,
  projectRoot: string,
): Promise<Partial<Config> | null> {
  const absolutePath = resolve(projectRoot, customPath)
  return await loadConfigFromFile(absolutePath)
}

/**
 * Merge configurations with priority: CLI options > custom config > config file > package.json > defaults
 */
function mergeConfigs(...configs: (Partial<Config> | null)[]): Required<Config> {
  const merged: Config = { ...DEFAULT_CONFIG }

  for (const config of configs) {
    if (config) {
      Object.assign(merged, config)
    }
  }

  return merged as Required<Config>
}

/**
 * Load and merge all configuration sources
 */
export async function loadConfig(
  customConfigPath?: string,
  cliOverrides?: Partial<Config>,
  projectRoot?: string,
): Promise<Required<Config>> {
  const root = projectRoot ?? findProjectRoot()

  // Load from different sources
  const packageJsonConfig = loadConfigFromPackageJson(root)
  const fileConfig = customConfigPath
    ? await loadCustomConfig(customConfigPath, root)
    : await findConfigFile(root)

  // Merge in priority order
  return mergeConfigs(packageJsonConfig, fileConfig, cliOverrides ?? null)
}

/**
 * Validate a single config field's type
 */
function validateFieldType(
  key: string,
  value: unknown,
  expected: 'boolean' | 'string' | 'string|false' | 'string[]',
): void {
  switch (expected) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`Config error: "${key}" must be a boolean (got ${JSON.stringify(value)})`)
      }
      break
    case 'string':
      if (typeof value !== 'string') {
        throw new Error(`Config error: "${key}" must be a string (got ${JSON.stringify(value)})`)
      }
      break
    case 'string|false':
      if (value !== false && typeof value !== 'string') {
        throw new Error(
          `Config error: "${key}" must be a string or false (got ${JSON.stringify(value)})`,
        )
      }
      break
    case 'string[]':
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        throw new Error(
          `Config error: "${key}" must be an array of strings (got ${JSON.stringify(value)})`,
        )
      }
      break
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: Required<Config>): void {
  // Check for unknown keys
  for (const key of Object.keys(config)) {
    if (!VALID_CONFIG_KEYS.has(key)) {
      throw new Error(
        `Unknown configuration option: "${key}".\nValid options: ${[...VALID_CONFIG_KEYS].join(', ')}`,
      )
    }
  }

  // Type checks
  validateFieldType('requireCleanWorkingDirectory', config.requireCleanWorkingDirectory, 'boolean')
  validateFieldType('preBumpCheck', config.preBumpCheck, 'string|false')
  validateFieldType('packageJson', config.packageJson, 'string')
  validateFieldType('files', config.files, 'string[]')
  validateFieldType('marker', config.marker, 'string')
  validateFieldType('commitMessage', config.commitMessage, 'string|false')
  validateFieldType('commitFiles', config.commitFiles, 'string[]')
  validateFieldType('tag', config.tag, 'string|false')
  validateFieldType('tagMessage', config.tagMessage, 'string|false')
  validateFieldType('push', config.push, 'boolean')
  validateFieldType('postBumpHook', config.postBumpHook, 'string|false')
  validateFieldType('verbose', config.verbose, 'boolean')
  validateFieldType('dryRun', config.dryRun, 'boolean')

  // Value checks
  if (typeof config.packageJson === 'string' && !config.packageJson) {
    throw new Error('Config error: "packageJson" path cannot be an empty string')
  }

  // Template placeholder checks
  if (typeof config.commitMessage === 'string' && !config.commitMessage.includes('{{version}}')) {
    console.warn('Warning: commitMessage should include {{version}} placeholder. Using default.')
    config.commitMessage = DEFAULT_CONFIG.commitMessage
  }

  if (typeof config.tag === 'string' && !config.tag.includes('{{version}}')) {
    console.warn('Warning: tag should include {{version}} placeholder. Using default.')
    config.tag = DEFAULT_CONFIG.tag
  }

  if (
    typeof config.tag === 'string' &&
    typeof config.tagMessage === 'string' &&
    !config.tagMessage.includes('{{version}}')
  ) {
    console.warn('Warning: tagMessage should include {{version}} placeholder. Using default.')
    config.tagMessage = DEFAULT_CONFIG.tagMessage
  }

  // Semantic validation: commitMessage:false → tag and push must be disabled
  if (!config.commitMessage && config.tag) {
    console.warn(
      'Warning: tag is disabled because commitMessage is false ' +
        '(tag would point to the pre-bump commit). Set commitMessage to a string to enable tags.',
    )
    config.tag = false
  }
  if (!config.commitMessage && config.push) {
    config.push = false
  }
}
