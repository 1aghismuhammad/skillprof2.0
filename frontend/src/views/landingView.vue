
<script setup>
import {
  Sparkles,
  BrainCircuit,
  Search,
  Award,
  ArrowRight
} from 'lucide-vue-next'

const features = [
  {
    title: 'AI Skill Identification',
    description:
      'Identify your skills from real projects, individual contributions, and supporting evidence.',
    icon: BrainCircuit,
    color: 'blue'
  },
  {
    title: 'Skill Gap Analysis',
    description:
      'Compare your current competencies with the skills required for your career goals.',
    icon: Search,
    color: 'purple'
  },
  {
    title: 'Evidence-Based Portfolio',
    description:
      'Build a professional portfolio showcasing your verified skills and project evidence.',
    icon: Award,
    color: 'cyan'
  }
]
</script>

<template>
  <div class="landing-page">

    <!-- NAVBAR -->
    <header class="navbar">

      <div class="brand">
        <div class="brand-symbol">
          <span class="symbol-blue"></span>
          <span class="symbol-purple"></span>
        </div>

        <div class="brand-name">
          <span>SKILL</span>
          <span>PROOF</span>
        </div>
      </div>

      <!-- NAVIGATION BUTTONS -->
      <div class="nav-actions">

        <router-link
          to="/login"
          class="btn-signin"
        >
          Sign In
        </router-link>

        <router-link
          to="/register"
          class="btn-signup"
        >
          Sign Up
        </router-link>

      </div>

    </header>

    <!-- MAIN CONTENT -->
    <main class="main-content">

      <!-- HERO -->
      <section class="hero-section">

        <div class="hero-badge">
          <Sparkles :size="17" />
          <span>Student Career & Skill Development Platform</span>
        </div>

        <h1>
          Turn Your Projects Into Real Skills
        </h1>

        <p class="hero-description">
          Discover your potential, prove your competencies, and build a portfolio
          that represents your real abilities.
        </p>

        <!-- GET STARTED BUTTON -->
        <router-link
          to="/register"
          class="btn-get-started"
        >
          Get Started
          <ArrowRight :size="19" />
        </router-link>

      </section>

      <!-- FEATURE CARDS -->
      <section class="feature-section">

        <article
          v-for="feature in features"
          :key="feature.title"
          class="feature-card"
        >

          <div
            class="feature-icon"
            :class="`icon-${feature.color}`"
          >
            <component :is="feature.icon" :size="23" />
          </div>

          <h2>{{ feature.title }}</h2>

          <p>{{ feature.description }}</p>

        </article>

      </section>

    </main>

  </div>
</template>

<style scoped>
/* =========================
   GLOBAL LANDING PAGE
========================= */

.landing-page {
  width: 100%;
  min-height: 100vh;
  min-height: 100svh;
  background: #1b1d36;
  color: #ffffff;
  overflow-x: hidden;
  font-family: Arial, Helvetica, sans-serif;
}

/* =========================
   NAVBAR
========================= */

