#!/usr/bin/env bun
// @bun

// apps/newframe-cli/src/index.ts
import { readFile as readFile3, writeFile } from "fs/promises";

// node_modules/.bun/@trpc+server@11.19.0+ff0372d108591aba/node_modules/@trpc/server/dist/observable-DwUFSuKv.mjs
function observable(subscribe) {
  const self = {
    subscribe(observer) {
      let teardownRef = null;
      let isDone = false;
      let unsubscribed = false;
      let teardownImmediately = false;
      function unsubscribe() {
        if (teardownRef === null) {
          teardownImmediately = true;
          return;
        }
        if (unsubscribed)
          return;
        unsubscribed = true;
        if (typeof teardownRef === "function")
          teardownRef();
        else if (teardownRef)
          teardownRef.unsubscribe();
      }
      teardownRef = subscribe({
        next(value) {
          var _observer$next;
          if (isDone)
            return;
          (_observer$next = observer.next) === null || _observer$next === undefined || _observer$next.call(observer, value);
        },
        error(err) {
          var _observer$error;
          if (isDone)
            return;
          isDone = true;
          (_observer$error = observer.error) === null || _observer$error === undefined || _observer$error.call(observer, err);
          unsubscribe();
        },
        complete() {
          var _observer$complete;
          if (isDone)
            return;
          isDone = true;
          (_observer$complete = observer.complete) === null || _observer$complete === undefined || _observer$complete.call(observer);
          unsubscribe();
        }
      });
      if (teardownImmediately)
        unsubscribe();
      return { unsubscribe };
    },
    pipe(...operations) {
      return operations.reduce(pipeReducer, self);
    }
  };
  return self;
}
function pipeReducer(prev, fn) {
  return fn(prev);
}
function observableToPromise(observable) {
  const ac = new AbortController;
  return new Promise((resolve, reject) => {
    let isDone = false;
    function onDone() {
      if (isDone)
        return;
      isDone = true;
      obs$.unsubscribe();
    }
    ac.signal.addEventListener("abort", () => {
      reject(ac.signal.reason);
    });
    const obs$ = observable.subscribe({
      next(data) {
        isDone = true;
        resolve(data);
        onDone();
      },
      error(data) {
        reject(data);
      },
      complete() {
        ac.abort();
        onDone();
      }
    });
  });
}

// node_modules/.bun/@trpc+server@11.19.0+ff0372d108591aba/node_modules/@trpc/server/dist/observable-CSprJVOf.mjs
function share(_opts) {
  return (source) => {
    let refCount = 0;
    let subscription = null;
    const observers = [];
    function startIfNeeded() {
      if (subscription)
        return;
      subscription = source.subscribe({
        next(value) {
          for (const observer of observers) {
            var _observer$next;
            (_observer$next = observer.next) === null || _observer$next === undefined || _observer$next.call(observer, value);
          }
        },
        error(error) {
          for (const observer of observers) {
            var _observer$error;
            (_observer$error = observer.error) === null || _observer$error === undefined || _observer$error.call(observer, error);
          }
        },
        complete() {
          for (const observer of observers) {
            var _observer$complete;
            (_observer$complete = observer.complete) === null || _observer$complete === undefined || _observer$complete.call(observer);
          }
        }
      });
    }
    function resetIfNeeded() {
      if (refCount === 0 && subscription) {
        const _sub = subscription;
        subscription = null;
        _sub.unsubscribe();
      }
    }
    return observable((subscriber) => {
      refCount++;
      observers.push(subscriber);
      startIfNeeded();
      return { unsubscribe() {
        refCount--;
        resetIfNeeded();
        const index = observers.findIndex((v) => v === subscriber);
        if (index > -1)
          observers.splice(index, 1);
      } };
    });
  };
}
var distinctUnsetMarker = Symbol();
function behaviorSubject(initialValue) {
  let value = initialValue;
  const observerList = [];
  const addObserver = (observer) => {
    if (value !== undefined)
      observer.next(value);
    observerList.push(observer);
  };
  const removeObserver = (observer) => {
    observerList.splice(observerList.indexOf(observer), 1);
  };
  const obs = observable((observer) => {
    addObserver(observer);
    return () => {
      removeObserver(observer);
    };
  });
  obs.next = (nextValue) => {
    if (value === nextValue)
      return;
    value = nextValue;
    for (const observer of observerList)
      observer.next(nextValue);
  };
  obs.get = () => value;
  return obs;
}

// node_modules/.bun/@trpc+client@11.19.0+18c69e608cdf50e2/node_modules/@trpc/client/dist/splitLink-BZPioDdG.mjs
function createChain(opts) {
  return observable((observer) => {
    function execute(index = 0, op = opts.op) {
      const next = opts.links[index];
      if (!next)
        throw new Error("No more links to execute - did you forget to add an ending link?");
      return next({
        op,
        next(nextOp) {
          return execute(index + 1, nextOp);
        }
      });
    }
    return execute().subscribe(observer);
  });
}

// node_modules/.bun/@trpc+client@11.19.0+18c69e608cdf50e2/node_modules/@trpc/client/dist/objectSpread2-weooBxVk.mjs
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(o) {
    return typeof o;
  } : function(o) {
    return o && typeof Symbol == "function" && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
  }, _typeof(o);
}
function toPrimitive(t, r) {
  if (_typeof(t) != "object" || !t)
    return t;
  var e = t[Symbol.toPrimitive];
  if (e !== undefined) {
    var i = e.call(t, r || "default");
    if (_typeof(i) != "object")
      return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (r === "string" ? String : Number)(t);
}
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return _typeof(i) == "symbol" ? i : i + "";
}
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r) {
      return Object.getOwnPropertyDescriptor(e, r).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1;r < arguments.length; r++) {
    var t = arguments[r] != null ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), true).forEach(function(r) {
      _defineProperty(e, r, t[r]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r) {
      Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
    });
  }
  return e;
}

// node_modules/.bun/@trpc+server@11.19.0+ff0372d108591aba/node_modules/@trpc/server/dist/codes-D5Ya6_Bi.mjs
function isObject(value) {
  return !!value && !Array.isArray(value) && typeof value === "object";
}
function emptyObject() {
  return Object.create(null);
}
var TRPC_ERROR_CODES_BY_KEY = {
  PARSE_ERROR: -32700,
  BAD_REQUEST: -32600,
  INTERNAL_SERVER_ERROR: -32603,
  NOT_IMPLEMENTED: -32603,
  BAD_GATEWAY: -32603,
  SERVICE_UNAVAILABLE: -32603,
  GATEWAY_TIMEOUT: -32603,
  UNAUTHORIZED: -32001,
  PAYMENT_REQUIRED: -32002,
  FORBIDDEN: -32003,
  NOT_FOUND: -32004,
  METHOD_NOT_SUPPORTED: -32005,
  TIMEOUT: -32008,
  CONFLICT: -32009,
  PRECONDITION_FAILED: -32012,
  PAYLOAD_TOO_LARGE: -32013,
  UNSUPPORTED_MEDIA_TYPE: -32015,
  UNPROCESSABLE_CONTENT: -32022,
  PRECONDITION_REQUIRED: -32028,
  TOO_MANY_REQUESTS: -32029,
  CLIENT_CLOSED_REQUEST: -32099
};
var retryableRpcCodes = [
  TRPC_ERROR_CODES_BY_KEY.BAD_GATEWAY,
  TRPC_ERROR_CODES_BY_KEY.SERVICE_UNAVAILABLE,
  TRPC_ERROR_CODES_BY_KEY.GATEWAY_TIMEOUT,
  TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR
];

