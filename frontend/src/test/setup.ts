import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// The admin area is lazy-loaded, and its first import can take a moment under a cold test run.
configure({ asyncUtilTimeout: 4000 })

// jsdom has no ResizeObserver, which Recharts' ResponsiveContainer needs to mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
