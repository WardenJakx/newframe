const registrar = [
  'function approve(address to, uint256 tokenId)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes _data)'
] as const

const registrarController = [
  'function commit(bytes32 commitment)',
  'function register(string name, address owner, uint256 duration, bytes32 secret) payable',
  'function registerWithConfig(string name, address owner, uint256 duration, bytes32 secret, address resolver, address addr) payable',
  'function renew(string name, uint256 duration) payable'
] as const

export { registrar, registrarController }
