import { z } from 'zod'

// The tray CSP blocks Zod's new Function capability probe.
z.config({ jitless: true })
