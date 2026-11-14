<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Award, ChevronDown, History, Plus, Target, X,
} from 'lucide-vue-next'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import { useSkillStore } from '../stores/skills.js'
import { useCareerStore } from '../stores/career.js'

const router = useRouter()
const skills = useSkillStore()
const career = useCareerStore()

const LEVELS = ['beginner', 'intermediate', 'advanced']

const loadingProgress = ref(false)
const progressError = ref('')
const levelFilter = ref('')
const loadingTarget = ref(false)
const targetError = ref('')

const showTimeline = ref(false)
const timelineLoading = ref(false)
const timelineError = ref('')
const timelineSkillId = ref(null)
const timelineData = ref(null)
let timelineSeq = 0

const summary = computed(() => skills.progress?.summary || null)
const activeSkills = computed(() =>
  Array.isArray(skills.progress?.active_skills) ? skills.progress.active_skills : [],
)
const recentAssessments = computed(() =>
  Array.isArray(skills.progress?.recent_accepted_assessments)
    ? skills.progress.recent_accepted_assessments
    : [],
)

const filteredSkills = computed(() => {
  const level = levelFilter.value
  if (!level) return activeSkills.value
  return activeSkills.value.filter(
    (s) => String(s.proficiency_level || '').toLowerCase() === level,
  )
})

const distribution = computed(() => {
  const dist = summary.value?.level_distribution || {}
  const total = LEVELS.reduce((sum, lv) => sum + Number(dist[lv] || 0), 0)
  return LEVELS.map((lv) => {
    const count = Number(dist[lv] || 0)
    return {
      level: lv,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }
  })
})

const selectedTarget = computed(() =>
  career.targets.find((t) => t.id === career.selectedTargetId) || null,
)

const targetProgress = computed(() =>
  career.selectedTargetId != null
    ? career.targetProgressByTarget[career.selectedTargetId] || null
    : null,
)

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
  return d.toLocaleString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function scoreWidth(score) {
  if (score == null || score === '') return '0%'
  const n = Math.max(0, Math.min(100, Number(score)))
  return `${Number.isNaN(n) ? 0 : n}%`
}

async function loadProgress() {
  loadingProgress.value = true
  progressError.value = ''
  try {
    await skills.fetchProgress()
  } catch (err) {
    progressError.value = err?.message || 'Gagal memuat perkembangan kompetensi.'
  } finally {
    loadingProgress.value = false
  }
}

async function loadTargetProgress() {
  targetError.value = ''
  if (!career.targets.length) {
    try {
      await career.fetchTargets()
    } catch (err) {
      targetError.value = err?.message || 'Gagal memuat target karier.'
      return
    }
  }
  if (career.selectedTargetId == null) {
    return
  }
  loadingTarget.value = true
  try {
    await career.fetchTargetProgress(career.selectedTargetId)
  } catch (err) {
    targetError.value = err?.message || 'Gagal memuat progres target karier.'
  } finally {
    loadingTarget.value = false
  }
}

async function onSelectTarget(event) {
  const raw = event?.target?.value
  const id = raw === '' || raw == null ? null : Number(raw)
  career.setSelectedTargetId(Number.isNaN(id) ? null : id)
  await loadTargetProgress()
}

async function openTimeline(skill) {
  const skillId = skill.skill_id
  const seq = ++timelineSeq
  timelineSkillId.value = skillId
  showTimeline.value = true
  timelineLoading.value = true
  timelineError.value = ''
  timelineData.value = null
  try {
    const data = await skills.fetchSkillTimeline(skillId)
    if (seq !== timelineSeq) return
    timelineData.value = data
  } catch (err) {
    if (seq !== timelineSeq) return
    timelineError.value = err?.message || 'Gagal memuat linimasa skill.'
  } finally {
    if (seq === timelineSeq) timelineLoading.value = false
  }
}

function closeTimeline() {
  showTimeline.value = false
}

async function bootstrap() {
  await Promise.allSettled([loadProgress(), loadTargetProgress()])
}

