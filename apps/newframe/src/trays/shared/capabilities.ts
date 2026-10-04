export interface ClipboardCapability {
  writeText(text: string): Promise<unknown>
}

export interface TokenImageCapability {
  hydrateTokenImage(tokenId: string): Promise<unknown>
}
