const fs = jest.requireActual('fs')

let writtenData: any

const mock = {
  ...fs,
  __getWrittenData: () => writtenData,
  writeSync: (...args: any[]) => {
    writtenData = args[1]
    return fs.writeSync(...args)
  },
  readFileSync: (...args: any[]) => {
    const path = args[0]
    if (path.includes('config.json')) {
      return JSON.stringify({
        main: {
          __: {
            1: {
              main: {
                _version: 1,
                instanceId: 'test-frame'
              }
            }
          }
        }
      })
    }

    return fs.readFileSync(...args)
  }
}

module.exports = mock
