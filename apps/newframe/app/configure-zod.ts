import { z } from 'zod'

// The renderer CSP blocks Zod's new Function capability probe.
z.config({ jitless: true })
