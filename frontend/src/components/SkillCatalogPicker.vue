<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useSkillStore } from '../stores/skills.js'
import { LoaderCircle, Search } from 'lucide-vue-next'

const props = defineProps({
  excludeIds: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  submitLabel: { type: String, default: 'Tambah Skill' },
  /** When false, empty score is allowed and emitted as null (career target skills). */
  scoreRequired: { type: Boolean, default: true },
  showNotes: { type: Boolean, default: true },
  showCancel: { type: Boolean, default: true },
  scoreLabel: { type: String, default: 'Skor (0–100)' },
  levelLabel: { type: String, default: 'Level' },
})

const emit = defineEmits(['submit', 'cancel'])

const skills = useSkillStore()
const LEVELS = ['beginner', 'intermediate', 'advanced']

const query = ref('')
const results = ref([])
const searching = ref(false)
const searchError = ref('')
const selected = ref(null)
const level = ref('intermediate')
const score = ref(props.scoreRequired ? 70 : '')
const notes = ref('')
const formError = ref('')

let debounceTimer = null
let searchSeq = 0

const excludeSet = computed(() => new Set((props.excludeIds || []).map(Number)))

const visibleResults = computed(() =>
  results.value.filter((item) => !excludeSet.value.has(Number(item.id))),
)

function clearDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

async function runSearch(term) {
  const seq = ++searchSeq
  searching.value = true
  searchError.value = ''
  try {
    const items = await skills.searchCatalog(term)
    if (seq !== searchSeq) return
    results.value = items
  } catch (err) {
    if (seq !== searchSeq) return
    searchError.value = err?.message || 'Gagal mencari katalog skill.'
    results.value = []
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

watch(query, (value) => {
  clearDebounce()
  const term = String(value || '').trim()
  debounceTimer = setTimeout(() => {
    runSearch(term)
  }, 300)
})

function pickSkill(item) {
  selected.value = item
  formError.value = ''
}

function onCancel() {
  selected.value = null
  formError.value = ''
  emit('cancel')
}

function onSubmit() {
  formError.value = ''
  if (!selected.value?.id) {
    formError.value = 'Pilih skill dari katalog terlebih dahulu.'
    return
  }
  if (!LEVELS.includes(level.value)) {
    formError.value = 'Level keahlian tidak valid.'
    return
  }

  let scoreValue = null
  if (score.value === '' || score.value == null) {
    if (props.scoreRequired) {
      formError.value = 'Skor wajib diisi antara 0 hingga 100.'
      return
    }
    scoreValue = null
  } else {
    const scoreNum = Number(score.value)
    if (!Number.isInteger(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      formError.value = props.scoreRequired
        ? 'Skor wajib diisi antara 0 hingga 100.'
        : 'Skor harus bilangan bulat 0–100 atau dikosongkan.'
      return
    }
    scoreValue = scoreNum
  }

  emit('submit', {
    skill_id: selected.value.id,
    skill_name: selected.value.name,
    category: selected.value.category,
    proficiency_level: level.value,
    expected_proficiency_level: level.value,
    score: scoreValue,
    expected_score: scoreValue,
    notes: notes.value.trim() || undefined,
  })
}

onUnmounted(clearDebounce)

// Initial empty search to show catalog sample
runSearch('')
</script>

<template>
  <div class="catalog-picker" :class="{ disabled }">
    <label class="field">
      Cari skill di katalog
      <div class="search-row">
        <Search :size="15" />
        <input
          v-model="query"
          type="search"
          placeholder="Ketik nama skill…"
          :disabled="disabled"
          autocomplete="off"
        />
        <LoaderCircle v-if="searching" class="spin" :size="15" />
      </div>
    </label>

    <p v-if="searchError" class="picker-error" role="alert">{{ searchError }}</p>

    <ul class="result-list" role="listbox">
      <li v-if="!searching && !visibleResults.length" class="empty">Tidak ada skill yang cocok.</li>
      <li
        v-for="item in visibleResults"
        :key="item.id"
        role="option"
        :aria-selected="selected?.id === item.id"
        :class="{ selected: selected?.id === item.id }"
        @click="!disabled && pickSkill(item)"
      >
        <strong>{{ item.name }}</strong>
        <span>{{ item.category || '—' }}</span>
      </li>
    </ul>

    <div v-if="selected" class="selected-banner">
      Terpilih: <strong>{{ selected.name }}</strong>
      <span>{{ selected.category || '—' }}</span>
    </div>

    <div class="controls">
      <label>
        {{ levelLabel }}
        <select v-model="level" :disabled="disabled">
          <option v-for="opt in LEVELS" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </label>
      <label>
        {{ scoreLabel }}{{ scoreRequired ? '' : ' · opsional' }}
        <input v-model="score" type="number" min="0" max="100" :disabled="disabled" />
      </label>
      <label v-if="showNotes" class="notes">
        Catatan (opsional)
        <textarea
          v-model="notes"
          rows="2"
          maxlength="1000"
          placeholder="Contoh: pengalaman proyek atau sertifikasi"
          :disabled="disabled"
        ></textarea>
      </label>
    </div>

    <p v-if="formError" class="picker-error" role="alert">{{ formError }}</p>

    <div class="actions">
      <button
        v-if="showCancel"
        type="button"
        class="ghost"
        :disabled="disabled"
        @click="onCancel"
      >
        Batal
      </button>
      <button type="button" class="primary" :disabled="disabled || !selected" @click="onSubmit">
        {{ submitLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.catalog-picker{color:#e8eaff}
.catalog-picker.disabled{opacity:.7;pointer-events:none}
.field{display:block;font-size:12px;margin-bottom:10px}
.search-row{display:flex;align-items:center;gap:8px;margin-top:6px;padding:0 10px;height:40px;border:1px solid #4a506f;border-radius:8px;background:#15182d}
.search-row input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#fff;font-size:13px}
.result-list{list-style:none;margin:0 0 12px;padding:0;max-height:180px;overflow:auto;border:1px solid #34395a;border-radius:8px;background:#171b31}
.result-list li{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid #2c3355;cursor:pointer;font-size:13px}
.result-list li:last-child{border-bottom:0}
.result-list li:hover,.result-list li.selected{background:#252946}
.result-list span{color:#9aa3c7;font-size:11px}
.result-list .empty{cursor:default;color:#9aa3c7;justify-content:center}
.selected-banner{margin:0 0 12px;padding:8px 10px;border-radius:7px;background:#2a2155;border:1px solid #6a49c7;font-size:12px}
.selected-banner span{margin-left:8px;color:#b9bfd7}
.controls{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.controls label{display:block;font-size:11px;color:#b9bfd7}
.controls select,.controls input,.controls textarea{display:block;width:100%;margin-top:5px;border:1px solid #4a506f;border-radius:7px;background:#15182d;color:#f5f6ff;padding:8px 10px;font-size:13px}
.notes{grid-column:1/-1}
.picker-error{margin:8px 0;padding:8px 10px;border-radius:7px;background:#3a1f2c;color:#ffb4b4;font-size:12px}
.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.actions button{height:36px;padding:0 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer}
.ghost{border:1px solid #4a506f;background:transparent;color:#d0d4e8}
.primary{border:0;background:linear-gradient(110deg,#5144ed,#8738f5);color:#fff}
.primary:disabled,.ghost:disabled{opacity:.6;cursor:not-allowed}
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:600px){.controls{grid-template-columns:1fr}}
</style>
