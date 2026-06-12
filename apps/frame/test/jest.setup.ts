// jsdom doesn't provide TextEncoder/TextDecoder, which @noble/hashes
// (a dependency of @ethereumjs/util) requires at import time
import { TextEncoder, TextDecoder } from 'util'

if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder as any
