export default {
  requireCleanWorkingDirectory: true,
  preBumpCheck: 'npm test && npm run lint',
  files: ['src/version.ts', 'README.md'],
  commitMessage: 'chore: bump to v{{version}}',
  commitFiles: ['CHANGELOG.md', 'package-lock.json'],
  tag: 'v{{version}}',
  tagMessage: 'Release v{{version}}',
  push: true,
}
