import { contractsDir, contractsEnv } from '../core/config.ts'
import { ProcessService } from '../core/process-service.ts'

export function createContractsCommandService(name: string, target: string) {
  return new ProcessService({
    name,
    command: 'make',
    args: [target],
    spawn: {
      cwd: contractsDir,
      env: contractsEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    },
    exitIsFailure: false
  })
}
