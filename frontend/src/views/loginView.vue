<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { safeRedirect } from '../router/guard.js'

import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  errorMessage.value = ''

  if (!email.value || !password.value) {
    errorMessage.value = 'Silakan masukkan email dan kata sandi.'
    return
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(email.value)) {
    errorMessage.value = 'Format alamat email tidak valid.'
    return
  }

  if (password.value.length < 8) {
    errorMessage.value = 'Kata sandi minimal 8 karakter.'
    return
  }

  loading.value = true
  try {
    await auth.login(email.value.trim(), password.value)
    await router.replace(safeRedirect(route.query.redirect))
  } catch (err) {
    errorMessage.value = err?.message || 'Login gagal. Coba lagi.'
  } finally {
    loading.value = false
  }
}

const goToRegister = () => {
  router.push('/register')
}
</script>

<template>
  <main class="login-page">

    <section class="login-card">

      <!-- LOGO -->
      <div class="login-logo">

        <div class="logo-symbol">
          <span class="logo-blue"></span>
          <span class="logo-purple"></span>
        </div>

        <span>Sign In</span>

      </div>

      <!-- LOGIN FORM -->
      <form @submit.prevent="handleLogin">

        <!-- EMAIL -->
        <div class="form-group">

          <label for="email">
            Alamat Email
          </label>

          <div class="input-wrapper">

            <Mail :size="19" class="input-icon" />

            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="Enter your email"
              autocomplete="email"
              required
            />

          </div>

        </div>

        <!-- PASSWORD -->
        <div class="form-group">

          <label for="password">
            Kata Sandi
          </label>

          <div class="input-wrapper">

            <Lock :size="19" class="input-icon" />

            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Enter your password"
              autocomplete="current-password"
              required
            />

            <!-- SHOW / HIDE PASSWORD -->
            <button
              type="button"
              class="password-toggle"
              @click="showPassword = !showPassword"
              aria-label="Toggle password visibility"
            >
              <Eye
                v-if="!showPassword"
                :size="19"
              />

              <EyeOff
                v-else
                :size="19"
              />
            </button>

          </div>

        </div>

        <p v-if="errorMessage" class="form-alert" role="alert">{{ errorMessage }}</p>

        <!-- SIGN IN BUTTON -->
        <button
          type="submit"
          class="login-button"
          :disabled="loading"
        >
          {{ loading ? 'Signing In…' : 'Sign In' }}
          <ArrowRight v-if="!loading" :size="19" />
        </button>

      </form>

      <!-- DIVIDER -->
      <div class="divider">

        <span></span>

        <p>atau</p>

        <span></span>

      </div>

      <!-- GOOGLE LOGIN -->
      <button
        type="button"
        class="google-button"
        @click="alert('Google Sign In will be connected later.')"
      >
        <span class="google-icon">G</span>

        Sign in menggunakan Google
      </button>

      <!-- FOOTER -->
      <div class="login-footer">

        <p>
          Belum punya akun?

          <button
            type="button"
            class="signup-link"
            @click="goToRegister"
          >
            Sign Up
          </button>

        </p>

      </div>

    </section>

  </main>
</template>

<style scoped>

/* =========================
   LOGIN BACKGROUND
========================= */

.login-page {
  min-height: 100vh;
  min-height: 100svh;
  width: 100%;

  background: #1b1d36;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 24px;

  font-family: Arial, Helvetica, sans-serif;
}


/* =========================
   LOGIN CARD
========================= */

.login-card {
  width: 100%;
  max-width: 390px;

  min-height: 465px;

  background: #ffffff;

  border-radius: 22px;

  padding: 30px 28px;

  color: #222222;

  box-shadow: 0 15px 45px rgba(0, 0, 0, 0.2);
}


/* =========================
   LOGO HEADING
========================= */

.login-logo {
  display: flex;
  justify-content: center;
  align-items: center;

  gap: 10px;

  margin-bottom: 38px;

  color: #8738f5;

  font-size: 27px;
  font-weight: 700;
}


