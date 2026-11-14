<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useProjectStore } from '../stores/projects.js'
import { useSkillStore } from '../stores/skills.js'
import { useCareerStore } from '../stores/career.js'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import {
  FolderKanban, BrainCircuit, ChartNoAxesColumnIncreasing,
  Award, BriefcaseBusiness, ChevronRight, Plus, Target,
  ShieldCheck, UserRound, Eye,
} from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()
const projectsStore = useProjectStore()
const skillsStore = useSkillStore()
const careerStore = useCareerStore()

const userName = computed(() => auth.user?.name || 'Student')

const projectsError = ref('')
const skillsError = ref('')
const pendingError = ref('')
const careerError = ref('')
const loadingProjects = ref(false)
const loadingSkills = ref(false)
const loadingPending = ref(false)
const loadingCareer = ref(false)

const projectCount = computed(() => projectsStore.projects?.length || 0)
const recentProjects = computed(() => {
  const list = [...(projectsStore.projects || [])]
  list.sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime()
    const tb = new Date(b.created_at || 0).getTime()
    return tb - ta
  })
  return list.slice(0, 3)
})

const summary = computed(() => skillsStore.progress?.summary || null)
const activeSkillsCount = computed(() => summary.value?.total_active_skills ?? 0)
const averageScore = computed(() => summary.value?.average_score)

const pendingTotal = computed(() => skillsStore.pendingTotal || 0)

const selectedTarget = computed(() =>
  careerStore.targets.find((t) => t.id === careerStore.selectedTargetId) || null,
)
const targetProgress = computed(() =>
  careerStore.selectedTargetId != null
    ? careerStore.targetProgressByTarget[careerStore.selectedTargetId] || null
    : null,
)
const readiness = computed(() => targetProgress.value?.readiness_percentage)

const topSkills = computed(() => {
  const list = Array.isArray(skillsStore.progress?.active_skills)
    ? [...skillsStore.progress.active_skills]
    : []
  return list
    .filter((s) => s.score != null && !Number.isNaN(Number(s.score)))
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, 5)
})

const quickActions = [
  { title: 'Add New Project', description: 'Document your work and get AI analysis.', icon: Plus, color: 'purple', to: '/projects' },
  { title: 'Analyze My Skills', description: 'Let AI find your skills from existing projects.', icon: BrainCircuit, color: 'blue', to: '/ai-skill-analyzer' },
  { title: 'View Skill Gap', description: 'Discover what skills to develop next.', icon: Target, color: 'teal', to: '/skill-gap-analysis' },
  { title: 'Build My Portfolio', description: 'Showcase your best work to the world.', icon: BriefcaseBusiness, color: 'violet', to: '/portfolio' },
]

function formatScore(value) {
  return value == null || value === '' ? '—' : String(value)
}

