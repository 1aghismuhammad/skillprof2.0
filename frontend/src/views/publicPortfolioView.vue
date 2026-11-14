<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { BriefcaseBusiness, ExternalLink, FolderKanban, Mail, Sparkles } from 'lucide-vue-next'
import { usePortfolioStore } from '../stores/portfolio.js'
import { isHttpUrl } from '../lib/url.js'

const NOT_FOUND_MSG = 'Portofolio tidak ditemukan atau belum dipublikasikan.'
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const route = useRoute()
const portfolioStore = usePortfolioStore()

const loading = ref(true)
const error = ref('')
const data = ref(null)

let loadSeq = 0

const author = computed(() => data.value?.author || null)
const contact = computed(() => data.value?.contact || {})
const careerTarget = computed(() => data.value?.career_target || null)
const projects = computed(() => data.value?.projects || [])
const skills = computed(() => data.value?.skills || [])
const displayBio = computed(() =>
  data.value?.custom_bio || author.value?.bio || '',
)

const avatarUrl = computed(() => {
  const url = author.value?.avatar_url
  return isHttpUrl(url) ? url.trim() : ''
})

const hasContact = computed(() => {
  const c = contact.value
  return Boolean(
    (c.public_email && String(c.public_email).trim())
    || (c.github_url && isHttpUrl(c.github_url))
    || (c.linkedin_url && isHttpUrl(c.linkedin_url))
    || (c.website_url && isHttpUrl(c.website_url)),
  )
})

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatScore(score) {
  return score == null || score === '' ? '—' : String(score)
}

