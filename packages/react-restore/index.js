/*
  Vendored from react-restore 0.6.2 (MIT, Copyright (c) 2017-present C. Jordan Muir,
  https://github.com/floating/restore).

  Patched for React 19: `connect` no longer uses the legacy context API
  (childContextTypes/getChildContext/contextTypes, removed in React 19).
  Frame creates exactly one store per window, so a connect call that receives an
  explicit store registers it as the module-level default and store-less connect
  calls resolve that default at construction time.
*/

import React from 'react'

/*
  Freeze objects
*/

const freezeShallow = (o) => Object.freeze(o)

const freezeDeep = (o) => {
  if (typeof o === 'object' && o !== null) Object.keys(o).forEach((k) => freezeDeep(o[k]))
  return freezeShallow(o)
}

const freeze = { deep: freezeDeep, shallow: freezeShallow }

/*
  Normalize dot/bracket notation paths
*/

const way = (path) => path.replace(/]\[|]|\[|]/g, '.').replace(/"|'|^\.+|\.+$/g, '')

const pathway = (path) => {
  if (!path) return ''
  if (path.constructor === Array) return way(path.join('.'))
  if (path.constructor === String) return way(path)
  throw new Error('[Restore] Pathway Error')
}

pathway.split = (path) => {
  if (!path || path === '*') return []
  if (path.constructor === Array) return path
  return path.split('.')
}

/*
  Get value at location described by dot notion path
*/

const get = (obj, path) => {
  path = pathway.split(path)
  path.some((key, i) => {
    if (typeof obj !== 'object')
      throw Error(
        `Get path '${path.join('.')}' cannot navigate past key '${path[i - 1]}', '${
          path[i - 1]
        }' is non-object value '${obj}'.`
      )
    obj = obj[key]
    return Boolean(obj === undefined) // Stop navigating the path if we get to undefined value
  })
  return obj
}

/*
  Expand targeted paths to all affected paths
*/

const expand = (internal) => {
  const links = Object.keys(internal.links)
  let paths = internal.queue.paths
  if (paths.indexOf('*') !== -1) return links // Target all observers
  paths.push('*')
  const targets = []
  paths = [...new Set(paths)]
  const peel = (point) => {
    if (point) {
      if (internal.links[point] && targets.indexOf(point) === -1) targets.push(point)
      peel(point.substring(0, point.lastIndexOf('.')))
    }
  }
  paths.forEach((path) => {
    links.forEach((link) => {
      if (link.startsWith(path) && targets.indexOf(link) === -1) targets.push(link) // Target child link
    })
    peel(path) // Target parent links
  })
  return targets
}

/*
  Observer tracking
*/

const observe = (internal, id, run) => {
  const links = internal.observers[id].links.slice(0)
  internal.observers[id].links = []
  run = run || internal.observers[id].run
  internal.track = id
  const self = { store: internal.store, remove: () => internal.store.api.remove(id) }
  const returned = run.call(self, self.store, self.remove)
  internal.track = null
  // When observer links change, remove them
  if (internal.observers[id]) {
    // If observer wasn't removed within run call
    links
      .filter((x) => internal.observers[id].links.indexOf(x) < 0)
      .forEach((link) => {
        const index = internal.links[link].indexOf(id)
        if (index !== -1) internal.links[link].splice(index, 1)
      })
  }
  return returned
}

/*
  Notify observers/watchers
*/

const process = (internal) => {
  if (internal.pending.length > 0) {
    observe(internal, internal.pending.shift())
    process(internal)
  }
}

const notify = (internal) => {
  // expand(internal) returns all paths touched by changes
  expand(internal).forEach((target) => {
    internal.pending = internal.pending.concat(internal.links[target])
  })
  internal.pending = [...new Set(internal.pending)]
  internal.pending.sort((a, b) => internal.order.indexOf(a) - internal.order.indexOf(b))
  Object.keys(internal.watchers).forEach((id) =>
    internal.watchers[id](internal.state, internal.queue.actions, internal.pending.length)
  )
  process(internal) // Process all pending observers
  internal.queue = { paths: [], actions: [] }
}

/*
  Thaw objects
*/

const thawShallow = (o) => {
  if (!o) return {}
  if (Object.prototype.toString.call(o) === '[object Object]') return Object.assign({}, o)
  if (Object.prototype.toString.call(o) === '[object Array]') return o.slice(0)
}

const thawDeep = (o) => {
  let n, i
  if (typeof o !== 'object') return o
  if (!o) return o
  if (o.constructor === Array) {
    n = []
    for (i = 0; i < o.length; i++) n[i] = thawDeep(o[i])
    return n
  }
  n = {}
  for (i in o) n[i] = thawDeep(o[i])
  return n
}

const thaw = { deep: thawDeep, shallow: thawShallow }

/*
  Patch objects, updates state with values returned from update methods
*/

const patch = (obj, path, value) => {
  if (path === '*') return freeze.deep(value)
  path = pathway.split(path)
  obj = thaw.shallow(obj)
  const key = path.shift()
  obj[key] = path.length > 0 ? patch(obj[key], path, value) : freeze.deep(value)
  return freeze.shallow(obj)
}

/*
  Resolves actions passed during create
*/

const resolve = (internal, action, tree = {}, name) => {
  if (typeof action === 'function') {
    return (...args) => {
      let deferred = false
      const count = (internal.count[name] = ++internal.count[name] || 1)
      internal.queue.actions.push({ name, count, deferred, updates: [] })
      if (internal.queue.actions.length === 1) setTimeout(() => notify(internal), 0)
      const update = (...args) => {
        args = [...args]
        const up = args.pop()
        const path = pathway(args) || '*'
        const value = up(thaw.deep(path === '*' ? internal.state : get(internal.state, path)), internal.state)
        internal.state = patch(internal.state, path, value)
        internal.queue.paths.push(path)
        const last = internal.queue.actions[internal.queue.actions.length - 1]
        if (last && last.name === name && last.count === count) {
          last.updates.push({ path, value })
        } else {
          internal.queue.actions.push({ name, count, deferred, updates: [{ path, value }] })
          if (internal.queue.actions.length === 1) setTimeout(() => notify(internal), 0)
        }
      }
      if (internal.track) {
        setTimeout(() => action(update, ...args), 0) // Action within observer
      } else {
        action(update, ...args)
      }
      setTimeout(() => {
        deferred = true
      }, 0)
      return internal.store
    }
  } else if (typeof action === 'object') {
    Object.keys(action).forEach((key) => {
      tree[key] = resolve(internal, action[key], tree[key], name ? `${name}.${key}` : key)
    })
  } else {
    throw new Error(`[Restore] Invalid entry in action tree: '${name}' is a ${typeof action}.`)
  }
  return tree
}

/*
  Create ids for observers
*/

const uuid = () => {
  let d = new Date().getTime()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = ((d + Math.random() * 16) % 16) | 0
    d = Math.floor(d / 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/*
  Create the store (Restore.create)
*/

export const create = (state = {}, actions = {}) => {
  const internal = {
    state: freeze.deep(state),
    queue: { paths: [], actions: [] },
    watchers: {},
    track: '',
    order: [],
    links: {},
    observers: {},
    pending: [],
    count: {}
  }
  const store = (...args) => {
    const path = pathway([...args]) || '*'
    if (internal.track) {
      const id = internal.track
      internal.observers[id].links = internal.observers[id].links || []
      internal.links[path] = internal.links[path] || []
      if (internal.observers[id].links.indexOf(path) === -1) internal.observers[id].links.push(path)
      if (internal.links[path].indexOf(internal.track) === -1) internal.links[path].push(internal.track)
    }
    return get(internal.state, path)
  }
  store.observer = (run, id, alt) => {
    id = id || uuid()
    if (internal.order.indexOf(id) === -1) internal.order.push(id)
    internal.observers[id] = {
      links: internal.observers[id] ? internal.observers[id].links : [],
      run: alt || run
    }
    return { returned: observe(internal, id, run), remove: () => store.api.remove(id) }
  }
  store.api = {
    replaceState: (state) => {
      state = freeze.deep(state)
      internal.queue.paths.push('*')
      internal.queue.actions.push({
        name: 'api.replaceState',
        count: 0,
        internal: true,
        updates: [{ path: '*', value: state }]
      })
      internal.state = state
      notify(internal)
    },
    feed: (watcher) => {
      const id = uuid()
      internal.watchers[id] = watcher
      return { remove: () => delete internal.watchers[id] }
    },
    remove: (id) => {
      if (internal.track === id) internal.track = null
      const p = internal.pending.indexOf(id)
      if (p > -1) internal.pending.splice(p, 1)
      const o = internal.order.indexOf(id)
      if (o > -1) internal.order.splice(o, 1)
      Object.keys(internal.links).forEach((link) => {
        const l = internal.links[link].indexOf(id)
        if (l > -1) internal.links[link].splice(l, 1)
      })
      delete internal.observers[id]
    },
    report: (id) => {
      const i = internal.pending.indexOf(id)
      if (i > -1) internal.pending.splice(i, 1)
    }
  }
  Object.keys(store.api).forEach((method) => {
    if (actions[method]) throw new Error(`[Restore] API method name ${method} is reserved.`)
  })
  Object.assign(store, resolve(internal, actions))
  internal.store = store
  return store
}

/*
  Connect React components (Restore.connect)

  Each window has a single store: the root component is connected with an
  explicit store (which becomes the module default) and descendants connect
  without one, resolving the default when they're constructed.
*/

let defaultStore = null

export const connect = (Component, store) => {
  if (store) defaultStore = store

  // Avoid double connect
  Component = Component._restoreOrigin || Component

  // Wrap Stateless Components
  if (
    typeof Component === 'function' &&
    (!Component.prototype || !Component.prototype.render) &&
    !Object.prototype.isPrototypeOf.call(React.Component, Component)
  ) {
    const statelessRender = Component
    class Stateless extends React.Component {
      render() {
        return statelessRender.call(this, this.props, this.context)
      }
    }
    Stateless.displayName = Component.displayName || Component.name
    Stateless.propTypes = Component.propTypes
    Stateless.defaultProps = Component.defaultProps
    Component = Stateless
  }

  // Create Connected Component
  class Connected extends Component {
    constructor(...args) {
      super(...args)
      this.restoreIdentity = uuid()
      if (!this.store) {
        throw new Error(
          `[Restore] '${Component.displayName || Component.name}' connected before any store was registered`
        )
      }
    }

    componentWillUnmount() {
      this.store.api.remove(this.restoreIdentity)
      if (super.componentWillUnmount) super.componentWillUnmount()
    }

    render(...args) {
      const observer = this.store.observer(super.render.bind(this, ...args), this.restoreIdentity, () =>
        this.forceUpdate()
      )
      this.store.api.report(this.restoreIdentity)
      return observer.returned
    }
  }
  // A prototype getter (rather than an instance property) so the store is
  // reachable from the wrapped component's own constructor via `this.store`
  Object.defineProperty(Connected.prototype, 'store', {
    get() {
      return store || defaultStore
    },
    configurable: true
  })
  Connected.displayName = Component.displayName || Component.name || 'Component'
  Connected._restoreOrigin = Component
  return Connected
}

export default { create, connect }
