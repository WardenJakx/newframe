/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./environment.d.ts" />
/// <reference path="./host.d.ts" />
/// <reference path="./rpc.d.ts" />
/// <reference path="./state.d.ts" />
/// <reference path="./ethProvider.d.ts" />

type NullableTimeout = ReturnType<typeof setTimeout> | null
type Callback<T> = (err: Error | null, result?: T) => void
