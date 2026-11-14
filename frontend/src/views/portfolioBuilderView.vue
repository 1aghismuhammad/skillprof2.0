<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  BriefcaseBusiness, CheckCircle2, ChevronLeft, ChevronRight, Copy, Eye,
  ExternalLink, FolderKanban, Globe, Save, Share2, Trash2, WandSparkles, X,
} from 'lucide-vue-next'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import { usePortfolioStore } from '../stores/portfolio.js'
import { useProjectStore } from '../stores/projects.js'
import { useSkillStore } from '../stores/skills.js'
import { useCareerStore } from '../stores/career.js'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const STEP_LABELS = ['Pilih Proyek', 'Pilih Skill', 'Tentang', 'Pratinjau & Simpan']

const router = useRouter()
const portfolioStore = usePortfolioStore()
const projectStore = useProjectStore()
const skillStore = useSkillStore()
const careerStore = useCareerStore()

const step = ref(1)
const bootLoading = ref(false)
const bootError = ref('')
const sourcesWarning = ref('')

const title = ref('')
const slug = ref('')
const summary = ref('')
const customBio = ref('')
const careerTargetId = ref(null)

/** @type {import('vue').Ref<Array<{project_id:number, custom_description:string}>>} */
const selectedProjects = ref([])
/** @type {import('vue').Ref<number[]>} */
const selectedSkillIds = ref([])

const formError = ref('')
const saveSuccess = ref('')
const draftBanner = ref(false)
const generateError = ref('')
const generateErrorStatus = ref(null)
const generatePhase = ref('')
const showDeleteModal = ref(false)
const deleting = ref(false)

const sharingLoading = ref(false)
const sharingSaving = ref(false)
const sharingError = ref('')
const sharingSuccess = ref('')
const sharePublished = ref(false)
const shareEmail = ref('')
const shareGithub = ref('')
const shareLinkedin = ref('')
const shareWebsite = ref('')
const copyOk = ref(false)

let generateTimer = null
let generateStartedAt = 0
let generateSeq = 0
let deleteSeq = 0
let saveSeq = 0
let copyTimer = null

const projects = computed(() => projectStore.projects || [])
const activeSkills = computed(() =>
  (skillStore.userSkills || []).filter((s) => (s.status || 'active') === 'active'),
)
const targets = computed(() => careerStore.targets || [])

const selectedProjectIds = computed(() =>
  selectedProjects.value.map((p) => Number(p.project_id)),
)

const previewProjects = computed(() =>
  selectedProjects.value.map((row, idx) => {
    const src = projects.value.find((p) => p.id === row.project_id)
    return {
      ...row,
      display_order: idx + 1,
      title: src?.title || `Proyek #${row.project_id}`,
      original_description: src?.description || '',
    }
  }),
)

const previewSkills = computed(() =>
  selectedSkillIds.value.map((id, idx) => {
    const src = activeSkills.value.find((s) => s.skill_id === id || s.id === id)
    return {
      skill_id: id,
      display_order: idx + 1,
      name: src?.skill_name || src?.name || `Skill #${id}`,
      proficiency_level: src?.proficiency_level || '—',
      score: src?.score,
      category: src?.category || '—',
    }
  }),
)

const isBusy = computed(() =>
  portfolioStore.saving
  || portfolioStore.generating
  || deleting.value
  || sharingSaving.value
  || sharingLoading.value,
)
const isGenerate422 = computed(() => generateErrorStatus.value === 422)
const canGenerate = computed(() =>
  projects.value.length > 0 && activeSkills.value.length > 0 && !isBusy.value,
)
const publicPageUrl = computed(() => {
  const s = portfolioStore.sharing?.slug
    || portfolioStore.portfolio?.slug
    || slug.value.trim()
  if (!s) return ''
  return `${window.location.origin}/p/${s}`
})

function formatScore(score) {
  return score == null || score === '' ? '—' : String(score)
}

function scoreWidth(score) {
  if (score == null || score === '') return '0%'
  const n = Math.max(0, Math.min(100, Number(score)))
  return `${Number.isNaN(n) ? 0 : n}%`
}

function resetForm() {
  title.value = ''
  slug.value = ''
  summary.value = ''
  customBio.value = ''
  careerTargetId.value = null
  selectedProjects.value = []
  selectedSkillIds.value = []
  draftBanner.value = false
  formError.value = ''
  saveSuccess.value = ''
  generateError.value = ''
  generateErrorStatus.value = null
  step.value = 1
  sharePublished.value = false
  shareEmail.value = ''
  shareGithub.value = ''
  shareLinkedin.value = ''
  shareWebsite.value = ''
  sharingError.value = ''
  sharingSuccess.value = ''
}

function emptyToNull(value) {
  const t = String(value ?? '').trim()
  return t === '' ? null : t
}

function applySharing(data) {
  if (!data) return
  sharePublished.value = Boolean(data.is_published)
  shareEmail.value = data.public_email || ''
  shareGithub.value = data.github_url || ''
  shareLinkedin.value = data.linkedin_url || ''
  shareWebsite.value = data.website_url || ''
}

async function loadSharing() {
  if (!portfolioStore.hasPortfolio) return
  sharingLoading.value = true
  sharingError.value = ''
  try {
    const data = await portfolioStore.fetchSharing()
    applySharing(data)
  } catch (err) {
    sharingError.value = err?.message || 'Gagal memuat pengaturan berbagi.'
  } finally {
    sharingLoading.value = false
  }
}

