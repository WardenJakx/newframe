import { AddHotAccount } from '../Components'
import { validateMnemonic as isValidMnemonic } from 'bip39'

const validateMnemonic = (mnemonic: any) => {
  if (!isValidMnemonic(mnemonic)) return 'INVALID SEED PHRASE'
  if (mnemonic.split(' ').length < 12) return 'SEED PHRASE TOO SHORT'
}

export default function AddPhrase({ accountData }: any) {
  return (
    <AddHotAccount
      {...{
        title: 'Seed Phrase',
        summary: 'A phrase account uses a list of words to backup and restore your account',
        svgName: 'seedling',
        intro: 'Add Phrase Account',
        accountData,
        createSignerMethod: 'createFromPhrase',
        newAccountType: 'seed',
        validateSecret: validateMnemonic
      }}
    />
  )
}
