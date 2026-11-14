<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight
} from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()

const fullName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')

const showPassword = ref(false)
const showConfirmPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const fieldErrors = ref([])

const handleRegister = async () => {
  errorMessage.value = ''
  fieldErrors.value = []

  const name = fullName.value.trim()
  if (!name || !email.value || !password.value || !confirmPassword.value) {
    errorMessage.value = 'Silakan lengkapi semua data pendaftaran.'
    return
  }

  if (name.length < 2 || name.length > 100) {
    errorMessage.value = 'Nama harus 2 hingga 100 karakter.'
    return
  }

  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Konfirmasi kata sandi tidak sesuai.'
    return
  }

  if (password.value.length < 8 || password.value.length > 100) {
    errorMessage.value = 'Kata sandi minimal 8 dan maksimal 100 karakter.'
    return
  }

  loading.value = true
  try {
    await auth.register(name, email.value.trim(), password.value)
    await router.replace({ name: 'CompleteProfile' })
  } catch (err) {
    if (err?.status === 409) {
      errorMessage.value = err.message || 'Email sudah terdaftar.'
    } else if (err?.status === 400 && Array.isArray(err.errors) && err.errors.length) {
      errorMessage.value = err.message || 'Validasi gagal.'
      fieldErrors.value = err.errors
    } else {
      errorMessage.value = err?.message || 'Pendaftaran gagal. Coba lagi.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="register-page">

    <section class="register-card">

      <!-- LOGO -->
      <div class="register-heading">

        <div class="logo-symbol">
          <span class="logo-blue"></span>
          <span class="logo-purple"></span>
        </div>

        <h1>Sign Up</h1>

      </div>

      <p class="register-description">
        Untuk memulai, silahkan lengkapi form pendaftaran
      </p>

      <form @submit.prevent="handleRegister">

        <!-- FULL NAME -->
        <div class="form-group">
          <label for="fullName">Nama Lengkap</label>

          <div class="input-wrapper">
            <User :size="22" class="input-icon" />

            <input
              id="fullName"
              v-model="fullName"
              type="text"
              placeholder="Masukkan nama lengkap"
              autocomplete="name"
              required
            />
          </div>
        </div>

        <!-- EMAIL -->
        <div class="form-group">
          <label for="email">Alamat Email</label>

          <div class="input-wrapper">
            <Mail :size="22" class="input-icon" />

            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="Masukkan alamat email"
              autocomplete="email"
              required
            />
          </div>
        </div>

        <!-- PASSWORD -->
        <div class="form-group">
          <label for="password">Kata Sandi</label>

          <div class="input-wrapper">
            <Lock :size="22" class="input-icon" />

            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Masukkan kata sandi"
              autocomplete="new-password"
              minlength="8"
              required
            />

            <button
              type="button"
              class="password-toggle"
              @click="showPassword = !showPassword"
              aria-label="Tampilkan kata sandi"
            >
              <Eye v-if="!showPassword" :size="21" />
              <EyeOff v-else :size="21" />
            </button>
          </div>
        </div>

        <!-- CONFIRM PASSWORD -->
        <div class="form-group">
          <label for="confirmPassword">
            Konfirmasi Kata Sandi
          </label>

          <div class="input-wrapper">
            <Lock :size="22" class="input-icon" />

            <input
              id="confirmPassword"
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="Konfirmasi kata sandi"
              autocomplete="new-password"
              minlength="8"
              required
            />

            <button
              type="button"
              class="password-toggle"
              @click="showConfirmPassword = !showConfirmPassword"
              aria-label="Tampilkan konfirmasi kata sandi"
            >
              <Eye v-if="!showConfirmPassword" :size="21" />
              <EyeOff v-else :size="21" />
            </button>
          </div>
        </div>

        <div v-if="errorMessage" class="form-alert" role="alert">
          <p>{{ errorMessage }}</p>
          <ul v-if="fieldErrors.length">
            <li v-for="(item, idx) in fieldErrors" :key="idx">{{ item }}</li>
          </ul>
        </div>

        <!-- SIGN UP BUTTON -->
        <button type="submit" class="register-button" :disabled="loading">
          {{ loading ? 'Signing Up…' : 'Sign Up' }}
          <ArrowRight v-if="!loading" :size="20" />
        </button>

      </form>

      <!-- DIVIDER -->
      <div class="divider">
        <span></span>
        <p>atau</p>
        <span></span>
      </div>

      <!-- GOOGLE REGISTER -->
      <button type="button" class="google-button">
        <span class="google-icon">G</span>
        <span>Daftar menggunakan Google</span>
      </button>

      <!-- LOGIN LINK -->
      <div class="register-footer">
        <span>Sudah punya akun?</span>

        <router-link to="/login">
          Sign In
        </router-link>
      </div>

    </section>

  </main>
</template>

<style scoped>
.register-page {
  width: 100%;
  min-height: 100vh;
  min-height: 100svh;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 24px 18px;

  background: #1b1d36;

  font-family: Arial, Helvetica, sans-serif;
}

.register-card {
  width: 100%;
  max-width: 585px;

  padding: 32px 42px;

  background: #ffffff;
  border-radius: 30px;

  color: #222222;
}

.register-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 13px;

  margin-bottom: 12px;
}

.register-heading h1 {
  margin: 0;

  color: #8738f5;

  font-size: 38px;
  font-weight: 700;
}

.logo-symbol {
  position: relative;

  width: 53px;
  height: 47px;

  flex-shrink: 0;
}

.logo-blue,
.logo-purple {
  position: absolute;

  width: 49px;
  height: 21px;

  border-radius: 7px;
  transform: skew(-25deg);
}

.logo-blue {
  top: 1px;
  left: 2px;

  background: linear-gradient(
    110deg,
    #28c0ff,
    #0876ef
  );
}

.logo-purple {
  bottom: 1px;
  right: 2px;

  background: linear-gradient(
    110deg,
    #c65aff,
    #8528f4
  );
}

.register-description {
  margin: 0 0 22px;

  text-align: center;

  color: #777777;
  font-size: 14px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;

  margin-bottom: 7px;

  color: #222222;

  font-size: 14px;
  font-weight: 600;
}

.input-wrapper {
  width: 100%;
  height: 48px;

  display: flex;
  align-items: center;
  gap: 11px;

  padding: 0 12px;

  border: 1px solid #aaaaaa;
  border-radius: 10px;

  background: #ffffff;

  transition: 0.2s;
}

.input-wrapper:focus-within {
  border-color: #8738f5;

  box-shadow: 0 0 0 3px
    rgba(135, 56, 245, 0.10);
}

.input-icon {
  flex-shrink: 0;
  color: #999999;
}

.input-wrapper input {
  width: 100%;
  min-width: 0;
  height: 100%;

  border: none;
  outline: none;

  background: transparent;

  color: #222222;
  font-size: 14px;
}

.input-wrapper input::placeholder {
  color: #a0a0a0;
}

.password-toggle {
  display: flex;
  align-items: center;
  justify-content: center;

  padding: 3px;

  border: none;
  background: transparent;

  color: #999999;
  flex-shrink: 0;
}

.register-button {
  width: 70%;
  height: 49px;

  margin: 8px auto 0;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;

  border: none;
  border-radius: 7px;

  background: linear-gradient(
    110deg,
    #5144ed,
    #8a32ed
  );

  color: #ffffff;

  font-size: 17px;
  font-weight: 700;

  transition: 0.2s;
}

.register-button:hover:not(:disabled) {
  filter: brightness(1.1);
}

.register-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.form-alert {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fdecec;
  color: #b42318;
  font-size: 13px;
  line-height: 1.4;
}

.form-alert p {
  margin: 0;
}

.form-alert ul {
  margin: 8px 0 0;
  padding-left: 18px;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;

  margin: 17px -42px;
}

.divider span {
  height: 1px;
  flex: 1;

  background: #dddddd;
}

.divider p {
  margin: 0;

  color: #888888;
  font-size: 14px;
}

.google-button {
  width: 100%;
  height: 47px;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;

  border: 1px solid #aaaaaa;
  border-radius: 9px;

  background: #ffffff;

  color: #777777;
  font-size: 14px;

  transition: 0.2s;
}

.google-button:hover {
  background: #f8f8f8;
}

.google-icon {
  font-family: Arial, sans-serif;
  font-size: 25px;
  font-weight: 800;

  background: conic-gradient(
    from -45deg,
    #4285f4 0deg 90deg,
    #34a853 90deg 180deg,
    #fbbc05 180deg 250deg,
    #ea4335 250deg 310deg,
    #4285f4 310deg
  );

  color: transparent;
  background-clip: text;
}

.register-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;

  margin-top: 22px;

  color: #777777;
  font-size: 13px;
}

.register-footer a {
  color: #8738f5;
  font-weight: 700;
  text-decoration: none;
}

.register-footer a:hover {
  text-decoration: underline;
}

@media (max-width: 600px) {
  .register-card {
    padding: 30px 22px;
    border-radius: 23px;
  }

  .register-heading h1 {
    font-size: 32px;
  }

  .divider {
    margin-left: -22px;
    margin-right: -22px;
  }

  .register-button {
    width: 80%;
  }
}
</style>
