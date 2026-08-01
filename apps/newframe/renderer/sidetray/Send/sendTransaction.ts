export function cleanAddress(address = '') {
  return address.trim().toLowerCase()
}

export function shouldResolveName(input = '') {
  const value = input.trim()

  return !!value && !/\s/.test(value)
}
