import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, AI_TIMEOUT_MS } from '../lib/api.js'
import { useSkillStore } from './skills.js'

export const useCareerStore = defineStore('career', () => {
  const targets = ref([])
  const selectedTargetId = ref(null)
  const gapByTarget = ref({})
  const gapLoading = ref(false)
  const gapError = ref('')
  const recommendations = ref({})
  const recLoading = ref({})
  const targetRevision = ref({})
  const targetProgressByTarget = ref({})
  const targetProgressSeqById = {}

  let gapSeq = 0

  function clearRecommendation(id) {
    if (id == null) return
    const nextRec = { ...recommendations.value }
    delete nextRec[id]
    recommendations.value = nextRec
    const nextLoad = { ...recLoading.value }
    delete nextLoad[id]
    recLoading.value = nextLoad
  }

  function bumpTargetRevision(id) {
    if (id == null) return
    targetRevision.value = {
      ...targetRevision.value,
      [id]: (targetRevision.value[id] || 0) + 1,
    }
    clearRecommendation(id)
  }

  function clearGap(id) {
    if (id == null) return
    const next = { ...gapByTarget.value }
    delete next[id]
    gapByTarget.value = next
  }

  async function fetchTargets() {
    const res = await api.get('/career-targets')
    const list = Array.isArray(res.data.data) ? res.data.data : []
    targets.value = list

    const stillExists = list.some((t) => t.id === selectedTargetId.value)
    if (!stillExists) {
      selectedTargetId.value = list[0]?.id ?? null
    }
    return targets.value
  }

  function setSelectedTargetId(id) {
    selectedTargetId.value = id ? Number(id) : null
  }

  async function selectTarget(id) {
    selectedTargetId.value = id ?? null
    if (selectedTargetId.value == null) {
      gapError.value = ''
      return null
    }
    return fetchGap(selectedTargetId.value)
  }

  async function createTarget(payload) {
    const res = await api.post('/career-targets', payload)
    const created = res.data.data
    if (created?.id != null) {
      targets.value = [created, ...targets.value.filter((t) => t.id !== created.id)]
      selectedTargetId.value = created.id
      await fetchGap(created.id).catch(() => {})
    } else {
      await fetchTargets()
      if (selectedTargetId.value != null) {
        await fetchGap(selectedTargetId.value).catch(() => {})
      }
    }
    return created
  }

  async function updateTarget(id, payload) {
    const res = await api.put(`/career-targets/${id}`, payload)
    const updated = res.data.data
    if (updated?.id != null) {
      const idx = targets.value.findIndex((t) => t.id === id || t.id === updated.id)
      if (idx >= 0) {
        targets.value[idx] = updated
      } else {
        targets.value.unshift(updated)
      }
    } else {
      await fetchTargets()
    }
    bumpTargetRevision(id)
    clearGap(id)
    if (selectedTargetId.value === id || selectedTargetId.value === updated?.id) {
      await fetchGap(selectedTargetId.value).catch(() => {})
    }
    return updated
  }

  async function deleteTarget(id) {
    await api.delete(`/career-targets/${id}`)
    targets.value = targets.value.filter((t) => t.id !== id && t.id !== Number(id))
    bumpTargetRevision(id)
    clearGap(id)

    if (selectedTargetId.value === id || selectedTargetId.value === Number(id)) {
      selectedTargetId.value = targets.value[0]?.id ?? null
      if (selectedTargetId.value != null) {
        await fetchGap(selectedTargetId.value).catch(() => {})
      } else {
        gapError.value = ''
      }
    }
  }

  async function fetchGap(targetId) {
    if (targetId == null) {
      gapError.value = ''
      return null
    }
    const seq = ++gapSeq
    gapLoading.value = true
    gapError.value = ''
    try {
      const res = await api.get(`/career-targets/${targetId}/gap-analysis`)
      const data = res.data.data
      if (seq !== gapSeq) return data
      gapByTarget.value = { ...gapByTarget.value, [targetId]: data }
      return data
    } catch (err) {
      if (seq !== gapSeq) throw err
      gapError.value = err?.message || 'Gagal memuat analisis kesenjangan.'
      throw err
    } finally {
      if (seq === gapSeq) gapLoading.value = false
    }
  }

  /**
   * Combined AI recommendations (#33). Cache keyed by competencyVersion + targetRevision.
   * @param {number|string} targetId
   * @param {boolean|{force?: boolean}} forceOrOpts
   */
  async function fetchRecommendations(targetId, forceOrOpts = false) {
    if (targetId == null) return null
    const force = typeof forceOrOpts === 'object'
      ? Boolean(forceOrOpts?.force)
      : Boolean(forceOrOpts)

    const skills = useSkillStore()
    const currentVersion = skills.competencyVersion
    const currentRev = targetRevision.value[targetId] || 0

    const inflight = recLoading.value[targetId]
    if (
      inflight
      && inflight.version === currentVersion
      && inflight.revision === currentRev
      && inflight.promise
    ) {
      return inflight.promise
    }

    const cached = recommendations.value[targetId]
    if (
      !force
      && cached
      && cached.version === currentVersion
      && cached.revision === currentRev
    ) {
      return cached.data
    }

    const promise = api
      .get(`/career-targets/${targetId}/recommendations`, { timeout: AI_TIMEOUT_MS })
      .then((res) => {
        const data = res.data.data
        const stillSameRev = (targetRevision.value[targetId] || 0) === currentRev
        const stillSameVersion = skills.competencyVersion === currentVersion
        if (stillSameRev && stillSameVersion) {
          recommendations.value = {
            ...recommendations.value,
            [targetId]: { version: currentVersion, revision: currentRev, data },
          }
        }
        return data
      })
      .finally(() => {
        const current = recLoading.value[targetId]
        if (current && current.promise === promise) {
          const next = { ...recLoading.value }
          delete next[targetId]
          recLoading.value = next
        }
      })

    recLoading.value = {
      ...recLoading.value,
      [targetId]: { version: currentVersion, revision: currentRev, promise },
    }
    return promise
  }

  async function fetchTargetProgress(targetId) {
    if (targetId == null) return null
    const seq = (targetProgressSeqById[targetId] || 0) + 1
    targetProgressSeqById[targetId] = seq
    const res = await api.get(`/competency-progress/career-targets/${targetId}`)
    const data = res.data.data
    if (targetProgressSeqById[targetId] !== seq) return data
    targetProgressByTarget.value = {
      ...targetProgressByTarget.value,
      [targetId]: data,
    }
    return data
  }

  return {
    targets,
    selectedTargetId,
    gapByTarget,
    gapLoading,
    gapError,
    recommendations,
    recLoading,
    targetRevision,
    targetProgressByTarget,
    fetchTargets,
    setSelectedTargetId,
    selectTarget,
    createTarget,
    updateTarget,
    deleteTarget,
    fetchGap,
    fetchRecommendations,
    fetchTargetProgress,
  }
})
