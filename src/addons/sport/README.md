# SportSeiza

Real equipment and sports services for ExerSeiza's rides (`../exer`). This
folder is the contract; the device and service integrations are yet to be
written.

```
index.ts    RideSource: what a device integration provides, and the
            registry ExerSeiza reads from.
strava.ts   RideSummary, the rides logged on this device, and where a
            Strava upload goes (on the server, not here).
```

## Adding a device

1. Write a module that builds a `RideSource` and calls
   `registerRideSource(source)` when it loads: for example `ftms.ts` for a
   Bluetooth smart trainer (the Fitness Machine Service, `0x1826`, through
   Web Bluetooth), or `bridge.ts` for an IoT bridge on a WebSocket.
2. Import that module once from `index.ts` (or behind a feature flag).
3. That's all ExerSeiza needs. Once a source is registered, the Ride panel
   lists it under "Smart trainer". Connecting it means:
   - while it sends a `speed`, the rider moves at that speed, on a screen
     and in a headset, with no keys or triggers held;
   - about once a second, `setGradient(percent)` gets the slope under the
     rider (from the world's floor), so resistance can follow the ground;
   - cadence, power, and heart rate are shown in the panel when sent.

Readings older than two seconds are ignored, so a device that drops out
stops the rider instead of leaving them coasting.

## Rules

- Device access needs a click: call `connect()` only from the panel's
  button, never on load.
- Secrets never reach the browser. Strava's client secret and each
  athlete's tokens live in the deployment's secrets and KV, behind a Worker
  route (see `strava.ts`).
- What a device sends stays on this device, apart from moving the rider,
  which the room sees as any movement.
