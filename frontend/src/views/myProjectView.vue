<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../stores/projects.js'
import { isHttpUrl } from '../lib/url.js'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import {
  FolderKanban, BrainCircuit, Search, Plus, Filter, ChevronDown,
  ChevronRight, MoreVertical, Code2, X, ExternalLink, Trash2, Pencil,
} from 'lucide-vue-next'

const EVIDENCE_TYPES = ['repository', 'demo', 'document', 'certificate', 'other']
const FILTERS = [
  { id: 'all', label: 'Semua Proyek' },
  { id: 'analyzed', label: 'Sudah Dianalisis' },
  { id: 'pending', label: 'Belum Dianalisis' },
]

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()

const searchQuery = ref('')
const selectedFilter = ref('all')
const showFilter = ref(false)
const showAddModal = ref(false)
const isEditing = ref(false)
const editingProjectId = ref(null)
const showDetailModal = ref(false)
const selectedProject = ref(null)
const selectedEvidences = ref([])
const openMenuId = ref(null)
const currentPage = ref(1)
const perPage = 4
const loadingList = ref(false)
const listError = ref('')
const saving = ref(false)
const formError = ref('')
const formErrors = ref([])
const detailLoading = ref(false)
const detailError = ref('')
const analysesErrorMap = ref({})

function emptyEvidence() {
  return { title: '', evidence_type: 'repository', url: '' }
}

const form = ref({
  title: '',
  description: '',
  repository_url: '',
  live_url: '',
  start_date: '',
  end_date: '',
  evidences: [emptyEvidence()],
})

const analysisCount = (projectId) => {
  const list = projectStore.analysesByProject[projectId]
  return Array.isArray(list) ? list.length : 0
}

const analysisStatusFailed = (projectId) => !!analysesErrorMap.value[projectId]

const statusLabel = (projectId) => {
  if (analysisStatusFailed(projectId)) return 'Gagal memuat status'
  const n = analysisCount(projectId)
  return n > 0 ? `Dianalisis ${n}×` : 'Belum Dianalisis'
}

const statusClass = (projectId) => {
  if (analysisStatusFailed(projectId)) return 'status-error'
  return analysisCount(projectId) > 0 ? 'status-analyzed' : 'status-pending'
}