async function onTogglePublish() {
  if (isBusy.value || !portfolioStore.hasPortfolio) return
  sharingSaving.value = true
  sharingError.value = ''
  sharingSuccess.value = ''
  const next = sharePublished.value
  try {
    const data = await portfolioStore.updateSharing({ is_published: next })
    sharePublished.value = Boolean(data?.is_published)
    sharingSuccess.value = sharePublished.value
      ? 'Portofolio dipublikasikan. Hanya skill aktif yang tampil di halaman publik.'
      : 'Portofolio disetel privat.'
  } catch (err) {
    sharePublished.value = !next
    sharingError.value = err?.message || 'Gagal memperbarui status publikasi.'
  } finally {
    sharingSaving.value = false
  }
}

async function onSaveSharingContacts() {
  if (isBusy.value || !portfolioStore.hasPortfolio) return
  sharingSaving.value = true
  sharingError.value = ''
  sharingSuccess.value = ''
  try {
    const data = await portfolioStore.updateSharing({
      public_email: emptyToNull(shareEmail.value),
      github_url: emptyToNull(shareGithub.value),
      linkedin_url: emptyToNull(shareLinkedin.value),
      website_url: emptyToNull(shareWebsite.value),
    })
    applySharing(data)
    sharingSuccess.value = 'Kontak publik berhasil disimpan.'
  } catch (err) {
    const detail = Array.isArray(err?.errors) && err.errors.length
      ? ` ${err.errors.join(' · ')}`
      : ''
    sharingError.value = `${err?.message || 'Gagal menyimpan kontak publik.'}${detail}`
  } finally {
    sharingSaving.value = false
  }
}

async function copyPublicUrl() {
  if (!publicPageUrl.value) return
  try {
    await navigator.clipboard.writeText(publicPageUrl.value)
    copyOk.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copyOk.value = false }, 2000)
  } catch {
    sharingError.value = 'Gagal menyalin URL. Salin manual dari kolom di atas.'
  }
}

function openPublicPage() {
  if (!publicPageUrl.value) return
  window.open(publicPageUrl.value, '_blank', 'noopener,noreferrer')
}

function applyPortfolio(data) {
  if (!data) {
    resetForm()
    return
  }
  title.value = data.title || ''
  slug.value = data.slug || ''
  summary.value = data.summary || ''
  customBio.value = data.custom_bio || ''
  careerTargetId.value = data.career_target?.id ?? data.career_target_id ?? null
  selectedProjects.value = (data.projects || []).map((p) => ({
    project_id: p.project_id || p.id,
    custom_description: p.custom_description || '',
  }))
  selectedSkillIds.value = (data.skills || [])
    .map((s) => s.skill_id || s.id)
    .filter((id) => id != null)
  draftBanner.value = false
  formError.value = ''
  saveSuccess.value = ''
}

function isProjectSelected(id) {
  return selectedProjectIds.value.includes(Number(id))
}

function toggleProject(id) {
  if (isBusy.value) return
  const pid = Number(id)
  if (isProjectSelected(pid)) {
    selectedProjects.value = selectedProjects.value.filter((p) => p.project_id !== pid)
  } else {
    selectedProjects.value = [
      ...selectedProjects.value,
      { project_id: pid, custom_description: '' },
    ]
  }
}

function updateProjectDescription(projectId, value) {
  if (isBusy.value) return
  selectedProjects.value = selectedProjects.value.map((p) =>
    p.project_id === projectId ? { ...p, custom_description: value } : p,
  )
}

function moveProject(projectId, dir) {
  if (isBusy.value) return
  const list = [...selectedProjects.value]
  const idx = list.findIndex((p) => p.project_id === projectId)
  if (idx < 0) return
  const next = idx + dir
  if (next < 0 || next >= list.length) return
  const tmp = list[idx]
  list[idx] = list[next]
  list[next] = tmp
  selectedProjects.value = list
}

function isSkillSelected(skillId) {
  return selectedSkillIds.value.includes(Number(skillId))
}

function toggleSkill(skillId) {
  if (isBusy.value) return
  const id = Number(skillId)
  if (isSkillSelected(id)) {
    selectedSkillIds.value = selectedSkillIds.value.filter((x) => x !== id)
  } else {
    selectedSkillIds.value = [...selectedSkillIds.value, id]
  }
}

function validateSlug(value) {
  const s = String(value || '').trim()
  if (s.length < 3 || s.length > 60) return false
  return SLUG_RE.test(s)
}

function clearGenerateTimer() {
  if (generateTimer) {
    clearInterval(generateTimer)
    generateTimer = null
  }
  generatePhase.value = ''
}

function startGeneratePhases() {
  clearGenerateTimer()
  generateStartedAt = Date.now()
  generatePhase.value = 'Menyiapkan konteks proyek & skill…'
  generateTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - generateStartedAt) / 1000)
    if (sec < 15) generatePhase.value = 'Menyiapkan konteks proyek & skill…'
    else if (sec < 45) generatePhase.value = 'AI sedang menyusun narasi portofolio…'
    else if (sec < 90) generatePhase.value = 'Mengurasi proyek dan skill relevan…'
    else generatePhase.value = 'Hampir selesai — menunggu respons AI…'
  }, 1000)
}

