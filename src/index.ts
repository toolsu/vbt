#!/usr/bin/env node

import { run } from './core.js'

run(process.argv.slice(2)).catch((error) => {
  console.error('\n❌ An error occurred:')
  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exit(1)
})