/* LOGO */

.logo-symbol {
  position: relative;

  width: 39px;
  height: 37px;
}

.logo-blue,
.logo-purple {
  position: absolute;

  width: 35px;
  height: 16px;

  border-radius: 5px;

  transform: skew(-25deg);
}

.logo-blue {
  top: 2px;
  left: 2px;

  background: linear-gradient(
    110deg,
    #28c0ff,
    #0876ef
  );
}

.logo-purple {
  bottom: 2px;
  right: 2px;

  background: linear-gradient(
    110deg,
    #c65aff,
    #8528f4
  );
}


/* =========================
   FORM GROUP
========================= */

.form-group {
  margin-bottom: 22px;
}

.form-group label {
  display: block;

  margin-bottom: 8px;

  font-size: 13px;
  font-weight: 600;

  color: #222222;
}


/* =========================
   INPUT
========================= */

.input-wrapper {
  height: 44px;
  width: 100%;

  display: flex;
  align-items: center;

  gap: 10px;

  border: 1px solid #a7a7a7;
  border-radius: 9px;

  padding: 0 11px;

  transition: 0.2s;
}

.input-wrapper:focus-within {
  border-color: #8438f5;

  box-shadow: 0 0 0 2px
    rgba(132, 56, 245, 0.10);
}

.input-icon {
  color: #929292;
  flex-shrink: 0;
}

.input-wrapper input {
  width: 100%;
  min-width: 0;

  border: none;
  outline: none;

  background: transparent;

  color: #222222;

  font-size: 13px;
}

.input-wrapper input::placeholder {
  color: #a0a0a0;
}


/* PASSWORD TOGGLE */

.password-toggle {
  display: flex;
  align-items: center;

  border: none;
  background: transparent;

  color: #999999;

  cursor: pointer;
}


/* =========================
   SIGN IN BUTTON
========================= */

.login-button {
  width: 70%;
  height: 43px;

  margin: 5px auto 0;

  display: flex;
  align-items: center;
  justify-content: center;

  gap: 9px;

  border: none;
  border-radius: 6px;

  background: linear-gradient(
    110deg,
    #5144ed,
    #8a32ed
  );

  color: #ffffff;

  font-size: 15px;
  font-weight: 700;

  transition: 0.2s;

  cursor: pointer;
}

.login-button:hover:not(:disabled) {
  filter: brightness(1.1);
}

.login-button:disabled {
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


/* =========================
   DIVIDER
========================= */

.divider {
  display: flex;
  align-items: center;

  gap: 10px;

  margin: 16px -28px;
}

.divider span {
  height: 1px;

  flex: 1;

  background: #dddddd;
}

.divider p {
  margin: 0;

  color: #888888;

  font-size: 13px;
}


/* =========================
   GOOGLE BUTTON
========================= */

.google-button {
  width: 100%;
  height: 43px;

  display: flex;
  justify-content: center;
  align-items: center;

  gap: 9px;

  border: 1px solid #aaaaaa;
  border-radius: 8px;

  background: #ffffff;

  color: #777777;

  font-size: 13px;

  cursor: pointer;
}

.google-button:hover {
  background: #f7f7f7;
}

.google-icon {
  font-size: 22px;
  font-weight: 800;

  font-family: Arial, sans-serif;

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


/* =========================
   FOOTER
========================= */

.login-footer {
  margin-top: 28px;

  text-align: center;
}

.login-footer p {
  margin: 0;

  color: #777777;

  font-size: 12px;
}

.signup-link {
  padding: 0;

  border: none;
  background: transparent;

  color: #8738f5;

  font-weight: 700;
  font-size: inherit;

  cursor: pointer;
}

.signup-link:hover {
  text-decoration: underline;
}


/* =========================
   RESPONSIVE
========================= */

@media (max-width: 480px) {

  .login-card {
    padding: 28px 22px;
  }

  .divider {
    margin-left: -22px;
    margin-right: -22px;
  }

}

</style>