function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${Number(value)}%`
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function scoreWidth(score) {
  const n = Math.max(0, Math.min(100, Number(score)))
  return `${Number.isNaN(n) ? 0 : n}%`
}

function navigate(path) {
  router.push(path)
}

async function loadProjectsWidget() {
  loadingProjects.value = true
  projectsError.value = ''
  try {
    await projectsStore.fetchProjects()
  } catch (err) {
    projectsError.value = err?.message || 'Gagal memuat proyek.'
  } finally {
    loadingProjects.value = false
  }
}

async function loadSkillsWidget() {
  loadingSkills.value = true
  skillsError.value = ''
  try {
    await skillsStore.fetchProgress()
  } catch (err) {
    skillsError.value = err?.message || 'Gagal memuat skill.'
  } finally {
    loadingSkills.value = false
  }
}

async function loadPendingWidget() {
  loadingPending.value = true
  pendingError.value = ''
  try {
    await skillsStore.fetchPendingAssessments()
  } catch (err) {
    pendingError.value = err?.message || 'Gagal memuat antrian tinjauan.'
  } finally {
    loadingPending.value = false
  }
}

async function loadCareerWidget() {
  loadingCareer.value = true
  careerError.value = ''
  try {
    await careerStore.fetchTargets()
    if (careerStore.selectedTargetId != null) {
      await careerStore.fetchTargetProgress(careerStore.selectedTargetId)
    }
  } catch (err) {
    careerError.value = err?.message || 'Gagal memuat kesiapan karier.'
  } finally {
    loadingCareer.value = false
  }
}

function bootstrap() {
  // Fire independently so each widget updates as soon as its own request settles.
  loadProjectsWidget()
  loadSkillsWidget()
  loadPendingWidget()
  loadCareerWidget()
}

onMounted(bootstrap)
</script>

<template>
  <WorkspaceLayout active="dashboard">
    <div class="dashboard-content">
      <div class="welcome-row">
        <div>
          <p class="eyebrow">STUDENT WORKSPACE</p>
          <h1>Welcome Back, <span>{{ userName }}!</span></h1>
          <p class="welcome-subtitle">Ringkasan proyek, kompetensi, antrian tinjauan, dan kesiapan karier Anda.</p>
        </div>
        <button class="outline-action" type="button" @click="navigate('/my-profile')"><UserRound :size="16" /> View Profile</button>
      </div>

      <section class="stats-grid">
        <article class="stat-card">
          <div class="stat-icon tone-purple"><FolderKanban :size="19" /></div>
          <div class="stat-copy">
            <p>Total Projects</p>
            <template v-if="loadingProjects">
              <strong class="loading-placeholder">…</strong>
              <small>Memuat proyek…</small>
            </template>
            <template v-else>
              <strong>{{ projectsError ? '—' : projectCount }}</strong>
              <small v-if="projectsError" class="err">{{ projectsError }}</small>
              <small v-else>{{ recentProjects.length }} terbaru ditampilkan</small>
            </template>
          </div>
        </article>

        <article class="stat-card">
          <div class="stat-icon tone-blue"><BrainCircuit :size="19" /></div>
          <div class="stat-copy">
            <p>Active Skills</p>
            <template v-if="loadingSkills">
              <strong class="loading-placeholder">…</strong>
              <small>Memuat skill…</small>
            </template>
            <template v-else>
              <strong>{{ skillsError ? '—' : activeSkillsCount }}</strong>
              <small v-if="skillsError" class="err">{{ skillsError }}</small>
              <small v-else>Rata-rata skor {{ formatScore(averageScore) }}</small>
            </template>
          </div>
        </article>

        <article class="stat-card clickable" @click="navigate('/skill-profile#review')">
          <div class="stat-icon tone-teal"><ShieldCheck :size="19" /></div>
          <div class="stat-copy">
            <p>Menunggu Tinjauan</p>
            <template v-if="loadingPending">
              <strong class="loading-placeholder">…</strong>
              <small>Memuat antrian…</small>
            </template>
            <template v-else>
              <strong>{{ pendingError ? '—' : pendingTotal }}</strong>
              <small v-if="pendingError" class="err">{{ pendingError }}</small>
              <small v-else class="positive">Tinjau sekarang →</small>
            </template>
          </div>
        </article>

        <article
          class="stat-card"
          :class="{ clickable: !loadingCareer && !selectedTarget }"
          @click="!loadingCareer && !selectedTarget && navigate('/skill-gap-analysis')"
        >
          <div class="stat-icon tone-violet"><ChartNoAxesColumnIncreasing :size="19" /></div>
          <div class="stat-copy">
            <p>Kesiapan Karier</p>
            <template v-if="loadingCareer">
              <strong class="loading-placeholder">…</strong>
              <small>Memuat kesiapan…</small>
            </template>
            <template v-else-if="careerError">
              <strong>—</strong>
              <small class="err">{{ careerError }}</small>
            </template>
            <template v-else-if="!selectedTarget">
              <strong>—</strong>
              <small class="positive">Buat Target Karier →</small>
            </template>
            <template v-else>
              <strong>{{ formatPct(readiness) }}</strong>
              <small>{{ selectedTarget.title }}</small>
            </template>
          </div>
          <div v-if="!loadingCareer && selectedTarget && readiness != null" class="stat-progress">
            <div :style="{ width: scoreWidth(readiness) }"></div>
          </div>
        </article>
      </section>

      <section class="overview-grid">
        <article class="panel skills-panel">
          <div class="panel-heading">
            <div>
              <h2>Top 5 Skills</h2>
              <p>Skill aktif dengan skor tertinggi</p>
            </div>
            <button class="text-action" type="button" @click="navigate('/skill-profile')">
              View All <ChevronRight :size="14" />
            </button>
          </div>
          <p v-if="loadingSkills" class="banner-info">Memuat skill…</p>
          <p v-else-if="skillsError" class="banner-error" role="alert">{{ skillsError }}</p>
          <div v-else-if="!topSkills.length" class="empty-copy">Belum ada skill ber-skor untuk ditampilkan.</div>
          <div v-else class="skill-list">
            <div v-for="skill in topSkills" :key="skill.skill_id" class="skill-row">
              <div class="skill-icon skill-purple"><Award :size="16" /></div>
              <div class="skill-info">
                <div class="skill-label">
                  <span>{{ skill.skill_name }}</span>
                  <strong>{{ formatScore(skill.score) }}</strong>
                </div>
                <div class="progress-track">
                  <div class="bar-purple" :style="{ width: scoreWidth(skill.score) }"></div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article class="panel projects-panel">
          <div class="panel-heading">
            <div>
              <h2>Recent Projects</h2>
              <p>Tiga proyek terbaru Anda</p>
            </div>
            <button class="text-action" type="button" @click="navigate('/projects')">
              View All <ChevronRight :size="14" />
            </button>
          </div>
          <p v-if="loadingProjects" class="banner-info">Memuat proyek…</p>
          <p v-else-if="projectsError" class="banner-error" role="alert">{{ projectsError }}</p>
          <div v-else-if="!recentProjects.length" class="empty-copy">Belum ada proyek. Tambahkan proyek pertama Anda.</div>
          <div v-else class="recent-list">
            <div v-for="project in recentProjects" :key="project.id" class="recent-project">
              <div class="project-icon"><FolderKanban :size="19" /></div>
              <div class="project-info">
                <strong>{{ project.title }}</strong>
                <span>{{ project.description ? String(project.description).slice(0, 80) : 'Tanpa deskripsi' }}</span>
                <small>{{ formatDate(project.created_at) }}</small>
              </div>
              <button class="view-project" type="button" aria-label="View project" @click="navigate('/projects')">
                <ChevronRight :size="16" />
              </button>
            </div>
          </div>
        </article>
      </section>

      <section class="quick-panel">
        <div class="panel-heading quick-heading">
          <div>
            <h2>Quick Actions</h2>
            <p>Lanjut ke alur utama SkillProof</p>
          </div>
        </div>
        <div class="quick-grid">
          <button
            v-for="action in quickActions"
            :key="action.title"
            type="button"
            class="quick-card"
            :class="`quick-${action.color}`"
            @click="navigate(action.to)"
          >
            <div class="quick-icon"><component :is="action.icon" :size="19" /></div>
            <div class="quick-copy">
              <strong>{{ action.title }}</strong>
              <span>{{ action.description }}</span>
            </div>
            <ChevronRight class="quick-arrow" :size="17" />
          </button>
        </div>
      </section>

      <div class="dashboard-footer">
        <span>© 2026 SkillProof Student Platform</span>
        <span><Eye :size="13" /> Data diperbarui dari API kompetensi & proyek</span>
      </div>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.dashboard-content{color:#f5f6ff;font-family:Arial,Helvetica,sans-serif}
.welcome-row{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:24px}.eyebrow{margin:0 0 8px;color:#858bb2;font-size:9px;font-weight:700;letter-spacing:1.4px}.welcome-row h1{margin:0;font-size:26px;line-height:1.2;font-weight:700}.welcome-row h1 span{color:#a56aff}.welcome-subtitle{margin:8px 0 0;color:#b9bdd3;font-size:13px}.outline-action{height:34px;padding:0 12px;border:1px solid #4b527b;border-radius:6px;background:#222642;color:#e5e6f2;display:flex;align-items:center;gap:7px;font-size:11px;cursor:pointer}.outline-action:hover{border-color:#9a58ff}
.stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:20px}.stat-card{position:relative;min-height:91px;background:#252a4a;border:1px solid #3b426c;border-radius:11px;padding:15px;display:flex;align-items:flex-start;gap:11px;overflow:hidden}.stat-card.clickable{cursor:pointer}.stat-icon{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex:none}.tone-purple{background:#5434a4;color:#c9a5ff}.tone-blue{background:#243c9b;color:#76a7ff}.tone-teal{background:#176b71;color:#66e2d5}.tone-violet{background:#51328d;color:#d3a1ff}.stat-copy{min-width:0}.stat-copy p{font-size:10px;color:#c4c8dd;margin:0 0 5px}.stat-copy strong{display:block;font-size:23px;line-height:1.1}.stat-copy small{display:block;margin-top:5px;font-size:9px;color:#8991b8}.stat-copy small.positive{color:#26c6a0}.stat-copy small.err{color:#ff9e9e}.loading-placeholder{opacity:.55}.stat-progress{position:absolute;bottom:0;left:0;right:0;height:4px;background:#414766}.stat-progress div{height:100%;background:linear-gradient(90deg,#7048ee,#b04cff);border-radius:0 5px 5px 0}
.overview-grid{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.25fr);gap:16px;margin-bottom:18px}.panel,.quick-panel{background:#242946;border:1px solid #39416b;border-radius:11px;padding:17px}.panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:17px}.panel-heading h2{font-size:15px;margin:0 0 5px}.panel-heading p{font-size:10px;color:#9fa5c4;margin:0}.text-action{display:flex;align-items:center;gap:2px;background:transparent;border:0;color:#8c9cff;font-size:10px;white-space:nowrap;cursor:pointer}.skill-list{display:flex;flex-direction:column;gap:15px}.skill-row{display:flex;align-items:center;gap:10px}.skill-icon{width:29px;height:29px;border-radius:7px;display:grid;place-items:center;flex:none}.skill-purple{background:#433078;color:#b999ff}.skill-info{flex:1;min-width:0}.skill-label{display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;font-size:10px;color:#d7d9e8}.skill-label strong{font-size:10px;color:#e9eaff}.progress-track{height:7px;border-radius:8px;background:#414662;overflow:hidden}.progress-track div{height:100%;border-radius:8px}.bar-purple{background:#9250ec}
.recent-list{display:flex;flex-direction:column}.recent-project{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #363d61}.recent-project:first-child{border-top:0;padding-top:0}.project-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:8px;background:#333b69;color:#b9c4ff;flex:none}.project-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}.project-info strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.project-info span{font-size:9px;color:#aeb4d0}.project-info small{font-size:8px;color:#828bad}.view-project{background:transparent;border:0;color:#aeb6d7;cursor:pointer}
.quick-panel{padding:17px}.quick-heading{margin-bottom:14px}.quick-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.quick-card{min-height:76px;border:1px solid transparent;border-radius:8px;padding:11px;display:flex;align-items:flex-start;gap:9px;text-align:left;color:#fff;cursor:pointer;transition:.18s}.quick-card:hover{transform:translateY(-2px);filter:brightness(1.12)}.quick-purple{background:#42358b;border-color:#5a4ba7}.quick-blue{background:#203c7b;border-color:#31539a}.quick-teal{background:#145c59;border-color:#267c73}.quick-violet{background:#4a317b;border-color:#69469e}.quick-icon{width:29px;height:29px;display:grid;place-items:center;background:#ffffff18;border-radius:7px;flex:none}.quick-copy{display:flex;flex-direction:column;gap:5px;min-width:0}.quick-copy strong{font-size:10px}.quick-copy span{font-size:8px;line-height:1.4;color:#d1d5eb}.quick-arrow{margin-left:auto;flex:none;color:#d6d8ee}.dashboard-footer{display:flex;justify-content:space-between;gap:12px;margin-top:18px;color:#777f9f;font-size:9px}.dashboard-footer span:last-child{display:flex;align-items:center;gap:5px}
.banner-info,.banner-error,.empty-copy{font-size:12px;margin:0 0 12px}.banner-info{padding:10px 12px;border-radius:8px;background:#1f2a48;color:#c7cce2}.banner-error{padding:10px 12px;border-radius:8px;background:#3a1f2c;color:#ffb4b4}.empty-copy{color:#9aa3c7}
@media(max-width:1050px){.stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.welcome-row{align-items:flex-start}.welcome-row h1{font-size:21px}.welcome-subtitle{font-size:11px;line-height:1.5}.outline-action{font-size:0;padding:0 9px}.overview-grid{grid-template-columns:1fr}.dashboard-footer{flex-direction:column}}
@media(max-width:480px){.stats-grid{gap:8px}.stat-card{padding:11px;min-height:82px;gap:8px}.stat-copy p{font-size:9px}.stat-copy strong{font-size:20px}.quick-grid{grid-template-columns:1fr}.welcome-row h1{font-size:18px}.welcome-subtitle{max-width:270px}}
</style>
