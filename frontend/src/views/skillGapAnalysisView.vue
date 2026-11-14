<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertCircle, BookOpen, Briefcase, CheckCircle2, ChevronDown, Clock3,
  FolderKanban, Lightbulb, Pencil, Plus, Target, Trash2, X, XCircle,
} from 'lucide-vue-next'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import SkillCatalogPicker from '../components/SkillCatalogPicker.vue'
import { useCareerStore } from '../stores/career.js'

const router = useRouter()
const career = useCareerStore()

const LEVELS = ['beginner', 'intermediate', 'advanced']

const bootLoading = ref(false)
const bootError = ref('')
const showFormModal = ref(false)
const formMode = ref('create')
const formSaving = ref(false)
const formError = ref('')
const formTitle = ref('')
const formDescription = ref('')
const formSkills = ref([])
const editingId = ref(null)

const BUCKETS = [
  {
    key: 'fulfilled',
    title: 'Didukung Bukti',
    hint: 'Kompetensi aktif memenuhi kriteria target.',
    icon: CheckCircle2,
    tone: 'green',
  },
  {
    key: 'under-qualified',
    title: 'Bukti Terbatas',
    hint: 'Ada kompetensi aktif, tetapi belum memenuhi level/skor target.',
    icon: AlertCircle,
    tone: 'yellow',
  },
  {
    key: 'missing',
    title: 'Belum Ada Bukti',
    hint: 'Belum ada kompetensi aktif maupun tinjauan pending.',
    icon: XCircle,
    tone: 'red',
  },
  {
    key: 'pending_review',
    title: 'Menunggu Tinjauan Anda',
    hint: 'Rekomendasi AI menunggu keputusan di Skill Profile.',
    icon: Clock3,
    tone: 'purple',
    link: '/skill-profile#review',
  },
]

const targets = computed(() => career.targets || [])
const selectedId = computed(() => career.selectedTargetId)
const selectedTarget = computed(() =>
  targets.value.find((t) => t.id === selectedId.value) || null,
)
const gap = computed(() =>
  selectedId.value != null ? career.gapByTarget[selectedId.value] || null : null,
)
const summary = computed(() => gap.value?.summary || null)
const gapSkills = computed(() =>
  Array.isArray(gap.value?.skills) ? gap.value.skills : [],
)

const excludeSkillIds = computed(() =>
  formSkills.value.map((s) => s.skill_id).filter((id) => id != null),
)

const hasGapActions = computed(() => {
  const s = summary.value
  if (!s) return false
  return Number(s.under_qualified_count || 0) + Number(s.missing_count || 0) > 0
})

const buckets = computed(() =>
  BUCKETS.map((meta) => ({
    ...meta,
    items: gapSkills.value.filter((s) => s.gap_status === meta.key),
  })),
)

function formatScore(value) {
  return value == null || value === '' ? '—' : String(value)
}

