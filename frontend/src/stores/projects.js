import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, AI_TIMEOUT_MS } from '../lib/api.js'
import { useSkillStore } from './skills.js'

function toListItem(project) {
  if (!project || typeof project !== 'object') return project
  const { evidences, ...rest } = project
  return rest
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export const useProjectStore = defineStore('projects', () => {
  const projects = ref([])
  const analysesByProject = ref({})
  const analyzing = ref({})
  const lastAnalysis = ref({})
  const analysisError = ref({})
  const notice = ref(null)

  const analyzingCount = computed(() => Object.keys(analyzing.value).length)

  function titleOf(id) {
    const project = projects.value.find((p) => p.id === Number(id) || p.id === id)
    return project?.title || `Proyek #${id}`
  }

  async function fetchProjects() {
    const res = await api.get('/projects')
    projects.value = Array.isArray(res.data.data) ? res.data.data : []
    return projects.value
  }

  async function fetchProject(id) {
    const res = await api.get(`/projects/${id}`)
    return res.data.data
  }

  async function createProject(payload) {
    const res = await api.post('/projects', payload)
    const created = res.data.data
    const item = toListItem(created)
    projects.value = [item, ...projects.value.filter((p) => p.id !== item.id)]
    return created
  }

  async function updateProject(id, payload) {
    const res = await api.put(`/projects/${id}`, payload)
    const updated = res.data.data
    const item = toListItem(updated)
    const idx = projects.value.findIndex((p) => p.id === Number(id) || p.id === id)
    if (idx >= 0) {
      projects.value[idx] = { ...projects.value[idx], ...item }
    } else {
      projects.value.unshift(item)
    }
    return updated
  }

  async function deleteProject(id) {
    await api.delete(`/projects/${id}`)
    const key = Number(id)
    projects.value = projects.value.filter((p) => p.id !== key && p.id !== id)
    const nextAnalyses = { ...analysesByProject.value }
    delete nextAnalyses[id]
    delete nextAnalyses[key]
    analysesByProject.value = nextAnalyses
    const nextLast = { ...lastAnalysis.value }
    delete nextLast[id]
    delete nextLast[key]
    lastAnalysis.value = nextLast
    const nextErr = { ...analysisError.value }
    delete nextErr[id]
    delete nextErr[key]
    analysisError.value = nextErr
    const nextAnalyzing = { ...analyzing.value }
    delete nextAnalyzing[id]
    delete nextAnalyzing[key]
    analyzing.value = nextAnalyzing
    useSkillStore().bumpCompetency()
  }

  /** shortcut: N+1 per project on list page — upgrade via BE-GAP-04 */
  async function fetchAnalyses(id) {
    const res = await api.get(`/projects/${id}/analyses`)
    const list = Array.isArray(res.data.data) ? res.data.data : []
    analysesByProject.value = { ...analysesByProject.value, [id]: list }
    return list
  }

  async function fetchAnalysis(id, aid) {
    const res = await api.get(`/projects/${id}/analyses/${aid}`)
    const detail = res.data.data
    lastAnalysis.value = { ...lastAnalysis.value, [id]: detail }
    return detail
  }

  /**
   * Poll analyses until a newer id appears (409 path), every 5s, max 24 attempts (~120s).
   */
  async function pollNewAnalysis(id, previousMaxId = 0) {
    const maxAttempts = 24
    const intervalMs = 5000
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await sleep(intervalMs)
      const list = await fetchAnalyses(id)
      const maxId = list.length ? Math.max(...list.map((a) => a.id)) : 0
      if (maxId > previousMaxId) {
        return fetchAnalysis(id, maxId)
      }
    }
    const err = new Error(
      'Analisis masih diproses. Muat ulang riwayat beberapa saat lagi.',
    )
    err.status = 0
    throw err
  }

  async function analyzeProject(id) {
    if (analyzing.value[id]) return

    analyzing.value = { ...analyzing.value, [id]: Date.now() }
    const nextErr = { ...analysisError.value }
    delete nextErr[id]
    analysisError.value = nextErr

    let previousMaxId = null
    try {
      const list = await fetchAnalyses(id)
      previousMaxId = list.length ? Math.max(...list.map((a) => a.id)) : 0
    } catch {
      previousMaxId = null
    }

    try {
      try {
        const res = await api.post(
          `/projects/${id}/analyze`,
          {},
          { timeout: AI_TIMEOUT_MS },
        )
        lastAnalysis.value = { ...lastAnalysis.value, [id]: res.data.data }
      } catch (e) {
        if (e?.status !== 409) throw e
        if (previousMaxId === null) {
          const baselineErr = new Error(
            'Analisis sedang berjalan di server. Silakan muat ulang riwayat dalam beberapa saat.',
          )
          baselineErr.status = 409
          throw baselineErr
        }
        lastAnalysis.value = {
          ...lastAnalysis.value,
          [id]: await pollNewAnalysis(id, previousMaxId),
        }
      }

      const skills = useSkillStore()
      skills.bumpCompetency()
      await Promise.allSettled([
        fetchAnalyses(id),
        skills.fetchPendingAssessments(),
      ])
      notice.value = {
        projectId: id,
        title: titleOf(id),
        kind: 'done',
      }
    } catch (e) {
      analysisError.value = { ...analysisError.value, [id]: e }
      notice.value = {
        projectId: id,
        title: titleOf(id),
        kind: 'error',
        message: e?.message || 'Analisis gagal.',
      }
    } finally {
      const next = { ...analyzing.value }
      delete next[id]
      analyzing.value = next
    }
  }

  function dismissNotice() {
    notice.value = null
  }

  return {
    projects,
    analysesByProject,
    analyzing,
    lastAnalysis,
    analysisError,
    notice,
    analyzingCount,
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    fetchAnalyses,
    fetchAnalysis,
    pollNewAnalysis,
    analyzeProject,
    dismissNotice,
  }
})