.navbar {
  width: 100%;
  height: 72px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-symbol {
  width: 43px;
  height: 42px;
  position: relative;
}

.symbol-blue,
.symbol-purple {
  position: absolute;
  width: 39px;
  height: 18px;
  border-radius: 5px;
  transform: skew(-25deg);
}

.symbol-blue {
  top: 2px;
  left: 3px;
  background: linear-gradient(110deg, #25c1ff, #0876ef);
}

.symbol-purple {
  bottom: 2px;
  right: 3px;
  background: linear-gradient(110deg, #c65aff, #8528f4);
}

.brand-name {
  display: flex;
  flex-direction: column;
  font-family: Georgia, serif;
  font-size: 17px;
  line-height: 17px;
  letter-spacing: 0.3px;
}

/* NAVIGATION */
.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-signin,
.btn-signup {
  height: 38px;
  padding: 0 20px;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  transition: 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  cursor: pointer;
}

.btn-signin {
  background: transparent;
  border: 1px solid #596080;
}

.btn-signin:hover {
  background: rgba(255,255,255,0.08);
}

.btn-signup {
  border: none;
  background: linear-gradient(110deg, #285dff, #9415f5);
}

.btn-signup:hover,
.btn-get-started:hover {
  filter: brightness(1.12);
}

/* =========================
   MAIN CONTENT
========================= */

.main-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* =========================
   HERO SECTION
========================= */

.hero-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: clamp(48px, 9vh, 76px) 24px 0;
}

.hero-badge {
  min-height: 36px;
  padding: 8px 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 50px;
  background: #ffffff;
  color: #9145f5;
  font-size: 12px;
  font-weight: 600;
}

.hero-section h1 {
  margin: 25px 0 0;
  font-size: clamp(30px, 2.8vw, 38px);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.8px;
}

.hero-description {
  max-width: 620px;
  margin: 15px 0 0;
  color: #d1d3e0;
  font-size: 14px;
  line-height: 1.7;
}

/* GET STARTED */
.btn-get-started {
  height: 42px;
  min-width: 135px;
  padding: 0 20px;
  margin-top: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(110deg, #285dff, #9415f5);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: 0.2s ease;
  cursor: pointer;
}

/* =========================
   FEATURE SECTION
========================= */

.feature-section {
  width: min(92%, 1100px);
  margin: clamp(45px, 8vh, 68px) auto 30px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 30px;
}

.feature-card {
  min-height: 132px;
  padding: 16px;
  border: 1px solid #39436f;
  border-radius: 13px;
  background: #242747;
  transition: 0.25s ease;
}

.feature-card:hover {
  transform: translateY(-3px);
  border-color: #7773db;
}

.feature-icon {
  width: 36px;
  height: 36px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.icon-blue {
  color: #54a5ff;
  background: rgba(48, 126, 255, 0.20);
}

.icon-purple {
  color: #c47aff;
  background: rgba(160, 76, 255, 0.20);
}

.icon-cyan {
  color: #20d5ed;
  background: rgba(0, 191, 220, 0.20);
}

.feature-card h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.feature-card p {
  margin: 9px 0 0;
  color: #d1d3e0;
  font-size: 11px;
  line-height: 1.6;
}

/* =========================
   LAPTOP / SHORT SCREEN
========================= */

@media (max-height: 700px) and (min-width: 769px) {
  .navbar {
    height: 64px;
  }

  .hero-section {
    padding-top: 38px;
  }

  .hero-section h1 {
    margin-top: 18px;
    font-size: 32px;
  }

  .hero-description {
    margin-top: 10px;
  }

  .btn-get-started {
    margin-top: 16px;
  }

  .feature-section {
    margin-top: 35px;
  }

  .feature-card {
    min-height: 118px;
    padding: 13px;
  }
}

/* =========================
   MOBILE RESPONSIVE
========================= */

@media (max-width: 768px) {
  .navbar {
    height: 65px;
    padding: 0 16px;
  }

  .brand-symbol {
    transform: scale(0.85);
    transform-origin: left center;
    width: 38px;
  }

  .brand-name {
    font-size: 15px;
    line-height: 15px;
  }

  .btn-signin,
  .btn-signup {
    height: 34px;
    padding: 0 12px;
    font-size: 12px;
  }

  .hero-section {
    padding-top: 65px;
  }

  .hero-badge {
    font-size: 10px;
    padding: 8px 12px;
  }

  .hero-section h1 {
    max-width: 550px;
    font-size: clamp(27px, 6vw, 36px);
  }

  .hero-description {
    max-width: 480px;
    font-size: 13px;
  }

  .feature-section {
    width: min(90%, 520px);
    grid-template-columns: 1fr;
    gap: 16px;
    margin-top: 45px;
  }

  .feature-card {
    min-height: 130px;
  }
}

@media (max-width: 380px) {
  .brand {
    gap: 5px;
  }

  .brand-name {
    font-size: 13px;
  }

  .btn-signin,
  .btn-signup {
    padding: 0 9px;
  }

  .hero-badge {
    font-size: 9px;
  }
}
</style>
