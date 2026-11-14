import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../lib/api.js'

export const useSkillStore = defineStore('skills', () => {
  const userSkills = ref([])
  const pendingAssessments = ref([])
  const pendingTotal = ref(0)
  const reviewing = ref({})
  const competencyVersion = ref(0)
  const progress = ref(null)
  const timelines = ref({})
  let progressSeq = 0
  let userSkillsSeq = 0
  let pendingAssessmentsSeq = 0
  const timelineSeqBySkill = {}

  function bumpCompetency() {
    competencyVersion.value += 1
  }

  function upsertUserSkill(raw) {
    if (!raw || typeof raw !== 'object') return
    const { assessment, ...skill } = raw
    if (skill.id == null && skill.skill_id == null) return
    const next = [...userSkills.value]
    const idx = next.findIndex(
      (s) =>
        (skill.id != null && s.id === skill.id) ||
        (skill.skill_id != null && s.skill_id === skill.skill_id),
    )
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...skill }
    } else {
      next.unshift(skill)
    }
    userSkills.value = next
  }

  async function fetchUserSkills({ status = 'active' } = {}) {
    const seq = ++userSkillsSeq
    const limit = 100
    const first = await api.get('/user-skills', {
      params: { status, limit, page: 1 },
    })
    let items = Array.isArray(first.data.data) ? [...first.data.data] : []
    const pagination = first.data.pagination || {}
    const totalPages = Number(pagination.totalPages ?? pagination.total_pages ?? 1) || 1

    for (let page = 2; page <= totalPages; page += 1) {
      const res = await api.get('/user-skills', {
        params: { status, limit, page },
      })
      const chunk = Array.isArray(res.data.data) ? res.data.data : []
      items = items.concat(chunk)
    }

    if (seq !== userSkillsSeq) return items
    userSkills.value = items
    return userSkills.value
  }

  async function fetchUserSkill(id) {
    const res = await api.get(`/user-skills/${id}`)
    return res.data.data
  }

  async function addSkill(payload) {
    const res = await api.post('/user-skills', payload)
    const created = res.data.data
    const { assessment, ...skill } = created || {}
    if (skill?.id != null) {
      userSkills.value = [
        skill,
        ...userSkills.value.filter((s) => s.id !== skill.id && s.skill_id !== skill.skill_id),
      ]
    } else {
      await fetchUserSkills({ status: 'active' })
    }
    bumpCompetency()
    return created
  }

  async function updateSkill(id, payload) {
    const res = await api.patch(`/user-skills/${id}`, payload)
    const updated = res.data.data
    const { assessment, ...skill } = updated || {}
    if (skill?.id != null) {
      const idx = userSkills.value.findIndex((s) => s.id === id || s.id === skill.id)
      if (idx >= 0) {
        userSkills.value[idx] = { ...userSkills.value[idx], ...skill }
      } else {
        userSkills.value.unshift(skill)
      }
    } else {
      await fetchUserSkills({ status: 'active' })
    }
    bumpCompetency()
    return updated
  }

  async function removeSkill(id) {
    await api.delete(`/user-skills/${id}`)
    userSkills.value = userSkills.value.filter((s) => s.id !== id && s.id !== Number(id))
    bumpCompetency()
  }

  async function searchCatalog(query, category) {
    const params = { limit: 20 }
    if (query != null && String(query).trim() !== '') {
      params.search = String(query).trim()
    }
    if (category != null && String(category).trim() !== '') {
      params.category = String(category).trim()
    }
    const res = await api.get('/skills', { params })
    return Array.isArray(res.data.data) ? res.data.data : []
  }

  async function fetchPendingAssessments() {
    const seq = ++pendingAssessmentsSeq
    const limit = 100
    const first = await api.get('/user-skills/assessments', {
      params: { status: 'pending', limit, page: 1 },
    })
    let items = Array.isArray(first.data.data) ? [...first.data.data] : []
    const pagination = first.data.pagination || {}
    const total = pagination.total ?? items.length
    const totalPages = Number(pagination.totalPages ?? pagination.total_pages ?? 1) || 1

    for (let page = 2; page <= totalPages; page += 1) {
      const res = await api.get('/user-skills/assessments', {
        params: { status: 'pending', limit, page },
      })
      const chunk = Array.isArray(res.data.data) ? res.data.data : []
      items = items.concat(chunk)
    }

    if (seq !== pendingAssessmentsSeq) return items
    pendingTotal.value = total
    pendingAssessments.value = items
    return pendingAssessments.value
  }

  async function acceptAssessment(id, body = {}) {
    reviewing.value = { ...reviewing.value, [id]: true }
    try {
      const res = await api.post(`/user-skills/assessments/${id}/accept`, body)
      pendingAssessments.value = pendingAssessments.value.filter((a) => a.id !== id)
      pendingTotal.value = Math.max(0, pendingTotal.value - 1)
      const payload = res.data.data
      if (payload?.user_skill) {
        upsertUserSkill(payload.user_skill)
      } else if (payload?.user_skill_id) {
        upsertUserSkill({
          id: payload.user_skill_id,
          skill_id: payload.skill_id,
          skill_name: payload.skill_name,
          category: payload.category || 'General',
          proficiency_level: payload.proficiency_level,
          score: payload.score,
          status: payload.user_skill_status || 'active',
          notes: payload.notes,
        })
      }
      bumpCompetency()
      await fetchUserSkills({ status: 'active' }).catch(() => {})
      return payload
    } catch (err) {
      if (err?.status === 400) {
        await fetchPendingAssessments()
      }
      throw err
    } finally {
      const next = { ...reviewing.value }
      delete next[id]
      reviewing.value = next
    }
  }

  async function rejectAssessment(id, notes) {
    reviewing.value = { ...reviewing.value, [id]: true }
    try {
      const body = notes != null && String(notes).trim() !== ''
        ? { notes: String(notes).trim() }
        : {}
      const res = await api.post(`/user-skills/assessments/${id}/reject`, body)
      pendingAssessments.value = pendingAssessments.value.filter((a) => a.id !== id)
      pendingTotal.value = Math.max(0, pendingTotal.value - 1)
      const payload = res.data.data
      if (payload?.user_skill_status && payload.user_skill_status !== 'active' && payload?.user_skill_id) {
        userSkills.value = userSkills.value.filter((s) => s.id !== payload.user_skill_id)
      }
      bumpCompetency()
      await fetchUserSkills({ status: 'active' }).catch(() => {})
      return payload
    } catch (err) {
      if (err?.status === 400) {
        await fetchPendingAssessments()
      }
      throw err
    } finally {
      const next = { ...reviewing.value }
      delete next[id]
      reviewing.value = next
    }
  }

  async function fetchProgress() {
    const seq = ++progressSeq
    const res = await api.get('/competency-progress')
    const data = res.data.data || null
    if (seq !== progressSeq) return data
    progress.value = data
    return progress.value
  }

  async function fetchSkillTimeline(skillId) {
    const seq = (timelineSeqBySkill[skillId] || 0) + 1
    timelineSeqBySkill[skillId] = seq
    const res = await api.get(`/competency-progress/skills/${skillId}`)
    const data = res.data.data
    if (timelineSeqBySkill[skillId] !== seq) return data
    timelines.value = { ...timelines.value, [skillId]: data }
    return data
  }

  return {
    userSkills,
    pendingAssessments,
    pendingTotal,
    reviewing,
    competencyVersion,
    progress,
    timelines,
    bumpCompetency,
    fetchUserSkills,
    fetchUserSkill,
    addSkill,
    updateSkill,
    removeSkill,
    searchCatalog,
    fetchPendingAssessments,
    acceptAssessment,
    rejectAssessment,
    fetchProgress,
    fetchSkillTimeline,
  }
})
