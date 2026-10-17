import { defineProject } from 'vitest/config'
import { manualIntegrations } from './test/e2e/support/integrations'

export default defineProject({
  test: {
    name: 'plugin',
    include: ['test/e2e/plugins/**/*.e2e.ts', ...manualIntegrations().map(kind => `test/e2e/integrations/${kind}.e2e.ts`)],
    exclude: ['**/archive/**', '**/dist/**', '**/node_modules/**', '**/target/**'],
    globalSetup: ['./test/e2e/setup-plugin.ts'],
    environment: 'node',
    fileParallelism: false,
    allowOnly: false,
    retry: 0,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
