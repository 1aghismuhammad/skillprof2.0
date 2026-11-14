<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, BrainCircuit, Sparkles, CheckCircle2, Code2,
  LoaderCircle, ShieldCheck, CalendarDays, ExternalLink,
} from 'lucide-vue-next'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import AssessmentReviewCard from '../components/AssessmentReviewCard.vue'
import { useProjectStore } from '../stores/projects.js'
import { useSkillStore } from '../stores/skills.js'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const skillStore = useSkillStore()

const selectedId = ref(null)
const historyLoadingId = ref(null)
const bootError = ref('')
const contextError = ref('')
const queueError = ref('')
const historyError = ref('')
const elapsed = ref(0)
let elapsedTimer = null

const projects = computed(() => projectStore.projects)

const queryProjectId = computed(() => {
  const q = route.query.project
  return q != null && q !== '' ? String(q) : null
})

const projectNotFound = computed(() => {
  if (!queryProjectId.value) return false
  if (!projects.value.length) return false
  return !projects.value.some((p) => String(p.id) === queryProjectId.value)
})

const project = computed(() => {
  if (!projects.value.length) return null
  if (queryProjectId.value) {
    return projects.value.find((p) => String(p.id) === queryProjectId.value) || null
  }
  const match = projects.value.find((p) => String(p.id) === String(selectedId.value))
  return match || projects.value[0] || null
})

const projectId = computed(() => project.value?.id ?? null)

const isAnalyzing = computed(() => {
  const id = projectId.value
  return id != null && !!projectStore.analyzing[id]
})

const analysis = computed(() => {
  const id = projectId.value
  return id != null ? projectStore.lastAnalysis[id] || null : null
})

const analysisError = computed(() => {
  const id = projectId.value
  return id != null ? projectStore.analysisError[id] || null : null
})

const history = computed(() => {
  const id = projectId.value
  return id != null ? (projectStore.analysesByProject[id] || []) : []
})

const pendingForProject = computed(() => {
  const id = projectId.value
  if (id == null) return []
  return skillStore.pendingAssessments.filter(
    (a) => Number(a.project_id) === Number(id),
  )
})

const descriptionOk = computed(() => {
  const desc = (project.value?.description || '').trim()
  return desc.length > 0 && desc.length <= 4000
})

const canAnalyze = computed(() => !!project.value && descriptionOk.value && !isAnalyzing.value)

const loadingMessage = computed(() => {
  if (elapsed.value <= 5) return 'Mengirim proyek ke AI…'
  if (elapsed.value <= 20) return 'Mengekstrak kandidat skill dari deskripsi & bukti…'
  return 'Provider AI lambat; sistem mencoba ulang otomatis (maks. ~90 detik)…'
})

const statusLabel = computed(() => {
  if (isAnalyzing.value) return 'Sedang dianalisis'
  if (history.value.length > 0 || analysis.value) return 'Sudah dianalisis'
  return 'Siap dianalisis'
})

const uncataloged = computed(() => {
  const list = analysis.value?.uncataloged_skills
  return Array.isArray(list) ? list : []
})

const skillsResult = computed(() => {
  const list = analysis.value?.skills
  return Array.isArray(list) ? list : []
})

function syncSelectionFromRoute() {
  const q = route.query.project
  if (q != null && q !== '') {
    selectedId.value = String(q)
    return
  }
  if (projects.value.length) {
    selectedId.value = String(projects.value[0].id)
  }
}

function onSelectProject(event) {
  const id = event.target.value
  selectedId.value = id
  contextError.value = ''
  historyError.value = ''
  router.replace({ path: '/ai-skill-analyzer', query: { project: id } })
}

async function loadContextForProject(id) {
  if (id == null) return
  contextError.value = ''
  await projectStore.fetchAnalyses(id)
  const list = projectStore.analysesByProject[id] || []
  if (list.length && !projectStore.lastAnalysis[id]) {
    const newest = list.reduce((a, b) => (a.id > b.id ? a : b))
    await projectStore.fetchAnalysis(id, newest.id)
  }
}

