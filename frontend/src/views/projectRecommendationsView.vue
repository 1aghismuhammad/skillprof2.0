<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CheckCircle2, ChevronDown, Lightbulb, RefreshCw, Search, Target,
} from 'lucide-vue-next'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import { useCareerStore } from '../stores/career.js'

const router = useRouter()
const career = useCareerStore()

const loadingTargets = ref(false)
const targetsError = ref('')
const query = ref('')
const difficultyFilter = ref('')
const loadError = ref('')
const loadErrorStatus = ref(null)
const requestSeq = ref(0)

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced']

const targets = computed(() => career.targets || [])
const selectedId = computed(() => career.selectedTargetId)
const selectedTarget = computed(() =>
  targets.value.find((t) => t.id === selectedId.value) || null,
)

const recEntry = computed(() =>
  selectedId.value != null ? career.recommendations[selectedId.value] || null : null,
)
const recData = computed(() => recEntry.value?.data || null)
const loadingRecommendations = computed(() =>
  selectedId.value != null && Boolean(career.recLoading[selectedId.value]?.promise),
)

const isGoalReached = computed(() => recData.value?.status === 'goal_reached')
const gapSkills = computed(() =>
  Array.isArray(recData.value?.gap_skills) ? recData.value.gap_skills : [],
)
const projects = computed(() =>
  Array.isArray(recData.value?.projects) ? recData.value.projects : [],
)

const filteredProjects = computed(() => {
  const q = query.value.trim().toLowerCase()
  const diff = difficultyFilter.value
  return projects.value.filter((p) => {
    if (diff && String(p.difficulty_level || '').toLowerCase() !== diff) return false
    if (!q) return true
    const skills = Array.isArray(p.target_skills) ? p.target_skills.join(' ') : ''
    const hay = `${p.title || ''} ${p.description || ''} ${skills} ${p.expected_outcome || ''}`.toLowerCase()
    return hay.includes(q)
  })
})

const isNoCriteria = computed(() => loadErrorStatus.value === 400)
const isRetryable = computed(() =>
  [0, 429, 502, 503, 504].includes(Number(loadErrorStatus.value)),
)

function gapTone(status) {
  if (status === 'under-qualified') return 'yellow'
  if (status === 'missing') return 'red'
  if (status === 'pending_review') return 'purple'
  return 'green'
}

function startProject(project) {
  router.push({
    name: 'MyProjects',
    query: {
      draftTitle: project.title || '',
      draftDescription: project.description || '',
    },
  })
}

async function loadRecommendations({ force = false } = {}) {
  const id = career.selectedTargetId
  if (id == null) {
    loadError.value = ''
    loadErrorStatus.value = null
    return
  }
  const seq = ++requestSeq.value
  loadError.value = ''
  loadErrorStatus.value = null
  try {
    await career.fetchRecommendations(id, force)
  } catch (err) {
    if (seq !== requestSeq.value) return
    if (career.selectedTargetId !== id) return
    loadErrorStatus.value = err?.status ?? null
    loadError.value = err?.message || 'Gagal memuat rekomendasi proyek.'
  }
}

async function onSelectTarget(event) {
  const raw = event?.target?.value
  const id = raw === '' || raw == null ? null : Number(raw)
  career.setSelectedTargetId(Number.isNaN(id) ? null : id)
  await loadRecommendations({ force: false })
}

async function reloadAi() {
  if (loadingRecommendations.value || career.selectedTargetId == null) return
  await loadRecommendations({ force: true })
}

async function loadTargets() {
  loadingTargets.value = true
  targetsError.value = ''
  try {
    await career.fetchTargets()
  } catch (err) {
    targetsError.value = err?.message || 'Gagal memuat target karier.'
    throw err
  } finally {
    loadingTargets.value = false
  }
}

async function bootstrap() {
  loadError.value = ''
  loadErrorStatus.value = null
  try {
    if (!career.targets.length) {
      await loadTargets()
    }
  } catch {
    return
  }
  if (career.selectedTargetId != null) {
    loadRecommendations({ force: false })
  }
}

onMounted(bootstrap)
</script>