function applyDraft(draft) {
  if (!draft) return
  if (draft.title) title.value = draft.title
  if (draft.summary != null) summary.value = draft.summary || ''
  if (draft.custom_bio != null) customBio.value = draft.custom_bio || ''
  if ((!slug.value || !slug.value.trim()) && draft.suggested_slug) {
    slug.value = draft.suggested_slug
  }
  careerTargetId.value = draft.career_target?.id
    ?? draft.career_target_id
    ?? careerTargetId.value

  const rawProjects = draft.suggested_projects || draft.selected_projects || []
  const rawSkills = draft.suggested_skills || draft.selected_skills || []

  if (Array.isArray(rawProjects) && rawProjects.length) {
    selectedProjects.value = rawProjects
      .slice()
      .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
      .map((p) => ({
        project_id: p.project_id || p.id,
        custom_description: p.custom_description || '',
      }))
      .filter((p) => p.project_id != null)
  }
  if (Array.isArray(rawSkills) && rawSkills.length) {
    selectedSkillIds.value = rawSkills
      .slice()
      .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
      .map((s) => s.skill_id || s.id)
      .filter((id) => id != null)
  }
  draftBanner.value = true
  step.value = 4
}

async function onGenerate() {
  if (isBusy.value) return
  const seq = ++generateSeq
  generateError.value = ''
  generateErrorStatus.value = null
  formError.value = ''
  saveSuccess.value = ''
  startGeneratePhases()
  try {
    const draft = await portfolioStore.generateDraft(careerTargetId.value)
    if (seq !== generateSeq) return
    applyDraft(draft)
  } catch (err) {
    if (seq !== generateSeq) return
    generateErrorStatus.value = err?.status ?? null
    if (err?.status === 422) {
      generateError.value = err?.message
        || 'Belum cukup data untuk generate. Tambahkan proyek atau skill aktif terlebih dahulu.'
    } else {
      generateError.value = err?.message || 'Gagal menghasilkan draf AI.'
    }
  } finally {
    if (seq === generateSeq) clearGenerateTimer()
  }
}

function buildPayload() {
  return {
    title: title.value.trim(),
    slug: slug.value.trim(),
    summary: summary.value.trim() || null,
    custom_bio: customBio.value.trim() || null,
    career_target_id: careerTargetId.value == null || careerTargetId.value === ''
      ? null
      : Number(careerTargetId.value),
    projects: selectedProjects.value.map((p, idx) => ({
      project_id: p.project_id,
      custom_description: p.custom_description?.trim() || null,
      display_order: idx + 1,
    })),
    skills: selectedSkillIds.value.map((skillId, idx) => ({
      skill_id: skillId,
      display_order: idx + 1,
    })),
  }
}

async function onSave() {
  if (isBusy.value) return
  generateSeq += 1
  clearGenerateTimer()
  const seq = ++saveSeq

  formError.value = ''
  saveSuccess.value = ''
  const t = title.value.trim()
  if (t.length < 3 || t.length > 200) {
    formError.value = 'Judul wajib 3–200 karakter.'
    step.value = 3
    return
  }
  if (!validateSlug(slug.value)) {
    formError.value = 'Slug wajib 3–60 karakter: huruf kecil, angka, dan tanda hubung tunggal (contoh: nama-anda-portfolio).'
    step.value = 3
    return
  }
  if (summary.value.length > 2000) {
    formError.value = 'Summary maksimal 2000 karakter.'
    step.value = 3
    return
  }
  if (customBio.value.length > 1000) {
    formError.value = 'Custom bio maksimal 1000 karakter.'
    step.value = 3
    return
  }

  try {
    const saved = await portfolioStore.save(buildPayload())
    if (seq !== saveSeq) return
    applyPortfolio(saved)
    saveSuccess.value = 'Portofolio berhasil disimpan.'
    draftBanner.value = false
    await loadSharing()
  } catch (err) {
    if (seq !== saveSeq) return
    const detailErrors = Array.isArray(err?.errors) && err.errors.length
      ? ` ${err.errors.join(' · ')}`
      : ''
    if (err?.status === 409) {
      const msg = String(err?.message || '').toLowerCase()
      if (msg.includes('slug')) {
        formError.value = `Slug sudah dipakai. Gunakan slug lain.${detailErrors}`
      } else if (msg.includes('portofolio') || msg.includes('portfolio')) {
        formError.value = `Anda sudah memiliki portofolio. Memuat ulang data…${detailErrors}`
        await portfolioStore.fetchMine().catch(() => {})
        if (seq !== saveSeq) return
        if (portfolioStore.hasPortfolio) applyPortfolio(portfolioStore.portfolio)
      } else {
        formError.value = `${err?.message || 'Konflik saat menyimpan portofolio.'}${detailErrors}`
      }
      step.value = 3
    } else {
      formError.value = `${err?.message || 'Gagal menyimpan portofolio.'}${detailErrors}`
    }
  }
}

