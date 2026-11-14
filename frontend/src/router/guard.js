/**
 * Reject open redirects; only same-origin relative paths are allowed.
 */
export function safeRedirect(target, fallback = '/dashboard') {
  return typeof target === 'string'
    && target.startsWith('/')
    && !target.startsWith('//')
    && !target.startsWith('/\\')
    ? target
    : fallback
}

/**
 * Pure navigation decision for vue-router beforeEach.
 *
 * @param {object} to - route location
 * @param {{ isAuthenticated: boolean, profileIncomplete?: boolean, profilePromptDismissed?: boolean }} s
 * @returns {true | string | object}
 */
export function resolveNavigation(to, s) {
  if (to.meta?.requiresAuth && !s.isAuthenticated) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  if (to.meta?.guestOnly && s.isAuthenticated) {
    return safeRedirect(to.query?.redirect)
  }
  if (
    to.meta?.requiresAuth
    && s.profileIncomplete
    && !s.profilePromptDismissed
    && to.name !== 'CompleteProfile'
  ) {
    return { name: 'CompleteProfile' }
  }
  return true
}