<template>
  <WorkspaceLayout active="recommendations">
    <div class="rec-page">
      <div class="rec-head">
        <div>
          <h1>Project <span>Recommendations</span></h1>
          <p>Ide proyek portofolio AI untuk menutup skill gap dan membangun bukti kompetensi.</p>
        </div>
        <button
          type="button"
          class="reload-btn"
          :disabled="loadingRecommendations || !selectedId || loadingTargets"
          @click="reloadAi"
        >
          <RefreshCw :size="14" :class="{ spin: loadingRecommendations }" />
          Muat Ulang Rekomendasi (AI)
        </button>
      </div>

      <p v-if="loadingTargets" class="banner-info">Memuat target karier…</p>

      <div v-else-if="targetsError" class="banner-error" role="alert">
        <p>{{ targetsError }}</p>
        <div class="error-actions">
          <button type="button" class="primary" :disabled="loadingTargets" @click="bootstrap">
            Coba Lagi
          </button>
        </div>
      </div>

      <section v-else-if="!targets.length" class="empty-panel">
        <Target :size="22" />
        <h2>Buat target karier terlebih dahulu</h2>
        <p>Rekomendasi proyek membutuhkan target karier dengan kriteria skill.</p>
        <button type="button" class="primary" @click="router.push('/skill-gap-analysis')">
          Buka Skill Gap Analysis
        </button>
      </section>

      <template v-else>
        <section class="toolbar">
          <label class="target-select">
            Target karier
            <span class="select-wrap">
              <select :value="selectedId ?? ''" :disabled="loadingRecommendations" @change="onSelectTarget">
                <option v-for="t in targets" :key="t.id" :value="t.id">{{ t.title }}</option>
              </select>
              <ChevronDown :size="14" />
            </span>
          </label>
          <div class="rec-search">
            <Search :size="15" />
            <input v-model="query" type="search" placeholder="Cari judul proyek atau skill…" />
          </div>
          <label class="diff-filter">
            Tingkat kesulitan
            <select v-model="difficultyFilter">
              <option value="">Semua</option>
              <option v-for="d in DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
            </select>
          </label>
        </section>

        <p v-if="selectedTarget" class="target-note">
          Target aktif: <strong>{{ selectedTarget.title }}</strong>
        </p>

        <p v-if="loadingRecommendations && !recData" class="banner-info">
          Menyusun rekomendasi AI… proses ini dapat memakan waktu hingga 2 menit.
        </p>
        <p v-else-if="loadingRecommendations" class="banner-info">Memuat ulang rekomendasi AI…</p>

        <div v-if="loadError" class="banner-error" role="alert">
          <p>{{ loadError }}</p>
          <div class="error-actions">
            <button
              v-if="isNoCriteria"
              type="button"
              class="primary"
              @click="router.push('/skill-gap-analysis')"
            >
              Tambah kriteria skill
            </button>
            <button
              v-else-if="isRetryable"
              type="button"
              class="primary"
              :disabled="loadingRecommendations"
              @click="reloadAi"
            >
              Coba lagi
            </button>
          </div>
        </div>

        <section v-else-if="isGoalReached" class="goal-banner">
          <h2>Selamat! Seluruh kriteria terpenuhi</h2>
          <p>
            {{ recData?.message || 'Kompetensi aktif Anda sudah memenuhi kebutuhan target karier ini.' }}
          </p>
          <div class="goal-actions">
            <button type="button" class="primary" @click="router.push('/competency')">
              Perbarui Progres
            </button>
            <button type="button" class="ghost" @click="router.push('/portfolio')">
              Bangun Portofolio
            </button>
          </div>
        </section>

        <template v-else-if="recData">
          <section v-if="gapSkills.length" class="gap-chips">
            <h2>Skill gap yang ditutup</h2>
            <div class="chips">
              <span
                v-for="skill in gapSkills"
                :key="skill.skill_id"
                class="chip"
                :class="gapTone(skill.gap_status)"
              >
                {{ skill.skill_name }}
                <small>{{ skill.gap_status }}</small>
              </span>
            </div>
          </section>

          <section class="rec-grid">
            <article
              v-for="(project, idx) in filteredProjects"
              :key="`${project.title}-${idx}`"
              class="rec-card"
            >
              <div class="rec-meta">
                <span>{{ project.difficulty_level || '—' }}</span>
                <i></i>
                <span class="rec-icon"><Lightbulb :size="16" /></span>
              </div>
              <h2>{{ project.title }}</h2>
              <p class="rec-desc">{{ project.description || '—' }}</p>

              <h4>Target Skills</h4>
              <div class="rec-skills">
                <span v-for="s in (project.target_skills || [])" :key="s">{{ s }}</span>
                <span v-if="!(project.target_skills || []).length">—</span>
              </div>

              <div class="rec-info">
                <p>
                  <b>Key Features</b><br />
                  <template v-if="(project.key_features || []).length">
                    <span v-for="(f, i) in project.key_features" :key="i" class="list-line">• {{ f }}</span>
                  </template>
                  <template v-else>—</template>
                </p>
                <p>
                  <b>Suggested Evidences</b><br />
                  <template v-if="(project.suggested_evidences || []).length">
                    <span v-for="(e, i) in project.suggested_evidences" :key="i" class="list-line">• {{ e }}</span>
                  </template>
                  <template v-else>—</template>
                </p>
                <p>
                  <b>Expected Outcome</b><br />
                  {{ project.expected_outcome || '—' }}
                </p>
              </div>

              <div class="rec-actions">
                <button type="button" class="choose" @click="startProject(project)">
                  <CheckCircle2 :size="13" /> Kerjakan Proyek Ini
                </button>
              </div>
            </article>
          </section>

          <p v-if="!filteredProjects.length" class="empty-copy">
            Tidak ada proyek yang cocok dengan filter saat ini.
          </p>

          <p class="footnote">
            Dihasilkan AI dari skill gap Anda. Memilih proyek akan membuka form Tambah Proyek dengan judul dan deskripsi terisi.
          </p>
        </template>
      </template>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.rec-page{color:#e7eaff}
.rec-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}
.rec-head h1{font-size:28px;margin:0 0 6px}
.rec-head h1 span{color:#a76aff}
.rec-head p{margin:0;font-size:14px;color:#c2c5da;line-height:1.45;max-width:560px}
.reload-btn,.primary,.ghost{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 12px;border-radius:7px;border:0;cursor:pointer;font-size:12px;font-weight:600}
.reload-btn,.primary{background:#7029f2;color:#fff}
.reload-btn:disabled,.primary:disabled{opacity:.55;cursor:not-allowed}
.ghost{background:#252b49;color:#d4d8ec;border:1px solid #414a79}
.toolbar{display:grid;grid-template-columns:220px 1fr 160px;gap:10px;align-items:end;padding:12px;background:#252b50;border:1px solid #414a79;border-radius:9px;margin-bottom:14px}
.target-select,.diff-filter{display:grid;gap:6px;font-size:11px;color:#c2c5d9}
.select-wrap{position:relative;display:flex;align-items:center}
.select-wrap select,.diff-filter select{width:100%;height:36px;appearance:none;border:0;border-radius:6px;background:#171d39;color:#d5d9ee;padding:0 28px 0 10px;font-size:12px}
.select-wrap svg{position:absolute;right:10px;pointer-events:none;color:#aeb6d6}
.rec-search{display:flex;gap:8px;align-items:center;height:36px;background:#303960;padding:0 10px;border-radius:5px;color:#aeb9d5}
.rec-search input{border:0;outline:0;background:none;color:#fff;width:100%;font-size:12px}
.target-note{margin:0 0 12px;font-size:12px;color:#b6bad0}
.banner-info,.banner-error{padding:12px 14px;border-radius:8px;margin:0 0 14px;font-size:13px}
.banner-info{background:#1f2a48;color:#c7cce2}
.banner-error{background:#3a1f2c;color:#ffb4b4}
.banner-error p{margin:0 0 8px}
.error-actions{display:flex;gap:8px}
.empty-panel,.goal-banner{display:grid;justify-items:start;gap:10px;padding:22px;background:#242946;border:1px solid #3b426c;border-radius:10px;color:#c0c4d9}
.empty-panel h2,.goal-banner h2{margin:0;color:#fff;font-size:18px}
.empty-panel p,.goal-banner p{margin:0;font-size:13px;line-height:1.45;max-width:540px}
.goal-actions{display:flex;gap:8px;flex-wrap:wrap}
.gap-chips{margin-bottom:16px}
.gap-chips h2{margin:0 0 10px;font-size:15px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:#1d2949;border:1px solid #2c3c65;font-size:12px}
.chip small{opacity:.8;font-size:10px;text-transform:uppercase}
.chip.yellow{border-color:#7a5a1d;background:#3a3018;color:#f0b638}
.chip.red{border-color:#6a2a3d;background:#3a1f2c;color:#ff6684}
.chip.purple{border-color:#5a3a9a;background:#2a2155;color:#d0b1ff}
.chip.green{border-color:#1a5a48;background:#143a34;color:#3cd4ae}
.rec-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.rec-card{background:#252b4c;border:1px solid #465080;border-radius:9px;padding:17px;min-width:0;display:flex;flex-direction:column}
.rec-meta{display:flex;align-items:center;gap:8px;color:#17cce3;font-size:11px}
.rec-meta span:first-child{background:#123c52;border-radius:12px;padding:4px 9px;text-transform:capitalize}
.rec-meta i{flex:1}
.rec-icon{color:#18cde3;background:#17284a;padding:7px;border-radius:7px;display:inline-flex}
.rec-card h2{font-size:15px;margin:12px 0 8px}
.rec-desc{font-size:12px;line-height:1.55;color:#b9bfd7;margin:0}
.rec-card h4{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#9ea8ca;margin:13px 0 7px}
.rec-skills{display:flex;flex-wrap:wrap;gap:5px}
.rec-skills span{font-size:10px;color:#d5d8f0;background:#37366f;border:1px solid #50449c;padding:4px 7px;border-radius:4px}
.rec-info{background:#111a37;border-radius:6px;padding:10px 12px;margin-top:13px;flex:1}
.rec-info p{font-size:11px;line-height:1.45;color:#b8bfd9;margin:0;padding:2px 0 8px}
.rec-info p+p{border-top:1px solid #2b3659;padding:8px 0 0}
.rec-info b{color:#e0e4f7}
.list-line{display:block}
.rec-actions{display:flex;gap:8px;border-top:1px solid #3b456d;margin-top:13px;padding-top:12px}
.choose{display:inline-flex;align-items:center;gap:6px;background:#7029f2;border:0;color:#fff;border-radius:6px;padding:9px 12px;font-size:11px;cursor:pointer}
.empty-copy{color:#aeb4d0;font-size:13px;margin:8px 0}
.footnote{margin:18px 0 0;font-size:11px;color:#9aa3c7;line-height:1.45}
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:800px){.rec-head{flex-direction:column}.toolbar{grid-template-columns:1fr}.rec-grid{grid-template-columns:1fr}}
</style>