const filteredProjects = computed(() => {
  const keyword = searchQuery.value.toLowerCase().trim()
  return projectStore.projects.filter((project) => {
    const searchable = [project.title, project.description].join(' ').toLowerCase()
    const matchesSearch = !keyword || searchable.includes(keyword)
    const failed = analysisStatusFailed(project.id)
    const analyzed = !failed && analysisCount(project.id) > 0
    const pending = !failed && !analyzed
    const matchesFilter =
      selectedFilter.value === 'all'
      || (selectedFilter.value === 'analyzed' && analyzed)
      || (selectedFilter.value === 'pending' && pending)
    return matchesSearch && matchesFilter
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredProjects.value.length / perPage)))

const visibleProjects = computed(() => {
  const start = (currentPage.value - 1) * perPage
  return filteredProjects.value.slice(start, start + perPage)
})

const isEmptyCatalog = computed(() => !loadingList.value && !listError.value && projectStore.projects.length === 0)

watch([searchQuery, selectedFilter], () => {
  currentPage.value = 1
})

async function loadProjects() {
  loadingList.value = true
  listError.value = ''
  analysesErrorMap.value = {}
  try {
    await projectStore.fetchProjects()
    // shortcut: N+1 per project on list page — upgrade via BE-GAP-04
    const ids = projectStore.projects.map((p) => p.id)
    const results = await Promise.allSettled(
      ids.map((id) => projectStore.fetchAnalyses(id)),
    )
    const nextErrors = { ...analysesErrorMap.value }
    results.forEach((result, index) => {
      const pid = ids[index]
      if (result.status === 'rejected') nextErrors[pid] = true
      else delete nextErrors[pid]
    })
    analysesErrorMap.value = nextErrors
  } catch (err) {
    listError.value = err?.message || 'Gagal memuat daftar proyek.'
  } finally {
    loadingList.value = false
  }
}

function resetForm() {
  form.value = {
    title: '',
    description: '',
    repository_url: '',
    live_url: '',
    start_date: '',
    end_date: '',
    evidences: [emptyEvidence()],
  }
  formError.value = ''
  formErrors.value = []
}

function openAddProject(prefill = {}) {
  resetForm()
  if (prefill.title) form.value.title = String(prefill.title).slice(0, 200)
  if (prefill.description) form.value.description = String(prefill.description).slice(0, 4000)
  isEditing.value = false
  editingProjectId.value = null
  showAddModal.value = true
}

function closeProjectForm() {
  showAddModal.value = false
  isEditing.value = false
  editingProjectId.value = null
  resetForm()
}

async function openProjectDetails(project) {
  openMenuId.value = null
  selectedProject.value = project
  selectedEvidences.value = []
  detailError.value = ''
  showDetailModal.value = true
  detailLoading.value = true
  try {
    const detail = await projectStore.fetchProject(project.id)
    selectedProject.value = detail
    selectedEvidences.value = Array.isArray(detail.evidences) ? detail.evidences : []
  } catch (err) {
    detailError.value = err?.message || 'Gagal memuat detail proyek.'
  } finally {
    detailLoading.value = false
  }
}

async function editProject(project) {
  openMenuId.value = null
  showDetailModal.value = false
  formError.value = ''
  formErrors.value = []
  try {
    const detail = await projectStore.fetchProject(project.id)
    form.value = {
      title: detail.title || '',
      description: detail.description || '',
      repository_url: detail.repository_url || '',
      live_url: detail.live_url || '',
      start_date: detail.start_date || '',
      end_date: detail.end_date || '',
      evidences: Array.isArray(detail.evidences) && detail.evidences.length
        ? detail.evidences.map((e) => ({
            title: e.title || '',
            evidence_type: e.evidence_type || 'other',
            url: e.url || '',
          }))
        : [emptyEvidence()],
    }
    isEditing.value = true
    editingProjectId.value = detail.id
    showAddModal.value = true
  } catch (err) {
    listError.value = err?.message || 'Gagal memuat proyek untuk diedit.'
  }
}

function addEvidenceRow() {
  if (form.value.evidences.length >= 10) return
  form.value.evidences.push(emptyEvidence())
}

function removeEvidenceRow(index) {
  form.value.evidences.splice(index, 1)
  if (!form.value.evidences.length) form.value.evidences.push(emptyEvidence())
}

function buildPayload() {
  const title = form.value.title.trim()
  const description = form.value.description.trim()
  const repository_url = form.value.repository_url.trim()
  const live_url = form.value.live_url.trim()
  const start_date = form.value.start_date || null
  const end_date = form.value.end_date || null

  if (!title || title.length > 200) {
    return { error: 'Judul wajib diisi (maksimal 200 karakter).' }
  }
  if (!description) {
    return { error: 'Deskripsi wajib diisi.' }
  }
  if (description.length > 4000) {
    return { error: 'Deskripsi maksimal 4000 karakter.' }
  }
  if (repository_url && !isHttpUrl(repository_url)) {
    return { error: 'URL repositori harus http/https yang valid.' }
  }
  if (live_url && !isHttpUrl(live_url)) {
    return { error: 'URL live harus http/https yang valid.' }
  }
  if (start_date && end_date && end_date < start_date) {
    return { error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' }
  }

  const evidences = []
  for (const row of form.value.evidences) {
    const etitle = (row.title || '').trim()
    const eurl = (row.url || '').trim()
    const etype = row.evidence_type || 'other'
    if (!etitle && !eurl) continue
    if (!etitle || etitle.length > 150) {
      return { error: 'Setiap bukti membutuhkan judul (maksimal 150 karakter).' }
    }
    if (!EVIDENCE_TYPES.includes(etype)) {
      return { error: 'Tipe bukti tidak valid.' }
    }
    if (!eurl || !isHttpUrl(eurl) || eurl.length > 500) {
      return { error: 'Setiap bukti membutuhkan URL http/https yang valid (maksimal 500 karakter).' }
    }
    evidences.push({ title: etitle, evidence_type: etype, url: eurl })
  }

  if (evidences.length > 10) {
    return { error: 'Maksimal 10 bukti pendukung.' }
  }

  return {
    payload: {
      title,
      description,
      repository_url: repository_url || null,
      live_url: live_url || null,
      start_date,
      end_date,
      evidences,
    },
  }
}

async function submitProject() {
  formError.value = ''
  formErrors.value = []
  const built = buildPayload()
  if (built.error) {
    formError.value = built.error
    return
  }

  saving.value = true
  try {
    if (isEditing.value && editingProjectId.value != null) {
      await projectStore.updateProject(editingProjectId.value, built.payload)
    } else {
      const created = await projectStore.createProject(built.payload)
      await projectStore.fetchAnalyses(created.id).catch(() => {
        analysesErrorMap.value[created.id] = true
      })
    }
    closeProjectForm()
    currentPage.value = 1
  } catch (err) {
    formError.value = err?.message || 'Gagal menyimpan proyek.'
    formErrors.value = Array.isArray(err?.errors) ? err.errors : []
  } finally {
    saving.value = false
  }
}

async function removeProject(projectId) {
  const project = projectStore.projects.find((item) => item.id === projectId)
  if (!project) return
  const confirmed = window.confirm(
    `Hapus proyek "${project.title}"? Tindakan ini tidak dapat dibatalkan.`,
  )
  if (!confirmed) return

  try {
    await projectStore.deleteProject(projectId)
    openMenuId.value = null
    if (selectedProject.value?.id === projectId) {
      selectedProject.value = null
      selectedEvidences.value = []
      showDetailModal.value = false
    }
    if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  } catch (err) {
    listError.value = err?.message || 'Gagal menghapus proyek.'
  }
}

function changeFilter(id) {
  selectedFilter.value = id
  showFilter.value = false
  currentPage.value = 1
}

function analyzeProject(project) {
  showDetailModal.value = false
  router.push({ name: 'AiSkillAnalyzer', query: { project: String(project.id) } })
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })
}

