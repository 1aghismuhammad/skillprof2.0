<script setup>
import { computed, ref, watch } from 'vue'
import { useSkillStore } from '../stores/skills.js'

const props = defineProps({
  assessment: { type: Object, required: true },
})

const skills = useSkillStore()
const LEVELS = ['beginner', 'intermediate', 'advanced']

const level = ref('intermediate')
const score = ref(0)
const notes = ref('')
const errorMessage = ref('')

watch(
  () => props.assessment,
  (a) => {
    level.value = a?.proficiency_level || 'intermediate'
    score.value = a?.score ?? 0
    notes.value = ''
    errorMessage.value = ''
  },
  { immediate: true },
)

const locked = computed(() => !!skills.reviewing[props.assessment.id])

const hasCorrection = computed(() => {
  const a = props.assessment
  return (
    level.value !== (a.proficiency_level || 'intermediate')
    || Number(score.value) !== Number(a.score ?? 0)
    || notes.value.trim() !== ''
  )
})

const activeWarning = computed(() => {
  const a = props.assessment
  if (a.current_active_level == null) return ''
  return `Skill ini sudah aktif (level ${a.current_active_level}, skor ${a.current_active_score ?? '—'}). Menerima akan menggantinya dengan nilai di bawah.`
})

async function onAccept() {
  errorMessage.value = ''
  try {
    const body = hasCorrection.value
      ? {
          proficiency_level: level.value,
          score: Number(score.value),
          ...(notes.value.trim() ? { notes: notes.value.trim() } : {}),
        }
      : {}
    await skills.acceptAssessment(props.assessment.id, body)
  } catch (err) {
    errorMessage.value = err?.message || 'Gagal menerima assessment.'
  }
}

async function onReject() {
  errorMessage.value = ''
  try {
    await skills.rejectAssessment(props.assessment.id, notes.value.trim())
  } catch (err) {
    errorMessage.value = err?.message || 'Gagal menolak assessment.'
  }
}
</script>

<template>
  <article class="review-card" :class="{ locked }">
    <header class="review-head">
      <div>
        <h3>{{ assessment.skill_name }}</h3>
        <p class="meta">
          <span>{{ assessment.skill_category || '—' }}</span>
          <span v-if="assessment.project_title">· {{ assessment.project_title }}</span>
        </p>
      </div>
      <div class="ai-values">
        <span>Usulan AI</span>
        <strong>{{ assessment.proficiency_level || '—' }} · {{ assessment.score ?? '—' }}</strong>
      </div>
    </header>

    <p class="reasoning">{{ assessment.ai_reasoning || assessment.notes || 'Tidak ada penalaran AI.' }}</p>
    <p v-if="activeWarning" class="active-warning">{{ activeWarning }}</p>

    <div class="controls">
      <label>
        Level
        <select v-model="level" :disabled="locked">
          <option v-for="opt in LEVELS" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </label>
      <label>
        Skor (0–100)
        <input
          v-model.number="score"
          type="number"
          min="0"
          max="100"
          :disabled="locked"
        />
      </label>
      <label class="notes">
        Catatan (opsional)
        <textarea
          v-model="notes"
          rows="2"
          maxlength="500"
          placeholder="Catatan untuk keputusan Anda"
          :disabled="locked"
        ></textarea>
      </label>
    </div>

    <p v-if="errorMessage" class="card-error" role="alert">{{ errorMessage }}</p>

    <div class="actions">
      <button type="button" class="reject" :disabled="locked" @click="onReject">
        Tolak
      </button>
      <button type="button" class="accept" :disabled="locked" @click="onAccept">
        {{ locked ? 'Memproses…' : 'Terima' }}
      </button>
    </div>

    <p class="disclaimer">Hasil AI adalah rekomendasi, bukan sertifikasi kompetensi.</p>
  </article>
</template>

<style scoped>
.review-card{background:#1c2341;border:1px solid #3b456e;border-radius:10px;padding:14px;color:#e8eaff}
.review-card.locked{opacity:.85}
.review-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}
.review-head h3{margin:0 0 4px;font-size:15px}
.meta{margin:0;color:#aab2d1;font-size:12px}
.ai-values{text-align:right;font-size:11px;color:#9aa3c7}
.ai-values strong{display:block;margin-top:3px;color:#49cbb4;font-size:12px}
.reasoning{margin:0 0 10px;font-size:13px;line-height:1.5;color:#c8cbe0;white-space:pre-wrap}
.active-warning{margin:0 0 10px;padding:8px 10px;border-radius:7px;background:#3a3148;color:#e4d4ff;font-size:12px}
.controls{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.controls label{display:block;font-size:11px;color:#b9bfd7}
.controls select,.controls input,.controls textarea{display:block;width:100%;margin-top:5px;border:1px solid #4a506f;border-radius:7px;background:#15182d;color:#f5f6ff;padding:8px 10px;font-size:13px}
.notes{grid-column:1/-1}
.card-error{margin:10px 0 0;padding:8px 10px;border-radius:7px;background:#3a1f2c;color:#ffb4b4;font-size:12px}
.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.actions button{height:36px;padding:0 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer}
.actions button:disabled{opacity:.65;cursor:not-allowed}
.reject{border:1px solid #614052;background:#2a1b28;color:#ffb4b4}
.accept{border:0;background:linear-gradient(110deg,#5144ed,#8738f5);color:#fff}
.disclaimer{margin:12px 0 0;font-size:11px;color:#8e97c0}
@media(max-width:600px){.controls{grid-template-columns:1fr}.review-head{flex-direction:column}}
</style>