async function reloadHistory() {
  if (projectId.value == null) return
  historyError.value = ''
  try {
    await loadContextForProject(projectId.value)
  } catch (err) {
    contextError.value = err?.message || 'Gagal memuat riwayat analisis.'
  }
}

async function bootstrap() {
  bootError.value = ''
  contextError.value = ''
  queueError.value = ''
  try {
    if (!projectStore.projects.length) {
      await projectStore.fetchProjects()
    }
    syncSelectionFromRoute()
    const results = await Promise.allSettled([
      projectNotFound.value ? Promise.resolve() : loadContextForProject(projectId.value),
      skillStore.fetchPendingAssessments(),
    ])
    if (results[0].status === 'rejected') {
      contextError.value = results[0].reason?.message || 'Gagal memuat riwayat analisis.'
    }
    if (results[1].status === 'rejected') {
      queueError.value = results[1].reason?.message || 'Gagal memuat antrian tinjauan.'
    }
  } catch (err) {
    bootError.value = err?.message || 'Gagal memuat data analyzer.'
  }
}

async function startAnalysis() {
  if (!canAnalyze.value || projectId.value == null) return
  await projectStore.analyzeProject(projectId.value)
}

async function openHistory(item) {
  if (!projectId.value) return
  historyLoadingId.value = item.id
  historyError.value = ''
  try {
    await projectStore.fetchAnalysis(projectId.value, item.id)
  } catch (err) {
    historyError.value = err?.message || 'Gagal memuat detail riwayat.'
  } finally {
    historyLoadingId.value = null
  }
}

