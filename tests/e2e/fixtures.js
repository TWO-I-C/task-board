import { test as base, expect } from '@playwright/test'
import { startTestApp } from '../helpers/test-app.mjs'

export const test = base.extend({
  // Playwright 要求第一个参数为依赖解构；本 fixture 没有其他依赖。
  // oxlint-disable-next-line no-empty-pattern
  testApp: [async ({}, provide) => {
    const app = await startTestApp()
    try { await provide(app) } finally { await app.stop() }
  }, { scope: 'worker', timeout: 45_000 }],
  baseURL: async ({ testApp }, provide) => { await provide(testApp.url) },
})

export { expect }
