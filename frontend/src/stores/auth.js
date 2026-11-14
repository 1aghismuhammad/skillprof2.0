import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../lib/api.js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const profilePromptDismissed = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const profileIncomplete = computed(() => !!user.value && !user.value.bio)

  /** Memoized once per page load (D-6). */
  let sessionPromise = null

  async function ensureSession() {
    if (sessionPromise) return sessionPromise
    sessionPromise = (async () => {
      try {
        const res = await api.get('/auth/me', { skipAuthRedirect: true })
        user.value = res.data.user ?? null
      } catch {
        user.value = null
      }
    })()
    return sessionPromise
  }

  async function login(email, password) {
    const res = await api.post(
      '/auth/login',
      { email, password },
      { skipAuthRedirect: true },
    )
    user.value = res.data.user
    return user.value
  }

  async function register(name, email, password) {
    const res = await api.post('/auth/register', { name, email, password })
    user.value = res.data.user
    return user.value
  }

  async function updateProfile(payload = {}) {
    const body = {}
    if (payload.name !== undefined) body.name = payload.name
    if (payload.bio !== undefined) body.bio = payload.bio
    if (payload.avatar_url !== undefined) body.avatar_url = payload.avatar_url

    const res = await api.put('/profile', body)
    user.value = { ...(user.value || {}), ...res.data.data }
    return user.value
  }

  function dismissProfilePrompt() {
    profilePromptDismissed.value = true
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // Cookie may already be gone; still clear client state and hard-navigate.
    } finally {
      user.value = null
      window.location.assign('/login')
    }
  }

  return {
    user,
    isAuthenticated,
    profileIncomplete,
    profilePromptDismissed,
    ensureSession,
    login,
    register,
    updateProfile,
    dismissProfilePrompt,
    logout,
  }
})
