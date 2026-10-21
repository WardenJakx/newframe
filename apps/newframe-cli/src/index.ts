#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises'

import { isDesktopClientError } from '@newframe/desktop-api/client'
import { type FlashQuoteRequest, FlashQuoteRequestSchema } from '@newframe/flash/contracts'
import { getReceiveAsset, getSpentAsset } from '@newframe/flash/pair'

import { NewframeClient } from './client.ts'

const usage = `newframe session start --name NAME [--description TEXT] [--duration SECONDS]
newframe session show|revoke
newframe rpc METHOD [--params JSON_OR_FILE] [--chain-id ID]
newframe flash quote --request FILE|- [--out FILE]  (side applies to targetAsset; contraAsset is the pricing asset, e.g. USDC; qty is the amount spent: target when selling, contra when buying)
newframe flash submit --quote FILE|-
newframe flash orders [--status STATUS] [--page-size NUMBER]
newframe flash order|watch|cancel ORDER_ID [--timeout SECONDS]`

function argumentsOf(argv: string[]) {
  const positionals: string[] = []
  const options: Record<string, string | undefined> = {}
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }
    const separator = arg.indexOf('=')
    const key = arg.slice(2, separator < 0 ? undefined : separator)
    const inlineValue = separator < 0 ? undefined : arg.slice(separator + 1)
    if (!key) {
      throw new Error(`Invalid argument: ${arg}`)
    }
    const value = inlineValue ?? argv.at(++index)
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }
    options[key] = value
  }
  return { positionals, options }
}

function option(options: Record<string, string | undefined>, key: string) {
  const value = options[key]
  if (!value) {
    throw new Error(`Missing --${key}`)
  }
  return value
}

function positiveNumber(value: string, label: string) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return number
}

function describeQuoteRequest(request: FlashQuoteRequest) {
  const spent = getSpentAsset(request).symbol
  const received = getReceiveAsset(request).symbol
  return `${request.side} ${request.targetAsset.symbol}: spend ${request.qty ?? request.inputAmount} ${spent} for ${received}`
}

async function jsonInput(source: string) {
  const text = source === '-' ? await Bun.stdin.text() : await readFile(source, 'utf8')
  return JSON.parse(text) as unknown
}

async function jsonOrFile(source: string) {
  if (source === '-' || source.startsWith('/') || source.startsWith('.')) {
    return jsonInput(source)
  }
  try {
    return JSON.parse(source) as unknown
  } catch {
    return jsonInput(source)
  }
}

export async function run(argv = process.argv.slice(2), client = new NewframeClient()): Promise<unknown> {
  if (argv[0] === 'help' || argv.includes('--help') || argv.includes('-h')) {
    return { usage }
  }
  const { positionals, options } = argumentsOf(argv)
  const [group, command, id] = positionals
  if (group === 'session') {
    if (command === 'start') {
      return client.startSession({
        name: option(options, 'name'),
        ...(options.description ? { description: options.description } : {}),
        ...(options.url ? { url: options.url } : {}),
        durationSeconds: positiveNumber(options.duration ?? '600', 'Duration')
      })
    }
    if (command === 'show') {
      return client.showSession()
    }
    if (command === 'revoke') {
      return client.revokeSession()
    }
  }
  if (group === 'rpc' && command) {
    const params = options.params ? await jsonOrFile(options.params) : []
    if (!Array.isArray(params)) {
      throw new Error('RPC params must be a JSON array')
    }
    const chainId = options['chain-id'] ? positiveNumber(options['chain-id'], 'Chain id') : undefined
    return { result: await client.rpc(command, params, chainId) }
  }
  if (group === 'flash') {
    if (command === 'quote') {
      const request = FlashQuoteRequestSchema.parse(await jsonInput(option(options, 'request')))
      const intent = describeQuoteRequest(request)
      const envelope = await client.quote(request).catch((error: unknown) => {
        if (error instanceof Error) {
          error.message = `${intent}: ${error.message}`
        }
        throw error
      })
      const { quote } = envelope
      const summary = `${intent}; receive ~${quote.outputAmount} ${quote.receiveAsset.symbol}`
      if (options.out) {
        await writeFile(options.out, `${JSON.stringify(envelope, null, 2)}\n`, { flag: 'wx' })
      }
      return { summary, ...envelope }
    }
    if (command === 'submit') {
      return client.submit(await jsonInput(option(options, 'quote')))
    }
    if (command === 'orders') {
      return client.orders({
        ...(options.status ? { status: options.status } : {}),
        ...(options['page-size'] ? { pageSize: positiveNumber(options['page-size'], 'Page size') } : {})
      })
    }
    if (command === 'order' && id) {
      return client.order(id)
    }
    if (command === 'watch' && id) {
      return client.watch(
        id,
        options.timeout ? { timeoutMs: positiveNumber(options.timeout, 'Timeout') * 1_000 } : {}
      )
    }
    if (command === 'cancel' && id) {
      return client.cancel(id)
    }
  }
  throw new Error(usage)
}

if (import.meta.main) {
  try {
    const result = await run()
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error)
    if (isDesktopClientError(error) && error.data?.httpStatus) {
      message = `${error.data.httpStatus}: ${message}`
    }
    process.stderr.write(`${JSON.stringify({ error: message })}\n`)
    process.exitCode = 1
  }
}
