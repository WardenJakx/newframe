type Update = (...args: any[]) => void

export const setLayerPop = (u: Update, pop: any) => {
  u('layerPop', () => pop)
}

export const setHover = (u: Update, hover: any) => {
  u('hover', () => hover)
}

export const setSelect = (u: Update, select: any) => {
  u('select', () => select)
}

export const setUser = (u: Update, userId: string, user: any) => {
  u('users', userId, () => user)
}

export const setUserInventory = (u: Update, userId: string, inventory: any) => {
  if (!userId || !inventory) return
  u('users', userId, (user: any) => {
    user.inventory = inventory
    return user
  })
}

export const setUserAvatar = (u: Update, userId: string, avatar: any) => {
  if (!userId || !avatar) return
  u('users', userId, (user: any) => {
    user.avatar = avatar
    return user
  })
}

export const setTheme = (u: Update, theme: any) => {
  u('theme', () => theme)
}

export const setBlob = (u: Update, blob: any, location: any, error?: any) => {
  if (error) {
    console.error(error)
  } else {
    u('blobMap', location, () => blob)
  }
}

export const setScrollBarWidth = (u: Update, width: number) => {
  u('scrollBarWidth', () => width)
}