// node_modules/.bun/@trpc+server@11.19.0+ff0372d108591aba/node_modules/@trpc/server/dist/getErrorShape-B0JBUs-i.mjs
var noop = () => {};
var freezeIfAvailable = (obj) => {
  if (Object.freeze)
    Object.freeze(obj);
};
function createInnerProxy(callback, path, memo) {
  var _memo$cacheKey;
  const cacheKey = path.join(".");
  (_memo$cacheKey = memo[cacheKey]) !== null && _memo$cacheKey !== undefined || (memo[cacheKey] = new Proxy(noop, {
    get(_obj, key) {
      if (typeof key !== "string" || key === "then")
        return;
      return createInnerProxy(callback, [...path, key], memo);
    },
    apply(_1, _2, args) {
      const lastOfPath = path[path.length - 1];
      if (lastOfPath === "valueOf" || lastOfPath === "toString" || lastOfPath === "toJSON")
        return `tRPC.proxy(${path.slice(0, -1).join(".")})`;
      let opts = {
        args,
        path
      };
      if (lastOfPath === "call")
        opts = {
          args: args.length >= 2 ? [args[1]] : [],
          path: path.slice(0, -1)
        };
      else if (lastOfPath === "apply")
        opts = {
          args: args.length >= 2 ? args[1] : [],
          path: path.slice(0, -1)
        };
      freezeIfAvailable(opts.args);
      freezeIfAvailable(opts.path);
      return callback(opts);
    }
  }));
  return memo[cacheKey];
}
var createRecursiveProxy = (callback) => createInnerProxy(callback, [], emptyObject());
var createFlatProxy = (callback) => {
  return new Proxy(noop, { get(_obj, name) {
    if (name === "then")
      return;
    return callback(name);
  } });
};
function _typeof2(o) {
  "@babel/helpers - typeof";
  return _typeof2 = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(o) {
    return typeof o;
  } : function(o) {
    return o && typeof Symbol == "function" && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
  }, _typeof2(o);
}
function toPrimitive2(t, r) {
  if (_typeof2(t) != "object" || !t)
    return t;
  var e = t[Symbol.toPrimitive];
  if (e !== undefined) {
    var i = e.call(t, r || "default");
    if (_typeof2(i) != "object")
      return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (r === "string" ? String : Number)(t);
}
function toPropertyKey2(t) {
  var i = toPrimitive2(t, "string");
  return _typeof2(i) == "symbol" ? i : i + "";
}
function _defineProperty2(e, r, t) {
  return (r = toPropertyKey2(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys2(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r) {
      return Object.getOwnPropertyDescriptor(e, r).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread22(e) {
  for (var r = 1;r < arguments.length; r++) {
    var t = arguments[r] != null ? arguments[r] : {};
    r % 2 ? ownKeys2(Object(t), true).forEach(function(r) {
      _defineProperty2(e, r, t[r]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys2(Object(t)).forEach(function(r) {
      Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
    });
  }
  return e;
}

// node_modules/.bun/@trpc+server@11.19.0+ff0372d108591aba/node_modules/@trpc/server/dist/tracked-D4jU_Hb3.mjs
function transformResultInner(response, transformer) {
  if ("error" in response) {
    const error = transformer.deserialize(response.error);
    return {
      ok: false,
      error: _objectSpread22(_objectSpread22({}, response), {}, { error })
    };
  }
  return {
    ok: true,
    result: _objectSpread22(_objectSpread22({}, response.result), (!response.result.type || response.result.type === "data") && {
      type: "data",
      data: transformer.deserialize(response.result.data)
    })
  };
}
var TransformResultError = class extends Error {
  constructor() {
    super("Unable to transform response from server");
  }
};
function transformResult(response, transformer) {
  let result;
  try {
    result = transformResultInner(response, transformer);
  } catch (_unused) {
    throw new TransformResultError;
  }
  if (!result.ok && (!isObject(result.error.error) || typeof result.error.error["code"] !== "number"))
    throw new TransformResultError;
  if (result.ok && !isObject(result.result))
    throw new TransformResultError;
  return result;
}
var trackedSymbol = Symbol();

// node_modules/.bun/@trpc+client@11.19.0+18c69e608cdf50e2/node_modules/@trpc/client/dist/TRPCClientError-CxFRO7Js.mjs
function isTRPCClientError(cause) {
  return cause instanceof TRPCClientError;
}
function isTRPCErrorResponse(obj) {
  return isObject(obj) && isObject(obj["error"]) && typeof obj["error"]["code"] === "number" && typeof obj["error"]["message"] === "string";
}
function getMessageFromUnknownError(err, fallback) {
  if (typeof err === "string")
    return err;
  if (isObject(err) && typeof err["message"] === "string")
    return err["message"];
  return fallback;
}
var TRPCClientError = class TRPCClientError extends Error {
  constructor(message, opts) {
    var _opts$result, _opts$result2;
    const cause = opts === null || opts === undefined ? undefined : opts.cause;
    super(message, { cause });
    _defineProperty(this, "cause", undefined);
    _defineProperty(this, "shape", undefined);
    _defineProperty(this, "data", undefined);
    _defineProperty(this, "meta", undefined);
    this.meta = opts === null || opts === undefined ? undefined : opts.meta;
    this.cause = cause;
    this.shape = opts === null || opts === undefined || (_opts$result = opts.result) === null || _opts$result === undefined ? undefined : _opts$result.error;
    this.data = opts === null || opts === undefined || (_opts$result2 = opts.result) === null || _opts$result2 === undefined ? undefined : _opts$result2.error.data;
    this.name = "TRPCClientError";
    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }
  static from(_cause, opts = {}) {
    const cause = _cause;
    if (isTRPCClientError(cause)) {
      if (opts.meta)
        cause.meta = _objectSpread2(_objectSpread2({}, cause.meta), opts.meta);
      return cause;
    }
    if (isTRPCErrorResponse(cause))
      return new TRPCClientError(cause.error.message, _objectSpread2(_objectSpread2({}, opts), {}, {
        result: cause,
        cause: opts.cause
      }));
    return new TRPCClientError(getMessageFromUnknownError(cause, "Unknown error"), _objectSpread2(_objectSpread2({}, opts), {}, { cause }));
  }
};

// node_modules/.bun/@trpc+client@11.19.0+18c69e608cdf50e2/node_modules/@trpc/client/dist/unstable-internals.mjs
function getTransformer(transformer) {
  const _transformer = transformer;
  if (!_transformer)
    return {
      input: {
        serialize: (data) => data,
        deserialize: (data) => data
      },
      output: {
        serialize: (data) => data,
        deserialize: (data) => data
      }
    };
  if ("input" in _transformer)
    return _transformer;
  return {
    input: _transformer,
    output: _transformer
  };
}

// node_modules/.bun/@trpc+client@11.19.0+18c69e608cdf50e2/node_modules/@trpc/client/dist/httpUtils-CB_100ND.mjs
var isFunction2 = (fn) => typeof fn === "function";
function getFetch(customFetchImpl) {
  if (customFetchImpl)
    return customFetchImpl;
  if (typeof window !== "undefined" && isFunction2(window.fetch))
    return window.fetch.bind(window);
  if (typeof globalThis !== "undefined" && isFunction2(globalThis.fetch))
    return globalThis.fetch;
  throw new Error("No fetch implementation found");
}
function raceAbortSignals(...signals) {
  const ac = new AbortController;
  for (const signal of signals)
    if (signal === null || signal === undefined ? undefined : signal.aborted)
      ac.abort();
    else
      signal === null || signal === undefined || signal.addEventListener("abort", () => ac.abort(), { once: true });
  return ac.signal;
}
function resolveHTTPLinkOptions(opts) {
  return {
    url: opts.url.toString(),
    fetch: opts.fetch,
    transformer: getTransformer(opts.transformer),
    methodOverride: opts.methodOverride
  };
}
function arrayToDict(array) {
  const dict = {};
  for (let index = 0;index < array.length; index++) {
    const element = array[index];
    dict[index] = element;
  }
  return dict;
}
var METHOD = {
  query: "GET",
  mutation: "POST",
  subscription: "PATCH"
};
function getInput(opts) {
  return "input" in opts ? opts.transformer.input.serialize(opts.input) : arrayToDict(opts.inputs.map((_input) => opts.transformer.input.serialize(_input)));
}
var getUrl = (opts) => {
  const parts = opts.url.split("?");
  let url = parts[0].replace(/\/$/, "") + "/" + opts.path;
  const queryParts = [];
  if (parts[1])
    queryParts.push(parts[1]);
  if ("inputs" in opts)
    queryParts.push("batch=1");
  if (opts.type === "query" || opts.type === "subscription") {
    const input = getInput(opts);
    if (input !== undefined && opts.methodOverride !== "POST")
      queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
  }
  if (queryParts.length)
    url += "?" + queryParts.join("&");
  return url;
};
var getBody = (opts) => {
  if (opts.type === "query" && opts.methodOverride !== "POST")
    return;
  const input = getInput(opts);
  return input !== undefined ? JSON.stringify(input) : undefined;
};
var jsonHttpRequester = (opts) => {
  return httpRequest(_objectSpread2(_objectSpread2({}, opts), {}, {
    contentTypeHeader: "application/json",
    getUrl,
    getBody
  }));
};
var AbortError = class extends Error {
  constructor() {
    const name = "AbortError";
    super(name);
    this.name = name;
    this.message = name;
  }
};
var throwIfAborted = (signal) => {
  var _signal$throwIfAborte;
  if (!(signal === null || signal === undefined ? undefined : signal.aborted))
    return;
  (_signal$throwIfAborte = signal.throwIfAborted) === null || _signal$throwIfAborte === undefined || _signal$throwIfAborte.call(signal);
  if (typeof DOMException !== "undefined")
    throw new DOMException("AbortError", "AbortError");
  throw new AbortError;
};
async function fetchHTTPResponse(opts) {
  var _opts$methodOverride, _opts$trpcAcceptHeade;
  throwIfAborted(opts.signal);
  const url = opts.getUrl(opts);
  const body = opts.getBody(opts);
  const method = (_opts$methodOverride = opts.methodOverride) !== null && _opts$methodOverride !== undefined ? _opts$methodOverride : METHOD[opts.type];
  const resolvedHeaders = await (async () => {
    const heads = await opts.headers();
    if (Symbol.iterator in heads)
      return Object.fromEntries(heads);
    return heads;
  })();
  const headers = _objectSpread2(_objectSpread2(_objectSpread2({}, opts.contentTypeHeader && method !== "GET" ? { "content-type": opts.contentTypeHeader } : {}), opts.trpcAcceptHeader ? { [(_opts$trpcAcceptHeade = opts.trpcAcceptHeaderKey) !== null && _opts$trpcAcceptHeade !== undefined ? _opts$trpcAcceptHeade : "trpc-accept"]: opts.trpcAcceptHeader } : undefined), resolvedHeaders);
  return getFetch(opts.fetch)(url, {
    method,
    signal: opts.signal,
    body,
    headers
  });
}
async function httpRequest(opts) {
  const meta = {};
  const res = await fetchHTTPResponse(opts);
  meta.response = res;
  const json = await res.json();
  meta.responseJSON = json;
  return {
    json,
    meta
  };
}

// node_modules/.bun/@trpc+client@11.19.0+18c69e608cdf50e2/node_modules/@trpc/client/dist/httpLink-Tm93WWFA.mjs
function isOctetType(input) {
  return input instanceof Uint8Array || input instanceof Blob;
}
function isFormData(input) {
  return input instanceof FormData;
}
var universalRequester = (opts) => {
  if ("input" in opts) {
    const { input } = opts;
    if (isFormData(input)) {
      if (opts.type !== "mutation" && opts.methodOverride !== "POST")
        throw new Error("FormData is only supported for mutations");
      return httpRequest(_objectSpread2(_objectSpread2({}, opts), {}, {
        contentTypeHeader: undefined,
        getUrl,
        getBody: () => input
      }));
    }
    if (isOctetType(input)) {
      if (opts.type !== "mutation" && opts.methodOverride !== "POST")
        throw new Error("Octet type input is only supported for mutations");
      return httpRequest(_objectSpread2(_objectSpread2({}, opts), {}, {
        contentTypeHeader: "application/octet-stream",
        getUrl,
        getBody: () => input
      }));
    }
  }
  return jsonHttpRequester(opts);
};
function httpLink(opts) {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  return () => {
    return (operationOpts) => {
      const { op } = operationOpts;
      return observable((observer) => {
        const { path, input, type } = op;
        if (type === "subscription")
          throw new Error("Subscriptions are unsupported by `httpLink` - use `httpSubscriptionLink` or `wsLink`");
        const ac = new AbortController;
        const request = universalRequester(_objectSpread2(_objectSpread2({}, resolvedOpts), {}, {
          type,
          path,
          input,
          signal: raceAbortSignals(op.signal, ac.signal),
          headers() {
            if (!opts.headers)
              return {};
            if (typeof opts.headers === "function")
              return opts.headers({ op });
            return opts.headers;
          }
        }));
        let isDone = false;
        let meta = undefined;
        request.then((res) => {
          isDone = true;
          meta = res.meta;
          const transformed = transformResult(res.json, resolvedOpts.transformer.output);
          if (!transformed.ok) {
            observer.error(TRPCClientError.from(transformed.error, { meta }));
            return;
          }
          observer.next({
            context: res.meta,
            result: transformed.result
          });
          observer.complete();
        }).catch((cause) => {
          isDone = true;
          observer.error(TRPCClientError.from(cause, { meta }));
        });
        return () => {
          if (!isDone)
            ac.abort();
        };
      });
    };
  };
}

// node_modules/.bun/@trpc+client@11.19.0+18c69e608cdf50e2/node_modules/@trpc/client/dist/wsLink-Bm5LKL6z.mjs
var resultOf = (value, ...args) => {
  return typeof value === "function" ? value(...args) : value;
};
function withResolvers() {
  let resolve;
  let reject;
  return {
    promise: new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    resolve,
    reject
  };
}
async function prepareUrl(urlOptions) {
  const url = await resultOf(urlOptions.url);
  if (!urlOptions.connectionParams)
    return url;
  return url + `${url.includes("?") ? "&" : "?"}connectionParams=1`;
}
async function buildConnectionMessage(connectionParams, encoder) {
  const message = {
    method: "connectionParams",
    data: await resultOf(connectionParams)
  };
  return encoder.encode(message);
}
function asyncWsOpen(ws) {
  const { promise, resolve, reject } = withResolvers();
  ws.addEventListener("open", () => {
    ws.removeEventListener("error", reject);
    resolve();
  });
  ws.addEventListener("error", reject);
  return promise;
}
function setupPingInterval(ws, { intervalMs, pongTimeoutMs }) {
  let pingTimeout;
  let pongTimeout;
  function start() {
    pingTimeout = setTimeout(() => {
      ws.send("PING");
      pongTimeout = setTimeout(() => {
        ws.close();
      }, pongTimeoutMs);
    }, intervalMs);
  }
  function reset() {
    clearTimeout(pingTimeout);
    start();
  }
  function pong() {
    clearTimeout(pongTimeout);
    reset();
  }
  ws.addEventListener("open", start);
  ws.addEventListener("message", ({ data }) => {
    clearTimeout(pingTimeout);
    start();
    if (data === "PONG")
      pong();
  });
  ws.addEventListener("close", () => {
    clearTimeout(pingTimeout);
    clearTimeout(pongTimeout);
  });
}
var WsConnection = class WsConnection {
  constructor(opts) {
    var _opts$WebSocketPonyfi;
    _defineProperty(this, "id", ++WsConnection.connectCount);
    _defineProperty(this, "WebSocketPonyfill", undefined);
    _defineProperty(this, "urlOptions", undefined);
    _defineProperty(this, "keepAliveOpts", undefined);
    _defineProperty(this, "encoder", undefined);
    _defineProperty(this, "wsObservable", behaviorSubject(null));
    _defineProperty(this, "openPromise", null);
    this.WebSocketPonyfill = (_opts$WebSocketPonyfi = opts.WebSocketPonyfill) !== null && _opts$WebSocketPonyfi !== undefined ? _opts$WebSocketPonyfi : WebSocket;
    if (!this.WebSocketPonyfill)
      throw new Error("No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill");
    this.urlOptions = opts.urlOptions;
    this.keepAliveOpts = opts.keepAlive;
    this.encoder = opts.encoder;
  }
  get ws() {
    return this.wsObservable.get();
  }
  set ws(ws) {
    this.wsObservable.next(ws);
  }
  isOpen() {
    return !!this.ws && this.ws.readyState === this.WebSocketPonyfill.OPEN && !this.openPromise;
  }
  isClosed() {
    return !!this.ws && (this.ws.readyState === this.WebSocketPonyfill.CLOSING || this.ws.readyState === this.WebSocketPonyfill.CLOSED);
  }
  async open() {
    if (this.openPromise)
      return this.openPromise;
    this.id = ++WsConnection.connectCount;
    const wsPromise = prepareUrl(this.urlOptions).then((url) => new this.WebSocketPonyfill(url));
    this.openPromise = wsPromise.then(async (ws) => {
      this.ws = ws;
      ws.binaryType = "arraybuffer";
      ws.addEventListener("message", function({ data }) {
        if (data === "PING")
          this.send("PONG");
      });
      if (this.keepAliveOpts.enabled)
        setupPingInterval(ws, this.keepAliveOpts);
      ws.addEventListener("close", () => {
        if (this.ws === ws)
          this.ws = null;
      });
      await asyncWsOpen(ws);
      if (this.urlOptions.connectionParams)
        ws.send(await buildConnectionMessage(this.urlOptions.connectionParams, this.encoder));
    });
    try {
      await this.openPromise;
    } finally {
      this.openPromise = null;
    }
  }
  async close() {
    try {
      await this.openPromise;
    } finally {
      var _this$ws;
      (_this$ws = this.ws) === null || _this$ws === undefined || _this$ws.close();
    }
  }
};
_defineProperty(WsConnection, "connectCount", 0);

// node_modules/.bun/@trpc+client@11.19.0+18c69e608cdf50e2/node_modules/@trpc/client/dist/index.mjs
var TRPCUntypedClient = class {
  constructor(opts) {
    _defineProperty(this, "links", undefined);
    _defineProperty(this, "runtime", undefined);
    _defineProperty(this, "requestId", undefined);
    this.requestId = 0;
    this.runtime = {};
    this.links = opts.links.map((link) => link(this.runtime));
  }
  $request(opts) {
    var _opts$context;
    return createChain({
      links: this.links,
      op: _objectSpread2(_objectSpread2({}, opts), {}, {
        context: (_opts$context = opts.context) !== null && _opts$context !== undefined ? _opts$context : {},
        id: ++this.requestId
      })
    }).pipe(share());
  }
  async requestAsPromise(opts) {
    try {
      const req$ = this.$request(opts);
      return (await observableToPromise(req$)).result.data;
    } catch (err) {
      throw TRPCClientError.from(err);
    }
  }
  query(path, input, opts) {
    return this.requestAsPromise({
      type: "query",
      path,
      input,
      context: opts === null || opts === undefined ? undefined : opts.context,
      signal: opts === null || opts === undefined ? undefined : opts.signal
    });
  }
  mutation(path, input, opts) {
    return this.requestAsPromise({
      type: "mutation",
      path,
      input,
      context: opts === null || opts === undefined ? undefined : opts.context,
      signal: opts === null || opts === undefined ? undefined : opts.signal
    });
  }
  subscription(path, input, opts) {
    return this.$request({
      type: "subscription",
      path,
      input,
      context: opts.context,
      signal: opts.signal
    }).subscribe({
      next(envelope) {
        switch (envelope.result.type) {
          case "state":
            var _opts$onConnectionSta;
            (_opts$onConnectionSta = opts.onConnectionStateChange) === null || _opts$onConnectionSta === undefined || _opts$onConnectionSta.call(opts, envelope.result);
            break;
          case "started":
            var _opts$onStarted;
            (_opts$onStarted = opts.onStarted) === null || _opts$onStarted === undefined || _opts$onStarted.call(opts, { context: envelope.context });
            break;
          case "stopped":
            var _opts$onStopped;
            (_opts$onStopped = opts.onStopped) === null || _opts$onStopped === undefined || _opts$onStopped.call(opts);
            break;
          case "data":
          case undefined:
            var _opts$onData;
            (_opts$onData = opts.onData) === null || _opts$onData === undefined || _opts$onData.call(opts, envelope.result.data);
        }
      },
      error(err) {
        var _opts$onError;
        (_opts$onError = opts.onError) === null || _opts$onError === undefined || _opts$onError.call(opts, err);
      },
      complete() {
        var _opts$onComplete;
        (_opts$onComplete = opts.onComplete) === null || _opts$onComplete === undefined || _opts$onComplete.call(opts);
      }
    });
  }
};
var untypedClientSymbol = Symbol.for("trpc_untypedClient");
var clientCallTypeMap = {
  query: "query",
  mutate: "mutation",
  subscribe: "subscription"
};
var clientCallTypeToProcedureType = (clientCallType) => {
  return clientCallTypeMap[clientCallType];
};
function createTRPCClientProxy(client) {
  const proxy = createRecursiveProxy(({ path, args }) => {
    const pathCopy = [...path];
    const procedureType = clientCallTypeToProcedureType(pathCopy.pop());
    const fullPath = pathCopy.join(".");
    return client[procedureType](fullPath, ...args);
  });
  return createFlatProxy((key) => {
    if (key === untypedClientSymbol)
      return client;
    return proxy[key];
  });
}
function createTRPCClient(opts) {
  return createTRPCClientProxy(new TRPCUntypedClient(opts));
}
function _OverloadYield(e, d) {
  this.v = e, this.k = d;
}
function AsyncGenerator(e) {
  var r, t;
  function resume(r, t) {
    try {
      var n = e[r](t), o = n.value, u = o instanceof _OverloadYield;
      Promise.resolve(u ? o.v : o).then(function(t) {
        if (u) {
          var i = r === "return" ? "return" : "next";
          if (!o.k || t.done)
            return resume(i, t);
          t = e[i](t).value;
        }
        settle(n.done ? "return" : "normal", t);
      }, function(e) {
        resume("throw", e);
      });
    } catch (e) {
      settle("throw", e);
    }
  }
  function settle(e, n) {
    switch (e) {
      case "return":
        r.resolve({
          value: n,
          done: true
        });
        break;
      case "throw":
        r.reject(n);
        break;
      default:
        r.resolve({
          value: n,
          done: false
        });
    }
    (r = r.next) ? resume(r.key, r.arg) : t = null;
  }
  this._invoke = function(e, n) {
    return new Promise(function(o, u) {
      var i = {
        key: e,
        arg: n,
        resolve: o,
        reject: u,
        next: null
      };
      t ? t = t.next = i : (r = t = i, resume(e, n));
    });
  }, typeof e["return"] != "function" && (this["return"] = undefined);
}
AsyncGenerator.prototype[typeof Symbol == "function" && Symbol.asyncIterator || "@@asyncIterator"] = function() {
  return this;
}, AsyncGenerator.prototype.next = function(e) {
  return this._invoke("next", e);
}, AsyncGenerator.prototype["throw"] = function(e) {
  return this._invoke("throw", e);
}, AsyncGenerator.prototype["return"] = function(e) {
  return this._invoke("return", e);
};

// packages/desktop-api/src/client.ts
function createDesktopClient(baseUrl, options = {}) {
  return createTRPCClient({
    links: [httpLink({ url: `${baseUrl.replace(/\/$/, "")}/trpc`, ...options })]
  });
}
function isDesktopClientError(error) {
  return error instanceof TRPCClientError;
}

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js
var _a;
function $constructor(name, initializer, params) {
  function init(inst, def) {
    if (!inst._zod) {
      Object.defineProperty(inst, "_zod", {
        value: {
          def,
          constr: _,
          traits: new Set
        },
        enumerable: false
      });
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer(inst, def);
    const proto = _.prototype;
    const keys = Object.keys(proto);
    for (let i = 0;i < keys.length; i++) {
      const k = keys[i];
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;

  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a;
    const inst = params?.Parent ? new Definition : this;
    init(inst, def);
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $brand = Symbol("zod_brand");

class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}

class $ZodEncodeError extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
}
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}
// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set = false;
  return {
    get value() {
      if (!set) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === undefined;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object, key, getter) {
  let value = undefined;
  Object.defineProperty(object, key, {
    get() {
      if (value === EVALUATING) {
        return;
      }
      if (value === undefined) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object, key, {
        value: v
      });
    },
    configurable: true
  });
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject2(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject2(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === undefined)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject2(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== undefined) {
    if (params?.error !== undefined)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-340282346638528860000000000000000000000, 340282346638528860000000000000000000000],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        newShape[key] = currDef.shape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key in shape) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== undefined) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function merge(a, b) {
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class, schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".partial() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in oldShape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key in oldShape) {
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in shape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key in oldShape) {
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    }
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a;
    (_a = iss).path ?? (_a.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
  const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/errors.js
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false
  });
  inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false
  });
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error, mapper = (issue) => issue.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue) => issue.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error, path = []) => {
    for (const issue of error.issues) {
      if (issue.code === "invalid_union" && issue.errors.length) {
        issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
      } else if (issue.code === "invalid_key") {
        processError({ issues: issue.issues }, [...path, ...issue.path]);
      } else if (issue.code === "invalid_element") {
        processError({ issues: issue.issues }, [...path, ...issue.path]);
      } else {
        const fullpath = [...path, ...issue.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }
  };
  processError(error);
  return fieldErrors;
}

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  if (result.issues.length) {
    const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, _params?.callee);
    throw e;
  }
  return result.value;
};
var parse = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  if (result.issues.length) {
    const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, params?.callee);
    throw e;
  }
  return result.value;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);
var _encode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parse(_Err)(schema, value, ctx);
};
var _decode = (_Err) => (schema, value, _ctx) => {
  return _parse(_Err)(schema, value, _ctx);
};
var _encodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parseAsync(_Err)(schema, value, ctx);
};
var _decodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _parseAsync(_Err)(schema, value, _ctx);
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/regexes.js
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version) => {
  if (!version)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const timeRegex = `${time}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;
var _null = /^null$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a = inst._zod).onattach ?? (_a.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst) => {
    var _a;
    (_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst) => {
    const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst) => {
    const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = new Set);
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a = inst._zod).check ?? (_a.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst) => {
    const bag = inst._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/doc.js
class Doc {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this)
      this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split(`
`).filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join(`
`));
  }
}

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 4,
  patch: 3
};

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError;
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary) => {
            return handleCanaryResult(canary, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return result.then((result) => runChecks(result, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  defineLazy(inst, "~standard", () => ({
    validate: (value) => {
      try {
        const r = safeParse(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  }));
});
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_) {}
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === undefined)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      if (!def.normalize && def.protocol?.source === httpProtocol.source) {
        if (!/^https?:\/\//i.test(trimmed)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
      }
      const url = new URL(trimmed);
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.normalize) {
        payload.value = url.href;
      } else {
        payload.value = trimmed;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv4`;
});
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv6`;
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const parts = payload.value.split("/");
    try {
      if (parts.length !== 2)
        throw new Error;
      const [address, prefix] = parts;
      if (!prefix)
        throw new Error;
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error;
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error;
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64";
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64url";
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : undefined : undefined;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodNull = /* @__PURE__ */ $constructor("$ZodNull", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _null;
  inst._zod.values = new Set([null]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input === null)
      return payload;
    payload.issues.push({
      expected: "null",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0;i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result) => handleArrayResult(result, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
  const isPresent = key in input;
  if (result.issues.length) {
    if (isOptionalIn && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && !isOptionalIn) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: undefined,
        path: [key]
      });
    }
    return;
  }
  if (result.value === undefined) {
    if (isPresent) {
      final.value[key] = undefined;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k of keys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const isOptionalIn = _catchall.optin === "optional";
  const isOptionalOut = _catchall.optout === "optional";
  for (const key in input) {
    if (key === "__proto__")
      continue;
    if (keySet.has(key))
      continue;
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
    } else {
      handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh
        });
        return newSh;
      }
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        propValues[key] ?? (propValues[key] = new Set);
        for (const v of field.values)
          propValues[key].add(v);
      }
    }
    return propValues;
  });
  const isObject = isObject2;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = {};
    const proms = [];
    const shape = value.shape;
    for (const key of value.keys) {
      const el = shape[key];
      const isOptionalIn = el._zod.optin === "optional";
      const isOptionalOut = el._zod.optout === "optional";
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
      } else {
        handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const generateFastpass = (shape) => {
    const doc = new Doc(["shape", "payload", "ctx"]);
    const normalized = _normalized.value;
    const parseStr = (key) => {
      const k = esc(key);
      return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    };
    doc.write(`const input = payload.value;`);
    const ids = Object.create(null);
    let counter = 0;
    for (const key of normalized.keys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(`const newResult = {};`);
    for (const key of normalized.keys) {
      const id = ids[key];
      const k = esc(key);
      const schema = shape[key];
      const isOptionalIn = schema?._zod?.optin === "optional";
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc.write(`const ${id} = ${parseStr(key)};`);
      if (isOptionalIn && isOptionalOut) {
        doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      } else if (!isOptionalIn) {
        doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
      } else {
        doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    const fn = doc.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject = isObject2;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results) => {
      return handleUnionResults(results, payload, inst, ctx);
    });
  };
});
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  def.inclusive = false;
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazy(inst._zod, "propValues", () => {
    const propValues = {};
    for (const option of def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
      for (const [k, v] of Object.entries(pv)) {
        if (!propValues[k])
          propValues[k] = new Set;
        for (const val of v) {
          propValues[k].add(val);
        }
      }
    }
    return propValues;
  });
  const disc = cached(() => {
    const opts = def.options;
    const map = new Map;
    for (const o of opts) {
      const values = o._zod.propValues?.[def.discriminator];
      if (!values || values.size === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
      for (const v of values) {
        if (map.has(v)) {
          throw new Error(`Duplicate discriminator value "${String(v)}"`);
        }
        map.set(v, o);
      }
    }
    return map;
  });
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const opt = disc.value.get(input?.[def.discriminator]);
    if (opt) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback || ctx.direction === "backward") {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      discriminator: def.discriminator,
      options: Array.from(disc.value.keys()),
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left, right]) => {
        return handleIntersectionResults(payload, left, right);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = new Map;
  let unrecIssue;
  for (const iss of left.issues) {
    if (iss.code === "unrecognized_keys") {
      unrecIssue ?? (unrecIssue = iss);
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).l = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  for (const iss of right.issues) {
    if (iss.code === "unrecognized_keys") {
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).r = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length && unrecIssue) {
    result.issues.push({ ...unrecIssue, keys: bothKeys });
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
  $ZodType.init(inst, def);
  const items = def.items;
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        input,
        inst,
        expected: "tuple",
        code: "invalid_type"
      });
      return payload;
    }
    payload.value = [];
    const proms = [];
    const optinStart = getTupleOptStart(items, "optin");
    const optoutStart = getTupleOptStart(items, "optout");
    if (!def.rest) {
      if (input.length < optinStart) {
        payload.issues.push({
          code: "too_small",
          minimum: optinStart,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
        return payload;
      }
      if (input.length > items.length) {
        payload.issues.push({
          code: "too_big",
          maximum: items.length,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
      }
    }
    const itemResults = new Array(items.length);
    for (let i = 0;i < items.length; i++) {
      const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((rr) => {
          itemResults[i] = rr;
        }));
      } else {
        itemResults[i] = r;
      }
    }
    if (def.rest) {
      let i = items.length - 1;
      const rest = input.slice(items.length);
      for (const el of rest) {
        i++;
        const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((r) => handleTupleResult(r, payload, i)));
        } else {
          handleTupleResult(result, payload, i);
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
    }
    return handleTupleResults(itemResults, payload, items, input, optoutStart);
  };
});
function getTupleOptStart(items, key) {
  for (let i = items.length - 1;i >= 0; i--) {
    if (items[i]._zod[key] !== "optional")
      return i + 1;
  }
  return 0;
}
function handleTupleResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
  for (let i = 0;i < items.length; i++) {
    const r = itemResults[i];
    const isPresent = i < input.length;
    if (r.issues.length) {
      if (!isPresent && i >= optoutStart) {
        final.value.length = i;
        break;
      }
      final.issues.push(...prefixIssues(i, r.issues));
    }
    final.value[i] = r.value;
  }
  for (let i = final.value.length - 1;i >= input.length; i--) {
    if (items[i]._zod.optout === "optional" && final.value[i] === undefined) {
      final.value.length = i;
    } else {
      break;
    }
  }
  return final;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values) {
      payload.value = {};
      const recordKeys = new Set;
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result) => {
              if (result.issues.length) {
                payload.issues.push(...prefixIssues(key, result.issues));
              }
              payload.value[outKey] = result.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized
        });
      }
    } else {
      payload.value = {};
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result) => {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[keyResult.value] = result.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  if (def.values.length === 0) {
    throw new Error("Cannot create literal schema with no valid values");
  }
  const values = new Set(def.values);
  inst._zod.values = values;
  inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output) => {
        payload.value = output;
        payload.fallback = true;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError;
    }
    payload.value = _out;
    payload.fallback = true;
    return payload;
  };
});
function handleOptionalResult(result, input) {
  if (input === undefined && (result.issues.length || result.fallback)) {
    return { issues: [], value: undefined };
  }
  return result;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      const input = payload.value;
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise)
        return result.then((r) => handleOptionalResult(r, input));
      return handleOptionalResult(result, input);
    }
    if (payload.value === undefined) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, null]) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleDefaultResult(result, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === undefined) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v = def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleNonOptionalResult(result, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === undefined) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => {
        payload.value = result.value;
        if (result.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
          payload.fallback = true;
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
      payload.fallback = true;
    }
    return payload;
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right) => handlePipeResult(right, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left) => handlePipeResult(left, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
  defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodFunction = /* @__PURE__ */ $constructor("$ZodFunction", (inst, def) => {
  $ZodType.init(inst, def);
  inst._def = def;
  inst._zod.def = def;
  inst.implement = (func) => {
    if (typeof func !== "function") {
      throw new Error("implement() must be called with a function");
    }
    return function(...args) {
      const parsedArgs = inst._def.input ? parse(inst._def.input, args) : args;
      const result = Reflect.apply(func, this, parsedArgs);
      if (inst._def.output) {
        return parse(inst._def.output, result);
      }
      return result;
    };
  };
  inst.implementAsync = (func) => {
    if (typeof func !== "function") {
      throw new Error("implementAsync() must be called with a function");
    }
    return async function(...args) {
      const parsedArgs = inst._def.input ? await parseAsync(inst._def.input, args) : args;
      const result = await Reflect.apply(func, this, parsedArgs);
      if (inst._def.output) {
        return await parseAsync(inst._def.output, result);
      }
      return result;
    };
  };
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "function") {
      payload.issues.push({
        code: "invalid_type",
        expected: "function",
        input: payload.value,
        inst
      });
      return payload;
    }
    const hasPromiseOutput = inst._def.output && inst._def.output._zod.def.type === "promise";
    if (hasPromiseOutput) {
      payload.value = inst.implementAsync(payload.value);
    } else {
      payload.value = inst.implement(payload.value);
    }
    return payload;
  };
  inst.input = (...args) => {
    const F = inst.constructor;
    if (Array.isArray(args[0])) {
      return new F({
        type: "function",
        input: new $ZodTuple({
          type: "tuple",
          items: args[0],
          rest: args[1]
        }),
        output: inst._def.output
      });
    }
    return new F({
      type: "function",
      input: args[0],
      output: inst._def.output
    });
  };
  inst.output = (output) => {
    const F = inst.constructor;
    return new F({
      type: "function",
      input: inst._def.input,
      output
    });
  };
  return inst;
});
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r) => handleRefineResult(r, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      path: [...inst._zod.def.path ?? []],
      continue: !inst._zod.def.abort
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/registries.js
var _a2;
var $output = Symbol("ZodOutput");
var $input = Symbol("ZodInput");

class $ZodRegistry {
  constructor() {
    this._map = new WeakMap;
    this._idmap = new Map;
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = new WeakMap;
    this._idmap = new Map;
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : undefined;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry;
}
(_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;
// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/api.js
function _string(Class, params) {
  return new Class({
    type: "string",
    ...normalizeParams(params)
  });
}
function _email(Class, params) {
  return new Class({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class, params) {
  return new Class({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class, params) {
  return new Class({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class, params) {
  return new Class({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class, params) {
  return new Class({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class, params) {
  return new Class({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class, params) {
  return new Class({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class, params) {
  return new Class({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class, params) {
  return new Class({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class, params) {
  return new Class({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class, params) {
  return new Class({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class, params) {
  return new Class({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class, params) {
  return new Class({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class, params) {
  return new Class({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class, params) {
  return new Class({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class, params) {
  return new Class({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _isoDateTime(Class, params) {
  return new Class({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class, params) {
  return new Class({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class, params) {
  return new Class({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class, params) {
  return new Class({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class, params) {
  return new Class({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
function _int(Class, params) {
  return new Class({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _boolean(Class, params) {
  return new Class({
    type: "boolean",
    ...normalizeParams(params)
  });
}
function _null2(Class, params) {
  return new Class({
    type: "null",
    ...normalizeParams(params)
  });
}
function _unknown(Class) {
  return new Class({
    type: "unknown"
  });
}
function _never(Class, params) {
  return new Class({
    type: "never",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _slugify() {
  return _overwrite((input) => slugify(input));
}
function _array(Class, element, params) {
  return new Class({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
function _refine(Class, fn, _params) {
  const schema = new Class({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
function _superRefine(fn, params) {
  const ch = _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {}),
    io: params?.io ?? "output",
    counter: 0,
    seen: new Map,
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    external: params?.external ?? undefined
  };
}
function process2(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
  ctx.seen.set(schema, result);
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      process2(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta = ctx.metadataRegistry.get(schema);
  if (meta)
    Object.assign(result.schema, meta);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a = result.schema).default ?? (_a.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const idToSchema = new Map;
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id) => id);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
    }
    if (entry[1] === root) {
      return { ref: "#" };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + defId };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema = seen.schema;
    for (const key in schema) {
      delete schema[key];
    }
    schema.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error("Cycle detected: " + `#/${seen.cycle?.join("/")}/<root>` + '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema = seen.def ?? seen.schema;
    const _cached = { ...schema };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema.allOf = schema.allOf ?? [];
        schema.allOf.push(refSchema);
      } else {
        Object.assign(schema, refSchema);
      }
      Object.assign(schema, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema,
      path: seen.path ?? []
    });
  };
  for (const entry of [...ctx.seen.entries()].reverse()) {
    flattenRef(entry[0]);
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {}
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  Object.assign(result, root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== undefined && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (seen.def && seen.defId) {
      if (seen.def.id === seen.defId)
        delete seen.def.id;
      defs[seen.defId] = seen.def;
    }
  }
  if (ctx.external) {} else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: new Set };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  process2(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  process2(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
var formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
};
var stringProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  json.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minLength = minimum;
  if (typeof maximum === "number")
    json.maxLength = maximum;
  if (format) {
    json.format = formatMap[format] ?? format;
    if (json.format === "")
      delete json.format;
    if (format === "time") {
      delete json.format;
    }
  }
  if (contentEncoding)
    json.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const regexes = [...patterns];
    if (regexes.length === 1)
      json.pattern = regexes[0].source;
    else if (regexes.length > 1) {
      json.allOf = [
        ...regexes.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
};
var numberProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
  if (typeof format === "string" && format.includes("int"))
    json.type = "integer";
  else
    json.type = "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json.minimum = exclusiveMinimum;
      json.exclusiveMinimum = true;
    } else {
      json.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json.maximum = exclusiveMaximum;
      json.exclusiveMaximum = true;
    } else {
      json.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json.maximum = maximum;
  }
  if (typeof multipleOf === "number")
    json.multipleOf = multipleOf;
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var nullProcessor = (_schema, ctx, json, _params) => {
  if (ctx.target === "openapi-3.0") {
    json.type = "string";
    json.nullable = true;
    json.enum = [null];
  } else {
    json.type = "null";
  }
};
var neverProcessor = (_schema, _ctx, json, _params) => {
  json.not = {};
};
var unknownProcessor = (_schema, _ctx, _json, _params) => {};
var enumProcessor = (schema, _ctx, json, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.every((v) => typeof v === "number"))
    json.type = "number";
  if (values.every((v) => typeof v === "string"))
    json.type = "string";
  json.enum = values;
};
var literalProcessor = (schema, ctx, json, _params) => {
  const def = schema._zod.def;
  const vals = [];
  for (const val of def.values) {
    if (val === undefined) {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Literal `undefined` cannot be represented in JSON Schema");
      }
    } else if (typeof val === "bigint") {
      if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt literals cannot be represented in JSON Schema");
      } else {
        vals.push(Number(val));
      }
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) {} else if (vals.length === 1) {
    const val = vals[0];
    json.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json.enum = [val];
    } else {
      json.const = val;
    }
  } else {
    if (vals.every((v) => typeof v === "number"))
      json.type = "number";
    if (vals.every((v) => typeof v === "string"))
      json.type = "string";
    if (vals.every((v) => typeof v === "boolean"))
      json.type = "boolean";
    if (vals.every((v) => v === null))
      json.type = "null";
    json.enum = vals;
  }
};
var customProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Custom types cannot be represented in JSON Schema");
  }
};
var functionProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Function types cannot be represented in JSON Schema");
  }
};
var transformProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Transforms cannot be represented in JSON Schema");
  }
};
var arrayProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
  json.type = "array";
  json.items = process2(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
};
var objectProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  json.properties = {};
  const shape = def.shape;
  for (const key in shape) {
    json.properties[key] = process2(shape[key], ctx, {
      ...params,
      path: [...params.path, "properties", key]
    });
  }
  const allKeys = new Set(Object.keys(shape));
  const requiredKeys = new Set([...allKeys].filter((key) => {
    const v = def.shape[key]._zod;
    if (ctx.io === "input") {
      return v.optin === undefined;
    } else {
      return v.optout === undefined;
    }
  }));
  if (requiredKeys.size > 0) {
    json.required = Array.from(requiredKeys);
  }
  if (def.catchall?._zod.def.type === "never") {
    json.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json.additionalProperties = false;
  } else if (def.catchall) {
    json.additionalProperties = process2(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
};
var unionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) => process2(x, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
  }));
  if (isExclusive) {
    json.oneOf = options;
  } else {
    json.anyOf = options;
  }
};
var intersectionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const a = process2(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b = process2(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => ("allOf" in val) && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a) ? a.allOf : [a],
    ...isSimpleIntersection(b) ? b.allOf : [b]
  ];
  json.allOf = allOf;
};
var tupleProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "array";
  const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
  const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
  const prefixItems = def.items.map((x, i) => process2(x, ctx, {
    ...params,
    path: [...params.path, prefixPath, i]
  }));
  const rest = def.rest ? process2(def.rest, ctx, {
    ...params,
    path: [...params.path, restPath, ...ctx.target === "openapi-3.0" ? [def.items.length] : []]
  }) : null;
  if (ctx.target === "draft-2020-12") {
    json.prefixItems = prefixItems;
    if (rest) {
      json.items = rest;
    }
  } else if (ctx.target === "openapi-3.0") {
    json.items = {
      anyOf: prefixItems
    };
    if (rest) {
      json.items.anyOf.push(rest);
    }
    json.minItems = prefixItems.length;
    if (!rest) {
      json.maxItems = prefixItems.length;
    }
  } else {
    json.items = prefixItems;
    if (rest) {
      json.additionalItems = rest;
    }
  }
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
};
var recordProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  const keyType = def.keyType;
  const keyBag = keyType._zod.bag;
  const patterns = keyBag?.patterns;
  if (def.mode === "loose" && patterns && patterns.size > 0) {
    const valueSchema = process2(def.valueType, ctx, {
      ...params,
      path: [...params.path, "patternProperties", "*"]
    });
    json.patternProperties = {};
    for (const pattern of patterns) {
      json.patternProperties[pattern.source] = valueSchema;
    }
  } else {
    if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
      json.propertyNames = process2(def.keyType, ctx, {
        ...params,
        path: [...params.path, "propertyNames"]
      });
    }
    json.additionalProperties = process2(def.valueType, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
  const keyValues = keyType._zod.values;
  if (keyValues) {
    const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
    if (validKeyValues.length > 0) {
      json.required = validKeyValues;
    }
  }
};
var nullableProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const inner = process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json.nullable = true;
  } else {
    json.anyOf = [inner, { type: "null" }];
  }
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var defaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
var prefaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io === "input")
    json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
var catchProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(undefined);
  } catch {
    throw new Error("Dynamic catch values are not supported in JSON Schema");
  }
  json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  process2(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.readOnly = true;
};
var optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/iso.js
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date2(params) {
  return _isoDate(ZodISODate, params);
}
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/errors.js
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError(inst, mapper)
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper)
    },
    addIssue: {
      value: (issue) => {
        inst.issues.push(issue);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    addIssues: {
      value: (issues) => {
        inst.issues.push(...issues);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      }
    }
  });
};
var ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, {
  Parent: Error
});

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/parse.js
var parse3 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
var _installedGroups = /* @__PURE__ */ new WeakMap;
function _installLazyMethods(inst, group, methods) {
  const proto = Object.getPrototypeOf(inst);
  let installed = _installedGroups.get(proto);
  if (!installed) {
    installed = new Set;
    _installedGroups.set(proto, installed);
  }
  if (installed.has(group))
    return;
  installed.add(group);
  for (const key in methods) {
    const fn = methods[key];
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const bound = fn.bind(this);
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: bound
        });
        return bound;
      },
      set(v) {
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: v
        });
      }
    });
  }
}
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  Object.assign(inst["~standard"], {
    jsonSchema: {
      input: createStandardJSONSchemaMethod(inst, "input"),
      output: createStandardJSONSchemaMethod(inst, "output")
    }
  });
  inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
  inst.def = def;
  inst.type = def.type;
  Object.defineProperty(inst, "_def", { value: def });
  inst.parse = (data, params) => parse3(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse2(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync2(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync2(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.encode = (data, params) => encode(inst, data, params);
  inst.decode = (data, params) => decode(inst, data, params);
  inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
  inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
  inst.safeEncode = (data, params) => safeEncode(inst, data, params);
  inst.safeDecode = (data, params) => safeDecode(inst, data, params);
  inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
  inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
  _installLazyMethods(inst, "ZodType", {
    check(...chks) {
      const def = this.def;
      return this.clone(mergeDefs(def, {
        checks: [
          ...def.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def, params) {
      return clone(this, def, params);
    },
    brand() {
      return this;
    },
    register(reg, meta) {
      reg.add(this, meta);
      return this;
    },
    refine(check, params) {
      return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(_overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d) {
      return _default(this, d);
    },
    prefault(d) {
      return prefault(this, d);
    },
    catch(params) {
      return _catch(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(undefined).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn) {
      return fn(this);
    }
  });
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  return inst;
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  _installLazyMethods(inst, "_ZodString", {
    regex(...args) {
      return this.check(_regex(...args));
    },
    includes(...args) {
      return this.check(_includes(...args));
    },
    startsWith(...args) {
      return this.check(_startsWith(...args));
    },
    endsWith(...args) {
      return this.check(_endsWith(...args));
    },
    min(...args) {
      return this.check(_minLength(...args));
    },
    max(...args) {
      return this.check(_maxLength(...args));
    },
    length(...args) {
      return this.check(_length(...args));
    },
    nonempty(...args) {
      return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(_lowercase(params));
    },
    uppercase(params) {
      return this.check(_uppercase(params));
    },
    trim() {
      return this.check(_trim());
    },
    normalize(...args) {
      return this.check(_normalize(...args));
    },
    toLowerCase() {
      return this.check(_toLowerCase());
    },
    toUpperCase() {
      return this.check(_toUpperCase());
    },
    slugify() {
      return this.check(_slugify());
    }
  });
});
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime2(params));
  inst.date = (params) => inst.check(date2(params));
  inst.time = (params) => inst.check(time2(params));
  inst.duration = (params) => inst.check(duration2(params));
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function url(params) {
  return _url(ZodURL, params);
}
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
  _installLazyMethods(inst, "ZodNumber", {
    gt(value, params) {
      return this.check(_gt(value, params));
    },
    gte(value, params) {
      return this.check(_gte(value, params));
    },
    min(value, params) {
      return this.check(_gte(value, params));
    },
    lt(value, params) {
      return this.check(_lt(value, params));
    },
    lte(value, params) {
      return this.check(_lte(value, params));
    },
    max(value, params) {
      return this.check(_lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(_gt(0, params));
    },
    nonnegative(params) {
      return this.check(_gte(0, params));
    },
    negative(params) {
      return this.check(_lt(0, params));
    },
    nonpositive(params) {
      return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(_multipleOf(value, params));
    },
    step(value, params) {
      return this.check(_multipleOf(value, params));
    },
    finite() {
      return this;
    }
  });
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodNull = /* @__PURE__ */ $constructor("ZodNull", (inst, def) => {
  $ZodNull.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullProcessor(inst, ctx, json, params);
});
function _null3(params) {
  return _null2(ZodNull, params);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
  inst.element = def.element;
  _installLazyMethods(inst, "ZodArray", {
    min(n, params) {
      return this.check(_minLength(n, params));
    },
    nonempty(params) {
      return this.check(_minLength(1, params));
    },
    max(n, params) {
      return this.check(_maxLength(n, params));
    },
    length(n, params) {
      return this.check(_length(n, params));
    },
    unwrap() {
      return this.element;
    }
  });
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
  defineLazy(inst, "shape", () => {
    return def.shape;
  });
  _installLazyMethods(inst, "ZodObject", {
    keyof() {
      return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone({ ...this._zod.def, catchall });
    },
    passthrough() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    loose() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    strict() {
      return this.clone({ ...this._zod.def, catchall: never() });
    },
    strip() {
      return this.clone({ ...this._zod.def, catchall: undefined });
    },
    extend(incoming) {
      return extend(this, incoming);
    },
    safeExtend(incoming) {
      return safeExtend(this, incoming);
    },
    merge(other) {
      return merge(this, other);
    },
    pick(mask) {
      return pick(this, mask);
    },
    omit(mask) {
      return omit(this, mask);
    },
    partial(...args) {
      return partial(ZodOptional, this, args[0]);
    },
    required(...args) {
      return required(ZodNonOptional, this, args[0]);
    }
  });
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...normalizeParams(params)
  };
  return new ZodObject(def);
}
function strictObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: never(),
    ...normalizeParams(params)
  });
}
function looseObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: unknown(),
    ...normalizeParams(params)
  });
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
var ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
  ZodUnion.init(inst, def);
  $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
  $ZodTuple.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => tupleProcessor(inst, ctx, json, params);
  inst.rest = (rest) => inst.clone({
    ...inst._zod.def,
    rest
  });
});
function tuple(items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new ZodTuple({
    type: "tuple",
    items,
    rest,
    ...normalizeParams(params)
  });
}
var ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string2(),
      valueType: keyType,
      ...normalizeParams(valueType)
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output) => {
        payload.value = output;
        payload.fallback = true;
        return payload;
      });
    }
    payload.value = output;
    payload.fallback = true;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
  });
}
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodFunction = /* @__PURE__ */ $constructor("ZodFunction", (inst, def) => {
  $ZodFunction.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => functionProcessor(inst, ctx, json, params);
});
function _function(params) {
  return new ZodFunction({
    type: "function",
    input: Array.isArray(params?.input) ? tuple(params?.input) : params?.input ?? array(unknown()),
    output: params?.output ?? unknown()
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
// packages/flash/dist/constants.js
var FLASH_ANVIL_CHAIN_ID = 31337;
var FLASH_NATIVE_ETH_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
var FLASH_WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
var FLASH_USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
var FLASH_BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
var FLASH_BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
var FLASH_NATIVE_ETH_ASSET_SYMBOL = "ETH";
var FLASH_WETH_ASSET_SYMBOL = "WETH";
var FLASH_USDC_ASSET_SYMBOL = "USDC";
var FLASH_MARKET_ORDER_TYPE = "market";
var FLASH_LIMIT_ORDER_TYPE = "limit";
var FLASH_TWAP_ORDER_TYPE = "twap";
var FLASH_STOP_ORDER_TYPE = "stop";
var FLASH_STOP_LOSS_ORDER_TYPE = "stop-loss";
var FLASH_TAKE_PROFIT_ORDER_TYPE = "take-profit";
var FLASH_BRACKET_ORDER_TYPE = "bracket";
var FLASH_ORDER_TYPES = [
  FLASH_MARKET_ORDER_TYPE,
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_BRACKET_ORDER_TYPE
];
var FLASH_TRADE_SIDES = ["buy", "sell"];

// packages/flash/dist/schemas.js
var FlashAddressSchema = string2().regex(/^0x[0-9a-fA-F]{40}$/);
var FlashChainIdSchema = number2().int().positive();
var FlashTradeSideSchema = _enum(FLASH_TRADE_SIDES);
var FlashOrderTypeSchema = _enum(FLASH_ORDER_TYPES);
var FlashStepKindSchema = _enum(["wrap", "approve", "sign", "submit"]);
var FlashStepStatusSchema = _enum(["idle", "required", "pending", "complete", "error", "skipped"]);
var FlashAssetSchema = strictObject({
  id: string2().min(1).max(256),
  symbol: string2().min(1).max(32),
  name: string2().min(1).max(128),
  decimals: number2().int().min(0).max(255),
  chainId: FlashChainIdSchema,
  isNative: boolean2(),
  address: FlashAddressSchema
});
var FlashStepSchema = object({
  id: string2().min(1).max(256),
  kind: FlashStepKindSchema,
  label: string2().min(1).max(256),
  status: FlashStepStatusSchema,
  asset: FlashAssetSchema.optional(),
  amount: string2().optional(),
  txHash: string2().optional(),
  error: string2().optional()
});
var FlashQuoteFeeSchema = object({
  label: string2(),
  amount: string2(),
  asset: FlashAssetSchema.optional()
});
var FlashQuoteLegSchema = object({
  asset: _enum(["target", "contra"]),
  amount: string2(),
  notional: string2()
});
var FlashQuoteTransactionRequestSchema = object({
  chainId: FlashChainIdSchema,
  from: FlashAddressSchema.optional(),
  to: FlashAddressSchema,
  data: string2(),
  value: string2().optional()
});
var FlashQuoteActionSchema = object({
  id: string2(),
  kind: _enum(["wrap", "approve"]),
  label: string2(),
  asset: FlashAssetSchema,
  amount: string2(),
  amountRaw: string2(),
  spender: FlashAddressSchema.optional(),
  tx: FlashQuoteTransactionRequestSchema
});
var FlashQuoteActionsSchema = object({
  wrap: FlashQuoteActionSchema.nullable().optional(),
  approval: FlashQuoteActionSchema.nullable().optional()
});
var FlashQuoteSchema = object({
  id: string2().optional(),
  side: FlashTradeSideSchema,
  orderType: FlashOrderTypeSchema,
  targetAsset: FlashAssetSchema,
  contraAsset: FlashAssetSchema,
  spentAsset: FlashAssetSchema,
  receiveAsset: FlashAssetSchema,
  inputAmount: string2(),
  outputAmount: string2(),
  inputNotional: string2().optional(),
  outputNotional: string2().optional(),
  estimatedFeeNotional: string2().optional(),
  targetNotionalPrice: string2().optional(),
  from: FlashQuoteLegSchema.optional(),
  to: FlashQuoteLegSchema.optional(),
  rate: string2().optional(),
  fees: array(FlashQuoteFeeSchema).optional(),
  steps: array(FlashStepSchema),
  actions: FlashQuoteActionsSchema.optional(),
  expiresAt: string2().optional(),
  raw: unknown().optional()
});
var FlashRuntimeSchema = object({
  environment: string2().nullish(),
  isDev: boolean2().nullish(),
  profile: string2().nullish()
});

// packages/flash/dist/contracts.js
var NumberOrStringSchema = union([number2(), string2()]);
var FlashPriceTriggerInputSchema = object({
  notionalPrice: NumberOrStringSchema.optional(),
  triggerType: _enum(["lower", "upper"]).optional()
});
var FlashChainInputSchema = union([
  NumberOrStringSchema,
  object({ id: NumberOrStringSchema.optional(), chainId: NumberOrStringSchema.optional() }),
  _null3()
]);
var FlashQuoteRequestSchema = object({
  accountAddress: string2().optional(),
  recipientAddress: string2().optional(),
  targetChain: FlashChainInputSchema.optional(),
  contraChain: FlashChainInputSchema.optional(),
  chainId: NumberOrStringSchema.optional(),
  targetAsset: FlashAssetSchema,
  contraAsset: FlashAssetSchema,
  side: FlashTradeSideSchema,
  qty: string2().optional(),
  inputAmount: string2().optional(),
  orderType: FlashOrderTypeSchema.optional(),
  slippage: NumberOrStringSchema.optional(),
  maxPriceImpact: NumberOrStringSchema.optional(),
  quickTrade: boolean2().optional(),
  durationSeconds: NumberOrStringSchema.optional(),
  expireTime: string2().optional(),
  startTime: string2().optional(),
  limitNotionalPrice: NumberOrStringSchema.optional(),
  stopLossNotionalPrice: NumberOrStringSchema.optional(),
  takeProfitNotionalPrice: NumberOrStringSchema.optional(),
  triggerNotionalPrice: NumberOrStringSchema.optional(),
  triggers: array(FlashPriceTriggerInputSchema).optional(),
  twapBucketCount: NumberOrStringSchema.optional()
});
var FlashBoundQuoteRequestSchema = FlashQuoteRequestSchema.extend({
  accountAddress: string2().min(1)
});
var FlashSubmitOrderRequestSchema = FlashBoundQuoteRequestSchema.extend({
  bridgeQuoteId: string2().optional(),
  evmOrderTypedData: unknown().optional(),
  evmPermitSignature: string2().optional(),
  evmPermitTypedData: unknown().optional(),
  quote: FlashQuoteSchema,
  quoteId: string2().optional(),
  signature: string2().optional(),
  orderSignature: string2().optional(),
  rawPayload: unknown().optional(),
  idempotencyKey: string2().optional()
});
var FlashListOrdersRequestSchema = object({
  accountAddress: string2().optional(),
  chainId: NumberOrStringSchema.optional(),
  pageSize: number2().optional(),
  status: union([string2(), array(string2())]).optional()
});
var FlashGetOrderRequestSchema = object({
  accountAddress: string2().optional(),
  orderId: string2().min(1)
});
var FlashCancelOrderRequestSchema = object({
  cancelMessage: string2().optional(),
  orderId: string2().min(1),
  signature: string2().optional(),
  userSignature: string2().optional()
});

// apps/newframe-cli/src/client.ts
import { createHash } from "crypto";

// packages/desktop-api/src/schemas.ts
var AddressSchema = string2().regex(/^0x[0-9a-f]{40}$/i);
var HexSchema = string2().regex(/^0x[0-9a-f]*$/i);
var HashSchema = string2().regex(/^0x[0-9a-f]{64}$/i);
var AgentDescriptorSchema = strictObject({
  name: string2().trim().min(1).max(128),
  description: string2().trim().max(512).optional(),
  url: url({ protocol: /^https?:$/ }).max(2048).optional()
});
var AgentConnectSchema = strictObject({
  descriptor: AgentDescriptorSchema,
  durationSeconds: number2().int().min(60).max(180 * 24 * 60 * 60)
});
var SessionSchema = object({
  sessionId: string2().min(1),
  sessionToken: string2().min(1),
  account: AddressSchema,
  expiresAt: number2().finite()
});
var AgentCredentialsSchema = SessionSchema.extend({ descriptor: AgentDescriptorSchema });
var RoutingSchema = object({
  chainId: string2().optional(),
  origin: string2().optional(),
  connecting: boolean2().optional()
});
var RpcCallSchema = RoutingSchema.extend({
  method: string2().min(1).max(128),
  params: union([array(unknown()), record(string2(), unknown())]).default([])
});
var OriginStatusSchema = object({
  originId: string2(),
  origin: string2(),
  connected: boolean2(),
  address: string2(),
  selectedAddress: string2().optional(),
  chainId: string2().optional()
});
var ChainSchema = looseObject({
  chainId: union([number2(), string2()]),
  name: string2().optional(),
  connected: boolean2().optional(),
  icon: array(looseObject({ url: string2() })).optional()
});
var ProviderEventSchema = _enum([
  "networkChanged",
  "chainChanged",
  "chainsChanged",
  "accountsChanged",
  "assetsChanged"
]);
var WalletEventSchema = discriminatedUnion("event", [
  object({ event: literal("chainsChanged"), value: array(ChainSchema) }),
  object({ event: literal("accountsChanged"), value: array(string2()) }),
  object({ event: literal("chainChanged"), value: string2() }),
  object({ event: literal("networkChanged"), value: union([string2(), number2()]) }),
  object({ event: literal("assetsChanged"), value: unknown() })
]);
var RpcErrorSchema = object({
  code: number2().optional(),
  message: string2(),
  data: unknown().optional()
});

// packages/flash/dist/chains.js
var FLASH_CHAIN_REGISTRY = [
  {
    chainId: 1,
    order: 0,
    slug: "ethereum",
    profiles: ["dev", "prod"],
    weth: FLASH_WETH_ADDRESS,
    usdc: FLASH_USDC_ADDRESS
  },
  { chainId: 10, order: 1, slug: "optimism", profiles: ["dev", "prod"] },
  { chainId: 56, order: 2, slug: "bsc", profiles: ["dev", "prod"] },
  { chainId: 137, order: 3, slug: "polygon", profiles: ["dev", "prod"] },
  { chainId: 999, order: 4, slug: "hyperevm", profiles: ["dev", "prod"] },
  {
    chainId: 8453,
    order: 5,
    slug: "base",
    profiles: ["dev", "prod"],
    weth: FLASH_BASE_WETH_ADDRESS,
    usdc: FLASH_BASE_USDC_ADDRESS
  },
  { chainId: 9745, order: 6, slug: "plasma", profiles: ["dev", "prod"] },
  { chainId: 81457, order: 7, slug: "blast", profiles: ["dev", "prod"] },
  { chainId: 42161, order: 8, slug: "arbitrum", profiles: ["dev", "prod"] },
  { chainId: 43114, order: 9, slug: "avalanche", profiles: ["dev", "prod"] },
  { chainId: 143, order: 10, slug: "monad", profiles: ["dev", "prod"] },
  {
    chainId: FLASH_ANVIL_CHAIN_ID,
    order: 11,
    slug: "anvil",
    profiles: ["dev"],
    weth: FLASH_WETH_ADDRESS,
    usdc: FLASH_USDC_ADDRESS
  }
];
function flashProfile(runtime) {
  return runtime.profile === "dev" || runtime.isDev === true || runtime.environment === "development" ? "dev" : "prod";
}
function getFlashChainConfig(chainId) {
  return FLASH_CHAIN_REGISTRY.find((config) => config.chainId === Number(chainId));
}
function getFlashSupportedChainIds(runtime = {}) {
  const profile = flashProfile(runtime);
  return FLASH_CHAIN_REGISTRY.filter((config) => config.profiles.includes(profile)).map((config) => config.chainId);
}
function isFlashChainSupported(chainId, runtime = {}) {
  return getFlashSupportedChainIds(runtime).includes(Number(chainId));
}
function getFlashChainSlug(chainId) {
  return getFlashChainConfig(chainId)?.slug ?? "";
}
function getFlashChainIdFromSlug(slug) {
  return FLASH_CHAIN_REGISTRY.find((config) => config.slug === slug.trim().toLowerCase())?.chainId;
}

// packages/flash/dist/assets.js
var NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000";
function normalizeFlashAddress(address) {
  const value = typeof address === "string" ? address.trim().toLowerCase() : "";
  if (value === NATIVE_CURRENCY) {
    return FLASH_NATIVE_ETH_TOKEN_ADDRESS;
  }
  return /^0x[0-9a-f]{40}$/.test(value) ? value : FLASH_NATIVE_ETH_TOKEN_ADDRESS;
}
function flashAssetId(chainId, address) {
  return `${chainId}:${normalizeFlashAddress(address)}`;
}
function createFlashAsset({ address, chainId, decimals, isNative, name, symbol }) {
  const normalizedAddress = normalizeFlashAddress(address);
  return FlashAssetSchema.parse({
    id: flashAssetId(chainId, normalizedAddress),
    symbol,
    name,
    decimals,
    chainId,
    isNative,
    address: normalizedAddress
  });
}
var FLASH_NATIVE_ETH_ASSET = createFlashAsset({
  address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
  chainId: FLASH_ANVIL_CHAIN_ID,
  decimals: 18,
  isNative: true,
  name: "Ether",
  symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL
});
var FLASH_WETH_ASSET = createFlashAsset({
  address: FLASH_WETH_ADDRESS,
  chainId: FLASH_ANVIL_CHAIN_ID,
  decimals: 18,
  isNative: false,
  name: "Wrapped Ether",
  symbol: FLASH_WETH_ASSET_SYMBOL
});
var FLASH_USDC_ASSET = createFlashAsset({
  address: FLASH_USDC_ADDRESS,
  chainId: FLASH_ANVIL_CHAIN_ID,
  decimals: 6,
  isNative: false,
  name: "USD Coin",
  symbol: FLASH_USDC_ASSET_SYMBOL
});
function toFlashApiAssetAddress(asset) {
  return asset.isNative ? FLASH_NATIVE_ETH_TOKEN_ADDRESS : normalizeFlashAddress(asset.address);
}
function getFlashAssetsForChain(chainId) {
  const normalizedChainId = Number(chainId);
  const config = getFlashChainConfig(normalizedChainId);
  if (!config?.weth || !config.usdc) {
    return [
      createFlashAsset({
        address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
        chainId: normalizedChainId,
        decimals: 18,
        isNative: true,
        name: "Native Asset",
        symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL
      })
    ];
  }
  return [
    createFlashAsset({
      address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
      chainId: normalizedChainId,
      decimals: 18,
      isNative: true,
      name: "Ether",
      symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL
    }),
    createFlashAsset({
      address: config.weth,
      chainId: normalizedChainId,
      decimals: 18,
      isNative: false,
      name: "Wrapped Ether",
      symbol: FLASH_WETH_ASSET_SYMBOL
    }),
    createFlashAsset({
      address: config.usdc,
      chainId: normalizedChainId,
      decimals: 6,
      isNative: false,
      name: "USD Coin",
      symbol: FLASH_USDC_ASSET_SYMBOL
    })
  ];
}

// packages/flash/dist/pair.js
function getSpentAsset({ side, targetAsset, contraAsset }) {
  return side === "buy" ? contraAsset : targetAsset;
}
function getReceiveAsset({ side, targetAsset, contraAsset }) {
  return side === "buy" ? targetAsset : contraAsset;
}
function getFlashAssetPairChains(pair) {
  const spentAsset = getSpentAsset(pair);
  const receiveAsset = getReceiveAsset(pair);
  const targetChainId = pair.targetAsset.chainId;
  const contraChainId = pair.contraAsset.chainId;
  return {
    targetChainId,
    contraChainId,
    spentChainId: spentAsset.chainId,
    receiveChainId: receiveAsset.chainId,
    isCrossChain: targetChainId !== contraChainId
  };
}

// packages/flash/dist/runtime.js
function flashRuntimeFromEnv() {
  return { isDev: process.env.FRAME_PROFILE === "dev" || process.env.NODE_ENV === "development" };
}

// packages/flash/dist/wire.js
var FlashWireOrderSchema = looseObject({
  orderId: string2().min(1).optional(),
  id: string2().min(1).optional(),
  accountAddress: string2().optional(),
  funderAddress: string2().optional(),
  account: string2().optional(),
  status: unknown().optional(),
  open: boolean2().optional()
}).refine((order) => Boolean(order.orderId ?? order.id), "Flash order response has no order id");
var FlashQuoteLegSchema2 = looseObject({
  asset: _enum(["target", "contra"]).optional().catch(undefined),
  amount: union([string2(), number2()]).optional().catch(""),
  notional: union([string2(), number2()]).optional().catch("")
});
var FlashToLegSchema = FlashQuoteLegSchema2.extend({
  amount: union([string2(), number2()]).optional().catch("0")
});
var FlashQuotePayloadSchema = looseObject({
  from: FlashQuoteLegSchema2.optional(),
  to: FlashToLegSchema.optional(),
  actions: looseObject({}).nullish(),
  evm: looseObject({}).nullish(),
  wrap: looseObject({}).nullish(),
  approval: looseObject({}).nullish()
});
var FlashQuoteResponseSchema = FlashQuotePayloadSchema.extend({
  quote: FlashQuotePayloadSchema.optional()
});
var FlashSubmitResponseSchema = looseObject({
  orderId: string2().min(1).optional(),
  id: string2().min(1).optional(),
  order: FlashWireOrderSchema.optional(),
  status: unknown().optional()
}).refine((response) => Boolean(response.orderId ?? response.order?.orderId ?? response.order?.id ?? response.id), "Flash order submit did not return an order id").transform((response) => ({
  ...response,
  orderId: string2().parse(response.orderId ?? response.order?.orderId ?? response.order?.id ?? response.id)
}));
var FlashListOrdersResponseSchema = union([array(FlashWireOrderSchema), looseObject({ orders: array(FlashWireOrderSchema) })]).transform((response) => Array.isArray(response) ? { orders: response } : response);
var FlashGetOrderResponseSchema = union([
  looseObject({
    order: FlashWireOrderSchema,
    accountAddress: string2().optional(),
    funderAddress: string2().optional(),
    account: string2().optional()
  }),
  FlashWireOrderSchema
]).transform((response) => ({
  ...response,
  order: FlashWireOrderSchema.parse("order" in response ? response.order : response)
}));
var FlashCancelOrderResponseSchema = union([
  looseObject({ order: FlashWireOrderSchema.optional() }),
  _null3().transform(() => ({ order: undefined }))
]);
var FlashWebSocketFrameSchema = union([
  object({
    channel: literal("subscriptions"),
    type: literal("ack"),
    subscriptions: array(string2()).catch([])
  }),
  object({
    channel: literal("orders"),
    type: _enum(["snapshot", "update"]),
    orders: array(unknown())
  }),
  object({
    type: literal("error"),
    code: string2().catch("ERROR"),
    message: string2().catch("")
  })
]);

// packages/flash/dist/protocol.js
function normalizeAddress(address) {
  return typeof address === "string" ? address.trim().toLowerCase() : "";
}
function normalizeAmount(amount) {
  return String(amount ?? "").trim().replace(/,/g, "");
}
function objectPayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function stringValue(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}
function flashChainIdFromSlug(input) {
  if (typeof input === "number") {
    return input;
  }
  if (typeof input !== "string") {
    return;
  }
  const normalized = input.trim().toLowerCase();
  const registeredChainId = getFlashChainIdFromSlug(normalized);
  if (registeredChainId) {
    return registeredChainId;
  }
  const parsed = Number(normalized);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  const caipChainId = normalized.match(/(?:^|:)(\d+)$/)?.[1];
  const caipParsed = Number(caipChainId);
  return Number.isInteger(caipParsed) && caipParsed > 0 ? caipParsed : undefined;
}
function requireSupportedChainId(chainId, runtime) {
  if (!isFlashChainSupported(chainId, runtime)) {
    throw new Error(`Flash does not support chain ${chainId} for this runtime`);
  }
  return chainId;
}
function normalizePercent(value) {
  if (value === undefined || String(value).trim() === "") {
    return;
  }
  const parsed = Number(normalizeAmount(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return;
  }
  return (parsed / 100).toString();
}
function optionalString(value) {
  const clean = normalizeAmount(value);
  return clean || undefined;
}
function optionalInteger(value, label, { max, min } = {}) {
  if (value === undefined || value === null || typeof value === "string" && value.trim() === "") {
    return;
  }
  const parsed = typeof value === "string" || typeof value === "number" ? Number(normalizeAmount(value)) : Number.NaN;
  if (!Number.isInteger(parsed) || min !== undefined && parsed < min || max !== undefined && parsed > max) {
    const range = [min, max].filter((boundary) => boundary !== undefined).join(" to ");
    throw new Error(`Flash ${label} must be an integer${range ? ` from ${range}` : ""}`);
  }
  return parsed;
}
function normalizeTrigger(trigger) {
  const notionalPrice = optionalString(trigger.notionalPrice);
  if (!notionalPrice || trigger.triggerType !== "lower" && trigger.triggerType !== "upper") {
    throw new Error("Flash triggers require a notional price and lower or upper trigger type");
  }
  return { notionalPrice, triggerType: trigger.triggerType };
}
function normalizeTriggers(request, orderType) {
  if (request.triggers) {
    if (request.triggers.length > 2) {
      throw new Error("Flash supports at most two price triggers");
    }
    return request.triggers.map(normalizeTrigger);
  }
  const triggerNotionalPrice = optionalString(request.triggerNotionalPrice);
  const stopLossNotionalPrice = optionalString(request.stopLossNotionalPrice);
  const takeProfitNotionalPrice = optionalString(request.takeProfitNotionalPrice);
  if (orderType === "stop" && triggerNotionalPrice) {
    return [{ notionalPrice: triggerNotionalPrice, triggerType: "upper" }];
  }
  if (orderType === "stop-loss" && (stopLossNotionalPrice || triggerNotionalPrice)) {
    return [
      {
        notionalPrice: stopLossNotionalPrice ?? triggerNotionalPrice ?? "",
        triggerType: "lower"
      }
    ];
  }
  if (orderType === "take-profit" && (takeProfitNotionalPrice || triggerNotionalPrice)) {
    return [
      {
        notionalPrice: takeProfitNotionalPrice ?? triggerNotionalPrice ?? "",
        triggerType: "upper"
      }
    ];
  }
  if (orderType === "bracket" && stopLossNotionalPrice && takeProfitNotionalPrice) {
    return [
      { notionalPrice: stopLossNotionalPrice, triggerType: "lower" },
      { notionalPrice: takeProfitNotionalPrice, triggerType: "upper" }
    ];
  }
  return;
}
function buildFlashQuoteBodyValidated(request, runtime) {
  const targetAsset = request.targetAsset;
  const contraAsset = request.contraAsset;
  const side = request.side;
  const chains = getFlashAssetPairChains({ side, targetAsset, contraAsset });
  requireSupportedChainId(chains.targetChainId, runtime);
  requireSupportedChainId(chains.contraChainId, runtime);
  const qty = normalizeAmount(request.qty ?? request.inputAmount);
  const orderType = request.orderType ?? FLASH_MARKET_ORDER_TYPE;
  const maxSlippage = normalizePercent(request.slippage);
  const maxPriceImpact = normalizePercent(request.maxPriceImpact);
  const durationSeconds = orderType === "twap" ? optionalInteger(request.durationSeconds, "durationSeconds", {
    min: 300
  }) : undefined;
  const twapBucketCount = orderType === "twap" ? optionalInteger(request.twapBucketCount, "twapBucketCount", {
    min: 2,
    max: 2560
  }) : undefined;
  const isTriggerOrder = ["stop", "stop-loss", "take-profit", "bracket"].includes(orderType);
  const triggers = isTriggerOrder ? normalizeTriggers(request, orderType) : undefined;
  const supportsExpiry = orderType === "limit" || isTriggerOrder;
  const supportsLimitPrice = orderType === "limit" || orderType === "twap" || orderType === "stop" || orderType === "stop-loss" || orderType === "take-profit";
  if (!qty || Number(qty) <= 0) {
    throw new Error("Flash quote requires a positive qty");
  }
  if (chains.isCrossChain && orderType !== FLASH_MARKET_ORDER_TYPE) {
    throw new Error("Flash cross-chain trades support market orders only");
  }
  return {
    funderAddress: request.accountAddress,
    recipientAddress: request.accountAddress,
    targetChain: getFlashChainSlug(chains.targetChainId),
    contraChain: getFlashChainSlug(chains.contraChainId),
    targetAsset: toFlashApiAssetAddress(targetAsset),
    contraAsset: toFlashApiAssetAddress(contraAsset),
    side,
    qty,
    orderType,
    ...maxSlippage ? { maxSlippage } : {},
    ...maxPriceImpact ? { maxPriceImpact } : {},
    ...orderType === FLASH_MARKET_ORDER_TYPE && request.quickTrade ? { quickTrade: true } : {},
    ...supportsLimitPrice && optionalString(request.limitNotionalPrice) ? { limitNotionalPrice: optionalString(request.limitNotionalPrice) } : {},
    ...supportsExpiry && request.expireTime?.trim() ? { expireTime: request.expireTime.trim() } : {},
    ...orderType === "twap" && request.startTime?.trim() ? { startTime: request.startTime.trim() } : {},
    ...durationSeconds !== undefined ? { durationSeconds } : {},
    ...twapBucketCount !== undefined ? { twapBucketCount } : {},
    ...triggers?.length ? { triggers } : {}
  };
}
var buildFlashQuoteBody = _function({ input: [FlashBoundQuoteRequestSchema, FlashRuntimeSchema.default(flashRuntimeFromEnv)] }).implement(buildFlashQuoteBodyValidated);
function normalizeTx(tx, fallbackChainId) {
  const record = objectPayload(tx);
  const to = stringValue(record.to);
  const data = stringValue(record.data, "0x");
  if (!to) {
    return null;
  }
  return {
    chainId: flashChainIdFromSlug(record.chainId) ?? fallbackChainId,
    ...record.from ? { from: stringValue(record.from) } : {},
    to,
    data,
    value: stringValue(record.value, "0x0")
  };
}
function quoteAction({ amount, amountRaw, asset, fallbackChainId, kind, label, spender, tx }) {
  const normalizedTx = normalizeTx(tx, fallbackChainId);
  if (!normalizedTx) {
    return null;
  }
  return {
    id: kind,
    kind,
    label,
    asset,
    amount,
    amountRaw,
    ...spender ? { spender } : {},
    tx: normalizedTx
  };
}
function normalizeFees(rawFees, spentAsset) {
  if (!Array.isArray(rawFees)) {
    const estimatedFeeNotional = optionalString(objectPayload(rawFees).estimatedFeeNotional);
    return estimatedFeeNotional ? [
      {
        label: "Estimated fee (USD)",
        amount: estimatedFeeNotional
      }
    ] : [];
  }
  return rawFees.map((fee) => {
    const record = objectPayload(fee);
    return {
      label: stringValue(record.label ?? record.name, "Flash fee"),
      amount: stringValue(record.amount ?? record.value, "0"),
      asset: spentAsset
    };
  });
}
function parseTypedData(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }
  const clean = value.trim();
  if (!clean) {
    return null;
  }
  try {
    const parsed = JSON.parse(clean);
    return parsed && typeof parsed === "object" ? parsed : value;
  } catch {
    return value;
  }
}
function serializeTypedData(value) {
  if (typeof value === "string") {
    return value.trim() ? value : undefined;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  return JSON.stringify(value);
}
function normalizeFlashQuoteResponseValidated(payload, request, runtime) {
  const quotePayload = objectPayload(payload.quote ?? payload);
  const targetAsset = request.targetAsset;
  const contraAsset = request.contraAsset;
  const side = request.side;
  const orderType = request.orderType ?? FLASH_MARKET_ORDER_TYPE;
  const chains = getFlashAssetPairChains({ side, targetAsset, contraAsset });
  requireSupportedChainId(chains.targetChainId, runtime);
  requireSupportedChainId(chains.contraChainId, runtime);
  if (chains.isCrossChain && orderType !== FLASH_MARKET_ORDER_TYPE) {
    throw new Error("Flash cross-chain trades support market orders only");
  }
  const spentAsset = getSpentAsset({ side, targetAsset, contraAsset });
  const receiveAsset = getReceiveAsset({ side, targetAsset, contraAsset });
  const fromPayload = objectPayload(quotePayload.from);
  const toPayload = objectPayload(quotePayload.to);
  const inputAmount = stringValue(fromPayload.amount ?? quotePayload.inputAmount ?? quotePayload.qty ?? request.qty ?? request.inputAmount);
  const outputAmount = stringValue(toPayload.amount ?? quotePayload.outputAmount ?? quotePayload.estimatedOutputAmount ?? quotePayload.toAmount, "0");
  const inputNotional = stringValue(fromPayload.notional ?? quotePayload.inputNotional ?? quotePayload.fromNotional);
  const outputNotional = stringValue(toPayload.notional ?? quotePayload.outputNotional ?? quotePayload.toNotional);
  const estimatedFeeNotional = stringValue(objectPayload(quotePayload.fees).estimatedFeeNotional);
  const targetLeg = fromPayload.asset === "target" || fromPayload.asset === undefined && side === "sell" ? { amount: inputAmount, notional: inputNotional } : { amount: outputAmount, notional: outputNotional };
  const targetAmountNumber = Number(targetLeg.amount);
  const targetNotionalNumber = Number(targetLeg.notional);
  const targetNotionalPrice = Number.isFinite(targetAmountNumber) && targetAmountNumber > 0 && Number.isFinite(targetNotionalNumber) ? String(targetNotionalNumber / targetAmountNumber) : "";
  let rawQuoteId = payload.id;
  if (quotePayload.quoteId !== undefined) {
    rawQuoteId = quotePayload.quoteId;
  } else if (quotePayload.id !== undefined) {
    rawQuoteId = quotePayload.id;
  } else if (payload.quoteId !== undefined) {
    rawQuoteId = payload.quoteId;
  }
  const quoteId = stringValue(rawQuoteId);
  const bridgeQuoteId = stringValue(quotePayload.bridgeQuoteId ?? payload.bridgeQuoteId).trim();
  const wrapPayload = objectPayload(quotePayload.wrap ?? objectPayload(quotePayload.actions).wrap);
  const evmPayload = objectPayload(quotePayload.evm ?? objectPayload(quotePayload.actions).evm);
  const approvalPayload = objectPayload(quotePayload.approval ?? objectPayload(quotePayload.actions).approval ?? evmPayload.approval);
  const orderTypedDataSource = evmPayload.orderTypedData ?? quotePayload.orderTypedData ?? objectPayload(quotePayload.actions).orderTypedData ?? null;
  const permitTypedDataSource = evmPayload.permitTypedData ?? null;
  const wrappedAssetAddress = stringValue(wrapPayload.wrappedAsset).trim();
  const approvalAsset = (wrappedAssetAddress ? getFlashAssetsForChain(chains.spentChainId).find((asset) => normalizeAddress(toFlashApiAssetAddress(asset)) === normalizeAddress(wrappedAssetAddress)) : null) ?? spentAsset;
  const wrapAction = quoteAction({
    amount: stringValue(wrapPayload.amount ?? inputAmount),
    amountRaw: stringValue(wrapPayload.amountRaw ?? wrapPayload.amountWei ?? "0"),
    asset: spentAsset,
    fallbackChainId: chains.spentChainId,
    kind: "wrap",
    label: stringValue(wrapPayload.label, `Wrap ${spentAsset.symbol}`),
    tx: wrapPayload.evmTx ?? wrapPayload.tx
  });
  const approvalAction = quoteAction({
    amount: stringValue(approvalPayload.amount ?? inputAmount),
    amountRaw: stringValue(approvalPayload.amountRaw ?? approvalPayload.amountWei ?? "0"),
    asset: approvalAsset,
    fallbackChainId: chains.spentChainId,
    kind: "approve",
    label: stringValue(approvalPayload.label, `Approve ${approvalAsset.symbol}`),
    spender: stringValue(approvalPayload.spender),
    tx: approvalPayload.evmTx ?? approvalPayload.tx ?? evmPayload.approveTx
  });
  const steps = [];
  if (wrapAction) {
    steps.push({
      id: "wrap",
      kind: "wrap",
      label: wrapAction.label,
      status: "required",
      asset: spentAsset
    });
  }
  if (approvalAction) {
    steps.push({
      id: "approve",
      kind: "approve",
      label: approvalAction.label,
      status: "required",
      asset: approvalAsset
    });
  }
  steps.push({
    id: "sign",
    kind: "sign",
    label: "Sign order",
    status: "required"
  }, {
    id: "submit",
    kind: "submit",
    label: orderType === FLASH_MARKET_ORDER_TYPE ? "Submit trade" : "Submit order",
    status: "required"
  });
  const quote = {
    id: quoteId,
    side,
    orderType,
    targetAsset,
    contraAsset,
    spentAsset,
    receiveAsset,
    inputAmount,
    inputNotional,
    outputAmount,
    outputNotional,
    estimatedFeeNotional,
    targetNotionalPrice,
    from: {
      asset: stringValue(fromPayload.asset, side === "buy" ? "contra" : "target"),
      amount: inputAmount,
      notional: inputNotional
    },
    to: {
      asset: stringValue(toPayload.asset, side === "buy" ? "target" : "contra"),
      amount: outputAmount,
      notional: outputNotional
    },
    rate: stringValue(quotePayload.rate ?? quotePayload.price ?? ""),
    fees: normalizeFees(quotePayload.fees, spentAsset),
    steps,
    actions: {
      wrap: wrapAction,
      approval: approvalAction
    },
    expiresAt: stringValue(quotePayload.expiresAt ?? quotePayload.expires_at ?? ""),
    raw: {
      ...quotePayload,
      quoteId,
      ...bridgeQuoteId ? { bridgeQuoteId } : {},
      from: {
        ...fromPayload,
        asset: stringValue(fromPayload.asset, side === "buy" ? "contra" : "target"),
        amount: inputAmount,
        notional: inputNotional
      },
      to: {
        ...toPayload,
        asset: stringValue(toPayload.asset, side === "buy" ? "target" : "contra"),
        amount: outputAmount,
        notional: outputNotional
      },
      evm: {
        ...evmPayload,
        orderTypedData: parseTypedData(orderTypedDataSource),
        orderTypedDataRaw: serializeTypedData(orderTypedDataSource) ?? null,
        permitTypedData: parseTypedData(permitTypedDataSource),
        permitTypedDataRaw: serializeTypedData(permitTypedDataSource) ?? null
      }
    }
  };
  return FlashQuoteSchema.parse(quote);
}
var normalizeFlashQuoteResponse = _function({
  input: [
    unknown().pipe(FlashQuoteResponseSchema),
    FlashBoundQuoteRequestSchema,
    FlashRuntimeSchema.default(flashRuntimeFromEnv)
  ]
}).implement(normalizeFlashQuoteResponseValidated);
function quoteTypedData(quote, field) {
  const evm = objectPayload(objectPayload(quote.raw).evm);
  return evm[`${field}Raw`] ?? evm[field];
}
function buildFlashSubmitBodyValidated(request, runtime) {
  const quote = request.quote;
  const chains = getFlashAssetPairChains(quote);
  if (chains.isCrossChain && quote.orderType !== FLASH_MARKET_ORDER_TYPE) {
    throw new Error("Flash cross-chain trades support market orders only");
  }
  const quoteFields = buildFlashQuoteBodyValidated({
    ...request,
    contraAsset: request.contraAsset,
    orderType: quote.orderType,
    qty: request.qty ?? request.inputAmount ?? quote.inputAmount,
    side: request.side,
    targetAsset: request.targetAsset
  }, runtime);
  const evmOrderTypedData = serializeTypedData(request.evmOrderTypedData ?? quoteTypedData(quote, "orderTypedData"));
  const evmPermitTypedData = serializeTypedData(request.evmPermitTypedData ?? quoteTypedData(quote, "permitTypedData"));
  const quoteId = request.quoteId ?? quote.id;
  const userSignature = request.orderSignature ?? request.signature;
  const rawQuote = objectPayload(quote.raw);
  const bridgeQuoteId = request.bridgeQuoteId ?? stringValue(rawQuote.bridgeQuoteId).trim();
  const wrap = objectPayload(rawQuote.wrap);
  const quotedTargetAsset = typeof rawQuote.targetAsset === "string" && rawQuote.targetAsset.trim() ? rawQuote.targetAsset.trim() : quoteFields.targetAsset;
  const quotedContraAsset = typeof rawQuote.contraAsset === "string" && rawQuote.contraAsset.trim() ? rawQuote.contraAsset.trim() : quoteFields.contraAsset;
  const wrappedAsset = typeof wrap.wrappedAsset === "string" && wrap.wrappedAsset.trim() ? wrap.wrappedAsset.trim() : "";
  const targetAsset = wrappedAsset && quote.side === "sell" ? wrappedAsset : quotedTargetAsset;
  const contraAsset = wrappedAsset && quote.side === "buy" ? wrappedAsset : quotedContraAsset;
  const { durationSeconds: _durationSeconds, expireTime: _expireTime, ...submitFields } = quoteFields;
  return {
    ...submitFields,
    targetAsset,
    contraAsset,
    ...quoteId ? { quoteId } : {},
    ...bridgeQuoteId ? { bridgeQuoteId } : {},
    ...userSignature ? { userSignature } : {},
    ...evmOrderTypedData ? { evmOrderTypedData } : {},
    ...evmPermitTypedData ? { evmPermitTypedData } : {},
    ...request.evmPermitSignature ? { evmPermitSignature: request.evmPermitSignature } : {}
  };
}
var buildFlashSubmitBody = _function({ input: [FlashSubmitOrderRequestSchema, FlashRuntimeSchema.default(flashRuntimeFromEnv)] }).implement(buildFlashSubmitBodyValidated);

// packages/flash/dist/status.js
var terminal = new Set(["filled", "cancelled", "rejected", "terminated", "expired"]);
var open = new Set(["pending", "accepted", "partially-filled"]);
function normalizeFlashStatus(status) {
  if (status === undefined || status === null) {
    return "accepted";
  }
  if (typeof status !== "string") {
    return "terminated";
  }
  const raw = status.trim();
  const value = (raw || "accepted").toLowerCase().replace(/^order_status_/, "").replaceAll("_", "-");
  if (value === "canceled") {
    return "cancelled";
  }
  if (["open", "active", "working", "created"].includes(value)) {
    return "accepted";
  }
  if (terminal.has(value) || open.has(value)) {
    return value;
  }
  return raw ? "terminated" : "accepted";
}
function flashRawStatus(status) {
  return `ORDER_STATUS_${status.replaceAll("-", "_").toUpperCase()}`;
}
function isFlashTerminalStatus(status) {
  return terminal.has(status);
}

// packages/flash/dist/api.js
var FLASH_DEV_BASE_URL = "http://127.0.0.1:8422/v1";
var FLASH_PROD_BASE_URL = "https://flash.definitive.fi/v1";
var FLASH_API_KEY = "dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b";
var AddressSchema2 = string2().trim().regex(/^0x[0-9a-fA-F]{40}$/);
var OrderIdSchema = string2().min(1);
var SignatureSchema = string2().min(1);
var ListOptionsSchema = object({
  status: union([string2(), array(string2())]).optional(),
  pageSize: number2().int().positive().optional()
});
var QuoteFunction = _function({
  input: [FlashBoundQuoteRequestSchema],
  output: object({ quote: FlashQuoteSchema, flash: unknown(), raw: FlashQuoteResponseSchema })
});
var SubmitOrderFunction = _function({
  input: [FlashSubmitOrderRequestSchema],
  output: FlashSubmitResponseSchema
});
var ListOrdersFunction = _function({
  input: [AddressSchema2, ListOptionsSchema.default({})],
  output: FlashListOrdersResponseSchema
});
var GetOrderFunction = _function({
  input: [AddressSchema2, OrderIdSchema],
  output: FlashGetOrderResponseSchema
});
var CancelOrderFunction = _function({
  input: tuple([OrderIdSchema, SignatureSchema]).rest(string2().min(1)),
  output: FlashCancelOrderResponseSchema
});
function flashBaseUrl(runtime = flashRuntimeFromEnv()) {
  return runtime.isDev ? FLASH_DEV_BASE_URL : FLASH_PROD_BASE_URL;
}
function flashHeaders(runtime = flashRuntimeFromEnv(), baseUrl = flashBaseUrl(runtime)) {
  const headers = { accept: "application/json", "content-type": "application/json" };
  if (!runtime.isDev && new URL(baseUrl).origin === new URL(FLASH_PROD_BASE_URL).origin) {
    headers["x-definitive-api-key"] = FLASH_API_KEY;
  }
  return headers;
}
function flashCancelMessage(orderId) {
  return `Definitive Flash v1 \u2014 Cancel Order
Order: ${orderId}`;
}
function errorMessage(payload, fallback) {
  if (typeof payload === "string") {
    return payload || fallback;
  }
  try {
    return JSON.stringify(payload) || fallback;
  } catch {
    return String(payload) || fallback;
  }
}

class FlashApiError extends Error {
  status;
  constructor(status, statusText, message) {
    super(`Flash API ${status} ${statusText}: ${message}`);
    this.status = status;
  }
}
function createFlashApi(options = {}) {
  const baseUrl = (options.baseUrl ?? flashBaseUrl(options.runtime)).replace(/\/$/, "");
  const runtime = options.runtime ?? {
    isDev: /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(baseUrl) || flashRuntimeFromEnv().isDev
  };
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  async function request(path, init = {}) {
    const headers = new Headers(flashHeaders(runtime, baseUrl));
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    const response = await fetcher(`${baseUrl}${path}`, { ...init, headers });
    const text = await response.text();
    let payload = text || null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {}
    }
    if (!response.ok) {
      throw new FlashApiError(response.status, response.statusText, errorMessage(payload, response.statusText));
    }
    return payload;
  }
  return {
    quote: QuoteFunction.implementAsync(async (input) => {
      const raw = FlashQuoteResponseSchema.parse(await request("/quote", {
        method: "POST",
        body: JSON.stringify(buildFlashQuoteBodyValidated(input, runtime))
      }));
      const quote = normalizeFlashQuoteResponseValidated(raw, input, runtime);
      return { quote, flash: quote.raw ?? raw, raw };
    }),
    submitOrder: SubmitOrderFunction.implementAsync(async (input) => {
      return FlashSubmitResponseSchema.parse(await request("/order", {
        method: "POST",
        ...input.idempotencyKey ? { headers: { "Idempotency-Key": input.idempotencyKey } } : {},
        body: JSON.stringify(buildFlashSubmitBodyValidated(input, runtime))
      }));
    }),
    listOrders: ListOrdersFunction.implementAsync(async (accountAddress, options) => {
      const query = new URLSearchParams({ funderAddress: accountAddress });
      if (options.status) {
        const statuses = Array.isArray(options.status) ? options.status : options.status.split(",");
        query.set("statuses", statuses.map((status) => flashRawStatus(normalizeFlashStatus(status))).join(","));
      }
      if (options.pageSize) {
        query.set("pageSize", String(Math.min(200, options.pageSize)));
      }
      return FlashListOrdersResponseSchema.parse(await request(`/orders?${query}`));
    }),
    getOrder: GetOrderFunction.implementAsync(async (accountAddress, orderId) => {
      const query = new URLSearchParams({ funderAddress: accountAddress });
      return FlashGetOrderResponseSchema.parse(await request(`/orders/${encodeURIComponent(orderId)}?${query}`));
    }),
    cancelOrder: CancelOrderFunction.implementAsync(async (orderId, userSignature, ...messages) => {
      return FlashCancelOrderResponseSchema.parse(await request(`/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({
          cancelMessage: messages[0] ?? flashCancelMessage(orderId),
          userSignature
        })
      }));
    })
  };
}

// packages/flash/dist/execution.js
function flashObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function nestedValue(value, path) {
  return path.reduce((current, key) => flashObject(current)[key], value);
}
function findFlashTypedData(quote, flashPayload, field) {
  const quoteRaw = flashObject(quote.raw);
  return nestedValue(flashPayload, ["actions", "evm", field]) ?? nestedValue(flashPayload, ["evm", field]) ?? nestedValue(flashPayload, [field]) ?? nestedValue(quoteRaw, ["actions", "evm", field]) ?? nestedValue(quoteRaw, ["evm", field]) ?? nestedValue(quoteRaw, [field]);
}
function parseFlashTypedData(value) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function serializeFlashTypedData(value) {
  if (typeof value === "string") {
    return value;
  }
  return value ? JSON.stringify(value) : "";
}
function flashTypedDataChainId(typedData, fallback) {
  const value = flashObject(flashObject(typedData).domain).chainId;
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = typeof value === "string" && value.toLowerCase().startsWith("0x") ? Number.parseInt(value, 16) : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid Flash chain id");
  }
  return parsed;
}
function buildFlashActionTransaction(action, expectedChainId) {
  const rawChainId = action.tx.chainId;
  const chainId = Number(rawChainId ?? expectedChainId);
  if (!Number.isInteger(chainId) || chainId <= 0 || chainId !== expectedChainId) {
    throw new Error("Invalid Flash action chain id");
  }
  return {
    chainId,
    transaction: {
      to: action.tx.to,
      data: action.tx.data,
      value: action.tx.value ?? "0x0"
    }
  };
}
function buildFlashSubmitRequest({ accountAddress, bridgeQuoteId, flashPayload, idempotencyKey, orderSignature, permitSignature, quote, quoteId, quoteRequest }) {
  const chains = getFlashAssetPairChains(quote);
  const orderTypedData = findFlashTypedData(quote, flashPayload, "orderTypedData");
  const orderTypedDataRaw = findFlashTypedData(quote, flashPayload, "orderTypedDataRaw") ?? orderTypedData;
  const permitTypedData = findFlashTypedData(quote, flashPayload, "permitTypedData");
  const permitTypedDataRaw = findFlashTypedData(quote, flashPayload, "permitTypedDataRaw") ?? permitTypedData;
  if (permitTypedData && !permitSignature) {
    throw new Error("Flash quote requires a permit signature.");
  }
  return {
    ...quoteRequest,
    accountAddress,
    funderAddress: accountAddress,
    recipientAddress: accountAddress,
    contraChain: getFlashChainSlug(chains.contraChainId),
    targetChain: getFlashChainSlug(chains.targetChainId),
    quote,
    ...quoteId ? { quoteId } : {},
    ...bridgeQuoteId ? { bridgeQuoteId } : {},
    rawPayload: flashPayload ?? quote.raw ?? null,
    evmOrderTypedData: serializeFlashTypedData(orderTypedDataRaw),
    ...permitTypedDataRaw ? {
      evmPermitSignature: permitSignature,
      evmPermitTypedData: serializeFlashTypedData(permitTypedDataRaw)
    } : {},
    signature: orderSignature,
    orderSignature,
    idempotencyKey
  };
}

// apps/newframe-cli/src/journal.ts
import { randomUUID as randomUUID2 } from "crypto";
import { constants as constants2 } from "fs";
import { chmod as chmod2, lstat as lstat2, mkdir as mkdir2, open as open3, readFile as readFile2, rename as rename2, rm as rm2 } from "fs/promises";
import { join as join2 } from "path";

// apps/newframe-cli/src/storage.ts
import { randomUUID } from "crypto";
import { constants } from "fs";
import { chmod, lstat, mkdir, open as open2, readFile, rename, rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
function stateDirectory(env = process.env) {
  return env.NEWFRAME_CLI_STATE_DIR ?? join(env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "newframe-cli");
}
async function secureDirectory(path) {
  await mkdir(path, { recursive: true, mode: 448 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("CLI state path must be a directory");
  }
  await chmod(path, 448);
}
function sessionPath(directory) {
  return join(directory, "session.json");
}
function validateSession(value) {
  const parsed = SessionSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid stored session");
  }
  return parsed.data;
}
async function saveSession(session, directory = stateDirectory()) {
  validateSession(session);
  await secureDirectory(directory);
  const path = sessionPath(directory);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("CLI session path must be a regular file");
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  const temporary = join(directory, `.session-${randomUUID()}.tmp`);
  const file = await open2(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 384);
  try {
    await file.writeFile(`${JSON.stringify(session)}
`);
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, path);
    await chmod(path, 384);
  } finally {
    await rm(temporary, { force: true });
  }
}
async function loadSession(directory = stateDirectory()) {
  const path = sessionPath(directory);
  const dirStat = await lstat(directory).catch(() => null);
  if (!dirStat || !dirStat.isDirectory() || dirStat.isSymbolicLink()) {
    throw new Error("No CLI session. Run `newframe session start` first.");
  }
  const stat = await lstat(path).catch(() => null);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("No CLI session. Run `newframe session start` first.");
  }
  if (stat.mode & 63) {
    throw new Error("CLI session file is accessible by other users");
  }
  const session = validateSession(JSON.parse(await readFile(path, "utf8")));
  if (session.expiresAt <= Date.now()) {
    throw new Error("CLI session expired. Run `newframe session start`.");
  }
  return session;
}
async function clearSession(directory = stateDirectory()) {
  await rm(sessionPath(directory), { force: true });
}

// apps/newframe-cli/src/journal.ts
function hasErrno(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
function journalPath(directory, key) {
  if (!/^[0-9a-f]{64}$/.test(key)) {
    throw new Error("Invalid Flash submission key");
  }
  return join2(directory, `submit-${key}.json`);
}
async function prepareDirectory(directory) {
  await mkdir2(directory, { recursive: true, mode: 448 });
  const stat = await lstat2(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("CLI state path must be a directory");
  }
  await chmod2(directory, 448);
}
async function readSubmitProgress(key, directory = stateDirectory()) {
  const path = journalPath(directory, key);
  const stat = await lstat2(path).catch((error) => {
    if (hasErrno(error, "ENOENT")) {
      return null;
    }
    throw error;
  });
  if (!stat) {
    return null;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 63) {
    throw new Error("Flash submission journal is not a private regular file");
  }
  const value = JSON.parse(await readFile2(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Flash submission journal");
  }
  const progress = value;
  if (typeof progress.account !== "string" || !progress.actions || typeof progress.actions !== "object") {
    throw new Error("Invalid Flash submission journal");
  }
  for (const value of Object.values(progress.actions)) {
    if (!value || typeof value !== "object") {
      throw new Error("Invalid Flash submission journal");
    }
    const step = value;
    if (step.phase !== "sending" && (step.phase !== "sent" || typeof step.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(step.hash) || typeof step.confirmed !== "boolean")) {
      throw new Error("Invalid Flash submission journal");
    }
  }
  if (progress.orderId !== undefined && typeof progress.orderId !== "string") {
    throw new Error("Invalid Flash submission journal");
  }
  return progress;
}
async function saveSubmitProgress(key, progress, directory = stateDirectory()) {
  await prepareDirectory(directory);
  const path = journalPath(directory, key);
  const existing = await lstat2(path).catch((error) => {
    if (hasErrno(error, "ENOENT")) {
      return null;
    }
    throw error;
  });
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error("Flash submission journal path is not a regular file");
  }
  const temporary = join2(directory, `.submit-${key}-${randomUUID2()}.tmp`);
  const file = await open3(temporary, constants2.O_WRONLY | constants2.O_CREAT | constants2.O_EXCL, 384);
  try {
    await file.writeFile(`${JSON.stringify(progress)}
`);
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename2(temporary, path);
    await chmod2(path, 384);
  } finally {
    await rm2(temporary, { force: true });
  }
}
function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}
async function withSubmitLock(key, task, directory = stateDirectory()) {
  await prepareDirectory(directory);
  const lockPath = `${journalPath(directory, key)}.lock`;
  let locked = false;
  for (let attempt = 0;attempt < 2 && !locked; attempt++) {
    let created = false;
    try {
      const file = await open3(lockPath, constants2.O_WRONLY | constants2.O_CREAT | constants2.O_EXCL, 384);
      created = true;
      try {
        await file.writeFile(`${process.pid}
`);
        await file.sync();
      } finally {
        await file.close();
      }
      locked = true;
    } catch (error) {
      if (created) {
        await rm2(lockPath, { force: true });
      }
      if (!hasErrno(error, "EEXIST")) {
        throw error;
      }
      const stat = await lstat2(lockPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 63) {
        throw new Error("Flash submission lock is not a private regular file", { cause: error });
      }
      const pid = Number((await readFile2(lockPath, "utf8")).trim());
      if (Date.now() - stat.mtimeMs < 2000 || processIsAlive(pid)) {
        throw new Error("Another CLI process is submitting this Flash quote", { cause: error });
      }
      await rm2(lockPath);
    }
  }
  if (!locked) {
    throw new Error("Could not acquire Flash submission lock");
  }
  try {
    return await task();
  } finally {
    await rm2(lockPath, { force: true });
  }
}

// apps/newframe-cli/src/client.ts
var defaultRpcUrl = "http://127.0.0.1:1248";
var addressPattern = /^0x[0-9a-f]{40}$/i;
function requireAddress(address) {
  if (!addressPattern.test(address)) {
    throw new Error("Invalid account address");
  }
  return address.toLowerCase();
}
function parseQuoteEnvelope(value) {
  const record = flashObject(value);
  if (!record.request || !record.quote || !("flash" in record)) {
    throw new Error("Expected a quote file produced by `newframe flash quote`");
  }
  return record;
}
function typedDataValue(quote, flash, field) {
  const value = findFlashTypedData(quote, flash, `${field}Raw`) ?? findFlashTypedData(quote, flash, field);
  return value === undefined || value === null ? null : parseFlashTypedData(value);
}
function assertTypedDataChain(typedData, expectedChainId) {
  if (!typedData || typeof typedData !== "object") {
    throw new Error("Flash quote has invalid typed data");
  }
  if (flashTypedDataChainId(typedData, expectedChainId) !== expectedChainId) {
    throw new Error("Flash signature chain does not match the quoted spend chain");
  }
}
function statusOf(order) {
  const record = flashObject(order);
  const nested = flashObject(record.order);
  return normalizeFlashStatus(nested.status ?? record.status);
}
function isClosedOrder(order) {
  const record = flashObject(order);
  const nested = flashObject(record.order);
  return nested.open === false || record.open === false || isFlashTerminalStatus(statusOf(order));
}
function assertQuoteFresh(quote) {
  if (!quote.expiresAt) {
    return;
  }
  const expiry = Date.parse(quote.expiresAt);
  if (!Number.isFinite(expiry)) {
    throw new Error("Flash quote has an invalid expiration");
  }
  if (expiry <= Date.now()) {
    throw new Error("Flash quote expired; request a new quote");
  }
}

class NewframeClient {
  rpcUrl;
  flashUrl;
  stateDir;
  fetcher;
  desktop;
  pollIntervalMs;
  receiptTimeoutMs;
  flash;
  constructor(options = {}) {
    this.rpcUrl = (options.rpcUrl ?? process.env.NEWFRAME_RPC_URL ?? defaultRpcUrl).replace(/\/$/, "");
    this.flashUrl = (options.flashUrl ?? process.env.NEWFRAME_FLASH_URL ?? flashBaseUrl()).replace(/\/$/, "");
    this.stateDir = options.stateDir ?? process.env.NEWFRAME_CLI_STATE_DIR;
    this.fetcher = options.fetch ?? fetch;
    this.desktop = createDesktopClient(this.rpcUrl, { fetch: this.fetcher });
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.receiptTimeoutMs = options.receiptTimeoutMs ?? 120000;
    this.flash = createFlashApi({ baseUrl: this.flashUrl, fetch: this.fetcher });
  }
  agentClient(session) {
    return createDesktopClient(this.rpcUrl, {
      fetch: this.fetcher,
      headers: () => ({
        authorization: `Bearer ${session.sessionToken}`,
        "x-newframe-agent-session": session.sessionId
      })
    });
  }
  async session() {
    return loadSession(this.stateDir);
  }
  async startSession(input) {
    let existing;
    try {
      existing = await this.session();
    } catch (error) {
      if (!(error instanceof Error) || !/^(No CLI session|CLI session expired)/.test(error.message)) {
        throw error;
      }
    }
    if (existing) {
      let stale = false;
      try {
        await this.agentClient(existing).agent.status.query();
      } catch (error) {
        if (isDesktopClientError(error) && error.data?.code === "UNAUTHORIZED") {
          stale = true;
        } else {
          throw error;
        }
      }
      if (!stale) {
        throw new Error(`Session ${existing.sessionId} is still active. Run \`newframe session revoke\` first.`);
      }
    }
    const { durationSeconds, ...descriptor } = input;
    const session = SessionSchema.parse(await this.desktop.agent.connect.mutate({ descriptor, durationSeconds }));
    if (session.expiresAt <= Date.now()) {
      throw new Error("Newframe returned expired session credentials");
    }
    if (existing) {
      try {
        await this.revokeCredentials(existing);
      } catch (error) {
        if (!isDesktopClientError(error) || error.data?.code !== "UNAUTHORIZED") {
          await this.revokeCredentials(session).catch(() => {
            return;
          });
          throw error;
        }
      }
    }
    await saveSession(session, this.stateDir);
    return { sessionId: session.sessionId, account: session.account, expiresAt: session.expiresAt };
  }
  async showSession() {
    const session = await this.session();
    return { sessionId: session.sessionId, account: session.account, expiresAt: session.expiresAt };
  }
  async revokeSession() {
    const session = await this.session();
    try {
      await this.revokeCredentials(session);
    } catch (error) {
      if (!isDesktopClientError(error) || error.data?.code !== "UNAUTHORIZED") {
        throw error;
      }
      await clearSession(this.stateDir);
      return { revoked: false, stale: true, sessionId: session.sessionId };
    }
    await clearSession(this.stateDir);
    return { revoked: true, sessionId: session.sessionId };
  }
  revokeCredentials(session) {
    return this.agentClient(session).agent.revoke.mutate({ sessionId: session.sessionId });
  }
  async rpc(method, params = [], chainId) {
    return this.agentClient(await this.session()).rpc.mutate({
      method,
      params,
      chainId: chainId ? `0x${chainId.toString(16)}` : undefined
    });
  }
  publicRpc(method, params, chainId) {
    return this.desktop.rpc.mutate({ method, params, chainId: `0x${chainId.toString(16)}` });
  }
  async quote(request) {
    const session = await this.session();
    if (request.accountAddress && requireAddress(request.accountAddress) !== requireAddress(session.account)) {
      throw new Error("Quote account does not match the approved session account");
    }
    const boundRequest = { ...request, accountAddress: session.account };
    const { quote, flash } = await this.flash.quote(boundRequest);
    return { request: boundRequest, quote, flash };
  }
  async waitForReceipt(hash, chainId) {
    const deadline = Date.now() + this.receiptTimeoutMs;
    while (Date.now() < deadline) {
      const value = flashObject(await this.publicRpc("eth_getTransactionReceipt", [hash], chainId));
      if (value.status === "0x0") {
        throw new Error(`Flash preparation transaction reverted: ${hash}`);
      }
      if (value.transactionHash || value.status === "0x1") {
        return value;
      }
      await Bun.sleep(this.pollIntervalMs);
    }
    throw new Error(`Timed out waiting for Flash preparation transaction ${hash}`);
  }
  async signTypedData(account, typedData, chainId) {
    assertTypedDataChain(typedData, chainId);
    const signature = await this.agentClient(await this.session()).wallet.signTypedData.mutate({
      account,
      data: JSON.stringify(typedData),
      chainId: `0x${chainId.toString(16)}`
    });
    if (typeof signature !== "string" || !/^0x[0-9a-f]+$/i.test(signature)) {
      throw new Error("Newframe did not return a Flash signature");
    }
    return signature;
  }
  async submit(input) {
    const { request, quote, flash } = parseQuoteEnvelope(input);
    const session = await this.session();
    const account = requireAddress(session.account);
    if (!request.accountAddress || requireAddress(request.accountAddress) !== account) {
      throw new Error("Quote account does not match the approved session account");
    }
    const idempotencyKey = createHash("sha256").update(JSON.stringify({ account, request, quoteId: quote.id, flash })).digest("hex");
    const directory = this.stateDir ?? stateDirectory();
    return withSubmitLock(idempotencyKey, async () => {
      const progress = await readSubmitProgress(idempotencyKey, directory) ?? {
        account,
        actions: {}
      };
      if (progress.account !== account) {
        throw new Error("Flash submission journal belongs to another account");
      }
      if (progress.orderId) {
        return { orderId: progress.orderId, raw: progress.raw };
      }
      const save = () => saveSubmitProgress(idempotencyKey, progress, directory);
      assertQuoteFresh(quote);
      const spentChainId = getFlashAssetPairChains(quote).spentChainId;
      const actions = [
        ["wrap", quote.actions?.wrap],
        ["approval", quote.actions?.approval]
      ];
      for (const [kind, action] of actions) {
        if (!action) {
          continue;
        }
        const built = buildFlashActionTransaction(action, spentChainId);
        if (action.tx.from && requireAddress(action.tx.from) !== account) {
          throw new Error("Flash preparation transaction is from a different account");
        }
        let step = progress.actions[kind];
        if (step?.phase === "sending") {
          throw new Error(`Flash ${kind} broadcast outcome is unknown; inspect the chain before retrying`);
        }
        if (!step) {
          progress.actions[kind] = { phase: "sending" };
          await save();
          const hash = await this.agentClient(session).wallet.sendTransaction.mutate({
            transaction: { ...built.transaction, from: account, chainId: `0x${spentChainId.toString(16)}` },
            chainId: `0x${spentChainId.toString(16)}`
          });
          if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) {
            throw new Error("Newframe did not return a preparation transaction hash");
          }
          step = { phase: "sent", hash, confirmed: false };
          progress.actions[kind] = step;
          await save();
        }
        if (!step.confirmed) {
          await this.waitForReceipt(step.hash, spentChainId);
          step.confirmed = true;
          await save();
        }
      }
      assertQuoteFresh(quote);
      const permitTypedData = typedDataValue(quote, flash, "permitTypedData");
      const permitSignature = permitTypedData ? await this.signTypedData(account, permitTypedData, spentChainId) : undefined;
      const orderTypedData = typedDataValue(quote, flash, "orderTypedData");
      if (!orderTypedData) {
        throw new Error("Flash quote has no order typed data");
      }
      const orderSignature = await this.signTypedData(account, orderTypedData, spentChainId);
      const submitRequest = buildFlashSubmitRequest({
        accountAddress: account,
        flashPayload: flash,
        idempotencyKey,
        orderSignature,
        ...permitSignature ? { permitSignature } : {},
        quote,
        quoteId: quote.id,
        quoteRequest: request
      });
      assertQuoteFresh(quote);
      const raw = await this.flash.submitOrder(submitRequest);
      const orderId = raw.orderId;
      progress.orderId = orderId;
      progress.raw = raw;
      await save();
      return { orderId, raw };
    }, directory);
  }
  async orders(options = {}) {
    const session = await this.session();
    return this.flash.listOrders(session.account, options);
  }
  async order(orderId) {
    const session = await this.session();
    return this.flash.getOrder(session.account, orderId);
  }
  async watch(orderId, options = {}) {
    const deadline = Date.now() + (options.timeoutMs ?? 10 * 60000);
    let latest;
    while (Date.now() < deadline) {
      latest = await this.order(orderId);
      if (isClosedOrder(latest)) {
        return latest;
      }
      await Bun.sleep(this.pollIntervalMs);
    }
    throw new Error(`Timed out waiting for Flash order ${orderId}; last status: ${statusOf(latest)}`);
  }
  async cancel(orderId) {
    const order = await this.order(orderId);
    const session = await this.session();
    const record = order.order;
    const owner = record.accountAddress ?? record.funderAddress ?? record.account ?? order.accountAddress ?? order.funderAddress ?? order.account;
    if (typeof owner !== "string" || requireAddress(owner) !== requireAddress(session.account)) {
      throw new Error("Flash order does not belong to the approved session account");
    }
    const cancelMessage = flashCancelMessage(orderId);
    const signature = await this.agentClient(session).wallet.personalSign.mutate({
      message: cancelMessage,
      account: session.account
    });
    if (typeof signature !== "string" || !signature) {
      throw new Error("Newframe did not return a cancel signature");
    }
    return this.flash.cancelOrder(orderId, signature, cancelMessage);
  }
}

// apps/newframe-cli/src/index.ts
var usage = `newframe session start --name NAME [--description TEXT] [--duration SECONDS]
newframe session show|revoke
newframe rpc METHOD [--params JSON_OR_FILE] [--chain-id ID]
newframe flash quote --request FILE|- [--out FILE]
newframe flash submit --quote FILE|-
newframe flash orders [--status STATUS] [--page-size NUMBER]
newframe flash order|watch|cancel ORDER_ID [--timeout SECONDS]`;
function argumentsOf(argv) {
  const positionals = [];
  const options = {};
  for (let index = 0;index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const separator = arg.indexOf("=");
    const key = arg.slice(2, separator < 0 ? undefined : separator);
    const inlineValue = separator < 0 ? undefined : arg.slice(separator + 1);
    if (!key) {
      throw new Error(`Invalid argument: ${arg}`);
    }
    const value = inlineValue ?? argv.at(++index);
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
  }
  return { positionals, options };
}
function option(options, key) {
  const value = options[key];
  if (!value) {
    throw new Error(`Missing --${key}`);
  }
  return value;
}
function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}
async function jsonInput(source) {
  const text = source === "-" ? await Bun.stdin.text() : await readFile3(source, "utf8");
  return JSON.parse(text);
}
async function jsonOrFile(source) {
  if (source === "-" || source.startsWith("/") || source.startsWith(".")) {
    return jsonInput(source);
  }
  try {
    return JSON.parse(source);
  } catch {
    return jsonInput(source);
  }
}
async function run2(argv = process.argv.slice(2), client = new NewframeClient) {
  if (argv[0] === "help" || argv.includes("--help") || argv.includes("-h")) {
    return { usage };
  }
  const { positionals, options } = argumentsOf(argv);
  const [group, command, id] = positionals;
  if (group === "session") {
    if (command === "start") {
      return client.startSession({
        name: option(options, "name"),
        ...options.description ? { description: options.description } : {},
        ...options.url ? { url: options.url } : {},
        durationSeconds: positiveNumber(options.duration ?? "600", "Duration")
      });
    }
    if (command === "show") {
      return client.showSession();
    }
    if (command === "revoke") {
      return client.revokeSession();
    }
  }
  if (group === "rpc" && command) {
    const params = options.params ? await jsonOrFile(options.params) : [];
    if (!Array.isArray(params)) {
      throw new Error("RPC params must be a JSON array");
    }
    const chainId = options["chain-id"] ? positiveNumber(options["chain-id"], "Chain id") : undefined;
    return { result: await client.rpc(command, params, chainId) };
  }
  if (group === "flash") {
    if (command === "quote") {
      const envelope = await client.quote(FlashQuoteRequestSchema.parse(await jsonInput(option(options, "request"))));
      if (options.out) {
        await writeFile(options.out, `${JSON.stringify(envelope, null, 2)}
`, { flag: "wx" });
      }
      return envelope;
    }
    if (command === "submit") {
      return client.submit(await jsonInput(option(options, "quote")));
    }
    if (command === "orders") {
      return client.orders({
        ...options.status ? { status: options.status } : {},
        ...options["page-size"] ? { pageSize: positiveNumber(options["page-size"], "Page size") } : {}
      });
    }
    if (command === "order" && id) {
      return client.order(id);
    }
    if (command === "watch" && id) {
      return client.watch(id, options.timeout ? { timeoutMs: positiveNumber(options.timeout, "Timeout") * 1000 } : {});
    }
    if (command === "cancel" && id) {
      return client.cancel(id);
    }
  }
  throw new Error(usage);
}
if (import.meta.main) {
  try {
    const result = await run2();
    process.stdout.write(`${JSON.stringify(result)}
`);
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    if (isDesktopClientError(error) && error.data?.httpStatus) {
      message = `${error.data.httpStatus}: ${message}`;
    }
    process.stderr.write(`${JSON.stringify({ error: message })}
`);
    process.exitCode = 1;
  }
}
export {
  run2 as run
};
