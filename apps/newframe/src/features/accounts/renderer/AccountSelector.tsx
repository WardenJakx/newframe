import { useEffect, useState } from 'react'

import { type AccountsCapability, selectAccountAndClose } from './accountsCapability'
import { AccountSelectorView } from './AccountSelectorView'
import { useAccountList } from './useAccountList'

export function AccountSelector({
  capability,
  onOpenChange
}: {
  capability: Pick<AccountsCapability, 'selectAccount'>
  onOpenChange?: (open: boolean) => void
}) {
  const { model } = useAccountList()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  useEffect(() => () => onOpenChange?.(false), [onOpenChange])
  const changeOpen = (next: boolean) => {
    setOpen(next)
    setQuery('')
    onOpenChange?.(next)
  }
  return (
    <AccountSelectorView
      model={model}
      open={open}
      query={query}
      onOpenChange={changeOpen}
      onSearchChange={setQuery}
      onAccountSelect={(accountId) =>
        selectAccountAndClose(capability, accountId, model.currentAccountId, () => changeOpen(false))
      }
    />
  )
}