function applyDraftQuery() {
  const draftTitle = route.query.draftTitle
  const draftDescription = route.query.draftDescription
  if (draftTitle == null && draftDescription == null) return
  openAddProject({
    title: draftTitle != null ? String(draftTitle) : '',
    description: draftDescription != null ? String(draftDescription) : '',
  })
  router.replace({ path: '/projects', query: {} })
}

watch(
  () => [route.query.draftTitle, route.query.draftDescription],
  () => {
    applyDraftQuery()
  },
)

onMounted(() => {
  applyDraftQuery()
  loadProjects()
})
</script>

<template>
  <WorkspaceLayout active="projects">
    <div class="projects-page" @click="openMenuId = null">
      <section class="content">
        <div class="page-heading">
          <div>
            <h1>My <span>Projects</span></h1>
            <p class="subtitle">Kelola proyek dan bukti kerja yang menunjukkan kompetensi Anda.</p>
          </div>
        </div>

        <div class="toolbar">
          <label class="project-search">
            <Search />
            <input v-model="searchQuery" placeholder="Cari proyek (judul atau deskripsi)" aria-label="Search your projects" />
          </label>

          <div class="filter-wrap" @click.stop>
            <button class="filter-button" type="button" @click="showFilter = !showFilter">
              <Filter /> Filter <ChevronDown />
            </button>
            <div v-if="showFilter" class="filter-menu">
              <button
                v-for="filter in FILTERS"
                :key="filter.id"
                type="button"
                @click="changeFilter(filter.id)"
              >
                {{ filter.label }}
                <span v-if="selectedFilter === filter.id">✓</span>
              </button>
            </div>
          </div>

          <button class="add-button" type="button" @click="openAddProject()">
            <Plus /> Tambah Proyek
          </button>
        </div>

        <p v-if="listError" class="banner-error" role="alert">{{ listError }}</p>
        <p v-if="loadingList" class="banner-info">Memuat proyek…</p>

        <div v-if="searchQuery || selectedFilter !== 'all'" class="result-caption">
          Menampilkan {{ filteredProjects.length }} proyek
          <button type="button" @click="searchQuery = ''; selectedFilter = 'all'">Clear filters</button>
        </div>

        <div v-if="visibleProjects.length" class="project-grid">
          <article v-for="project in visibleProjects" :key="project.id" class="project-card">
            <div class="project-thumb">
              <Code2 :size="45" />
            </div>

            <div class="project-info">
              <h2>{{ project.title }}</h2>
              <p>{{ project.description || 'Tanpa deskripsi.' }}</p>
              <p class="meta-line">Dibuat {{ formatDate(project.created_at) }}</p>
              <button class="details" type="button" @click="openProjectDetails(project)">
                View details <ChevronRight />
              </button>
            </div>

            <span class="status" :class="statusClass(project.id)">{{ statusLabel(project.id) }}</span>

            <div class="card-menu-wrap" @click.stop>
              <button
                class="more"
                type="button"
                aria-label="Project options"
                @click="openMenuId = openMenuId === project.id ? null : project.id"
              >
                <MoreVertical />
              </button>
              <div v-if="openMenuId === project.id" class="card-menu">
                <button type="button" @click="openProjectDetails(project)">View details</button>
                <button type="button" @click="editProject(project)"><Pencil /> Edit project</button>
                <button type="button" @click="analyzeProject(project)"><BrainCircuit /> Analyze</button>
                <button type="button" class="delete-option" @click="removeProject(project.id)">
                  <Trash2 /> Delete project
                </button>
              </div>
            </div>
          </article>
        </div>

        <div v-else-if="isEmptyCatalog" class="empty">
          <FolderKanban :size="42" />
          <h2>Belum ada proyek</h2>
          <p>Tambahkan proyek pertama Anda beserta bukti pendukungnya.</p>
          <button class="add-button" type="button" @click="openAddProject()">
            <Plus /> Tambah Proyek
          </button>
        </div>

        <div v-else-if="!loadingList" class="empty">
          <FolderKanban :size="42" />
          <h2>Tidak ada proyek yang cocok</h2>
          <p>Coba ubah kata kunci atau filter status analisis.</p>
          <button class="add-button" type="button" @click="openAddProject()">
            <Plus /> Tambah Proyek
          </button>
        </div>

        <div v-if="filteredProjects.length > perPage" class="pagination">
          <button type="button" :disabled="currentPage === 1" @click="currentPage--">‹</button>
          <button
            v-for="page in totalPages"
            :key="page"
            type="button"
            :class="{ selected: currentPage === page }"
            @click="currentPage = page"
          >
            {{ page }}
          </button>
          <button type="button" :disabled="currentPage === totalPages" @click="currentPage++">›</button>
        </div>
      </section>

      <!-- ADD / EDIT MODAL -->
      <div v-if="showAddModal" class="overlay" @click.self="closeProjectForm">
        <section class="modal wide">
          <button class="close" type="button" aria-label="Close" @click="closeProjectForm"><X /></button>
          <h2>{{ isEditing ? 'Edit Project' : 'Tambah Proyek' }}</h2>
          <p class="muted">
            {{ isEditing ? 'Perbarui data proyek dan bukti pendukung.' : 'Dokumentasikan proyek beserta bukti yang dapat diverifikasi.' }}
          </p>

          <form @submit.prevent="submitProject">
            <label>
              Judul proyek
              <input v-model="form.title" maxlength="200" placeholder="mis. Aplikasi E-Commerce SkillProof" required />
            </label>

            <label>
              Deskripsi
              <textarea
                v-model="form.description"
                rows="4"
                maxlength="4000"
                placeholder="Jelaskan peran, kontribusi, dan teknologi yang Anda gunakan — AI menilai dari deskripsi ini."
                required
              ></textarea>
              <small class="char-count">{{ form.description.length }}/4000</small>
            </label>

            <div class="form-row">
              <label>
                Repository URL
                <input v-model="form.repository_url" type="url" maxlength="255" placeholder="https://github.com/…" />
              </label>
              <label>
                Live URL
                <input v-model="form.live_url" type="url" maxlength="255" placeholder="https://…" />
              </label>
            </div>

            <div class="form-row">
              <label>
                Tanggal mulai
                <input v-model="form.start_date" type="date" />
              </label>
              <label>
                Tanggal selesai
                <input v-model="form.end_date" type="date" />
              </label>
            </div>

            <div class="evidences-block">
              <div class="evidences-head">
                <h3>Bukti pendukung</h3>
                <button type="button" class="ghost" :disabled="form.evidences.length >= 10" @click="addEvidenceRow">
                  + Tambah bukti
                </button>
              </div>
              <p class="muted tiny">Opsional, maksimal 10. Setiap baris membutuhkan judul, tipe, dan URL http/https.</p>

              <div v-for="(row, index) in form.evidences" :key="index" class="evidence-row">
                <input v-model="row.title" maxlength="150" placeholder="Judul bukti" aria-label="Judul bukti" />
                <select v-model="row.evidence_type" aria-label="Tipe bukti">
                  <option v-for="type in EVIDENCE_TYPES" :key="type" :value="type">{{ type }}</option>
                </select>
                <input v-model="row.url" maxlength="500" placeholder="https://…" aria-label="URL bukti" />
                <button type="button" class="icon-danger" aria-label="Hapus bukti" @click="removeEvidenceRow(index)">
                  <Trash2 :size="15" />
                </button>
              </div>
            </div>

            <div v-if="formError" class="form-alert" role="alert">
              <p>{{ formError }}</p>
              <ul v-if="formErrors.length">
                <li v-for="(item, idx) in formErrors" :key="idx">{{ item }}</li>
              </ul>
            </div>

            <div class="modal-actions">
              <button type="button" class="ghost" :disabled="saving" @click="closeProjectForm">Batal</button>
              <button type="submit" class="add-button" :disabled="saving">
                {{ saving ? 'Menyimpan…' : (isEditing ? 'Simpan Perubahan' : 'Simpan Proyek') }}
              </button>
            </div>
          </form>
        </section>
      </div>

      <!-- DETAIL MODAL -->
      <div v-if="showDetailModal && selectedProject" class="overlay" @click.self="showDetailModal = false">
        <section class="modal wide">
          <button class="close" type="button" aria-label="Close" @click="showDetailModal = false"><X /></button>
          <h2>{{ selectedProject.title }}</h2>
          <p class="status-inline" :class="statusClass(selectedProject.id)">{{ statusLabel(selectedProject.id) }}</p>
          <p v-if="detailLoading" class="muted">Memuat detail…</p>
          <p v-if="detailError" class="modal-error" role="alert">{{ detailError }}</p>
          <p class="body-copy">{{ selectedProject.description || 'Tanpa deskripsi.' }}</p>

          <div class="detail-meta">
            <div><span>Mulai</span><strong>{{ selectedProject.start_date || '—' }}</strong></div>
            <div><span>Selesai</span><strong>{{ selectedProject.end_date || '—' }}</strong></div>
            <div><span>Dibuat</span><strong>{{ formatDate(selectedProject.created_at) }}</strong></div>
          </div>

          <div class="link-row">
            <a
              v-if="isHttpUrl(selectedProject.repository_url)"
              :href="selectedProject.repository_url"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink :size="14" /> Repository
            </a>
            <a
              v-if="isHttpUrl(selectedProject.live_url)"
              :href="selectedProject.live_url"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink :size="14" /> Live demo
            </a>
          </div>

          <h3 class="section-title">Bukti</h3>
          <p v-if="detailLoading" class="muted">Memuat bukti pendukung...</p>
          <ul v-else-if="selectedEvidences.length" class="evidence-list">
            <li v-for="evidence in selectedEvidences" :key="evidence.id || evidence.url">
              <div>
                <strong>{{ evidence.title }}</strong>
                <small>{{ evidence.evidence_type }}</small>
              </div>
              <a
                v-if="isHttpUrl(evidence.url)"
                :href="evidence.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                Buka <ExternalLink :size="13" />
              </a>
            </li>
          </ul>
          <p v-else-if="!detailError" class="muted">Belum ada bukti pendukung.</p>

          <div class="modal-actions">
            <button type="button" class="ghost" @click="editProject(selectedProject)"><Pencil :size="14" /> Edit</button>
            <button type="button" class="add-button" @click="analyzeProject(selectedProject)">
              <BrainCircuit :size="14" /> Analyze
            </button>
          </div>
        </section>
      </div>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.projects-page{color:#f5f6ff;font-family:Arial,Helvetica,sans-serif}
.project-search{height:42px;display:flex;align-items:center;gap:10px;padding:0 12px;border:1px solid #3c426b;border-radius:9px;background:#252946;color:#aeb5d4}
.project-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#fff;font-size:13px}
.content{max-width:1200px;margin:0 auto}
.page-heading h1{margin:0 0 6px;font-size:28px}
.page-heading h1 span{color:#a66aff}
.subtitle{margin:0 0 20px;color:#b8bbd0;font-size:14px}
.toolbar{display:flex;gap:12px;align-items:center;margin-bottom:18px;flex-wrap:wrap}
.project-search{flex:1;min-width:220px}
.filter-wrap{position:relative}
.filter-button,.add-button,.ghost{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:7px;font-size:13px;cursor:pointer}
.filter-button{border:1px solid #4a506f;background:#202440;color:#d7daf0}
.filter-menu{position:absolute;top:46px;right:0;min-width:190px;background:#1c203c;border:1px solid #3a4066;border-radius:8px;padding:6px;z-index:5}
.filter-menu button{width:100%;display:flex;justify-content:space-between;border:0;background:transparent;color:#d7daf0;padding:9px 10px;border-radius:6px;cursor:pointer;font-size:12px}
.filter-menu button:hover{background:#2a3054}
.add-button{border:0;background:linear-gradient(110deg,#5144ed,#8738f5);color:#fff;font-weight:600}
.ghost{border:1px solid #4a506f;background:transparent;color:#d0d4e8}
.banner-error,.banner-info,.form-alert{padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:13px}
.banner-error,.form-alert{background:#3a1f2c;color:#ffb4b4}
.banner-info{background:#1f2a48;color:#c7cce2}
.form-alert p{margin:0}.form-alert ul{margin:8px 0 0;padding-left:18px}
.result-caption{display:flex;gap:10px;align-items:center;color:#aeb3cb;font-size:13px;margin-bottom:12px}
.result-caption button{border:0;background:transparent;color:#b58aff;cursor:pointer;font-weight:700}
.project-grid{display:grid;gap:14px}
.project-card{position:relative;display:grid;grid-template-columns:88px 1fr auto;gap:16px;align-items:start;padding:16px;background:#252843;border:1px solid #383c5e;border-radius:12px}
.project-thumb{width:88px;height:88px;border-radius:10px;background:#343957;display:grid;place-items:center;color:#c8cbe0}
.project-info h2{margin:0 0 6px;font-size:17px}
.project-info p{margin:0 0 8px;color:#c5c8db;font-size:13px;line-height:1.5}
.meta-line{color:#8f95b3!important;font-size:12px!important}
.details{display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;color:#b58aff;font-weight:700;cursor:pointer;padding:0;font-size:13px}
.status{justify-self:end;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.status-analyzed{background:#14352f;color:#2fe0b0}
.status-pending{background:#3a3148;color:#d7c2ff}
.status-error{background:#3a1f2c;color:#ffb4b4}
.modal-error{margin:0 0 12px;padding:10px 12px;border-radius:8px;background:#3a1f2c;color:#ffb4b4;font-size:13px}
.card-menu-wrap{position:absolute;top:12px;right:12px}
.more{border:0;background:transparent;color:#aeb3cb;cursor:pointer}
.card-menu{position:absolute;right:0;top:28px;min-width:170px;background:#1c203c;border:1px solid #3a4066;border-radius:8px;padding:6px;z-index:4}
.card-menu button{width:100%;display:flex;align-items:center;gap:8px;border:0;background:transparent;color:#d7daf0;padding:9px 10px;border-radius:6px;cursor:pointer;font-size:12px}
.card-menu button:hover{background:#2a3054}
.delete-option{color:#ff9e9e!important}
.empty{padding:48px 20px;text-align:center;background:#202440;border:1px dashed #3b4168;border-radius:12px;color:#c6c9df}
.empty h2{margin:12px 0 6px;font-size:18px}
.empty p{margin:0 0 16px;font-size:13px}
.pagination{display:flex;gap:8px;justify-content:center;margin-top:18px}
.pagination button{width:34px;height:34px;border-radius:7px;border:1px solid #3a4066;background:#202440;color:#d7daf0;cursor:pointer}
.pagination button.selected{background:#702bf3;border-color:#702bf3}
.pagination button:disabled{opacity:.45;cursor:not-allowed}
.overlay{position:fixed;inset:0;background:rgba(8,10,22,.72);display:grid;place-items:center;padding:18px;z-index:40}
.modal{width:min(560px,100%);background:#1c2038;border:1px solid #383c5e;border-radius:14px;padding:22px;position:relative;max-height:90vh;overflow:auto}
.modal.wide{width:min(760px,100%)}
.modal h2{margin:0 0 6px;font-size:22px;padding-right:28px}
.muted{color:#9aa0bd;font-size:13px;margin:0 0 16px}
.muted.tiny{font-size:12px;margin-top:-8px}
.close{position:absolute;top:14px;right:14px;border:0;background:transparent;color:#c2c5d9;cursor:pointer}
.modal label{display:block;margin-bottom:12px;font-size:12px;font-weight:600;color:#d7daf0}
.modal input,.modal textarea,.modal select{display:block;width:100%;margin-top:6px;border:1px solid #4a506f;border-radius:8px;background:#15182d;color:#f5f6ff;padding:10px 11px;font-size:13px;outline:none}
.modal textarea{resize:vertical;min-height:96px}
.char-count{display:block;margin-top:5px;color:#8f95b3;font-size:11px;font-weight:500}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.evidences-block{margin:8px 0 14px;padding:12px;border:1px solid #34395a;border-radius:10px;background:#171b31}
.evidences-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.evidences-head h3{margin:0;font-size:14px}
.evidence-row{display:grid;grid-template-columns:1.2fr .9fr 1.4fr 34px;gap:8px;margin-bottom:8px}
.icon-danger{border:0;background:#3a1f2c;color:#ff9e9e;border-radius:7px;cursor:pointer}
.modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:8px}
.body-copy{color:#d5d8ea;font-size:14px;line-height:1.6;white-space:pre-wrap}
.detail-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
.detail-meta span{display:block;color:#8f95b3;font-size:11px;margin-bottom:4px}
.detail-meta strong{font-size:13px}
.link-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.link-row a,.evidence-list a{display:inline-flex;align-items:center;gap:6px;color:#b58aff;text-decoration:none;font-size:13px;font-weight:700}
.section-title{margin:0 0 10px;font-size:15px}
.evidence-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.evidence-list li{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 12px;background:#15182d;border:1px solid #34395a;border-radius:8px}
.evidence-list strong{display:block;font-size:13px}
.evidence-list small{color:#8f95b3;font-size:11px}
.status-inline{display:inline-block;margin:0 0 10px;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:700}
@media(max-width:900px){.form-row,.evidence-row,.detail-meta{grid-template-columns:1fr}.project-card{grid-template-columns:64px 1fr}}
</style>
