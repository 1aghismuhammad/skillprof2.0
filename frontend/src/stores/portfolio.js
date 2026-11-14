import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, AI_TIMEOUT_MS } from '../lib/api.js'

export const usePortfolioStore = defineStore('portfolio', () => {
  const portfolio = ref(null)
  const hasPortfolio = ref(false)
  const loaded = ref(false)
  const generating = ref(false)
  const saving = ref(false)
  const sharing = ref(null)
  const publicPortfolio = ref(null)

  let sharingSeq = 0

  async function fetchMine() {
    const res = await api.get('/portfolios')
    const data = res.data.data ?? null
    const flag = res.data.has_portfolio != null
      ? Boolean(res.data.has_portfolio)
      : Boolean(data)
    portfolio.value = data
    hasPortfolio.value = flag && data != null
    loaded.value = true
    return { portfolio: portfolio.value, hasPortfolio: hasPortfolio.value }
  }

  async function generateDraft(careerTargetId = null) {
    generating.value = true
    try {
      const body = {
        career_target_id: careerTargetId == null ? null : careerTargetId,
      }
      const res = await api.post('/portfolios/generate', body, {
        timeout: AI_TIMEOUT_MS,
      })
      return res.data.data
    } finally {
      generating.value = false
    }
  }

  async function save(payload) {
    saving.value = true
    try {
      // D-11: never send is_published from content save
      const { is_published: _ignored, ...safe } = payload || {}
      let res
      if (hasPortfolio.value && portfolio.value?.id != null) {
        res = await api.put(`/portfolios/${portfolio.value.id}`, safe)
      } else {
        res = await api.post('/portfolios', safe)
      }
      portfolio.value = res.data.data
      hasPortfolio.value = true
      loaded.value = true
      return portfolio.value
    } finally {
      saving.value = false
    }
  }

  async function remove() {
    sharingSeq += 1
    if (!portfolio.value?.id) {
      portfolio.value = null
      hasPortfolio.value = false
      sharing.value = null
      return
    }
    await api.delete(`/portfolios/${portfolio.value.id}`)
    portfolio.value = null
    hasPortfolio.value = false
    sharing.value = null
  }

  async function fetchSharing() {
    const targetId = portfolio.value?.id
    if (!targetId) {
      sharing.value = null
      return null
    }
    const seq = ++sharingSeq
    const res = await api.get(`/portfolios/${targetId}/sharing`)
    if (portfolio.value?.id !== targetId || seq !== sharingSeq) return res.data.data
    sharing.value = res.data.data
    return sharing.value
  }

  async function updateSharing(patch) {
    const targetId = portfolio.value?.id
    if (targetId == null) {
      throw Object.assign(new Error('Portofolio belum tersedia.'), { status: 400 })
    }
    const seq = ++sharingSeq
    const res = await api.patch(`/portfolios/${targetId}/sharing`, patch)
    if (portfolio.value?.id !== targetId || seq !== sharingSeq) return res.data.data
    sharing.value = res.data.data
    if (sharing.value?.slug != null) portfolio.value.slug = sharing.value.slug
    if (sharing.value?.is_published != null) {
      portfolio.value.is_published = sharing.value.is_published
    }
    return sharing.value
  }

  /** Stateless: returns payload only; does not mutate store session state. */
  async function fetchPublic(slug) {
    const res = await api.get(`/public/portfolios/${encodeURIComponent(slug)}`)
    return res.data.data
  }

  return {
    portfolio,
    hasPortfolio,
    loaded,
    generating,
    saving,
    sharing,
    publicPortfolio,
    fetchMine,
    generateDraft,
    save,
    remove,
    fetchSharing,
    updateSharing,
    fetchPublic,
  }
})
