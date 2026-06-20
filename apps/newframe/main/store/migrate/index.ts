const latest = 1

export default {
  apply: (state: any) => {
    state.main._version = state.main._version || latest

    return state
  },
  latest
}
