import crypto from 'crypto'

const stringToKey = (pass: string) => {
  const hash = crypto.createHash('sha256').update(pass)
  return Buffer.from(hash.digest('hex').substring(0, 32))
}

export default { stringToKey }
