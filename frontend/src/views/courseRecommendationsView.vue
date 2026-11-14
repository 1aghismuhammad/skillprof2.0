<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  BookOpen, ChevronDown, Clock3, ExternalLink, RefreshCw, Search, Target,
} from 'lucide-vue-next'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import { useCareerStore } from '../stores/career.js'
import { isHttpUrl } from '../lib/url.js'

const router = useRouter()
const career = useCareerStore()

const loadingTargets = ref(false)
const targetsError = ref('')
const query = ref('')
const levelFilter = ref('')
const loadError = ref('')
const loadErrorStatus = ref(null)
const requestSeq = ref(0)

const LEVELS = ['beginner', 'intermediate', 'advanced']

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
const courses = computed(() =>
  Array.isArray(recData.value?.courses) ? recData.value.courses : [],
)

const filteredCourses = computed(() => {
  const q = query.value.trim().toLowerCase()
  const level = levelFilter.value
  return courses.value.filter((c) => {
    if (level && String(c.level || '').toLowerCase() !== level) return false
    if (!q) return true
    const hay = `${c.title || ''} ${c.platform || ''} ${c.skill_name || ''} ${c.description || ''}`.toLowerCase()
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
    loadError.value = err?.message || 'Gagal memuat rekomendasi kursus.'
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
  <WorkspaceLayout active="courses">
    <div class="cr-page">
      <div class="cr-heading">
        <div>
          <h1>Course <span>Recommendations</span></h1>
          <p>Materi kursus yang disusun AI berdasarkan skill gap target karier Anda.</p>
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
        <p>Rekomendasi kursus membutuhkan target karier dengan kriteria skill.</p>
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
          <div class="filter-search">
            <Search :size="15" />
            <input v-model="query" type="search" placeholder="Cari judul, platform, atau skill…" />
          </div>
          <label class="level-filter">
            Level
            <select v-model="levelFilter">
              <option value="">Semua</option>
              <option v-for="lv in LEVELS" :key="lv" :value="lv">{{ lv }}</option>
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

          <section class="course-grid">
            <article v-for="(course, idx) in filteredCourses" :key="`${course.title}-${idx}`" class="course-card">
              <div class="course-meta">
                <span>{{ course.platform || '—' }}</span>
                <b>{{ course.level || '—' }}</b>
              </div>
              <h3>{{ course.title }}</h3>
              <div class="course-facts">
                <span><BookOpen :size="12" /> {{ course.skill_name || '—' }}</span>
                <span><Clock3 :size="12" /> {{ course.estimated_duration || '—' }}</span>
              </div>
              <p class="course-desc">{{ course.description || '—' }}</p>
              <footer class="course-actions">
                <a
                  v-if="isHttpUrl(course.url)"
                  class="view-course"
                  :href="course.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buka Kursus <ExternalLink :size="12" />
                </a>
                <span v-else class="url-missing">URL kursus tidak tersedia</span>
              </footer>
            </article>
          </section>

          <p v-if="!filteredCourses.length" class="empty-copy">
            Tidak ada kursus yang cocok dengan filter saat ini.
          </p>

          <p class="footnote">
            Dihasilkan AI dari skill gap Anda; platform dibatasi pada allowlist resmi.
          </p>
        </template>
      </template>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.cr-page{color:#e8eaff}
.cr-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}
.cr-heading h1{font-size:28px;margin:0 0 6px}
.cr-heading h1 span{color:#a66bff}
.cr-heading p{margin:0;color:#c6c7dc;font-size:14px;line-height:1.45;max-width:560px}
.reload-btn,.primary,.ghost{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 12px;border-radius:7px;border:0;cursor:pointer;font-size:12px;font-weight:600}
.reload-btn,.primary{background:#7028f4;color:#fff}
.reload-btn:disabled,.primary:disabled{opacity:.55;cursor:not-allowed}
.ghost{background:#252b49;color:#d4d8ec;border:1px solid #414a79}
.toolbar{display:grid;grid-template-columns:220px 1fr 140px;gap:10px;align-items:end;padding:14px;background:#252a4d;border:1px solid #414a7a;border-radius:10px;margin-bottom:14px}
.target-select,.level-filter{display:grid;gap:6px;font-size:11px;color:#c2c5d9}
.select-wrap{position:relative;display:flex;align-items:center}
.select-wrap select,.level-filter select{width:100%;height:36px;appearance:none;border:1px solid #353d68;border-radius:6px;background:#11162e;color:#dce0f5;padding:0 28px 0 10px;font-size:12px}
.select-wrap svg{position:absolute;right:10px;pointer-events:none;color:#aeb6d6}
.filter-search{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;background:#11162e;border:1px solid #353d68;border-radius:6px;color:#9da6c7}
.filter-search input{border:0;outline:0;background:transparent;color:#fff;width:100%;font-size:12px}
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
.course-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.course-card{display:flex;flex-direction:column;background:#111b3a;border:1px solid #283963;border-radius:10px;padding:14px;min-width:0}
.course-meta{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#13d6ed}
.course-meta b{color:#c9b2ff;font-weight:600;text-transform:capitalize}
.course-card h3{font-size:14px;line-height:1.4;margin:10px 0}
.course-facts{display:flex;gap:12px;flex-wrap:wrap;color:#aeb8d2;font-size:11px;padding-bottom:10px;border-bottom:1px solid #263453}
.course-facts span{display:inline-flex;align-items:center;gap:4px}
.course-desc{font-size:12px;line-height:1.5;color:#aeb8d2;flex:1;margin:10px 0}
.course-actions{display:flex;gap:8px;padding-top:4px}
.view-course{flex:1;height:32px;display:inline-flex;align-items:center;justify-content:center;gap:5px;background:#7028f4;color:#fff;border-radius:6px;text-decoration:none;font-size:11px;font-weight:600}
.url-missing{font-size:11px;color:#9aa3c7}
.empty-copy{color:#aeb4d0;font-size:13px;margin:8px 0}
.footnote{margin:18px 0 0;font-size:11px;color:#9aa3c7;line-height:1.45}
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1050px){.course-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.toolbar{grid-template-columns:1fr 1fr}}
@media(max-width:700px){.cr-heading{flex-direction:column}.toolbar{grid-template-columns:1fr}.course-grid{grid-template-columns:1fr}}
</style>
