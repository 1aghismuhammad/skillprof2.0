import axios from 'axios'
import { normalizeApiError } from './apiError.js'

// Backend AI: 30s × (1 + MAX_RETRIES 2) + backoff ≈ 93s
export const AI_TIMEOUT_MS = 120000

let onUnauthorized = () => {}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = typeof fn === 'function' ? fn : () => {}
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  withCredentials: true,
  timeout: 15000,
  headers: { Accept: 'application/json' },
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.skipAuthRedirect) {
      onUnauthorized()
    }
    return Promise.reject(normalizeApiError(err))
  },
)
