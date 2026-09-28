# macOS VM visual harness

Run the normal harness command:

```sh
bun run visual:harness:newframe
```

The launcher reserves one of two suspended bases, `newframe-harness-warm-base-1` or `newframe-harness-warm-base-2`, and clones it. Tart resumes its already-unlocked macOS session with the guest agent ready, so each run skips boot and FileVault login. The bases have distinct macOS serials and virtual MAC addresses; clones of one suspended base cannot resume concurrently on this host. A host file lock allows two concurrent runs and queues additional runs. Each clone has its own disk, network, ports, and Newframe profile. The guest sets its display to 1440x900 points before starting Electron so the side tray has enough height for the visual checks. Tart resets the display mode when restoring a clone, so the guest sets it on every run. The clone is stopped and deleted after the harness; logs and screenshots remain in the printed host artifact directory.

The warm bases on this Mac are macOS 26.6.2 with Apple Command Line Tools 26.6 (Git), Bun 1.4.2, Node 26.5.0, Foundry 1.8.0, and Tart guest agent 0.10.0. They contain no Newframe checkout or profile. The guest copies the current checkout and the durable `config.json`, `vault.json`, and `signers/` from `~/Library/Application Support/Newframe dev`, installs the checkout's locked dependencies, builds Flash and the app, then runs the existing visual harness. The root and app `.env` files travel with the checkout. The copied checkout is initialized as a standalone `main` repository so Newframe's existing development-profile resolver uses the copied `Newframe dev` profile.

The host needs Tart, `rsync`, Git, `lockf`, and an active `en0` bridge. Override the bridge with `NEWFRAME_HARNESS_VM_NETWORK_INTERFACE` or the artifact directory with `NEWFRAME_HARNESS_VM_OUTPUT_DIR`. Set `NEWFRAME_HARNESS_VM_KEEP=1` to retain a clone for debugging.

To rebuild either warm base after updating `newframe-harness-base`, repeat for each slot number `N` (1 and 2):

1. Ensure the slot is idle and remove its old base, then clone the stopped cold base: `tart clone newframe-harness-base newframe-harness-warm-base-N`. Before boot, give it a unique macOS machine identifier with `tart set newframe-harness-warm-base-N --random-serial`.
2. Create an empty share with `mkdir -p /private/tmp/newframe-harness-warm-share-N`, then start the clone with `tart run --suspendable --no-graphics --vnc-experimental --no-audio --no-clipboard --net-bridged=en0 --dir=/private/tmp/newframe-harness-warm-share-N newframe-harness-warm-base-N`.
3. Unlock its FileVault screen over the VNC address printed by Tart. Wait until `tart exec newframe-harness-warm-base-N /usr/bin/true` succeeds.
4. Run `tart suspend newframe-harness-warm-base-N` from another terminal. `tart list` should show `suspended`.

Keep the base free of Newframe source and runtime secrets. Tart's [suspendable VM documentation](https://tart.run/blog/2023/09/20/tart-200-and-community-updates/) describes the saved macOS state.
