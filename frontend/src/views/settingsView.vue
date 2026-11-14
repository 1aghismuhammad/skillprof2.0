<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, Globe, UserRound, Save, LogOut, AlertTriangle } from 'lucide-vue-next'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import { useAuthStore } from '../stores/auth.js'
import { usePortfolioStore } from '../stores/portfolio.js'

const router = useRouter()
const auth = useAuthStore()
const portfolioStore = usePortfolioStore()

const name = ref('')
const loading = ref(false)
const message = ref('')
const errorMessage = ref('')
const fieldErrors = ref([])
const logoutConfirm = ref(false)

const portfolioLoading = ref(false)
const visibilitySaving = ref(false)
const visibilityError = ref('')
const visibilityMsg = ref('')
const published = ref(false)

const email = computed(() => auth.user?.email || '')

watch(
  () => auth.user,
  (u) => {
    name.value = u?.name || ''
  },
  { immediate: true },
)

async function loadPortfolioVisibility() {
  portfolioLoading.value = true
  visibilityError.value = ''
  try {
    await portfolioStore.fetchMine()
    if (portfolioStore.hasPortfolio) {
      const sharing = await portfolioStore.fetchSharing()
      published.value = Boolean(sharing?.is_published)
    }
  } catch (err) {
    visibilityError.value = err?.message || 'Gagal memuat status portofolio.'
  } finally {
    portfolioLoading.value = false
  }
}

onMounted(loadPortfolioVisibility)

async function saveAccount() {
  message.value = ''
  errorMessage.value = ''
  fieldErrors.value = []

  const trimmed = name.value.trim()
  if (trimmed.length < 2 || trimmed.length > 100) {
    errorMessage.value = 'Nama harus 2 hingga 100 karakter.'
    return
  }

  loading.value = true
  try {
    await auth.updateProfile({ name: trimmed })
    message.value = 'Nama akun berhasil diperbarui.'
    setTimeout(() => { message.value = '' }, 3500)
  } catch (err) {
    errorMessage.value = err?.message || 'Gagal memperbarui akun.'
    fieldErrors.value = Array.isArray(err?.errors) ? err.errors : []
  } finally {
    loading.value = false
  }
}

async function onVisibilityToggle() {
  if (!portfolioStore.hasPortfolio || visibilitySaving.value) return
  visibilitySaving.value = true
  visibilityError.value = ''
  visibilityMsg.value = ''
  const next = published.value
  try {
    await portfolioStore.updateSharing({ is_published: next })
    visibilityMsg.value = next
      ? 'Portofolio dipublikasikan.'
      : 'Portofolio disetel privat.'
  } catch (err) {
    published.value = !next
    visibilityError.value = err?.message || 'Gagal memperbarui visibilitas.'
  } finally {
    visibilitySaving.value = false
  }
}

function logout() {
  auth.logout()
}
</script>

