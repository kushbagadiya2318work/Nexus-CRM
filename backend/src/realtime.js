// Realtime (websocket) stub.
//
// In a serverless environment (Vercel functions) long-lived websocket
// connections are not supported, so these are intentionally no-ops. When
// running the standalone Express server you can swap this with a real
// `ws`-based implementation; the call signatures are stable.

let attached = false

export function attachRealtime(_httpServer) {
  // Intentional no-op. Hook a real ws server here for self-hosted deployments.
  attached = true
}

export function broadcast(_event, _data, _options = {}) {
  // No-op: nothing to deliver in serverless mode.
}

export function realtimeStatus() {
  return {
    enabled: false,
    transport: 'none',
    attached,
    note: 'Websockets disabled in serverless mode',
  }
}