onMounted(bootstrap)
</script>

<template>
  <WorkspaceLayout active="competency">
    <div class="cp-page">
      <div class="cp-head">
        <div>
          <h1>Competency <span>Progress</span></h1>
          <p>Pantau perkembangan kompetensi aktif, linimasa penilaian, dan kesiapan terhadap target karier.</p>
        </div>
        <div class="cp-actions">
          <button type="button" @click="router.push('/skill-profile')">
            <Award :size="14" /> Skill Profile
          </button>
          <button type="button" class="add" @click="router.push('/projects')">
            <Plus :size="14" /> Tambah Proyek
          </button>
        </div>
      </div>

      <p v-if="loadingProgress" class="banner-info">Memuat ringkasan kompetensi…</p>
      <p v-else-if="progressError" class="banner-error" role="alert">{{ progressError }}</p>

      <template v-else-if="summary">
        <section class="cp-stats">
          <article>
            <small>SKILL AKTIF</small>
            <strong>{{ summary.total_active_skills ?? 0 }}</strong>
            <p>Kompetensi berstatus active</p>
          </article>
          <article>
            <small>RATA-RATA SKOR</small>
            <strong>{{ formatScore(summary.average_score) }}</strong>
            <p>{{ summary.skills_with_score_count ?? 0 }} skill ber-skor</p>
          </article>
          <article>
            <small>ASSESSMENT DITERIMA</small>
            <strong>{{ summary.total_accepted_assessments ?? 0 }}</strong>
            <p>Total penilaian accepted</p>
          </article>
        </section>

        <section class="cp-panel">
          <div class="panel-heading">
            <div>
              <h2>Distribusi Level</h2>
              <p>Sebaran proficiency_level pada skill aktif</p>
            </div>
          </div>
          <div class="dist-bars">
            <div v-for="item in distribution" :key="item.level" class="dist-row">
              <span class="dist-label">{{ item.level }}</span>
              <div class="dist-track"><i :style="{ width: item.pct + '%' }"></i></div>
              <strong>{{ item.count }} · {{ item.pct }}%</strong>
            </div>
          </div>
        </section>

        <div class="cp-columns">
          <section class="cp-panel">
            <div class="panel-heading">
              <div>
                <h2>Matriks Skill Aktif</h2>
                <p>Klik kartu untuk membuka linimasa assessment</p>
              </div>
              <label>
                Filter level
                <select v-model="levelFilter">
                  <option value="">Semua</option>
                  <option v-for="lv in LEVELS" :key="lv" :value="lv">{{ lv }}</option>
                </select>
              </label>
            </div>

            <div v-if="!filteredSkills.length" class="empty-copy">Belum ada skill aktif{{ levelFilter ? ' pada filter ini' : '' }}.</div>
            <button
              v-for="skill in filteredSkills"
              :key="skill.skill_id"
              type="button"
              class="skill-row"
              @click="openTimeline(skill)"
            >
              <div>
                <b>{{ skill.skill_name }}</b>
                <small>{{ skill.category || '—' }}</small>
              </div>
              <div class="skill-meter">
                <span>{{ formatScore(skill.score) }}</span>
                <b>{{ skill.proficiency_level || '—' }}</b>
                <i><u :style="{ width: scoreWidth(skill.score) }"></u></i>
              </div>
            </button>
          </section>

          <aside class="cp-panel">
            <div class="panel-heading">
              <div>
                <h2>Linimasa Penilaian</h2>
                <p>Assessment accepted terbaru</p>
              </div>
              <History :size="15" />
            </div>
            <div v-if="!recentAssessments.length" class="empty-copy">Belum ada assessment yang diterima.</div>
            <div v-else class="timeline">
              <div v-for="item in recentAssessments" :key="item.assessment_id">
                <i>•</i>
                <p>
                  <b>{{ item.skill_name }}</b>
                  · {{ item.proficiency_level || '—' }}
                  · skor {{ formatScore(item.score) }}
                  <template v-if="item.project?.title">
                    · proyek
                    <button
                      type="button"
                      class="linkish"
                      @click="router.push({ path: '/projects', query: { project: item.project.id } })"
                    >
                      {{ item.project.title }}
                    </button>
                  </template>
                  <small>{{ formatDate(item.created_at) }}</small>
                </p>
              </div>
            </div>
          </aside>
        </div>
      </template>

      <section class="cp-panel target-panel">
        <div class="panel-heading">
          <div>
            <h2>Progres Target Karier</h2>
            <p>Kesiapan terhadap kriteria target terpilih</p>
          </div>
          <label v-if="career.targets.length" class="target-select">
            Target
            <span class="select-wrap">
              <select :value="career.selectedTargetId ?? ''" :disabled="loadingTarget" @change="onSelectTarget">
                <option v-for="t in career.targets" :key="t.id" :value="t.id">{{ t.title }}</option>
              </select>
              <ChevronDown :size="14" />
            </span>
          </label>
        </div>

        <p v-if="loadingTarget" class="banner-info">Memuat progres target…</p>
        <p v-else-if="targetError" class="banner-error" role="alert">{{ targetError }}</p>
        <div v-else-if="!career.targets.length" class="empty-block">
          <Target :size="18" />
          <p>Belum ada target karier. Buat target untuk melihat kesiapan kompetensi.</p>
          <button type="button" class="add" @click="router.push('/skill-gap-analysis')">
            Buka Skill Gap Analysis
          </button>
        </div>
        <template v-else-if="targetProgress">
          <div class="readiness-row">
            <div>
              <small>Kesiapan Terverifikasi</small>
              <strong>{{ formatPct(targetProgress.readiness_percentage) }}</strong>
            </div>
            <div>
              <small>Estimasi Kesiapan</small>
              <strong>{{ formatPct(targetProgress.projected_readiness_percentage) }}</strong>
            </div>
            <div>
              <small>Target</small>
              <strong class="title-strong">{{ targetProgress.career_target?.title || selectedTarget?.title || '—' }}</strong>
            </div>
          </div>

          <p v-if="targetProgress.has_requirements === false" class="empty-copy">
            Target ini belum memiliki kriteria skill. Tambahkan kebutuhan di Skill Gap Analysis.
          </p>
          <div v-else class="progress-list">
            <article
              v-for="row in (targetProgress.skills_progress || [])"
              :key="row.skill_id"
              class="progress-item"
              :class="{ fulfilled: row.is_fulfilled }"
            >
              <div class="progress-head">
                <strong>{{ row.skill_name }}</strong>
                <span>{{ row.is_fulfilled ? 'Terpenuhi' : (row.gap_status || 'Belum') }}</span>
              </div>
              <p>
                Target: {{ row.target_requirement?.expected_proficiency_level || '—' }}
                · skor {{ formatScore(row.target_requirement?.expected_score) }}
              </p>
              <p>
                Saat ini:
                <template v-if="row.current_proficiency">
                  {{ row.current_proficiency.proficiency_level || '—' }}
                  · skor {{ formatScore(row.current_proficiency.score) }}
                </template>
                <template v-else>—</template>
              </p>
              <small>{{ row.notes || '' }}</small>
            </article>
          </div>
        </template>
      </section>
    </div>

    <div v-if="showTimeline" class="overlay" @click.self="closeTimeline">
      <section class="drawer">
        <button type="button" class="close" aria-label="Tutup" @click="closeTimeline"><X /></button>
        <h2>{{ timelineData?.skill?.name || 'Detail Skill' }}</h2>
        <p class="muted">
          {{ timelineData?.skill?.category || '—' }}
          · status {{ timelineData?.current_state?.status || '—' }}
          · {{ timelineData?.current_state?.proficiency_level || '—' }}
          · skor {{ formatScore(timelineData?.current_state?.score) }}
        </p>

        <p v-if="timelineLoading" class="banner-info">Memuat linimasa…</p>
        <p v-else-if="timelineError" class="banner-error" role="alert">{{ timelineError }}</p>
        <template v-else-if="timelineData">
          <div class="stat-chips">
            <span>Total {{ timelineData.assessment_statistics?.total_assessments ?? 0 }}</span>
            <span class="ok">Accepted {{ timelineData.assessment_statistics?.accepted_count ?? 0 }}</span>
            <span class="warn">Pending {{ timelineData.assessment_statistics?.pending_count ?? 0 }}</span>
            <span class="bad">Rejected {{ timelineData.assessment_statistics?.rejected_count ?? 0 }}</span>
          </div>
          <ul class="history-list">
            <li
              v-for="item in (timelineData.assessment_history || [])"
              :key="item.assessment_id"
            >
              <div>
                <strong>{{ item.source_type || '—' }} · {{ item.review_status || '—' }}</strong>
                <span>
                  {{ item.proficiency_level || '—' }} · skor {{ formatScore(item.score) }}
                </span>
                <p v-if="item.project?.title">Proyek: {{ item.project.title }}</p>
                <p>{{ item.notes || 'Tanpa catatan.' }}</p>
              </div>
              <small>{{ formatDate(item.created_at) }}</small>
            </li>
          </ul>
          <p v-if="!(timelineData.assessment_history || []).length" class="empty-copy">
            Belum ada riwayat assessment untuk skill ini.
          </p>
        </template>
      </section>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.cp-page{color:#e8eaff}
.cp-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;margin-bottom:18px}
.cp-head h1{font-size:28px;margin:0 0 6px}
.cp-head h1 span{color:#a66aff}
.cp-head p{font-size:14px;line-height:1.45;color:#c2c6dc;margin:0;max-width:620px}
.cp-actions{display:flex;gap:8px;flex-wrap:wrap}
.cp-actions button,.add{display:inline-flex;gap:6px;align-items:center;background:#171e3a;border:1px solid #303d68;color:#d5daf0;border-radius:6px;padding:9px 11px;font-size:11px;cursor:pointer}
.add{background:#7029f4;border-color:#7029f4;color:#fff}
.cp-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:16px}
.cp-stats article{background:#111a35;border:1px solid #26375d;border-radius:8px;padding:16px}
.cp-stats small{font-size:10px;letter-spacing:.4px;color:#b8bfd7}
.cp-stats strong{display:block;font-size:28px;margin-top:8px}
.cp-stats p{font-size:11px;color:#aeb6d0;margin:6px 0 0}
.cp-panel{background:#111a35;border:1px solid #26375d;border-radius:8px;padding:16px;margin-bottom:16px}
.panel-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
.panel-heading h2{font-size:15px;margin:0 0 4px}
.panel-heading p{font-size:11px;color:#9ea9c8;margin:0}
.panel-heading label,.target-select{font-size:11px;color:#b9bfd5;display:grid;gap:5px}
.panel-heading select,.select-wrap select{background:#1d2747;border:1px solid #303d65;color:#e0e4f6;border-radius:4px;padding:6px 8px;font-size:11px}
.select-wrap{position:relative;display:flex;align-items:center}
.select-wrap select{appearance:none;padding-right:26px;min-width:180px}
.select-wrap svg{position:absolute;right:8px;pointer-events:none;color:#aeb6d6}
.dist-bars{display:grid;gap:10px}
.dist-row{display:grid;grid-template-columns:110px 1fr auto;gap:10px;align-items:center;font-size:12px}
.dist-label{text-transform:capitalize;color:#c7cce0}
.dist-track{height:8px;background:#293555;border-radius:6px;overflow:hidden}
.dist-track i{display:block;height:100%;background:linear-gradient(90deg,#7837ff,#17d2e9)}
.cp-columns{display:grid;grid-template-columns:1.5fr 1fr;gap:16px}
.skill-row{width:100%;display:grid;grid-template-columns:1.1fr 1.3fr;gap:12px;align-items:center;padding:12px 0;border:0;border-bottom:1px solid #202b49;background:transparent;color:inherit;text-align:left;cursor:pointer}
.skill-row:last-child{border-bottom:0}
.skill-row b{display:block;font-size:13px}
.skill-row small{display:block;font-size:11px;color:#9aa3c7;margin-top:3px}
.skill-meter{display:grid;grid-template-columns:1fr auto;gap:4px;font-size:11px;color:#c7cce0}
.skill-meter i{grid-column:1/3;height:6px;background:#293555;border-radius:5px;overflow:hidden}
.skill-meter u{display:block;height:100%;background:linear-gradient(90deg,#7837ff,#17d2e9);border-radius:5px}
.timeline{padding:4px 0}
.timeline>div{display:flex;gap:10px;position:relative;padding-bottom:12px}
.timeline>div:not(:last-child):before{content:'';position:absolute;left:7px;top:18px;bottom:0;border-left:1px solid #35456e}
.timeline i{font-style:normal;z-index:1;width:16px;height:16px;display:grid;place-items:center;border-radius:50%;background:#12334c;color:#17d5e7;flex:none;font-size:10px}
.timeline p{font-size:12px;line-height:1.45;color:#c0c8df;margin:0}
.timeline small{display:block;color:#8f9ab9;margin-top:3px}
.linkish{border:0;background:transparent;color:#20d2e8;cursor:pointer;padding:0;font:inherit}
.readiness-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px}
.readiness-row small{display:block;font-size:10px;color:#9ea9c8}
.readiness-row strong{display:block;font-size:22px;margin-top:4px}
.title-strong{font-size:15px!important}
.progress-list{display:grid;gap:10px}
.progress-item{padding:12px;border:1px solid #28365a;border-radius:7px;background:#0f1730}
.progress-item.fulfilled{border-color:#1a5a48}
.progress-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}
.progress-head span{font-size:11px;color:#3cd4ae}
.progress-item:not(.fulfilled) .progress-head span{color:#f0b638}
.progress-item p{margin:0 0 4px;font-size:12px;color:#b8bfd9}
.progress-item small{font-size:11px;color:#8f95b3}
.empty-copy{color:#aeb4d0;font-size:13px;margin:8px 0}
.empty-block{display:grid;justify-items:start;gap:10px;color:#c0c4d9}
.banner-error,.banner-info{padding:10px 12px;border-radius:8px;margin:0 0 12px;font-size:13px}
.banner-error{background:#3a1f2c;color:#ffb4b4}
.banner-info{background:#1f2a48;color:#c7cce2}
.overlay{position:fixed;inset:0;background:rgba(8,10,22,.72);display:grid;justify-items:end;z-index:40}
.drawer{width:min(480px,100%);height:100%;background:#1c2038;border-left:1px solid #383c5e;padding:22px;overflow:auto;position:relative}
.drawer h2{margin:0 0 6px;font-size:20px;padding-right:28px}
.muted{color:#9aa0bd;font-size:13px;margin:0 0 14px}
.close{position:absolute;top:14px;right:14px;border:0;background:transparent;color:#c2c5d9;cursor:pointer}
.stat-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.stat-chips span{font-size:11px;padding:5px 8px;border-radius:999px;background:#252946;border:1px solid #3b426c}
.stat-chips .ok{color:#3cd4ae;border-color:#1a5a48}
.stat-chips .warn{color:#f0b638;border-color:#7a5a1d}
.stat-chips .bad{color:#ff9e9e;border-color:#614052}
.history-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.history-list li{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #34395a;border-radius:8px;background:#15182d}
.history-list strong{display:block;font-size:12px;margin-bottom:4px}
.history-list span,.history-list p{display:block;font-size:12px;color:#c8cbe0;margin:0 0 4px}
.history-list small{font-size:11px;color:#8f95b3;white-space:nowrap}
@media(max-width:900px){.cp-columns,.cp-stats,.readiness-row{grid-template-columns:1fr}.cp-head{flex-direction:column}}
</style>
