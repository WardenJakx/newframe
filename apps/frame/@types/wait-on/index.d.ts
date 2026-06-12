declare module 'wait-on' {
  interface WaitOnOptions {
    resources: string[]
    delay?: number
    interval?: number
    timeout?: number
    reverse?: boolean
    simultaneous?: number
    verbose?: boolean
    window?: number
    validateStatus?: (status: number) => boolean
  }

  function waitOn(options: WaitOnOptions): Promise<void>

  export = waitOn
}
