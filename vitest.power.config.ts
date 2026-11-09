// Separate config so the (slow) power simulation never runs with `npm test`.
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['analysis/**/*.sim.ts'] } })