async function confirmDelete() {
  if (portfolioStore.saving || portfolioStore.generating) return
  const seq = ++deleteSeq
  // Invalidate any in-flight generate so late drafts cannot refill a wiped form.
  generateSeq += 1
  clearGenerateTimer()
  deleting.value = true
  formError.value = ''
  try {
    await portfolioStore.remove()
    if (seq !== deleteSeq) return
    resetForm()
    showDeleteModal.value = false
    saveSuccess.value = 'Portofolio berhasil dihapus.'
  } catch (err) {
    if (seq !== deleteSeq) return
    formError.value = err?.message || 'Gagal menghapus portofolio.'
    showDeleteModal.value = false
  } finally {
    if (seq === deleteSeq) deleting.value = false
  }
}

async function bootstrap() {
  bootLoading.value = true
  bootError.value = ''
  sourcesWarning.value = ''
  try {
    const results = await Promise.allSettled([
      portfolioStore.fetchMine(),
      projectStore.fetchProjects(),
      skillStore.fetchUserSkills({ status: 'active' }),
      careerStore.fetchTargets(),
    ])
    if (results[0].status === 'rejected') {
      bootError.value = results[0].reason?.message || 'Gagal memuat data portofolio.'
      return
    }

    const sourceNotes = []
    if (results[1].status === 'rejected') {
      sourceNotes.push(`Proyek: ${results[1].reason?.message || 'gagal dimuat'}`)
    }
    if (results[2].status === 'rejected') {
      sourceNotes.push(`Skill: ${results[2].reason?.message || 'gagal dimuat'}`)
    }
    if (results[3].status === 'rejected') {
      sourceNotes.push(`Target karier: ${results[3].reason?.message || 'gagal dimuat'}`)
    }
    if (sourceNotes.length) {
      sourcesWarning.value = `Sebagian data pendukung gagal dimuat. ${sourceNotes.join(' · ')}`
    }

    if (portfolioStore.hasPortfolio) {
      applyPortfolio(portfolioStore.portfolio)
      step.value = 4
      await loadSharing()
    } else {
      resetForm()
    }
  } catch (err) {
    bootError.value = err?.message || 'Gagal memuat data portofolio.'
  } finally {
    bootLoading.value = false
  }
}

