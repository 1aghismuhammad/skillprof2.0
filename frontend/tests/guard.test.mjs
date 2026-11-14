import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveNavigation, safeRedirect } from '../src/router/guard.js'

describe('safeRedirect', () => {
  it('accepts same-origin relative paths', () => {
    assert.equal(safeRedirect('/projects?x=1'), '/projects?x=1')
    assert.equal(safeRedirect('/dashboard'), '/dashboard')
  })

  it('rejects open redirects and non-strings', () => {
    assert.equal(safeRedirect('//evil.com'), '/dashboard')
    assert.equal(safeRedirect('https://evil.com'), '/dashboard')
    assert.equal(safeRedirect('/\\evil.com'), '/dashboard')
    assert.equal(safeRedirect(undefined), '/dashboard')
    assert.equal(safeRedirect(['/x']), '/dashboard')
  })

  it('honors custom fallback', () => {
    assert.equal(safeRedirect('https://evil.com', '/home'), '/home')
  })
})

describe('resolveNavigation', () => {
  const guest = { isAuthenticated: false }
  const user = {
    isAuthenticated: true,
    profileIncomplete: false,
    profilePromptDismissed: false,
  }

  it('redirects guest from requiresAuth to Login with redirect query', () => {
    const to = {
      fullPath: '/dashboard',
      meta: { requiresAuth: true },
      name: 'Dashboard',
      query: {},
    }
    assert.deepEqual(resolveNavigation(to, guest), {
      name: 'Login',
      query: { redirect: '/dashboard' },
    })
  })

  it('redirects authenticated user away from guestOnly via safeRedirect', () => {
    const to = {
      fullPath: '/login',
      meta: { guestOnly: true },
      name: 'Login',
      query: { redirect: '/projects' },
    }
    assert.equal(resolveNavigation(to, user), '/projects')
  })

  it('sends authenticated guestOnly visitor to /dashboard when redirect missing', () => {
    const to = {
      fullPath: '/login',
      meta: { guestOnly: true },
      name: 'Login',
      query: {},
    }
    assert.equal(resolveNavigation(to, user), '/dashboard')
  })

  it('allows authenticated user on requiresAuth when profile complete', () => {
    const to = {
      fullPath: '/dashboard',
      meta: { requiresAuth: true },
      name: 'Dashboard',
      query: {},
    }
    assert.equal(resolveNavigation(to, user), true)
  })

  it('allows public routes for guest and authenticated user', () => {
    const to = { fullPath: '/', meta: {}, name: 'Landing', query: {} }
    assert.equal(resolveNavigation(to, guest), true)
    assert.equal(resolveNavigation(to, user), true)
  })

  it('allows public portfolio /p/:slug for guest and authenticated user', () => {
    const to = {
      fullPath: '/p/demo-slug',
      meta: {},
      name: 'PublicPortfolio',
      query: {},
      params: { slug: 'demo-slug' },
    }
    assert.equal(resolveNavigation(to, guest), true)
    assert.equal(resolveNavigation(to, user), true)
  })

  it('redirects incomplete profile to CompleteProfile', () => {
    const to = {
      fullPath: '/dashboard',
      meta: { requiresAuth: true },
      name: 'Dashboard',
      query: {},
    }
    const incomplete = {
      isAuthenticated: true,
      profileIncomplete: true,
      profilePromptDismissed: false,
    }
    assert.deepEqual(resolveNavigation(to, incomplete), { name: 'CompleteProfile' })
  })

  it('allows incomplete profile after prompt dismissed', () => {
    const to = {
      fullPath: '/dashboard',
      meta: { requiresAuth: true },
      name: 'Dashboard',
      query: {},
    }
    const dismissed = {
      isAuthenticated: true,
      profileIncomplete: true,
      profilePromptDismissed: true,
    }
    assert.equal(resolveNavigation(to, dismissed), true)
  })

  it('allows CompleteProfile itself when profile incomplete (no loop)', () => {
    const to = {
      fullPath: '/complete-profile',
      meta: { requiresAuth: true },
      name: 'CompleteProfile',
      query: {},
    }
    const incomplete = {
      isAuthenticated: true,
      profileIncomplete: true,
      profilePromptDismissed: false,
    }
    assert.equal(resolveNavigation(to, incomplete), true)
  })
})
