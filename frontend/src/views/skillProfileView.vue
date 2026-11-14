<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Award, BrainCircuit, ChartNoAxesColumnIncreasing, Pencil, Plus,
  Sparkles, Target, Trash2, X,
} from 'lucide-vue-next'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import AssessmentReviewCard from '../components/AssessmentReviewCard.vue'
import SkillCatalogPicker from '../components/SkillCatalogPicker.vue'
import { useSkillStore } from '../stores/skills.js'

const router = useRouter()
const route = useRoute()
const skillStore = useSkillStore()

const loading = ref(false)
const activeError = ref('')
const pendingError = ref('')
const actionError = ref('')
const showAddModal = ref(false)
const adding = ref(false)
const addError = ref('')
const showEditModal = ref(false)
const editingSkill = ref(null)
const editLevel = ref('intermediate')
const editScore = ref('')
const editNotes = ref('')
const editSaving = ref(false)
const editError = ref('')
const showDetailModal = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailSkill = ref(null)
const detailAssessments = ref([])
let detailSeq = 0

const LEVELS = ['beginner', 'intermediate', 'advanced']

const activeSkills = computed(() => skillStore.userSkills || [])
const pendingAssessments = computed(() => skillStore.pendingAssessments || [])
const pendingTotal = computed(() => skillStore.pendingTotal || pendingAssessments.value.length)

const excludeSkillIds = computed(() => activeSkills.value.map((s) => s.skill_id).filter((id) => id != null))

const groupedSkills = computed(() => {
  const map = new Map()
  for (const skill of activeSkills.value) {
    const key = skill.category || 'Lainnya'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(skill)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, skills]) => ({
      category,
      skills: [...skills].sort((x, y) => String(x.skill_name).localeCompare(String(y.skill_name))),
      count: skills.length,
      average: averageScore(skills),
    }))
})

function averageScore(skills) {
  const scored = skills.filter((s) => s.score != null && s.score !== '' && !Number.isNaN(Number(s.score)))
  if (!scored.length) return null
  const sum = scored.reduce((acc, s) => acc + Number(s.score), 0)
  return Math.round(sum / scored.length)
}

function formatScore(score) {
  return score == null || score === '' ? '—' : String(score)
}

function scoreWidth(score) {
  if (score == null || score === '') return '0%'
  const n = Math.max(0, Math.min(100, Number(score)))
  return `${Number.isNaN(n) ? 0 : n}%`
}

function scoresEqual(a, b) {
  const aEmpty = a === '' || a == null
  const bEmpty = b === '' || b == null
  if (aEmpty && bEmpty) return true
  if (aEmpty || bEmpty) return false
  return Number(a) === Number(b)
}

