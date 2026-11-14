<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'
import { Pencil, Mail, Target } from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()

const displayName = computed(() => auth.user?.name || 'Student')
const email = computed(() => auth.user?.email || '—')
const bio = computed(() => auth.user?.bio || '')
const avatarUrl = computed(() => auth.user?.avatar_url || '')
const createdAt = computed(() => {
  const raw = auth.user?.created_at
  if (!raw) return '—'
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})
const initials = computed(() => displayName.value.trim().charAt(0).toUpperCase() || 'S')

function navigate(path) {
  router.push(path)
}

function editProfile() {
  router.push({ path: '/complete-profile', query: { from: 'my-profile' } })
}
</script>

<template>
  <WorkspaceLayout active="my-profile">
    <div class="profile-content">
      <div class="page-heading-row">
        <div>
          <h1>My <span>Profile</span></h1>
          <p>Data profil diambil dari akun SkillProof Anda.</p>
        </div>
        <button class="edit-button" type="button" @click="editProfile">
          <Pencil :size="15" /> Edit Profile
        </button>
      </div>

      <article class="profile-card">
        <div class="identity-section">
          <div class="large-avatar">
            <img v-if="avatarUrl" :src="avatarUrl" alt="Profile photo" />
            <span v-else>{{ initials }}</span>
          </div>
          <div class="identity-copy">
            <h2>{{ displayName }}</h2>
            <p class="email-line"><Mail :size="15" /> {{ email }}</p>
            <span>Bergabung {{ createdAt }}</span>
          </div>
        </div>

        <div class="section-divider"></div>

        <section class="information-section">
          <h3>Personal Information</h3>
          <div class="information-grid">
            <div class="information-item">
              <span>Full Name</span>
              <strong>{{ displayName }}</strong>
            </div>
            <div class="information-item">
              <span>Email</span>
              <strong>{{ email }}</strong>
            </div>
          </div>
        </section>

        <div class="section-divider"></div>

        <section class="detail-section about-section">
          <h3>About Me</h3>
          <p v-if="bio">{{ bio }}</p>
          <p v-else class="empty-copy">
            Bio belum diisi. Pilih Edit Profile untuk menambahkan pengenalan singkat.
          </p>
        </section>

        <div class="career-cta">
          <button type="button" @click="navigate('/skill-gap-analysis')">
            <Target :size="15" /> Kelola target karier
          </button>
        </div>
      </article>
    </div>
  </WorkspaceLayout>
</template>

<style scoped>
.profile-content{color:#f7f7fc;font-family:Arial,Helvetica,sans-serif;max-width:1200px;margin:0 auto}.page-heading-row{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:26px}.page-heading-row h1{margin:0 0 9px;font-size:30px;letter-spacing:-.5px}.page-heading-row h1 span{color:#a66aff}.page-heading-row p{margin:0;color:#b8bbd0;font-size:14px;line-height:1.6;max-width:720px}.edit-button{height:42px;padding:0 18px;display:flex;align-items:center;gap:9px;border:1px solid #7654d9;border-radius:7px;background:linear-gradient(110deg,#5144ed,#8738f5);color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}.edit-button:hover{filter:brightness(1.12)}
.profile-card{padding:28px 30px;background:#252843;border:1px solid #383c5e;border-radius:13px}.identity-section{display:flex;align-items:center;gap:24px;padding:2px 0 22px}.large-avatar{width:112px;height:112px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#343957;border:2px solid #555b80;color:#d8d9eb;font-size:38px;font-weight:600;flex-shrink:0}.large-avatar img{width:100%;height:100%;object-fit:cover}.identity-copy h2{margin:0 0 8px;font-size:23px}.email-line{display:flex;align-items:center;gap:8px;margin:0 0 5px;color:#d0d2e2;font-size:15px}.identity-copy>span{color:#a66aff;font-size:14px}.section-divider{height:1px;background:#777b9b;margin:0 0 20px;opacity:.65}.information-section h3,.detail-section h3{margin:0 0 17px;font-size:17px}.information-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 45px;padding-bottom:23px}.information-item{display:flex;flex-direction:column;gap:7px;min-width:0}.information-item span{color:#b8bbd0;font-size:14px}.information-item strong{font-size:16px;font-weight:500;overflow-wrap:anywhere}.detail-section p{margin:0;color:#e1e2ed;font-size:15px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}.empty-copy{color:#aeb3cb!important}.career-cta{margin-top:18px}.career-cta button{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border:1px solid #4a506f;border-radius:7px;background:#202440;color:#d7daf0;font-size:13px;cursor:pointer}
@media(max-width:600px){.page-heading-row{flex-direction:column}.page-heading-row h1{font-size:25px}.profile-card{padding:20px 17px}.identity-section{gap:15px}.large-avatar{width:82px;height:82px}.identity-copy h2{font-size:18px}.information-grid{grid-template-columns:1fr;gap:15px}}
</style>