<template>
  <WorkspaceLayout active="settings">
    <div class="settings-page">
      <div class="settings-head">
        <div>
          <h1>Settings</h1>
          <p>Kelola identitas akun dan sesi SkillProof Anda.</p>
        </div>
      </div>

      <div class="settings-grid">
        <section class="settings-card">
          <div class="card-title">
            <span class="title-icon purple"><UserRound :size="17" /></span>
            <div>
              <h2>Account Information</h2>
              <p>Nama dapat diubah; email bersifat tetap</p>
            </div>
          </div>

          <label>
            Full Name
            <input v-model="name" type="text" maxlength="100" autocomplete="name" />
          </label>

          <label>
            Email Address
            <input :value="email" type="email" readonly disabled />
          </label>
          <small class="domain-note">Email tidak dapat diubah melalui pengaturan ini.</small>

          <div v-if="errorMessage" class="form-alert" role="alert">
            <p>{{ errorMessage }}</p>
            <ul v-if="fieldErrors.length">
              <li v-for="(item, idx) in fieldErrors" :key="idx">{{ item }}</li>
            </ul>
          </div>

          <div class="card-footer">
            <button class="save" type="button" :disabled="loading" @click="saveAccount">
              <Save :size="13" />
              {{ loading ? 'Saving…' : 'Save Account Changes' }}
            </button>
          </div>
        </section>

        <section class="settings-card">
          <div class="card-title">
            <span class="title-icon cyan"><Eye :size="17" /></span>
            <div>
              <h2>Visibilitas Portofolio</h2>
              <p>Kontrol publikasi portofolio publik Anda</p>
            </div>
          </div>

          <p v-if="portfolioLoading" class="vis-note">Memuat status portofolio…</p>
          <div v-else-if="visibilityError" class="form-alert" role="alert">
            <p>{{ visibilityError }}</p>
          </div>
          <template v-else-if="portfolioStore.hasPortfolio">
            <label class="vis-toggle">
              <input
                v-model="published"
                type="checkbox"
                :disabled="visibilitySaving"
                @change="onVisibilityToggle"
              />
              <span>
                <b>{{ published ? 'Dipublikasikan' : 'Privat' }}</b>
                <small>Sinkron dengan panel Pengaturan Berbagi di Portfolio Builder.</small>
              </span>
            </label>
            <p v-if="visibilityMsg" class="vis-ok" role="status">{{ visibilityMsg }}</p>
            <button class="link-btn" type="button" @click="router.push('/portfolio')">
              <Globe :size="13" /> Buka Portfolio Builder
            </button>
          </template>
          <template v-else>
            <p class="vis-note">
              Anda belum memiliki portofolio. Buat dan simpan draf di Portfolio Builder terlebih dahulu.
            </p>
            <button class="save" type="button" @click="router.push('/portfolio')">
              Ke Portfolio Builder
            </button>
          </template>
        </section>

        <section class="settings-card session-card">
          <div class="card-title">
            <span class="title-icon red"><LogOut :size="17" /></span>
            <div>
              <h2>Session Control</h2>
              <p>Keluar dari sesi SkillProof pada perangkat ini.</p>
            </div>
            <button class="logout" type="button" @click="logoutConfirm = true">Logout</button>
          </div>

          <div v-if="logoutConfirm" class="confirm-logout">
            <AlertTriangle :size="20" />
            <div>
              <b>Confirm Logout</b>
              <p>Anda akan keluar dan diarahkan ke halaman login.</p>
            </div>
            <button type="button" @click="logoutConfirm = false">Cancel</button>
            <button class="confirm" type="button" @click="logout">Confirm Logout</button>
          </div>
        </section>
      </div>

      <p v-if="message" class="settings-message" role="status">{{ message }}</p>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.settings-page{color:#e8eaff}
.settings-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.settings-head h1{font-size:30px;margin:0 0 3px}
.settings-head p{font-size:17px;color:#c2c6dc;margin:0}
.settings-grid{display:grid;grid-template-columns:1fr;gap:17px;max-width:720px}
.settings-card{background:#111a35;border:1px solid #26365c;border-radius:8px;padding:17px;min-width:0}
.card-title{display:flex;align-items:center;gap:9px;border-bottom:1px solid #263451;padding-bottom:13px;margin-bottom:15px;min-height:49px}
.title-icon{width:29px;height:29px;border-radius:6px;display:grid;place-items:center;flex:none}
.title-icon.purple{background:#29205b;color:#c49aff}
.title-icon.cyan{background:#103b51;color:#15c6dc}
.title-icon.red{background:#4a2438;color:#ff9ab1}
.card-title h2{font-size:12px;margin:0 0 3px}
.card-title p{font-size:9px;color:#aeb7d0;margin:0}
.settings-card>label{display:block;color:#b8c1da;font-size:9px;margin:12px 0}
.settings-card input{display:block;width:100%;background:#080f29;border:1px solid #27375e;color:#e2e7f8;border-radius:5px;padding:9px 10px;font-size:10px;margin-top:6px;outline:none}
.settings-card input:disabled{opacity:.7;cursor:not-allowed}
.domain-note{font-size:8px;color:#15c6dc}
.card-footer{display:flex;justify-content:flex-end;border-top:1px solid #273451;margin-top:17px;padding-top:13px}
.save{display:flex;align-items:center;justify-content:center;gap:6px;background:#702bf3;border:0;border-radius:6px;color:white;padding:9px 13px;font-size:9px;cursor:pointer}
.save:disabled{opacity:.7;cursor:not-allowed}
.form-alert{margin:10px 0 0;padding:10px 12px;border-radius:6px;background:#3a1f2c;color:#ffb4b4;font-size:11px}
.form-alert p{margin:0}
.form-alert ul{margin:8px 0 0;padding-left:18px}
.vis-toggle{display:flex;align-items:flex-start;gap:10px;margin:0 0 12px;cursor:pointer}
.vis-toggle input{width:auto;margin-top:2px;padding:0}
.vis-toggle b{display:block;font-size:12px;color:#e8eaff}
.vis-toggle small{display:block;font-size:10px;color:#aeb7d0;margin-top:3px}
.vis-note{font-size:12px;color:#aeb7d0;margin:0 0 12px;line-height:1.45}
.vis-ok{font-size:11px;color:#18d6ad;margin:0 0 10px}
.link-btn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid #35436a;color:#c7cde2;border-radius:6px;padding:8px 12px;font-size:11px;cursor:pointer}
.session-card{border-color:#614052}
.session-card .card-title{border:0;margin:0}
.logout{margin-left:auto;background:#a9001c;border:1px solid #e12b46;color:white;border-radius:6px;padding:8px 13px;font-size:9px;cursor:pointer}
.confirm-logout{display:flex;align-items:center;gap:12px;background:#171f3b;border:1px solid #303d60;border-radius:7px;padding:13px;margin-top:10px}
.confirm-logout svg{color:#ff9c9c;flex:none}
.confirm-logout div{flex:1}
.confirm-logout b{font-size:10px}
.confirm-logout p{font-size:9px;color:#aeb8d0;margin:4px 0}
.confirm-logout button{background:#252e4d;border:0;color:#d3d9ed;padding:8px;border-radius:5px;font-size:9px}
.confirm-logout .confirm{background:#702bf3;color:white}
.settings-message{font-size:10px;color:#18d6ad;margin-top:12px}
@media(max-width:800px){.settings-head{align-items:flex-start}.settings-head p{font-size:14px}.confirm-logout{flex-wrap:wrap}}
</style>
