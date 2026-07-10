const latest = 2

export default {
  apply: (state: any) => {
    state.main.colorway = 'dark'
    state.main._version = latest

    return state
  },
  latest
}
