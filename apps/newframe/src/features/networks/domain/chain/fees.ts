export function chainUsesOptimismFees(chainId: number) {
  return [10, 420, 8453, 84531, 84532, 7777777, 11155420].includes(chainId)
}