onMounted(bootstrap)
onUnmounted(() => {
  clearGenerateTimer()
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <WorkspaceLayout active="portfolio">
    <div class="pb-page">
      <div class="pb-heading">
        <div>
          <h1>Portfolio <span>Builder</span></h1>
          <p>
            Susun portofolio dari proyek dan skill aktif Anda, atau biarkan AI mengusulkan draf untuk ditinjau sebelum disimpan.
          </p>
        </div>
        <div class="heading-actions">
          <button
            type="button"
            class="generate-btn"
            :disabled="isBusy || !canGenerate || bootLoading"
            @click="onGenerate"
          >
            <WandSparkles :size="14" />
            {{ portfolioStore.generating ? 'Generating…' : 'Generate dengan AI' }}
          </button>
          <button
            v-if="portfolioStore.hasPortfolio"
            type="button"
            class="danger-btn"
            :disabled="isBusy"
            @click="showDeleteModal = true"
          >
            <Trash2 :size="14" /> Hapus
          </button>
        </div>
      </div>

      <p v-if="bootLoading" class="banner-info">Memuat data portofolio…</p>
      <p v-else-if="bootError" class="banner-error" role="alert">{{ bootError }}</p>

      <template v-else>
        <div class="steps">
          <button
            v-for="(label, i) in STEP_LABELS"
            :key="label"
            type="button"
            :class="{ done: step > i + 1, current: step === i + 1 }"
            :disabled="isBusy"
            @click="step = i + 1"
          >
            <span>{{ step > i + 1 ? '✓' : i + 1 }}</span>
            <div>
              <small>STEP 0{{ i + 1 }}</small>
              <b>{{ label }}</b>
            </div>
          </button>
        </div>

        <p v-if="sourcesWarning" class="banner-warn" role="status">{{ sourcesWarning }}</p>
        <p v-if="draftBanner" class="banner-ai" role="status">
          Draf rekomendasi AI berhasil dimuat — silakan tinjau dan sesuaikan sebelum menyimpan.
        </p>
        <p v-if="saveSuccess" class="banner-ok" role="status">{{ saveSuccess }}</p>
        <p v-if="formError" class="banner-error" role="alert">{{ formError }}</p>

        <div v-if="portfolioStore.generating" class="banner-info">
          {{ generatePhase || 'AI sedang menyusun draf portofolio…' }}
          (timeout hingga 120 detik)
        </div>

        <div v-if="generateError" class="banner-error" role="alert">
          <p>{{ generateError }}</p>
          <div v-if="isGenerate422" class="error-actions">
            <button type="button" class="primary" @click="router.push('/projects')">Tambah Proyek</button>
            <button type="button" class="ghost" @click="router.push('/skill-profile')">Kelola Skill</button>
          </div>
        </div>

        <div class="pb-layout">
          <main>
            <!-- STEP 1 -->
            <section v-if="step === 1" class="pb-panel">
              <div class="pb-panel-title">
                <div>
                  <h2><FolderKanban :size="17" /> Step 1: Pilih Proyek</h2>
                  <p>Pilih proyek untuk ditampilkan. Urutan pilihan menjadi display_order.</p>
                </div>
                <span>{{ selectedProjects.length }} dipilih</span>
              </div>

              <p v-if="!projects.length" class="empty-copy">
                Belum ada proyek.
                <button type="button" class="linkish" @click="router.push('/projects')">Tambah proyek</button>
              </p>

              <article
                v-for="p in projects"
                :key="p.id"
                class="project-option"
                :class="{ selected: isProjectSelected(p.id) }"
              >
                <button type="button" class="check-box" :disabled="isBusy" @click="toggleProject(p.id)">
                  {{ isProjectSelected(p.id) ? '✓' : '' }}
                </button>
                <div class="project-body">
                  <b>{{ p.title }}</b>
                  <p>{{ p.description || 'Tanpa deskripsi' }}</p>
                  <label v-if="isProjectSelected(p.id)" class="field-label">
                    Deskripsi kustom (opsional)
                    <textarea
                      rows="2"
                      maxlength="2000"
                      :disabled="isBusy"
                      :value="selectedProjects.find((x) => x.project_id === p.id)?.custom_description || ''"
                      @input="updateProjectDescription(p.id, $event.target.value)"
                    ></textarea>
                  </label>
                  <div v-if="isProjectSelected(p.id)" class="order-actions">
                    <button type="button" class="ghost" :disabled="isBusy" @click="moveProject(p.id, -1)">Naik</button>
                    <button type="button" class="ghost" :disabled="isBusy" @click="moveProject(p.id, 1)">Turun</button>
                  </div>
                </div>
              </article>

              <div class="step-nav">
                <button type="button" class="primary" :disabled="isBusy" @click="step = 2">
                  Lanjut ke Skill <ChevronRight :size="14" />
                </button>
              </div>
            </section>

            <!-- STEP 2 -->
            <section v-if="step === 2" class="pb-panel">
              <div class="pb-panel-title">
                <div>
                  <h2><WandSparkles :size="17" /> Step 2: Pilih Skill Aktif</h2>
                  <p>Hanya skill berstatus active yang dapat ditampilkan di portofolio.</p>
                </div>
                <span>{{ selectedSkillIds.length }} dipilih</span>
              </div>

              <p v-if="!activeSkills.length" class="empty-copy">
                Belum ada skill aktif.
                <button type="button" class="linkish" @click="router.push('/skill-profile')">Buka Skill Profile</button>
              </p>

              <div class="skill-grid">
                <button
                  v-for="s in activeSkills"
                  :key="s.skill_id || s.id"
                  type="button"
                  class="skill-card"
                  :class="{ picked: isSkillSelected(s.skill_id || s.id) }"
                  :disabled="isBusy"
                  @click="toggleSkill(s.skill_id || s.id)"
                >
                  <div class="skill-top">
                    <strong>{{ s.skill_name || s.name }}</strong>
                    <span>{{ s.proficiency_level || '—' }}</span>
                  </div>
                  <div class="score-row">
                    <small>Skor {{ formatScore(s.score) }}</small>
                    <i><u :style="{ width: scoreWidth(s.score) }"></u></i>
                  </div>
                </button>
              </div>

              <div class="step-nav">
                <button type="button" class="ghost" :disabled="isBusy" @click="step = 1"><ChevronLeft :size="14" /> Kembali</button>
                <button type="button" class="primary" :disabled="isBusy" @click="step = 3">
                  Lanjut ke Tentang <ChevronRight :size="14" />
                </button>
              </div>
            </section>

            <!-- STEP 3 -->
            <section v-if="step === 3" class="pb-panel">
              <div class="pb-panel-title">
                <div>
                  <h2><BriefcaseBusiness :size="17" /> Step 3: Tentang Portofolio</h2>
                  <p>Judul, slug publik, ringkasan, bio, dan target karier opsional.</p>
                </div>
              </div>

              <label class="field-label">
                Judul (3–200)
                <input v-model="title" type="text" maxlength="200" :disabled="isBusy" />
              </label>
              <label class="field-label">
                Slug (3–60, huruf kecil/angka/tanda hubung)
                <input v-model="slug" type="text" maxlength="60" placeholder="nama-anda-portfolio" :disabled="isBusy" />
              </label>
              <label class="field-label">
                Summary (opsional, max 2000)
                <textarea v-model="summary" rows="4" maxlength="2000" :disabled="isBusy"></textarea>
                <small>{{ summary.length }}/2000</small>
              </label>
              <label class="field-label">
                Custom bio (opsional, max 1000)
                <textarea v-model="customBio" rows="3" maxlength="1000" :disabled="isBusy"></textarea>
                <small>{{ customBio.length }}/1000</small>
              </label>
              <label class="field-label">
                Target karier (opsional)
                <select v-model="careerTargetId" :disabled="isBusy">
                  <option :value="null">— Tanpa target —</option>
                  <option v-for="t in targets" :key="t.id" :value="t.id">{{ t.title }}</option>
                </select>
              </label>

              <div class="step-nav">
                <button type="button" class="ghost" :disabled="isBusy" @click="step = 2"><ChevronLeft :size="14" /> Kembali</button>
                <button type="button" class="primary" :disabled="isBusy" @click="step = 4">
                  Pratinjau <ChevronRight :size="14" />
                </button>
              </div>
            </section>

            <!-- STEP 4 -->
            <section v-if="step === 4" class="pb-panel">
              <div class="pb-panel-title">
                <div>
                  <h2><Eye :size="17" /> Step 4: Pratinjau & Simpan</h2>
                  <p>Periksa konten sebelum menyimpan ke server. Publikasi diatur terpisah di panel Sharing (FE-10).</p>
                </div>
              </div>

              <div class="preview">
                <h2>{{ title || 'Judul portofolio' }}</h2>
                <p class="slug-line">/p/{{ slug || 'slug-anda' }}</p>
                <p>{{ summary || 'Belum ada summary.' }}</p>
                <p class="bio">{{ customBio || 'Belum ada custom bio.' }}</p>

                <h3>Proyek ({{ previewProjects.length }})</h3>
                <ul v-if="previewProjects.length">
                  <li v-for="p in previewProjects" :key="p.project_id">
                    <strong>{{ p.display_order }}. {{ p.title }}</strong>
                    <span>{{ p.custom_description || p.original_description || '—' }}</span>
                  </li>
                </ul>
                <p v-else class="empty-copy">Belum ada proyek dipilih.</p>

                <h3>Skill ({{ previewSkills.length }})</h3>
                <div v-if="previewSkills.length" class="preview-tags">
                  <span v-for="s in previewSkills" :key="s.skill_id">
                    {{ s.name }} · {{ s.proficiency_level }} · {{ formatScore(s.score) }}
                  </span>
                </div>
                <p v-else class="empty-copy">Belum ada skill dipilih.</p>
              </div>

              <div class="step-nav">
                <button type="button" class="ghost" :disabled="isBusy" @click="step = 3"><ChevronLeft :size="14" /> Edit</button>
                <button
                  type="button"
                  class="primary"
                  :disabled="isBusy"
                  @click="onSave"
                >
                  <Save :size="13" />
                  {{ portfolioStore.saving ? 'Menyimpan…' : (portfolioStore.hasPortfolio ? 'Simpan Perubahan' : 'Simpan Portofolio') }}
                </button>
              </div>
            </section>
          </main>

          <aside class="pb-side">
            <div class="finalizer">
              <span>RINGKASAN</span>
              <h3>{{ portfolioStore.hasPortfolio ? 'Mode Edit' : 'Wizard Baru' }}</h3>
              <p>Konten disimpan lewat POST/PUT tanpa mengubah status publikasi.</p>
              <div class="artifact-box">
                <small>KONFIGURASI</small>
                <p>Proyek <b>{{ selectedProjects.length }}</b></p>
                <p>Skill aktif <b>{{ selectedSkillIds.length }}</b></p>
                <p>Judul <b>{{ title.trim() ? 'Siap' : 'Kosong' }}</b></p>
                <p>Slug <b>{{ validateSlug(slug) ? 'Valid' : 'Belum valid' }}</b></p>
              </div>
              <button
                type="button"
                class="generate"
                :disabled="isBusy || !canGenerate"
                @click="onGenerate"
              >
                <WandSparkles :size="14" />
                {{ portfolioStore.generating ? 'Generating…' : 'Generate dengan AI' }}
              </button>
              <button
                type="button"
                class="draft"
                :disabled="isBusy"
                @click="step = 4; onSave()"
              >
                <Save :size="13" /> Simpan Portofolio
              </button>
              <div class="live-preview">
                <CheckCircle2 :size="12" />
                {{ portfolioStore.hasPortfolio ? 'Portofolio tersimpan di server' : 'Belum disimpan' }}
              </div>
            </div>
          </aside>
        </div>

        <section class="pb-panel sharing-panel">
          <div class="pb-panel-title">
            <div>
              <h2><Share2 :size="17" /> Pengaturan Berbagi</h2>
              <p>
                Publikasikan portofolio dan atur kontak publik. Publikasi hanya lewat panel ini (bukan lewat Simpan konten).
              </p>
            </div>
          </div>

          <template v-if="!portfolioStore.hasPortfolio">
            <p class="empty-copy">
              Simpan draf portofolio terlebih dahulu sebelum mengatur berbagi dan URL publik.
            </p>
          </template>

          <template v-else>
            <p v-if="sharingLoading" class="banner-info">Memuat pengaturan berbagi…</p>
            <p v-if="sharingError" class="banner-error" role="alert">{{ sharingError }}</p>
            <p v-if="sharingSuccess" class="banner-ok" role="status">{{ sharingSuccess }}</p>

            <label class="publish-toggle">
              <input
                v-model="sharePublished"
                type="checkbox"
                :disabled="sharingLoading || sharingSaving || isBusy"
                @change="onTogglePublish"
              />
              <span>
                <b>{{ sharePublished ? 'Dipublikasikan' : 'Privat' }}</b>
                <small>Hanya skill berstatus aktif yang tampil di halaman publik.</small>
              </span>
            </label>

            <div class="public-url-box">
              <label class="field-label">
                URL publik (frontend)
                <input :value="publicPageUrl" type="text" readonly />
              </label>
              <div class="url-actions">
                <button
                  type="button"
                  class="ghost"
                  :disabled="!publicPageUrl || sharingSaving"
                  @click="copyPublicUrl"
                >
                  <Copy :size="14" /> {{ copyOk ? 'Tersalin' : 'Salin URL' }}
                </button>
                <button
                  type="button"
                  class="primary"
                  :disabled="!publicPageUrl"
                  @click="openPublicPage"
                >
                  <ExternalLink :size="14" /> Lihat Portofolio
                </button>
              </div>
            </div>

            <div class="contact-grid">
              <label class="field-label">
                Email publik
                <input
                  v-model="shareEmail"
                  type="email"
                  maxlength="150"
                  placeholder="kontak@contoh.dev"
                  :disabled="sharingLoading || sharingSaving || isBusy"
                />
              </label>
              <label class="field-label">
                GitHub
                <input
                  v-model="shareGithub"
                  type="url"
                  maxlength="255"
                  placeholder="https://github.com/…"
                  :disabled="sharingLoading || sharingSaving || isBusy"
                />
              </label>
              <label class="field-label">
                LinkedIn
                <input
                  v-model="shareLinkedin"
                  type="url"
                  maxlength="255"
                  placeholder="https://linkedin.com/in/…"
                  :disabled="sharingLoading || sharingSaving || isBusy"
                />
              </label>
              <label class="field-label">
                Website
                <input
                  v-model="shareWebsite"
                  type="url"
                  maxlength="255"
                  placeholder="https://…"
                  :disabled="sharingLoading || sharingSaving || isBusy"
                />
              </label>
            </div>
            <p class="share-hint">
              <Globe :size="13" /> Kosongkan field untuk menghapus kontak publik (dikirim sebagai null).
            </p>
            <div class="step-nav">
              <button
                type="button"
                class="primary"
                :disabled="sharingLoading || sharingSaving || isBusy"
                @click="onSaveSharingContacts"
              >
                <Save :size="13" />
                {{ sharingSaving ? 'Menyimpan…' : 'Simpan Kontak Publik' }}
              </button>
            </div>
          </template>
        </section>
      </template>
    </div>

    <div v-if="showDeleteModal" class="overlay" @click.self="!deleting && (showDeleteModal = false)">
      <section class="modal">
        <button type="button" class="close" :disabled="deleting" @click="showDeleteModal = false"><X /></button>
        <h2>Hapus Portofolio?</h2>
        <p class="muted">
          Portofolio akan dihapus permanen. Proyek dan skill aktif di profil Anda tetap aman.
        </p>
        <div class="modal-actions">
          <button type="button" class="ghost" :disabled="deleting" @click="showDeleteModal = false">Batal</button>
          <button type="button" class="danger-btn" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? 'Menghapus…' : 'Ya, Hapus' }}
          </button>
        </div>
      </section>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.pb-page{color:#e8eaff}
.pb-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px}
.pb-heading h1{font-size:28px;margin:0 0 6px}
.pb-heading h1 span{color:#a66aff}
.pb-heading p{font-size:14px;line-height:1.45;color:#c4c8dd;margin:0;max-width:620px}
.heading-actions{display:flex;gap:8px;flex-wrap:wrap}
.generate-btn,.primary,.generate{display:inline-flex;align-items:center;gap:6px;background:#702bf2;border:0;color:#fff;border-radius:6px;padding:9px 12px;font-size:12px;cursor:pointer}
.generate-btn:disabled,.primary:disabled,.generate:disabled,.draft:disabled{opacity:.55;cursor:not-allowed}
.danger-btn{display:inline-flex;align-items:center;gap:6px;background:#2a1b28;border:1px solid #614052;color:#ffb4b4;border-radius:6px;padding:9px 12px;font-size:12px;cursor:pointer}
.danger-btn:disabled{opacity:.55;cursor:not-allowed}
.ghost{display:inline-flex;align-items:center;gap:6px;background:#202947;border:1px solid #35436a;color:#cbd1e8;border-radius:6px;padding:9px 12px;font-size:12px;cursor:pointer}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#111a35;border:1px solid #29375d;border-radius:8px;padding:10px;margin-bottom:14px}
.steps>button{display:flex;gap:9px;align-items:center;padding:6px;cursor:pointer;color:#858eae;border:0;background:transparent;text-align:left}
.steps>button>span{width:25px;height:25px;border-radius:50%;background:#252e4d;display:grid;place-items:center;font-size:10px;flex:none}
.steps>button small,.steps>button b{display:block}
.steps>button small{font-size:8px}
.steps>button b{font-size:11px;margin-top:3px}
.steps>button.current{color:#17d6e8}
.steps>button.current>span,.steps>button.done>span{background:#6c2df0;color:#fff}
.steps>button.done{color:#c5d1ee}
.steps>button:disabled{opacity:.55;cursor:not-allowed}
.pb-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px}
.pb-panel,.finalizer{background:#111a35;border:1px solid #28375e;border-radius:8px;padding:16px;margin-bottom:14px}
.pb-panel-title{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px}
.pb-panel-title h2{display:flex;align-items:center;gap:8px;font-size:14px;margin:0 0 4px}
.pb-panel-title p{font-size:12px;color:#aeb8d0;margin:0}
.pb-panel-title>span{font-size:11px;color:#13d6e8;background:#103b51;padding:5px 8px;border-radius:15px;white-space:nowrap}
.project-option{display:flex;align-items:flex-start;gap:10px;border:1px solid #293b6a;border-radius:7px;padding:12px;margin-bottom:9px}
.project-option.selected{border-color:#773cff;background:#171d43}
.check-box{width:20px;height:20px;border:1px solid #677397;border-radius:4px;display:grid;place-items:center;flex:none;color:#fff;font-size:11px;background:transparent;cursor:pointer}
.selected .check-box{background:#7431f2;border-color:#7431f2}
.project-body{flex:1;min-width:0}
.project-body b{font-size:13px}
.project-body>p{font-size:12px;color:#aeb8d0;margin:5px 0}
.order-actions{display:flex;gap:6px;margin-top:6px}
.skill-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.skill-card{text-align:left;border:1px solid #35416a;border-radius:8px;background:#171e3a;color:#bbc4df;padding:10px;cursor:pointer}
.skill-card.picked{border-color:#783cff;background:#29205b;color:#d7ceff}
.skill-top{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px;font-size:12px}
.score-row small{font-size:11px;color:#9aa3c7}
.score-row i{display:block;height:5px;background:#293555;border-radius:5px;overflow:hidden;margin-top:5px}
.score-row u{display:block;height:100%;background:linear-gradient(90deg,#7837ff,#17d2e9)}
.field-label{display:block;font-size:11px;color:#b8c1dc;margin:0 0 12px}
.field-label textarea,.field-label input,.field-label select{display:block;width:100%;margin-top:6px;background:#18213e;border:1px solid #2e3c63;border-radius:6px;color:#e5e9fb;padding:10px;font-size:13px;outline:none}
.field-label small{display:block;margin-top:4px;color:#8f95b3}
.step-nav{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.finalizer{border-color:#4b31a0;background:linear-gradient(160deg,#1b1b48,#111a35 60%)}
.finalizer>span{font-size:10px;color:#15d7e9;font-weight:700}
.finalizer h3{font-size:15px;margin:10px 0 5px}
.finalizer>p{font-size:12px;line-height:1.45;color:#adb7d1}
.artifact-box{background:#171f3d;border:1px solid #2b3a63;border-radius:7px;padding:12px;margin:14px 0}
.artifact-box small{font-size:10px;color:#909cbb}
.artifact-box p{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#aeb8d2;margin:6px 0}
.artifact-box b{color:#d7dcf0}
.generate{width:100%;justify-content:center;padding:12px}
.draft{width:100%;margin-top:8px;background:#171f3d;border:1px solid #2d3a61;color:#c7cde2;padding:9px;border-radius:6px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.live-preview{display:flex;align-items:center;gap:6px;color:#8f9bb9;font-size:11px;margin-top:14px}
.preview{background:#18213e;border:1px solid #2e3b63;border-radius:8px;padding:18px}
.preview h2{font-size:20px;margin:0 0 4px}
.slug-line{font-size:12px;color:#16d5e7;margin:0 0 10px}
.preview>p,.bio{font-size:13px;line-height:1.55;color:#bfc8df}
.preview h3{font-size:13px;margin:16px 0 8px}
.preview li{font-size:12px;margin:6px 0;display:grid;gap:2px}
.preview li span{color:#9aa3c7}
.preview-tags{display:flex;flex-wrap:wrap;gap:6px}
.preview-tags span{background:#31236a;color:#d6caff;padding:5px 8px;border-radius:12px;font-size:11px}
.empty-copy{color:#aeb4d0;font-size:13px}
.linkish{border:0;background:transparent;color:#16d5e7;cursor:pointer;padding:0;font:inherit}
.banner-error,.banner-info,.banner-ok,.banner-ai,.banner-warn{padding:10px 12px;border-radius:8px;margin:0 0 12px;font-size:13px}
.banner-error{background:#3a1f2c;color:#ffb4b4}
.banner-info{background:#1f2a48;color:#c7cce2}
.banner-warn{background:#3a3218;color:#f0d48a;border:1px solid #6a5a2a}
.banner-ok{background:#143a34;color:#3cd4ae;border:1px solid #1a5a48}
.banner-ai{background:#2a2155;color:#d0b1ff;border:1px solid #6a49c7}
.error-actions{display:flex;gap:8px;margin-top:8px}
.sharing-panel{margin-top:4px}
.publish-toggle{display:flex;align-items:flex-start;gap:10px;margin:0 0 14px;cursor:pointer}
.publish-toggle input{margin-top:3px}
.publish-toggle b{display:block;font-size:13px;color:#e8eaff}
.publish-toggle small{display:block;font-size:11px;color:#aeb8d0;margin-top:3px}
.public-url-box{margin-bottom:12px}
.url-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.share-hint{display:flex;align-items:center;gap:6px;font-size:11px;color:#9aa3c7;margin:0 0 8px}
.overlay{position:fixed;inset:0;background:rgba(8,10,22,.72);display:grid;place-items:center;padding:18px;z-index:40}
.modal{width:min(420px,100%);background:#1c2038;border:1px solid #383c5e;border-radius:14px;padding:22px;position:relative}
.modal h2{margin:0 0 8px;font-size:18px;padding-right:28px}
.muted{color:#9aa0bd;font-size:13px;margin:0 0 14px;line-height:1.45}
.close{position:absolute;top:14px;right:14px;border:0;background:transparent;color:#c2c5d9;cursor:pointer}
.modal-actions{display:flex;justify-content:flex-end;gap:8px}
@media(max-width:900px){.pb-layout{grid-template-columns:1fr}.pb-side{order:-1}.skill-grid{grid-template-columns:1fr}.contact-grid{grid-template-columns:1fr}}
@media(max-width:600px){.pb-heading{flex-direction:column}.steps{grid-template-columns:1fr 1fr}}
</style>