async function bootstrap() {
  loading.value = true
  activeError.value = ''
  pendingError.value = ''
  actionError.value = ''
  try {
    const results = await Promise.allSettled([
      skillStore.fetchUserSkills({ status: 'active' }),
      skillStore.fetchPendingAssessments(),
    ])
    if (results[0].status === 'rejected') {
      activeError.value = results[0].reason?.message || 'Gagal memuat skill aktif.'
    }
    if (results[1].status === 'rejected') {
      pendingError.value = results[1].reason?.message || 'Gagal memuat antrian tinjauan.'
    }
  } catch (err) {
    activeError.value = err?.message || 'Gagal memuat profil skill.'
  } finally {
    loading.value = false
    await nextTick()
    if (route.hash === '#review') {
      document.getElementById('review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}

function openAddModal() {
  addError.value = ''
  showAddModal.value = true
}

async function onAddSubmit(payload) {
  adding.value = true
  addError.value = ''
  try {
    await skillStore.addSkill({
      skill_id: payload.skill_id,
      proficiency_level: payload.proficiency_level,
      score: payload.score,
      notes: payload.notes,
    })
    showAddModal.value = false
  } catch (err) {
    if (err?.status === 409) {
      addError.value = 'Skill ini sudah ada di profil aktif Anda. Gunakan opsi Edit untuk mengubah level/skor.'
    } else {
      addError.value = err?.message || 'Gagal menambahkan skill.'
    }
  } finally {
    adding.value = false
  }
}

function openEdit(skill) {
  showDetailModal.value = false
  editingSkill.value = skill
  editLevel.value = skill.proficiency_level || 'intermediate'
  editScore.value = skill.score == null ? '' : skill.score
  editNotes.value = ''
  editError.value = ''
  showEditModal.value = true
}

async function saveEdit() {
  if (!editingSkill.value) return
  editError.value = ''
  const payload = {}
  if (editLevel.value !== editingSkill.value.proficiency_level) {
    payload.proficiency_level = editLevel.value
  }

  if (!scoresEqual(editScore.value, editingSkill.value.score)) {
    if (editScore.value === '' || editScore.value == null) {
      editError.value = 'Skor wajib diisi antara 0 hingga 100.'
      return
    }
    const scoreNum = Number(editScore.value)
    if (!Number.isInteger(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      editError.value = 'Skor harus bilangan bulat 0–100.'
      return
    }
    payload.score = scoreNum
  }

  if (editNotes.value.trim()) {
    payload.notes = editNotes.value.trim()
  }
  if (!Object.keys(payload).length) {
    editError.value = 'Tidak ada perubahan untuk disimpan.'
    return
  }

  editSaving.value = true
  try {
    await skillStore.updateSkill(editingSkill.value.id, payload)
    showEditModal.value = false
  } catch (err) {
    editError.value = err?.message || 'Gagal memperbarui skill.'
  } finally {
    editSaving.value = false
  }
}

async function removeSkill(skill) {
  const ok = window.confirm(
    `Nonaktifkan skill "${skill.skill_name}" dari profil aktif? Riwayat assessment tetap tersimpan.`,
  )
  if (!ok) return
  try {
    await skillStore.removeSkill(skill.id)
    if (detailSkill.value?.id === skill.id) {
      showDetailModal.value = false
      detailSkill.value = null
      detailAssessments.value = []
    }
  } catch (err) {
    actionError.value = err?.message || 'Gagal menonaktifkan skill.'
  }
}

async function openDetail(skill) {
  const seq = ++detailSeq
  showDetailModal.value = true
  detailLoading.value = true
  detailError.value = ''
  detailSkill.value = skill
  detailAssessments.value = []
  try {
    const data = await skillStore.fetchUserSkill(skill.id)
    if (seq !== detailSeq) return
    detailSkill.value = data
    detailAssessments.value = Array.isArray(data.assessments) ? data.assessments : []
  } catch (err) {
    if (seq !== detailSeq) return
    detailError.value = err?.message || 'Gagal memuat detail skill.'
  } finally {
    if (seq === detailSeq) detailLoading.value = false
  }
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

onMounted(bootstrap)
</script>

<template>
  <WorkspaceLayout active="skill-profile">
    <div class="skill-profile-view">
      <div class="skill-profile-heading">
        <div>
          <h1>Skill <span>Profile</span></h1>
          <p>Kelola kompetensi aktif dan tinjau rekomendasi AI untuk profil SkillProof Anda.</p>
        </div>
        <div class="heading-actions">
          <button type="button" class="add-button" @click="openAddModal">
            <Plus :size="15" /> Tambah Skill
          </button>
          <button type="button" class="explore-button" @click="router.push('/skill-gap-analysis')">
            <Sparkles :size="15" /> Target Karier
          </button>
        </div>
      </div>

      <section class="profile-metrics">
        <article class="metric-card">
          <div>
            <small>Skill Aktif</small>
            <strong>{{ activeSkills.length }}</strong>
            <p>{{ groupedSkills.length }} kategori</p>
          </div>
          <span class="metric-icon purple"><BrainCircuit /></span>
        </article>
        <article class="metric-card">
          <div>
            <small>Menunggu Tinjauan</small>
            <strong>{{ pendingTotal }}</strong>
            <p class="verified-note">Human-in-the-loop</p>
          </div>
          <span class="metric-icon teal"><Award /></span>
        </article>
        <article class="metric-card">
          <div>
            <small>Rata-rata skor</small>
            <strong>{{ formatScore(averageScore(activeSkills)) }}</strong>
            <p class="balanced-note">Hanya skill ber-skor</p>
          </div>
          <span class="metric-icon blue"><ChartNoAxesColumnIncreasing /></span>
        </article>
      </section>

      <p v-if="loading" class="banner-info">Memuat profil skill…</p>
      <p v-if="actionError" class="banner-error" role="alert">{{ actionError }}</p>

      <section id="review" class="review-panel">
        <div class="section-heading">
          <div>
            <h2>Menunggu Tinjauan</h2>
            <p>Rekomendasi AI yang menunggu keputusan Anda.</p>
          </div>
          <span class="telemetry">{{ pendingAssessments.length }} pending</span>
        </div>
        <p v-if="pendingError" class="banner-error" role="alert">{{ pendingError }}</p>
        <div v-else-if="pendingAssessments.length" class="review-list">
          <AssessmentReviewCard
            v-for="item in pendingAssessments"
            :key="item.id"
            :assessment="item"
          />
        </div>
        <p v-else-if="!loading" class="empty-copy">Tidak ada assessment pending saat ini.</p>
      </section>

      <section class="category-panel">
        <div class="section-heading">
          <div>
            <h2>Skill Aktif per Kategori</h2>
            <p>Dikelompokkan dari kategori katalog master di backend.</p>
          </div>
        </div>

        <p v-if="activeError" class="banner-error" role="alert">{{ activeError }}</p>
        <div v-else-if="!loading && !groupedSkills.length" class="empty-block">
          <p>Belum ada skill aktif. Tambahkan manual atau terima rekomendasi AI.</p>
          <button type="button" class="add-button" @click="openAddModal"><Plus :size="14" /> Tambah Skill</button>
        </div>

        <template v-if="!activeError">
          <div v-for="group in groupedSkills" :key="group.category" class="skill-group">
            <div class="group-head">
              <h3>{{ group.category }}</h3>
              <span>{{ group.count }} skill · rata-rata {{ formatScore(group.average) }}</span>
            </div>
            <div class="skill-grid">
              <article
                v-for="skill in group.skills"
                :key="skill.id"
                class="skill-card"
              >
                <button type="button" class="skill-main" @click="openDetail(skill)">
                  <div class="skill-top">
                    <strong>{{ skill.skill_name }}</strong>
                    <span class="level-badge">{{ skill.proficiency_level || '—' }}</span>
                  </div>
                  <div class="score-row">
                    <span>Skor</span>
                    <b>{{ formatScore(skill.score) }}</b>
                  </div>
                  <div class="score-track"><i :style="{ width: scoreWidth(skill.score) }"></i></div>
                </button>
                <div class="skill-actions">
                  <button type="button" @click="openEdit(skill)"><Pencil :size="13" /> Edit</button>
                  <button type="button" class="danger" @click="removeSkill(skill)"><Trash2 :size="13" /> Nonaktifkan</button>
                </div>
              </article>
            </div>
          </div>
        </template>
      </section>

      <section class="career-cta">
        <div class="accelerate-icon"><Target /></div>
        <div>
          <strong>Minat Pengembangan → Target Karier</strong>
          <p>Susun target karier dan lihat gap kompetensi berdasarkan skill aktif Anda.</p>
        </div>
        <button type="button" @click="router.push('/skill-gap-analysis')">Buka Skill Gap Analysis</button>
      </section>
    </div>

    <!-- ADD MODAL -->
    <div v-if="showAddModal" class="overlay" @click.self="showAddModal = false">
      <section class="modal">
        <button class="close" type="button" aria-label="Tutup" @click="showAddModal = false"><X /></button>
        <h2>Tambah Skill Manual</h2>
        <p class="muted">Cari skill dari katalog resmi, lalu tetapkan level dan skor.</p>
        <p v-if="addError" class="banner-error" role="alert">{{ addError }}</p>
        <SkillCatalogPicker
          :exclude-ids="excludeSkillIds"
          :disabled="adding"
          @submit="onAddSubmit"
          @cancel="showAddModal = false"
        />
      </section>
    </div>

    <!-- EDIT MODAL -->
    <div v-if="showEditModal && editingSkill" class="overlay" @click.self="showEditModal = false">
      <section class="modal narrow">
        <button class="close" type="button" aria-label="Tutup" @click="showEditModal = false"><X /></button>
        <h2>Edit {{ editingSkill.skill_name }}</h2>
        <label>
          Level
          <select v-model="editLevel" :disabled="editSaving">
            <option v-for="opt in LEVELS" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </label>
        <label>
          Skor (0–100)
          <input v-model="editScore" type="number" min="0" max="100" :disabled="editSaving" />
        </label>
        <label>
          Catatan (opsional)
          <textarea v-model="editNotes" rows="3" maxlength="1000" :disabled="editSaving"></textarea>
        </label>
        <p v-if="editError" class="banner-error" role="alert">{{ editError }}</p>
        <div class="modal-actions">
          <button type="button" class="ghost" :disabled="editSaving" @click="showEditModal = false">Batal</button>
          <button type="button" class="primary" :disabled="editSaving" @click="saveEdit">
            {{ editSaving ? 'Menyimpan…' : 'Simpan' }}
          </button>
        </div>
      </section>
    </div>

    <!-- DETAIL DRAWER -->
    <div v-if="showDetailModal && detailSkill" class="overlay" @click.self="showDetailModal = false">
      <section class="modal">
        <button class="close" type="button" aria-label="Tutup" @click="showDetailModal = false"><X /></button>
        <h2>{{ detailSkill.skill_name }}</h2>
        <p class="muted">
          {{ detailSkill.category || '—' }} · {{ detailSkill.proficiency_level || '—' }} · skor
          {{ formatScore(detailSkill.score) }}
        </p>
        <p v-if="detailLoading" class="banner-info">Memuat riwayat assessment…</p>
        <p v-if="detailError" class="banner-error" role="alert">{{ detailError }}</p>
        <ul v-if="!detailLoading && detailAssessments.length" class="history-list">
          <li v-for="item in detailAssessments" :key="item.id">
            <div>
              <strong>{{ item.source_type || '—' }} · {{ item.review_status || '—' }}</strong>
              <span v-if="item.project_title">{{ item.project_title }}</span>
              <p>{{ item.notes || item.ai_reasoning || 'Tanpa catatan.' }}</p>
            </div>
            <small>{{ formatDate(item.created_at) }}</small>
          </li>
        </ul>
        <p v-else-if="!detailLoading && !detailError" class="empty-copy">Belum ada riwayat assessment.</p>
        <div class="modal-actions">
          <button type="button" class="ghost" @click="openEdit(detailSkill)"><Pencil :size="13" /> Edit</button>
          <button type="button" class="danger-btn" @click="removeSkill(detailSkill)"><Trash2 :size="13" /> Nonaktifkan</button>
        </div>
      </section>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.skill-profile-view{color:#f4f5ff}
.skill-profile-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:19px}
.skill-profile-heading h1{font-size:25px;margin:0 0 5px}
.skill-profile-heading h1 span{color:#a66aff}
.skill-profile-heading p{max-width:700px;color:#c1c5da;font-size:14px;line-height:1.45;margin:0}
.heading-actions{display:flex;gap:8px;flex-wrap:wrap}
.explore-button,.add-button,.primary{height:35px;display:inline-flex;align-items:center;gap:7px;padding:0 12px;background:#6739ed;border:0;border-radius:6px;color:#fff;font-size:11px;cursor:pointer;white-space:nowrap}
.add-button{background:linear-gradient(110deg,#5144ed,#8738f5)}
.profile-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:17px}
.metric-card{position:relative;min-height:90px;display:flex;justify-content:space-between;padding:14px;background:#252a49;border:1px solid #3b426c;border-radius:9px}
.metric-card small{color:#c4c8dc;font-size:10px}
.metric-card strong{display:block;font-size:23px;margin:4px 0}
.metric-card p{margin:0;color:#929bbb;font-size:9px}
.verified-note{color:#30c9a9}
.balanced-note{color:#28d4dc}
.metric-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:8px}
.metric-icon svg{width:17px}
.metric-icon.purple{background:#51318b;color:#caa3ff}
.metric-icon.teal{background:#116a67;color:#59d9c7}
.metric-icon.blue{background:#214b83;color:#71c6ff}
.review-panel,.category-panel{background:#242946;border:1px solid #3b426c;border-radius:9px;padding:15px;margin-bottom:16px}
.section-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.section-heading h2{font-size:15px;margin:0 0 4px}
.section-heading p{font-size:10px;color:#aeb4d0;margin:0;line-height:1.4}
.telemetry{font-size:9px;color:#39d9b1;background:#145a50;padding:5px 8px;border-radius:5px;white-space:nowrap}
.review-list{display:grid;gap:12px}
.empty-copy,.empty-block{color:#aeb4d0;font-size:12px}
.empty-block{display:grid;gap:10px;justify-items:start;padding:12px 0}
.skill-group{margin-bottom:18px}
.group-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:10px}
.group-head h3{margin:0;font-size:14px}
.group-head span{font-size:11px;color:#9aa3c7}
.skill-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.skill-card{background:#1b2240;border:1px solid #333e67;border-radius:8px;overflow:hidden}
.skill-main{width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:12px;cursor:pointer}
.skill-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:10px}
.skill-top strong{font-size:13px}
.level-badge{font-size:10px;padding:3px 7px;border-radius:999px;background:#34306d;color:#d9ccff}
.score-row{display:flex;justify-content:space-between;font-size:11px;color:#aeb4d0;margin-bottom:6px}
.score-track{height:6px;background:#343c60;border-radius:8px;overflow:hidden}
.score-track i{display:block;height:100%;background:#9250ed}
.skill-actions{display:flex;border-top:1px solid #333e67}
.skill-actions button{flex:1;border:0;background:transparent;color:#c3a1ff;font-size:11px;padding:9px 6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}
.skill-actions .danger{color:#ff9e9e;border-left:1px solid #333e67}
.career-cta{display:flex;align-items:center;gap:12px;padding:12px 15px;background:#20294b;border:1px solid #35416c;border-radius:8px}
.accelerate-icon{width:31px;height:31px;display:grid;place-items:center;border-radius:50%;background:#46358a;color:#d0b1ff;flex:none}
.career-cta strong{font-size:12px}
.career-cta p{font-size:11px;color:#adb5d3;margin:4px 0 0}
.career-cta button{margin-left:auto;padding:8px 12px;border:0;border-radius:6px;background:#6739ed;color:#fff;font-size:11px;cursor:pointer}
.banner-error,.banner-info{padding:10px 12px;border-radius:8px;margin:0 0 12px;font-size:13px}
.banner-error{background:#3a1f2c;color:#ffb4b4}
.banner-info{background:#1f2a48;color:#c7cce2}
.overlay{position:fixed;inset:0;background:rgba(8,10,22,.72);display:grid;place-items:center;padding:18px;z-index:40}
.modal{width:min(640px,100%);background:#1c2038;border:1px solid #383c5e;border-radius:14px;padding:22px;position:relative;max-height:90vh;overflow:auto}
.modal.narrow{width:min(420px,100%)}
.modal h2{margin:0 0 6px;font-size:20px;padding-right:28px}
.muted{color:#9aa0bd;font-size:13px;margin:0 0 14px}
.close{position:absolute;top:14px;right:14px;border:0;background:transparent;color:#c2c5d9;cursor:pointer}
.modal label{display:block;margin-bottom:12px;font-size:12px;font-weight:600;color:#d7daf0}
.modal input,.modal select,.modal textarea{display:block;width:100%;margin-top:6px;border:1px solid #4a506f;border-radius:8px;background:#15182d;color:#f5f6ff;padding:10px 11px;font-size:13px}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.ghost{height:36px;padding:0 14px;border-radius:7px;border:1px solid #4a506f;background:transparent;color:#d0d4e8;cursor:pointer}
.danger-btn{height:36px;padding:0 14px;border-radius:7px;border:1px solid #614052;background:#2a1b28;color:#ffb4b4;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.history-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.history-list li{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #34395a;border-radius:8px;background:#15182d}
.history-list strong{display:block;font-size:12px;margin-bottom:4px}
.history-list span{display:block;font-size:11px;color:#b58aff;margin-bottom:4px}
.history-list p{margin:0;font-size:12px;color:#c8cbe0;white-space:pre-wrap}
.history-list small{font-size:11px;color:#8f95b3;white-space:nowrap}
@media(max-width:950px){.profile-metrics,.skill-grid{grid-template-columns:1fr 1fr}.career-cta{flex-wrap:wrap}.career-cta button{margin-left:0}}
@media(max-width:600px){.skill-profile-heading{flex-direction:column;align-items:flex-start}.profile-metrics,.skill-grid{grid-template-columns:1fr}}
</style>
