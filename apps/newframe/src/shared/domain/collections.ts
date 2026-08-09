export function arraysMatch<T>(left: T[] = [], right: T[] = []) {
  return left.length === right.length && left.every((item, index) => right[index] === item)
}

export function arraysEqual<T>(left: T[] = [], right: T[] = []) {
  if (left.length !== right.length) return false
  return arraysMatch(left.sort(), right.sort())
}