function backToProjects() {
  router.push('/projects')
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function clearElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

watch(
  () => [projectId.value, projectStore.analyzing[projectId.value]],
  async ([id, startedAt], prev) => {
    clearElapsedTimer()
    if (startedAt) {
      elapsed.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      elapsedTimer = setInterval(() => {
        elapsed.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      }, 1000)
    } else {
      elapsed.value = 0
    }
    if (id != null && id !== prev?.[0]) {
      try {
        await loadContextForProject(id)
      } catch (err) {
        contextError.value = err?.message || 'Gagal memuat riwayat analisis.'
      }
    }
  },
)

watch(
  () => route.query.project,
  () => {
    syncSelectionFromRoute()
  },
)

onMounted(bootstrap)
onUnmounted(clearElapsedTimer)
</script>

<template>
  <WorkspaceLayout active="analyzer">
    <div class="analyzer-view">
      <button class="back-link" type="button" @click="backToProjects">
        <ArrowLeft :size="15" /> Back to My Projects
      </button>

      <div class="page-heading">
        <div>
          <h1>AI Skill <span>Analyzer</span></h1>
          <p>Analisis proyek Anda untuk menemukan kandidat skill yang perlu ditinjau.</p>
        </div>
        <div class="ai-heading-icon"><BrainCircuit :size="24" /></div>
      </div>

      <p v-if="bootError" class="banner-error" role="alert">{{ bootError }}</p>

      <section v-if="projectNotFound" class="missing-project" role="alert">
        <BrainCircuit :size="36" />
        <h2>Proyek tidak ditemukan</h2>
        <p>
          ID proyek <strong>{{ queryProjectId }}</strong> tidak ada di daftar proyek Anda.
          Pilih proyek valid di bawah atau kembali ke My Projects.
        </p>
        <label v-if="projects.length" class="project-picker">
          Pilih proyek valid
          <select value="" @change="onSelectProject">
            <option value="" disabled>Pilih proyek…</option>
            <option v-for="p in projects" :key="p.id" :value="String(p.id)">
              {{ p.title }}
            </option>
          </select>
        </label>
        <button type="button" class="primary-action" @click="backToProjects">Back to My Projects</button>
      </section>

      <template v-else-if="project">
        <section class="analyzer-project-card">
          <div class="analyzer-project-image"><Code2 :size="38" /></div>
          <div class="analyzer-project-description">
            <label class="project-picker">
              Pilih proyek
              <select :value="String(project.id)" @change="onSelectProject">
                <option v-for="p in projects" :key="p.id" :value="String(p.id)">
                  {{ p.title }}
                </option>
              </select>
            </label>
            <p>{{ project.description || 'Belum ada deskripsi.' }}</p>
          </div>
          <div class="analyzer-project-status">
            <small>Status</small>
            <span :class="history.length || analysis ? 'is-analyzed' : 'is-ready'">
              <CheckCircle2 :size="14" />{{ statusLabel }}
            </span>
            <small class="updated-label"><CalendarDays :size="13" /> Dibuat</small>
            <small>{{ formatDate(project.created_at) }}</small>
          </div>
          <div class="analyzer-project-action">
            <button type="button" :disabled="!canAnalyze" @click="startAnalysis">
              <LoaderCircle v-if="isAnalyzing" class="spin" :size="16" />
              <Sparkles v-else :size="16" />
              {{ isAnalyzing ? 'Menganalisis…' : 'Start AI Analysis' }}
            </button>
          </div>
        </section>

        <p v-if="!descriptionOk" class="banner-warn" role="status">
          Deskripsi proyek kosong atau melebihi 4000 karakter.
          <button type="button" class="inline-link" @click="router.push('/projects')">
            Lengkapi Deskripsi di My Projects
          </button>
        </p>

        <p v-if="contextError" class="banner-error" role="alert">
          {{ contextError }}
          <button type="button" class="inline-link" @click="reloadHistory">Muat ulang riwayat</button>
        </p>
        <p v-if="queueError" class="banner-error" role="alert">{{ queueError }}</p>

        <section v-if="isAnalyzing" class="running-panel" aria-live="polite">
          <LoaderCircle class="spin" :size="22" />
          <div>
            <strong>{{ elapsed }}s</strong>
            <p>{{ loadingMessage }}</p>
            <small>Anda boleh berpindah halaman. Analisis tetap berjalan.</small>
          </div>
        </section>

        <p v-if="analysisError" class="banner-error" role="alert">
          {{ analysisError.message }}
          <button
            v-if="analysisError.status === 0"
            type="button"
            class="inline-link"
            @click="reloadHistory"
          >
            Muat ulang riwayat
          </button>
          <button
            v-else-if="analysisError.status !== 400 && analysisError.status !== 503"
            type="button"
            class="inline-link"
            :disabled="isAnalyzing || !descriptionOk"
            @click="startAnalysis"
          >
            Coba lagi
          </button>
          <button
            v-if="analysisError.status === 400"
            type="button"
            class="inline-link"
            @click="router.push('/projects')"
          >
            Edit proyek
          </button>
        </p>

        <section v-if="analysis" class="analysis-results">
          <div class="results-heading">
            <div>
              <p class="eyebrow">HASIL ANALISIS</p>
              <h2>{{ analysis.summary || 'Ringkasan analisis' }}</h2>
            </div>
          </div>
          <p v-if="analysis.feedback" class="feedback">{{ analysis.feedback }}</p>

          <div class="result-grid">
            <article v-for="(skill, index) in skillsResult" :key="`${skill.skill_name}-${index}`" class="result-skill-card">
              <div class="result-skill-top">
                <span class="result-number">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="result-score">{{ skill.score ?? '—' }}</span>
              </div>
              <h3>{{ skill.skill_name }}</h3>
              <p>{{ skill.category || '—' }} · {{ skill.proficiency_level || '—' }}</p>
              <small v-if="skill.reasoning"><ShieldCheck :size="13" /> {{ skill.reasoning }}</small>
              <small v-if="skill.evidence" class="evidence">{{ skill.evidence }}</small>
            </article>
          </div>

          <p v-if="uncataloged.length" class="uncataloged">
            Skill di luar katalog (tidak disimpan):
            {{ uncataloged.map((s) => (typeof s === 'string' ? s : s?.name || s?.skill_name)).filter(Boolean).join(', ') }}
          </p>
        </section>

        <section class="review-section">
          <h2>Antrian tinjauan untuk proyek ini</h2>
          <p class="section-sub">Rekomendasi AI menunggu keputusan Anda (human-in-the-loop).</p>
          <div v-if="pendingForProject.length" class="review-list">
            <AssessmentReviewCard
              v-for="item in pendingForProject"
              :key="item.id"
              :assessment="item"
            />
          </div>
          <p v-else-if="!queueError" class="empty-copy">Tidak ada assessment pending untuk proyek ini.</p>
        </section>

        <section class="history-section">
          <h2>Riwayat analisis</h2>
          <p v-if="historyError" class="banner-error" role="alert">{{ historyError }}</p>
          <ul v-if="history.length" class="history-list">
            <li v-for="item in history" :key="item.id">
              <button type="button" @click="openHistory(item)">
                <div>
                  <strong>{{ formatDate(item.created_at) }}</strong>
                  <span>{{ item.total_skills ?? '—' }} skill · {{ item.status || 'completed' }}</span>
                </div>
                <span class="history-action">
                  {{ historyLoadingId === item.id ? 'Memuat…' : 'Lihat detail' }}
                </span>
              </button>
            </li>
          </ul>
          <p v-else-if="!contextError" class="empty-copy">Belum ada riwayat analisis.</p>
        </section>

        <div class="results-actions">
          <button type="button" class="secondary-action" @click="backToProjects">Back to My Projects</button>
          <button type="button" class="primary-action" @click="router.push('/skill-profile')">
            View Skill Profile <ExternalLink :size="15" />
          </button>
        </div>
      </template>

      <section v-else class="no-project">
        <BrainCircuit :size="42" />
        <h2>Belum ada proyek untuk dianalisis</h2>
        <p>Tambahkan proyek terlebih dahulu di My Projects.</p>
        <button type="button" @click="router.push('/projects')">Go to My Projects</button>
      </section>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.analyzer-view{color:#f4f5ff}
.back-link{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:#b9c1df;font-size:12px;padding:0;margin:0 0 12px;cursor:pointer}
.page-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.page-heading h1{font-size:25px;margin:0 0 6px}
.page-heading h1 span{color:#a56aff}
.page-heading p{font-size:15px;color:#c0c4d9;margin:0}
.ai-heading-icon{width:42px;height:42px;border-radius:10px;background:#43318a;color:#c4a4ff;display:grid;place-items:center}
.analyzer-project-card{display:grid;grid-template-columns:92px minmax(180px,1fr) 145px 175px;align-items:center;gap:14px;padding:12px;background:#242a49;border:1px solid #3c456f;border-radius:10px;min-height:112px}
.analyzer-project-image{width:92px;height:92px;border-radius:8px;background:linear-gradient(145deg,#e5eaf5,#9eabc9);color:#435a92;display:grid;place-items:center}
.analyzer-project-description{min-width:0}
.project-picker{display:block;font-size:11px;color:#aab2d1;margin-bottom:8px}
.project-picker select{display:block;width:100%;margin-top:4px;border:1px solid #4a506f;border-radius:7px;background:#15182d;color:#fff;padding:8px 10px;font-size:13px}
.analyzer-project-description p{font-size:11px;line-height:1.45;color:#c0c4d9;margin:0;white-space:pre-wrap}
.analyzer-project-status{height:76px;border-left:1px solid #41486d;padding-left:14px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px}
.analyzer-project-status small{font-size:10px;color:#b9bfd7}
.analyzer-project-status>span{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:12px;font-size:10px}
.is-ready{background:#174c55;color:#39d3c3}
.is-analyzed{background:#155a50;color:#40d9b1}
.updated-label{display:flex;align-items:center;gap:5px;margin-top:5px}
.analyzer-project-action{display:flex;justify-content:center;border-left:1px solid #41486d;padding-left:12px}
.analyzer-project-action button,.no-project button{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px 15px;border:0;border-radius:6px;background:linear-gradient(110deg,#5144ed,#8738f5);color:white;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}
.analyzer-project-action button:disabled{opacity:.55;cursor:not-allowed}
.running-panel{display:flex;gap:12px;align-items:flex-start;margin:16px 0;padding:14px;border-radius:10px;background:#1c2341;border:1px solid #3b456e}
.running-panel p{margin:4px 0;font-size:13px;color:#c8cbe0}
.running-panel small{color:#8e97c0;font-size:11px}
.banner-error,.banner-warn{padding:10px 12px;border-radius:8px;margin:12px 0;font-size:13px}
.banner-error{background:#3a1f2c;color:#ffb4b4}
.banner-warn{background:#3a3148;color:#e4d4ff}
.inline-link{margin-left:8px;border:0;background:transparent;color:#b58aff;font-weight:700;cursor:pointer;font-size:12px}
.analysis-results,.review-section,.history-section{margin-top:22px;padding:18px;background:#242a49;border:1px solid #3c456f;border-radius:10px}
.results-heading{margin-bottom:12px}
.eyebrow{font-size:9px;letter-spacing:1.2px;color:#8e97c0;margin:0 0 5px}
.results-heading h2,.review-section h2,.history-section h2{margin:0 0 6px;font-size:17px}
.feedback{margin:0 0 14px;color:#c8cbe0;font-size:13px;line-height:1.55;white-space:pre-wrap}
.result-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.result-skill-card{padding:13px;border:1px solid #3b456e;border-radius:8px;background:#1c2341}
.result-skill-top{display:flex;justify-content:space-between;color:#8f9bcb;font-size:10px}
.result-score{color:#32c9b0}
.result-skill-card h3{font-size:13px;margin:12px 0 5px}
.result-skill-card p{font-size:10px;color:#aab2d1;margin:0 0 10px}
.result-skill-card small{display:flex;align-items:flex-start;gap:5px;color:#49cbb4;font-size:10px;line-height:1.4}
.result-skill-card .evidence{color:#aab2d1;margin-top:6px}
.uncataloged{margin:14px 0 0;font-size:12px;color:#d5bd80}
.section-sub,.empty-copy{margin:0 0 12px;color:#aab2d1;font-size:12px}
.review-list{display:grid;gap:12px}
.history-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.history-list button{width:100%;display:flex;justify-content:space-between;gap:12px;align-items:center;text-align:left;border:1px solid #3b456e;background:#1c2341;color:#e8eaff;border-radius:8px;padding:12px;cursor:pointer}
.history-list strong{display:block;font-size:13px;margin-bottom:3px}
.history-list span{font-size:11px;color:#aab2d1}
.history-action{color:#b58aff;font-size:12px;font-weight:700;white-space:nowrap}
.results-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:17px}
.secondary-action,.primary-action{height:35px;padding:0 12px;border-radius:6px;font-size:11px;display:flex;align-items:center;gap:7px;cursor:pointer}
.secondary-action{border:1px solid #596184;background:transparent;color:#e1e4f2}
.primary-action{border:0;background:#6739ec;color:#fff}
.no-project,.missing-project{min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#aeb7dc;gap:10px;padding:24px;background:#242a49;border:1px solid #3c456f;border-radius:10px}
.no-project h2,.missing-project h2{color:#fff;font-size:19px;margin:0}
.missing-project .project-picker{width:min(360px,100%);text-align:left}
.missing-project .primary-action{margin-top:8px}
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:900px){.analyzer-project-card{grid-template-columns:80px 1fr 140px}.analyzer-project-action{grid-column:2/4;justify-content:flex-start;border:0;padding:0}.result-grid{grid-template-columns:1fr 1fr}}
@media(max-width:650px){.analyzer-project-card{grid-template-columns:1fr}.analyzer-project-status,.analyzer-project-action{border:0;padding:0}.result-grid{grid-template-columns:1fr}}
</style>