function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${Number(value)}%`
}

function resetForm() {
  formTitle.value = ''
  formDescription.value = ''
  formSkills.value = []
  formError.value = ''
  editingId.value = null
}

function openCreateModal() {
  formMode.value = 'create'
  resetForm()
  showFormModal.value = true
}

function openEditModal() {
  if (!selectedTarget.value) return
  formMode.value = 'edit'
  editingId.value = selectedTarget.value.id
  formTitle.value = selectedTarget.value.title || ''
  formDescription.value = selectedTarget.value.description || ''
  formSkills.value = (selectedTarget.value.target_skills || []).map((s) => ({
    skill_id: s.skill_id,
    skill_name: s.skill_name,
    category: s.category,
    expected_proficiency_level: s.expected_proficiency_level || 'intermediate',
    expected_score: s.expected_score == null ? null : s.expected_score,
  }))
  formError.value = ''
  showFormModal.value = true
}

function onPickerSubmit(payload) {
  if (formSkills.value.some((s) => Number(s.skill_id) === Number(payload.skill_id))) {
    formError.value = 'Skill tersebut sudah ada di daftar kebutuhan target.'
    return
  }
  formError.value = ''
  formSkills.value = [
    ...formSkills.value,
    {
      skill_id: payload.skill_id,
      skill_name: payload.skill_name,
      category: payload.category,
      expected_proficiency_level: payload.expected_proficiency_level || payload.proficiency_level || 'intermediate',
      expected_score: payload.expected_score == null ? null : payload.expected_score,
    },
  ]
  // excludeIds updates immediately so the same skill disappears from picker results
}

function removeFormSkill(skillId) {
  formSkills.value = formSkills.value.filter((s) => s.skill_id !== skillId)
}

function updateFormSkillLevel(skillId, level) {
  formSkills.value = formSkills.value.map((s) =>
    s.skill_id === skillId ? { ...s, expected_proficiency_level: level } : s,
  )
}

function updateFormSkillScore(skillId, raw) {
  const expected_score = raw === '' || raw == null ? null : raw
  formSkills.value = formSkills.value.map((s) =>
    s.skill_id === skillId ? { ...s, expected_score } : s,
  )
}

function closeFormModal() {
  if (formSaving.value) return
  showFormModal.value = false
  resetForm()
}

async function saveForm() {
  formError.value = ''
  const title = formTitle.value.trim()
  if (title.length < 2 || title.length > 150) {
    formError.value = 'Judul target wajib 2–150 karakter.'
    return
  }
  const description = formDescription.value.trim()
  if (description.length > 2000) {
    formError.value = 'Deskripsi maksimal 2000 karakter.'
    return
  }
  for (const skill of formSkills.value) {
    if (!LEVELS.includes(skill.expected_proficiency_level)) {
      formError.value = `Level skill "${skill.skill_name}" tidak valid.`
      return
    }
    if (skill.expected_score !== null && skill.expected_score !== '') {
      const n = Number(skill.expected_score)
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        formError.value = `Skor diharapkan untuk "${skill.skill_name}" harus bilangan bulat 0–100 atau dikosongkan.`
        return
      }
    }
  }

  const payload = {
    title,
    description: description || null,
    target_skills: formSkills.value.map((s) => ({
      skill_id: s.skill_id,
      expected_proficiency_level: s.expected_proficiency_level,
      expected_score: s.expected_score == null || s.expected_score === ''
        ? null
        : Number(s.expected_score),
    })),
  }

  formSaving.value = true
  try {
    if (formMode.value === 'create') {
      await career.createTarget(payload)
    } else {
      await career.updateTarget(editingId.value, payload)
    }
    showFormModal.value = false
    resetForm()
  } catch (err) {
    if (err?.status === 409) {
      formError.value = 'Judul target sudah dipakai. Gunakan judul lain.'
    } else {
      formError.value = err?.message || 'Gagal menyimpan target karier.'
    }
  } finally {
    formSaving.value = false
  }
}

async function onSelectTarget(event) {
  const raw = event?.target?.value
  const id = raw === '' || raw == null ? null : Number(raw)
  const requestedId = Number.isNaN(id) ? null : id
  bootError.value = ''
  try {
    await career.selectTarget(requestedId)
  } catch (err) {
    if (career.selectedTargetId === requestedId) {
      bootError.value = err?.message || 'Gagal memuat analisis target.'
    }
  }
}

async function confirmDelete() {
  if (!selectedTarget.value) return
  const ok = window.confirm(
    `Hapus target karier "${selectedTarget.value.title}"? Kebutuhan skill terkait akan ikut terhapus.`,
  )
  if (!ok) return
  bootError.value = ''
  try {
    await career.deleteTarget(selectedTarget.value.id)
  } catch (err) {
    bootError.value = err?.message || 'Gagal menghapus target karier.'
  }
}

async function bootstrap() {
  bootLoading.value = true
  bootError.value = ''
  try {
    await career.fetchTargets()
    if (career.selectedTargetId != null) {
      await career.fetchGap(career.selectedTargetId)
    }
  } catch (err) {
    bootError.value = err?.message || 'Gagal memuat target karier.'
  } finally {
    bootLoading.value = false
  }
}

onMounted(bootstrap)
</script>

<template>
  <WorkspaceLayout active="skill-gap">
    <div class="gap-view">
      <div class="gap-heading">
        <div>
          <h1>Skill Gap <span>Analysis</span></h1>
          <p>
            Bandingkan kompetensi aktif Anda dengan kebutuhan target karier, lalu tentukan langkah belajar berikutnya.
          </p>
        </div>
        <button type="button" class="primary" @click="openCreateModal">
          <Plus :size="14" /> Tambah Target
        </button>
      </div>

      <p v-if="bootLoading" class="banner-info">Memuat target karier…</p>
      <p v-if="bootError" class="banner-error" role="alert">{{ bootError }}</p>

      <section v-if="!bootLoading && !targets.length" class="empty-panel">
        <Target :size="22" />
        <h2>Belum ada target karier</h2>
        <p>Buat target pertama beserta kebutuhan skill untuk melihat analisis kesenjangan.</p>
        <button type="button" class="primary" @click="openCreateModal">
          <Plus :size="14" /> Buat Target Karier
        </button>
      </section>

      <template v-else-if="targets.length">
        <section class="career-target-panel">
          <div class="target-copy">
            <small>TARGET KARIER</small>
            <h2>{{ selectedTarget?.title || 'Pilih target' }}</h2>
            <p>{{ selectedTarget?.description || 'Pilih target untuk melihat kebutuhan kompetensi dan kesiapan Anda.' }}</p>
          </div>
          <div class="target-controls">
            <label class="role-select">
              <select :value="selectedId ?? ''" @change="onSelectTarget">
                <option v-for="t in targets" :key="t.id" :value="t.id">{{ t.title }}</option>
              </select>
              <ChevronDown :size="14" />
            </label>
            <div class="benchmark-pill">
              <span>{{ formatPct(summary?.readiness_percentage).replace('%', '') }}</span>
              <small>Kesiapan Terverifikasi</small>
            </div>
            <div class="target-actions">
              <button type="button" class="ghost" :disabled="!selectedTarget" @click="openEditModal">
                <Pencil :size="13" /> Edit
              </button>
              <button type="button" class="danger" :disabled="!selectedTarget" @click="confirmDelete">
                <Trash2 :size="13" /> Hapus
              </button>
            </div>
          </div>
        </section>

        <p v-if="career.gapLoading" class="banner-info">Menghitung analisis kesenjangan…</p>
        <p v-else-if="career.gapError" class="banner-error" role="alert">{{ career.gapError }}</p>

        <template v-else-if="gap">
          <section v-if="summary && summary.has_requirements === false" class="empty-panel soft">
            <AlertCircle :size="20" />
            <h2>Target ini belum memiliki kriteria skill</h2>
            <p>Tambahkan kebutuhan skill untuk melihat analisis kesenjangan.</p>
            <button type="button" class="primary" @click="openEditModal">
              <Pencil :size="13" /> Tambah Kebutuhan Skill
            </button>
          </section>

          <template v-else>
            <section class="readiness-grid">
              <article class="metric-card">
                <small>Kesiapan Terverifikasi</small>
                <strong>{{ formatPct(summary?.readiness_percentage) }}</strong>
                <p>Hanya skill berstatus fulfilled.</p>
              </article>
              <article class="metric-card projected">
                <small>Estimasi Kesiapan (Termasuk Tinjauan Pending)</small>
                <strong>{{ formatPct(summary?.projected_readiness_percentage) }}</strong>
                <p>Estimasi progres — bukan bukti terverifikasi industri.</p>
              </article>
              <article class="metric-card">
                <small>Ringkasan Bucket</small>
                <strong>{{ summary?.total_skills ?? 0 }} skill</strong>
                <p>
                  {{ summary?.fulfilled_count || 0 }} fulfilled ·
                  {{ summary?.under_qualified_count || 0 }} terbatas ·
                  {{ summary?.missing_count || 0 }} missing ·
                  {{ summary?.pending_review_count || 0 }} pending
                </p>
              </article>
            </section>

            <p class="disclaimer">
              Status "Belum Ada Bukti" tidak berarti Anda tidak memiliki keahlian tersebut, melainkan belum ada proyek atau bukti yang diverifikasi di platform.
            </p>

            <section class="gap-columns">
              <article
                v-for="bucket in buckets"
                :key="bucket.key"
                class="gap-column"
                :class="`tone-${bucket.tone}`"
              >
                <div class="column-heading">
                  <div>
                    <h3>{{ bucket.title }}</h3>
                    <p>{{ bucket.hint }}</p>
                  </div>
                  <span class="column-tag">{{ bucket.items.length }}</span>
                </div>

                <RouterLink
                  v-if="bucket.link"
                  class="review-link"
                  :to="bucket.link"
                >
                  Buka antrian tinjauan →
                </RouterLink>

                <div
                  v-for="skill in bucket.items"
                  :key="`${bucket.key}-${skill.skill_id}`"
                  class="gap-skill-card"
                >
                  <div class="gap-skill-title">
                    <component :is="bucket.icon" />
                    <strong>{{ skill.skill_name }}</strong>
                    <b>{{ skill.category || '—' }}</b>
                  </div>
                  <div class="compare-grid">
                    <div>
                      <small>Kebutuhan target</small>
                      <p>
                        {{ skill.target_requirement?.expected_proficiency_level || '—' }}
                        · skor {{ formatScore(skill.target_requirement?.expected_score) }}
                      </p>
                    </div>
                    <div>
                      <small>Kompetensi Anda</small>
                      <p v-if="skill.user_competency">
                        {{ skill.user_competency.proficiency_level || '—' }}
                        · skor {{ formatScore(skill.user_competency.score) }}
                      </p>
                      <p v-else>—</p>
                    </div>
                  </div>
                  <p class="skill-notes">{{ skill.notes || '—' }}</p>
                </div>

                <p v-if="!bucket.items.length" class="empty-copy">Tidak ada skill di bucket ini.</p>
              </article>
            </section>

            <section class="bridge-panel">
              <div class="bridge-icon"><Lightbulb /></div>
              <div class="bridge-copy">
                <h3>Panel Keputusan Alur Belajar</h3>
                <p v-if="hasGapActions">
                  Ada skill yang masih terbatas atau belum berbukti. Lanjutkan dengan rekomendasi proyek atau kursus.
                </p>
                <p v-else>
                  Kebutuhan utama sudah terpenuhi. Perbarui progres kompetensi atau bangun portofolio Anda.
                </p>
              </div>
              <div class="bridge-actions">
                <template v-if="hasGapActions">
                  <button type="button" class="recommended-button" @click="router.push('/recommendations')">
                    <FolderKanban :size="12" /> Rekomendasi Proyek
                  </button>
                  <button type="button" @click="router.push('/courses')">
                    <BookOpen :size="12" /> Rekomendasi Kursus
                  </button>
                </template>
                <template v-else>
                  <button type="button" class="recommended-button" @click="router.push('/competency')">
                    <Briefcase :size="12" /> Perbarui Progres
                  </button>
                  <button type="button" @click="router.push('/portfolio')">
                    <Target :size="12" /> Bangun Portofolio
                  </button>
                </template>
              </div>
            </section>
          </template>
        </template>
      </template>
    </div>

    <div v-if="showFormModal" class="overlay" @click.self="!formSaving && closeFormModal()">
      <section class="modal">
        <button type="button" class="close" aria-label="Tutup" :disabled="formSaving" @click="closeFormModal"><X /></button>
        <h2>{{ formMode === 'create' ? 'Tambah Target Karier' : 'Edit Target Karier' }}</h2>
        <p class="muted">Tentukan judul, deskripsi, dan kebutuhan skill dari katalog master.</p>

        <label>
          Judul (2–150)
          <input v-model="formTitle" type="text" maxlength="150" :disabled="formSaving" />
        </label>
        <label>
          Deskripsi (opsional)
          <textarea v-model="formDescription" rows="3" maxlength="2000" :disabled="formSaving"></textarea>
        </label>

        <div class="skills-editor">
          <h3>Kebutuhan Skill</h3>
          <ul v-if="formSkills.length" class="skill-rows">
            <li v-for="skill in formSkills" :key="skill.skill_id">
              <div class="row-main">
                <strong>{{ skill.skill_name }}</strong>
                <span>{{ skill.category || '—' }}</span>
              </div>
              <select
                :value="skill.expected_proficiency_level"
                :disabled="formSaving"
                @change="updateFormSkillLevel(skill.skill_id, $event.target.value)"
              >
                <option v-for="opt in LEVELS" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Skor"
                :value="skill.expected_score == null ? '' : skill.expected_score"
                :disabled="formSaving"
                @input="updateFormSkillScore(skill.skill_id, $event.target.value)"
              />
              <button type="button" class="danger" :disabled="formSaving" @click="removeFormSkill(skill.skill_id)">
                Hapus
              </button>
            </li>
          </ul>
          <p v-else class="empty-copy">Belum ada skill. Tambahkan dari katalog di bawah.</p>

          <SkillCatalogPicker
            :exclude-ids="excludeSkillIds"
            :disabled="formSaving"
            :score-required="false"
            :show-notes="false"
            :show-cancel="false"
            submit-label="Tambahkan ke Target"
            level-label="Level diharapkan"
            score-label="Skor diharapkan"
            @submit="onPickerSubmit"
          />
        </div>

        <p v-if="formError" class="banner-error" role="alert">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="ghost" :disabled="formSaving" @click="closeFormModal">Batal</button>
          <button type="button" class="primary" :disabled="formSaving" @click="saveForm">
            {{ formSaving ? 'Menyimpan…' : (formMode === 'create' ? 'Buat Target' : 'Simpan Perubahan') }}
          </button>
        </div>
      </section>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.gap-view{color:#f4f5ff}
.gap-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;margin-bottom:18px}
.gap-heading h1{font-size:25px;margin:0 0 5px}
.gap-heading h1 span{color:#a56aff}
.gap-heading p{font-size:14px;color:#c0c4d9;margin:0;max-width:670px;line-height:1.45}
.career-target-panel{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 18px;background:#252a4a;border:1px solid #414a78;border-radius:9px;margin-bottom:17px}
.target-copy small{font-size:9px;color:#c6b1ff;font-weight:700}
.target-copy h2{font-size:16px;margin:5px 0}
.target-copy p{font-size:12px;color:#b8bfd9;margin:0;max-width:490px;line-height:1.5}
.target-controls{display:grid;grid-template-columns:220px 170px;gap:8px;align-items:center}
.role-select{height:34px;position:relative;display:flex;align-items:center}
.role-select select{width:100%;height:100%;appearance:none;padding:0 28px 0 10px;background:#1c2341;border:1px solid #414a78;border-radius:6px;color:#e5e7f3;font-size:12px;outline:0}
.role-select svg{position:absolute;right:9px;color:#aeb6d6;pointer-events:none}
.benchmark-pill{height:34px;display:flex;align-items:center;justify-content:center;gap:7px;background:#1c2341;border:1px solid #414a78;border-radius:6px}
.benchmark-pill span{min-width:28px;height:23px;display:grid;place-items:center;border-radius:50%;border:2px solid #20c8ca;color:#36d6d3;font-size:10px;font-weight:700;padding:0 4px}
.benchmark-pill small{font-size:9px;color:#c2c8df}
.target-actions{grid-column:1/-1;display:flex;gap:8px}
.readiness-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px}
.metric-card{padding:14px;background:#252a49;border:1px solid #3b426c;border-radius:9px}
.metric-card.projected{border-color:#6a49c7}
.metric-card small{display:block;font-size:10px;color:#c4c8dc}
.metric-card strong{display:block;font-size:22px;margin:6px 0}
.metric-card p{margin:0;font-size:11px;color:#929bbb;line-height:1.4}
.disclaimer{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#2a2438;border:1px solid #5a4a78;color:#d7c9ff;font-size:12px;line-height:1.45}
.gap-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.gap-column{min-width:0;padding:13px 12px 12px;border:1px solid #3c456b;border-radius:9px;background:#242a49;display:flex;flex-direction:column}
.tone-green{border-top:2px solid #13c58e}
.tone-yellow{border-top:2px solid #eaa728}
.tone-red{border-top:2px solid #f04468}
.tone-purple{border-top:2px solid #9b6bff}
.column-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;min-height:58px}
.column-heading h3{font-size:13px;margin:0 0 5px}
.column-heading p{font-size:11px;line-height:1.4;color:#aeb5d0;margin:0}
.column-tag{font-size:10px;padding:4px 7px;border-radius:10px;white-space:nowrap;background:#124f48;color:#3cd4ae}
.tone-yellow .column-tag{background:#5a461d;color:#f0b638}
.tone-red .column-tag{background:#5c263b;color:#ff6684}
.tone-purple .column-tag{background:#3a2a63;color:#d0b1ff}
.review-link{display:inline-block;margin:4px 0 8px;font-size:12px;color:#c3a1ff;text-decoration:none}
.gap-skill-card{padding:10px;margin-top:8px;background:#1c2341;border-radius:6px;border:1px solid #303b60}
.gap-skill-title{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.gap-skill-title svg{width:14px;height:14px;flex:none}
.tone-green .gap-skill-title svg{color:#1dd19e}
.tone-yellow .gap-skill-title svg{color:#f0ae28}
.tone-red .gap-skill-title svg{color:#f04468}
.tone-purple .gap-skill-title svg{color:#c3a1ff}
.gap-skill-title strong{font-size:12px;line-height:1.3;flex:1}
.gap-skill-title b{font-size:10px;color:#9aa3c7;font-weight:500}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.compare-grid small{display:block;font-size:10px;color:#8f95b3;margin-bottom:2px}
.compare-grid p{margin:0;font-size:11px;color:#d7daf0}
.skill-notes{margin:0;font-size:11px;color:#aeb5d0;line-height:1.4}
.empty-copy{color:#aeb4d0;font-size:12px;margin:8px 0 0}
.empty-panel{display:grid;justify-items:start;gap:10px;padding:22px;background:#242946;border:1px solid #3b426c;border-radius:9px;color:#c0c4d9}
.empty-panel.soft{margin-bottom:14px}
.empty-panel h2{margin:0;font-size:16px;color:#fff}
.empty-panel p{margin:0;font-size:13px;line-height:1.45;max-width:520px}
.bridge-panel{display:flex;align-items:center;gap:11px;padding:13px 15px;margin-top:16px;background:#20294b;border:1px solid #35416c;border-radius:8px}
.bridge-icon{width:31px;height:31px;display:grid;place-items:center;border-radius:50%;background:#46358a;color:#d0b1ff;flex:none}
.bridge-copy{flex:1;min-width:160px}
.bridge-copy h3{font-size:13px;margin:0 0 4px}
.bridge-copy p{font-size:12px;color:#adb5d3;margin:0;line-height:1.4}
.bridge-actions{display:flex;flex-wrap:wrap;gap:6px}
.bridge-actions button,.ghost,.danger,.primary{height:32px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid #485178;border-radius:5px;background:#1a2140;color:#d9dcf0;font-size:11px;cursor:pointer;white-space:nowrap}
.bridge-actions .recommended-button,.primary{background:#6739ed;border-color:#6739ed;color:#fff}
.danger{color:#ffb4b4;border-color:#614052;background:#2a1b28}
.banner-error,.banner-info{padding:10px 12px;border-radius:8px;margin:0 0 12px;font-size:13px}
.banner-error{background:#3a1f2c;color:#ffb4b4}
.banner-info{background:#1f2a48;color:#c7cce2}
.overlay{position:fixed;inset:0;background:rgba(8,10,22,.72);display:grid;place-items:center;padding:18px;z-index:40}
.modal{width:min(720px,100%);background:#1c2038;border:1px solid #383c5e;border-radius:14px;padding:22px;position:relative;max-height:90vh;overflow:auto}
.modal h2{margin:0 0 6px;font-size:20px;padding-right:28px}
.muted{color:#9aa0bd;font-size:13px;margin:0 0 14px}
.close{position:absolute;top:14px;right:14px;border:0;background:transparent;color:#c2c5d9;cursor:pointer}
.modal label{display:block;margin-bottom:12px;font-size:12px;font-weight:600;color:#d7daf0}
.modal input,.modal select,.modal textarea{display:block;width:100%;margin-top:6px;border:1px solid #4a506f;border-radius:8px;background:#15182d;color:#f5f6ff;padding:10px 11px;font-size:13px}
.skills-editor{margin:8px 0 14px;padding-top:8px;border-top:1px solid #34395a}
.skills-editor h3{margin:0 0 10px;font-size:14px}
.skill-rows{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px}
.skill-rows li{display:grid;grid-template-columns:1.4fr 120px 90px auto;gap:8px;align-items:center;padding:8px;border:1px solid #34395a;border-radius:8px;background:#15182d}
.row-main strong{display:block;font-size:12px}
.row-main span{font-size:11px;color:#9aa3c7}
.skill-rows select,.skill-rows input{margin:0;padding:8px;font-size:12px}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
@media(max-width:1050px){.career-target-panel{align-items:flex-start;flex-direction:column}.target-controls{width:100%;grid-template-columns:1fr 1fr}.readiness-grid,.gap-columns{grid-template-columns:1fr}.bridge-panel{flex-wrap:wrap}}
@media(max-width:700px){.skill-rows li{grid-template-columns:1fr 1fr}.skill-rows .danger{grid-column:1/-1}}
@media(max-width:600px){.gap-heading{flex-direction:column}.target-controls{grid-template-columns:1fr}}
</style>
