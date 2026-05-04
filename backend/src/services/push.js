// Web Push service.
//
// Uses the optional `web-push` package when installed AND VAPID keys are set.
// All exports are safe to call when push is unconfigured — they degrade to
// no-ops so the rest of the API keeps working.

let webpush = null
let initialized = false
let lastInitError = null

async function loadWebPush() {
  if (webpush !== null) return webpush
  try {
    const mod = await import('web-push')
    webpush = mod.default || mod
  } catch (error) {
    lastInitError = `web-push package not installed: ${error.message}`
    webpush = false
  }
  return webpush
}

function hasVapid() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

/**
 * Initialise web-push. Returns `true` when fully configured, `false` otherwise.
 * Synchronous-looking but kicks off async loading on first call; subsequent
 * calls return the cached state.
 */
export function initWebPush() {
  if (initialized) return Boolean(webpush) && hasVapid()
  if (!hasVapid()) {
    lastInitError = 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set'
    return false
  }
  // Kick off load (fire-and-forget). Until it resolves we report unready.
  loadWebPush().then((wp) => {
    if (wp && wp.setVapidDetails) {
      try {
        wp.setVapidDetails(
          process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        )
        initialized = true
      } catch (error) {
        lastInitError = error.message
      }
    }
  })
  return false
}

export function pushStatus() {
  return {
    enabled: initialized,
    vapidConfigured: hasVapid(),
    package: webpush ? 'web-push' : 'not-installed',
    error: lastInitError,
  }
}

export async function sendPush(subscription, payload) {
  if (!initWebPush()) {
    return { ok: false, reason: 'push-not-configured' }
  }
  const wp = await loadWebPush()
  if (!wp || !wp.sendNotification) {
    return { ok: false, reason: 'web-push-unavailable' }
  }
  try {
    await wp.sendNotification(subscription, JSON.stringify(payload))
    return { ok: true }
  } catch (error) {
    // 404 / 410 mean the subscription is no longer valid and should be removed.
    const gone = error?.statusCode === 404 || error?.statusCode === 410
    return { ok: false, gone, statusCode: error?.statusCode, error: error.message }
  }
}