async function load() {
  const seq = ++loadSeq
  const targetSlug = String(route.params.slug || '')
  if (seq === loadSeq) {
    loading.value = true
    error.value = ''
    data.value = null
  }
  if (!SLUG_RE.test(targetSlug)) {
    if (seq !== loadSeq) return
    data.value = null
    error.value = NOT_FOUND_MSG
    document.title = 'Portofolio - SkillProof'
    loading.value = false
    return
  }
  try {
    const resData = await portfolioStore.fetchPublic(targetSlug)
    if (seq !== loadSeq) return
    data.value = resData
    error.value = ''
    document.title = resData?.title
      ? `${resData.title} - SkillProof`
      : 'Portofolio Publik - SkillProof'
  } catch (err) {
    if (seq !== loadSeq) return
    data.value = null
    document.title = 'Portofolio - SkillProof'
    if (err?.status === 404) {
      error.value = NOT_FOUND_MSG
    } else {
      error.value = 'Gagal memuat portofolio, coba lagi.'
    }
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

onMounted(load)
watch(() => route.params.slug, load)
</script>

<template>
  <div class="pub-page">
    <header class="pub-nav">
      <RouterLink to="/" class="brand">Skill<span>Proof</span></RouterLink>
    </header>

    <main class="pub-main">
      <p v-if="loading" class="state">Memuat portofolio…</p>
      <p v-else-if="error" class="state error" role="alert">{{ error }}</p>

      <template v-else-if="data">
        <section class="hero">
          <div class="author" v-if="author">
            <img v-if="avatarUrl" :src="avatarUrl" :alt="author.name || 'Avatar'" class="avatar" />
            <div v-else class="avatar fallback">{{ (author.name || '?').slice(0, 1) }}</div>
            <div>
              <p class="author-name">{{ author.name || 'Penulis' }}</p>
            </div>
          </div>

          <h1>{{ data.title }}</h1>
          <p v-if="data.published_at" class="meta">Dipublikasikan {{ formatDate(data.published_at) }}</p>
          <p v-if="data.summary" class="summary">{{ data.summary }}</p>
          <p v-if="displayBio" class="bio">{{ displayBio }}</p>

          <div v-if="hasContact" class="contact">
            <a
              v-if="contact.public_email"
              :href="`mailto:${contact.public_email}`"
              class="chip"
            >
              <Mail :size="14" /> {{ contact.public_email }}
            </a>
            <a
              v-if="isHttpUrl(contact.github_url)"
              :href="contact.github_url.trim()"
              target="_blank"
              rel="noopener noreferrer"
              class="chip"
            >
              <ExternalLink :size="14" /> GitHub
            </a>
            <a
              v-if="isHttpUrl(contact.linkedin_url)"
              :href="contact.linkedin_url.trim()"
              target="_blank"
              rel="noopener noreferrer"
              class="chip"
            >
              <ExternalLink :size="14" /> LinkedIn
            </a>
            <a
              v-if="isHttpUrl(contact.website_url)"
              :href="contact.website_url.trim()"
              target="_blank"
              rel="noopener noreferrer"
              class="chip"
            >
              <ExternalLink :size="14" /> Website
            </a>
          </div>
        </section>

        <section v-if="careerTarget" class="block">
          <h2><BriefcaseBusiness :size="16" /> Target Karier</h2>
          <p class="target-title">{{ careerTarget.title }}</p>
          <p v-if="careerTarget.description" class="muted">{{ careerTarget.description }}</p>
        </section>

        <section class="block">
          <h2><FolderKanban :size="16" /> Proyek</h2>
          <p v-if="!projects.length" class="muted">Belum ada proyek ditampilkan.</p>
          <article v-for="p in projects" :key="p.id || p.title" class="project">
            <div class="project-head">
              <h3>{{ p.title }}</h3>
              <span v-if="p.is_featured" class="badge">Featured</span>
            </div>
            <p class="muted dates">
              <template v-if="p.start_date || p.end_date">
                {{ formatDate(p.start_date) || '—' }} — {{ formatDate(p.end_date) || 'sekarang' }}
              </template>
            </p>
            <p v-if="p.description">{{ p.description }}</p>
            <div class="links">
              <a
                v-if="isHttpUrl(p.repository_url)"
                :href="p.repository_url.trim()"
                target="_blank"
                rel="noopener noreferrer"
              >Repository</a>
              <a
                v-if="isHttpUrl(p.live_url)"
                :href="p.live_url.trim()"
                target="_blank"
                rel="noopener noreferrer"
              >Demo</a>
            </div>
            <ul v-if="p.evidences?.length" class="evidences">
              <li v-for="(e, idx) in p.evidences" :key="idx">
                <span>{{ e.title || e.evidence_type || 'Bukti' }}</span>
                <a
                  v-if="isHttpUrl(e.url)"
                  :href="e.url.trim()"
                  target="_blank"
                  rel="noopener noreferrer"
                >Buka</a>
              </li>
            </ul>
          </article>
        </section>

        <section class="block">
          <h2><Sparkles :size="16" /> Skill</h2>
          <p v-if="!skills.length" class="muted">Belum ada skill ditampilkan.</p>
          <div v-else class="skill-list">
            <div v-for="s in skills" :key="s.id || s.name" class="skill">
              <div class="skill-top">
                <strong>{{ s.name }}</strong>
                <span>{{ s.proficiency_level || '—' }}</span>
              </div>
              <p class="muted">
                {{ s.category || '—' }} · Skor {{ formatScore(s.score) }}
                <template v-if="s.verified_at"> · Terverifikasi {{ formatDate(s.verified_at) }}</template>
              </p>
            </div>
          </div>
        </section>
      </template>
    </main>

    <footer class="pub-foot">
      <span>SkillProof</span>
      <RouterLink to="/">Beranda</RouterLink>
    </footer>
  </div>
</template>

<style scoped>
.pub-page{
  min-height:100vh;
  background:
    radial-gradient(ellipse 80% 50% at 10% -10%, rgba(112,43,242,.22), transparent 55%),
    radial-gradient(ellipse 60% 40% at 90% 0%, rgba(23,214,232,.12), transparent 50%),
    #0b1022;
  color:#e8eaff;
  display:flex;
  flex-direction:column;
}
.pub-nav{
  display:flex;
  align-items:center;
  padding:18px 24px;
  border-bottom:1px solid #1e2a4a;
}
.brand{
  font-size:18px;
  font-weight:700;
  color:#e8eaff;
  text-decoration:none;
  letter-spacing:.02em;
}
.brand span{color:#a66aff}
.pub-main{
  width:min(860px,100%);
  margin:0 auto;
  padding:28px 20px 48px;
  flex:1;
}
.state{font-size:15px;color:#b8c1da;text-align:center;margin:48px 0}
.state.error{color:#ffb4b4;background:#3a1f2c;border-radius:8px;padding:16px}
.hero{margin-bottom:28px}
.author{display:flex;align-items:center;gap:14px;margin-bottom:18px}
.avatar{
  width:56px;height:56px;border-radius:50%;object-fit:cover;
  border:1px solid #35436a;background:#171e3a;flex:none;
}
.avatar.fallback{
  display:grid;place-items:center;font-size:20px;font-weight:700;color:#d0b1ff;
}
.author-name{margin:0;font-size:15px;font-weight:600}
.author-bio{margin:4px 0 0;font-size:13px;color:#aeb8d0;line-height:1.4}
.hero h1{font-size:clamp(26px,4vw,36px);margin:0 0 8px;line-height:1.2}
.meta{font-size:12px;color:#15c6dc;margin:0 0 12px}
.summary,.bio{font-size:15px;line-height:1.6;color:#c4c8dd;margin:0 0 10px}
.contact{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{
  display:inline-flex;align-items:center;gap:6px;
  background:#171e3a;border:1px solid #35436a;color:#d7dcf0;
  border-radius:999px;padding:7px 12px;font-size:12px;text-decoration:none;
}
.chip:hover{border-color:#783cff;color:#fff}
.block{margin-bottom:28px}
.block h2{
  display:flex;align-items:center;gap:8px;
  font-size:15px;margin:0 0 14px;padding-bottom:8px;
  border-bottom:1px solid #243356;
}
.target-title{font-size:16px;font-weight:600;margin:0 0 6px}
.muted{color:#aeb8d0;font-size:13px;line-height:1.5;margin:0}
.project{
  background:#111a35;border:1px solid #28375e;border-radius:10px;
  padding:16px;margin-bottom:12px;
}
.project-head{display:flex;align-items:center;gap:10px;justify-content:space-between}
.project h3{margin:0;font-size:16px}
.badge{
  font-size:10px;background:#29205b;color:#d0b1ff;
  padding:3px 8px;border-radius:10px;white-space:nowrap;
}
.dates{margin:6px 0 8px}
.project>p{font-size:14px;line-height:1.55;color:#c4c8dd;margin:0 0 10px}
.links{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.links a,.evidences a{color:#16d5e7;font-size:13px;text-decoration:none}
.links a:hover,.evidences a:hover{text-decoration:underline}
.evidences{list-style:none;padding:0;margin:10px 0 0;border-top:1px solid #243356;padding-top:10px}
.evidences li{
  display:flex;justify-content:space-between;gap:10px;
  font-size:13px;color:#b8c1da;margin:6px 0;
}
.skill-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.skill{
  background:#111a35;border:1px solid #28375e;border-radius:10px;padding:12px;
}
.skill-top{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:13px}
.skill-top span{color:#c49aff}
.pub-foot{
  display:flex;justify-content:space-between;align-items:center;
  padding:16px 24px;border-top:1px solid #1e2a4a;font-size:12px;color:#8f95b3;
}
.pub-foot a{color:#16d5e7;text-decoration:none}
@media(max-width:640px){
  .skill-list{grid-template-columns:1fr}
  .pub-nav,.pub-foot{padding:14px 16px}
}
</style>
