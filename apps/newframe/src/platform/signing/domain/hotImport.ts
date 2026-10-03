export type HotSignerImport = {
  address: string
  secret: { kind: 'seed'; seed: string; path: string } | { kind: 'key'; privateKey: string }
}
