<script setup>
import { computed, ref, watch } from 'vue'
import { UserRound, ChevronRight } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import WorkspaceLayout from '../components/WorkspaceLayout.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const name = ref('')
const bio = ref('')
const avatarUrl = ref('')
const loading = ref(false)
const errorMessage = ref('')
const fieldErrors = ref([])
const avatarBroken = ref(false)

const previewInitials = computed(() => {
  const n = (name.value || auth.user?.name || '').trim()
  return n ? n.charAt(0).toUpperCase() : ''
})
const avatarPreview = computed(() => {
  const url = avatarUrl.value.trim()
  if (!isHttpUrl(url) || avatarBroken.value) return ''
  return url
})

watch(avatarUrl, () => {
  avatarBroken.value = false
})

function onAvatarError() {
  avatarBroken.value = true
}

function isHttpUrl(value) {
  if (!value || typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function prefillFromUser() {
  const u = auth.user
  name.value = u?.name || ''
  bio.value = u?.bio || ''
  avatarUrl.value = u?.avatar_url || ''
}

watch(() => auth.user, prefillFromUser, { immediate: true })

function returnTarget() {
  const q = route.query
  if (q.from === 'my-profile' || q.returnTo === 'my-profile') return '/my-profile'
  return '/dashboard'
}

async function handleSave() {
  errorMessage.value = ''
  fieldErrors.value = []

  const trimmedName = name.value.trim()
  const trimmedBio = bio.value.trim()
  const trimmedAvatar = avatarUrl.value.trim()

  if (trimmedName.length < 2 || trimmedName.length > 100) {
    errorMessage.value = 'Nama harus 2 hingga 100 karakter.'
    return
  }

  if (trimmedBio.length > 1000) {
    errorMessage.value = 'Bio maksimal 1000 karakter.'
    return
  }

  if (trimmedAvatar && !isHttpUrl(trimmedAvatar)) {
    errorMessage.value = 'URL avatar harus memakai protokol http atau https.'
    return
  }

  if (trimmedAvatar.length > 255) {
    errorMessage.value = 'URL avatar maksimal 255 karakter.'
    return
  }

  loading.value = true
  try {
    await auth.updateProfile({
      name: trimmedName,
      bio: trimmedBio || null,
      avatar_url: trimmedAvatar || null,
    })
    auth.dismissProfilePrompt()
    await router.replace(returnTarget())
  } catch (err) {
    errorMessage.value = err?.message || 'Gagal menyimpan profil.'
    fieldErrors.value = Array.isArray(err?.errors) ? err.errors : []
  } finally {
    loading.value = false
  }
}

function handleSkip() {
  auth.dismissProfilePrompt()
  router.replace(returnTarget())
}
</script>

<template>
  <WorkspaceLayout active="my-profile">
    <section class="profile-content">
      <div class="page-heading">
        <h1>Complete Your Profile</h1>
        <p>
          Lengkapi nama, bio, dan URL avatar agar rekomendasi SkillProof lebih relevan.
        </p>
      </div>

      <div class="profile-card">
        <form @submit.prevent="handleSave">
          <div class="profile-form-layout">
            <div class="photo-section">
              <div class="photo-circle">
                <img
                  v-if="avatarPreview"
                  :src="avatarPreview"
                  alt="Pratinjau avatar"
                  @error="onAvatarError"
                />
                <span v-else-if="previewInitials" class="photo-initials">{{ previewInitials }}</span>
                <UserRound v-else :size="52" stroke-width="1" />
              </div>
              <p class="photo-hint">Pratinjau dari URL avatar (http/https)</p>
            </div>

            <div class="form-fields">
              <div class="field-group full-width">
                <label for="name">Nama Lengkap</label>
                <input
                  id="name"
                  v-model="name"
                  type="text"
                  maxlength="100"
                  placeholder="Masukkan nama lengkap"
                  required
                />
              </div>

              <div class="field-group full-width">
                <label for="avatarUrl">URL Avatar (opsional)</label>
                <input
                  id="avatarUrl"
                  v-model="avatarUrl"
                  type="url"
                  maxlength="255"
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              <div class="field-group full-width">
                <label for="bio">Bio (opsional)</label>
                <textarea
                  id="bio"
                  v-model="bio"
                  rows="4"
                  maxlength="1000"
                  placeholder="Ceritakan minat, fokus belajar, dan tujuan karier Anda…"
                ></textarea>
                <small class="char-count">{{ bio.trim().length }}/1000</small>
              </div>

              <div v-if="errorMessage" class="form-alert" role="alert">
                <p>{{ errorMessage }}</p>
                <ul v-if="fieldErrors.length">
                  <li v-for="(item, idx) in fieldErrors" :key="idx">{{ item }}</li>
                </ul>
              </div>

              <div class="form-actions">
                <button type="button" class="cancel-button" :disabled="loading" @click="handleSkip">
                  Lewati untuk Sekarang
                </button>
                <button type="submit" class="save-button" :disabled="loading">
                  {{ loading ? 'Menyimpan…' : 'Simpan Profil' }}
                  <ChevronRight v-if="!loading" :size="17" />
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </section>
  </WorkspaceLayout>
</template>

<style scoped>
.profile-content {
  color: #f5f6ff;
  font-family: Arial, Helvetica, sans-serif;
  max-width: 980px;
  margin: 0 auto;
}

.page-heading h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.page-heading p {
  margin: 0 0 24px;
  color: #b8bbd0;
  font-size: 14px;
  line-height: 1.5;
}

.profile-card {
  background: #252843;
  border: 1px solid #383c5e;
  border-radius: 13px;
  padding: 28px;
}

.profile-form-layout {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 28px;
}

.photo-section {
  text-align: center;
}

.photo-circle {
  width: 140px;
  height: 140px;
  margin: 0 auto 12px;
  border-radius: 50%;
  border: 2px solid #555b80;
  background: #343957;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #c8cbe0;
}

.photo-circle img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-initials {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  color: #d8d9eb;
}

.photo-hint {
  margin: 0;
  color: #9aa0bd;
  font-size: 12px;
}

.field-group {
  margin-bottom: 16px;
}

.field-group label {
  display: block;
  margin-bottom: 7px;
  font-size: 13px;
  font-weight: 600;
}

.field-group input,
.field-group textarea {
  width: 100%;
  border: 1px solid #4a506f;
  border-radius: 8px;
  background: #1b1d36;
  color: #f5f6ff;
  padding: 11px 12px;
  font-size: 14px;
  outline: none;
}

.field-group textarea {
  resize: vertical;
  min-height: 110px;
}

.char-count {
  display: block;
  margin-top: 6px;
  color: #8f95b3;
  font-size: 12px;
}

.form-alert {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #3a1f2c;
  color: #ffb4b4;
  font-size: 13px;
}

.form-alert p {
  margin: 0;
}

.form-alert ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.cancel-button,
.save-button {
  height: 42px;
  padding: 0 16px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.cancel-button {
  border: 1px solid #4a506f;
  background: transparent;
  color: #d0d4e8;
}

.save-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: linear-gradient(110deg, #5144ed, #8738f5);
  color: #fff;
}

.cancel-button:disabled,
.save-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .profile-form-layout {
    grid-template-columns: 1fr;
  }
}
</style>
