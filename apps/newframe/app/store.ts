/* globals */

import EventEmitter from 'events'
import Restore from 'react-restore'

import link from '../resources/link'
import {
  applyRestoreActionBatch,
  initializeRendererStateStore,
  type RestoreActionBatch
} from './state/rendererStore'

// const actions = {
//   initialSignerPos: (u, pos) => u('selected.position.initial', () => pos),
//   initialScrollPos: (u, pos) => u('selected.position.scrollTop', () => pos)
// }

import * as actions from '../resources/store/actions.panel'

export default (state: any, _cb?: any) => {
  // Restore is the legacy render-tracking bridge for existing class components.
  // New React UI should read app state through useAppSelector with typed selectors
  // instead of adding new Restore.connect components.
  initializeRendererStateStore(state)

  const store = Restore.create(state, actions)
  ;(store as any).events = new EventEmitter()

  // Feed for relaying state updates
  // store.api.feed((state, actions, obscount) => {
  //   actions.forEach(action => {
  //     action.updates.forEach(update => {
  //       // console.log(update)
  //       // if (update.path.startsWith('main')) return
  //       // if (update.path.startsWith('panel')) return
  //       // link.send('tray:syncPath', update.path, update.value)
  //     })
  //   })
  // })

  link.on('action', (action, ...args) => {
    if (store[action]) store[action](...args)

    if (action === 'stateSync') {
      try {
        applyRestoreActionBatch(JSON.parse(args[0]) as RestoreActionBatch)
      } catch (e) {
        console.error('Renderer State Syncing Error', e)
      }
    }
  })

  return store
}
