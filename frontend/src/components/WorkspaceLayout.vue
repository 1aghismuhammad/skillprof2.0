<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useProjectStore } from '../stores/projects.js'
import {
  LayoutDashboard, UserRound, FolderKanban, BrainCircuit,
  ChartNoAxesColumnIncreasing, Target, GraduationCap, Lightbulb,
  TrendingUp, BriefcaseBusiness, Settings, LogOut, Search, Bell, X,
} from 'lucide-vue-next'

defineProps({ active: { type: String, default: '' } })
const router = useRouter()
const auth = useAuthStore()
const projectStore = useProjectStore()

const userName = computed(() => auth.user?.name || 'Student')
const analyzingCount = computed(() => projectStore.analyzingCount)
const notice = computed(() => projectStore.notice)

const groups = [
  { title: 'MAIN MENU', items: [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, key: 'dashboard' },
    { label: 'My Profile', to: '/my-profile', icon: UserRound, key: 'profile' },
    { label: 'My Project', to: '/projects', icon: FolderKanban, key: 'projects' },
    { label: 'AI Skill Analyzer', to: '/ai-skill-analyzer', icon: BrainCircuit, key: 'analyzer' },
    { label: 'Skill profile', to: '/skill-profile', icon: ChartNoAxesColumnIncreasing, key: 'skill-profile' },
    { label: 'Skill Gap Analysis', to: '/skill-gap-analysis', icon: Target, key: 'skill-gap' },
  ] },
  { title: 'DEVELOPMENT', items: [
    { label: 'Course Recommendations', to: '/courses', icon: GraduationCap, key: 'courses' },
    { label: 'Project Recommendations', to: '/recommendations', icon: Lightbulb, key: 'recommendations' },
    { label: 'Competency Progress', to: '/competency', icon: TrendingUp, key: 'competency' },
  ] },
  { title: 'PORTFOLIO', items: [
    { label: 'Portfolio Builder', to: '/portfolio', icon: BriefcaseBusiness, key: 'portfolio' },
  ] },
]

function go(path) {
  router.push(path)
}

function signOut() {
  auth.logout()
}

function openNotice() {
  const n = notice.value
  if (!n?.projectId) return
  projectStore.dismissNotice()
  router.push({ path: '/ai-skill-analyzer', query: { project: String(n.projectId) } })
}

function dismissNotice() {
  projectStore.dismissNotice()
}
</script>

<template>
  <div class="workspace-shell">
    <aside class="workspace-sidebar">
      <div class="workspace-brand">
        <div class="brand-mark"><span></span><i></i></div>
        <div class="brand-word">SKILL<br>PROOF</div>
      </div>
      <nav class="workspace-nav">
        <section v-for="group in groups" :key="group.title" class="nav-group">
          <p class="nav-caption">{{ group.title }}</p>
          <button
            v-for="item in group.items"
            :key="item.key"
            class="nav-item"
            :class="{ active: active === item.key }"
            @click="go(item.to)"
          >
            <component :is="item.icon" :size="19" /><span>{{ item.label }}</span>
          </button>
        </section>
      </nav>
      <div class="workspace-bottom">
        <p class="nav-caption">ACCOUNT</p>
        <button class="nav-item" :class="{ active: active === 'settings' }" @click="go('/settings')">
          <Settings :size="19" /><span>Settings</span>
        </button>
        <button class="nav-item" @click="signOut"><LogOut :size="19" /><span>Sign Out</span></button>
      </div>
    </aside>

    <main class="workspace-main">
      <header class="workspace-topbar">
        <div class="workspace-search">
          <Search :size="19" /><input placeholder="Search projects, skills, or anything" /><kbd>⌘ K</kbd>
        </div>
        <div class="workspace-user-area">
          <span v-if="analyzingCount > 0" class="ai-pill" aria-live="polite">
            <BrainCircuit :size="14" />
            AI menganalisis {{ analyzingCount }} proyek…
          </span>
          <button class="notification-button" aria-label="Notifications"><Bell :size="19" /><i></i></button>
          <div class="workspace-user">
            <span>{{ userName.charAt(0).toUpperCase() }}</span>
            <strong>{{ userName }}</strong>
          </div>
        </div>
      </header>

      <div
        v-if="notice"
        class="workspace-notice"
        :class="notice.kind === 'error' ? 'is-error' : 'is-done'"
        role="status"
      >
        <button type="button" class="notice-body" @click="openNotice">
          <template v-if="notice.kind === 'done'">
            Analisis '{{ notice.title }}' selesai — Tinjau hasil →
          </template>
          <template v-else>
            Analisis '{{ notice.title }}' gagal: {{ notice.message || 'Terjadi kesalahan.' }}
          </template>
        </button>
        <button type="button" class="notice-close" aria-label="Tutup" @click="dismissNotice">
          <X :size="15" />
        </button>
      </div>

      <div class="workspace-page"><slot /></div>
    </main>
  </div>
</template>

<style>
.workspace-shell{display:flex;min-height:100vh;background:#1b1d36;color:#f5f6ff;font-family:Arial,Helvetica,sans-serif}.workspace-sidebar{width:205px;min-width:205px;background:#17192e;border-right:1px solid #343752;display:flex;flex-direction:column;min-height:100vh}.workspace-brand{height:76px;display:flex;align-items:center;gap:11px;padding:0 20px;border-bottom:1px solid #30334d;flex:none}.brand-mark{position:relative;width:38px;height:36px;flex:none}.brand-mark span,.brand-mark i{position:absolute;width:35px;height:16px;border-radius:5px;transform:skew(-25deg)}.brand-mark span{top:1px;left:1px;background:linear-gradient(110deg,#28c0ff,#0876ef)}.brand-mark i{bottom:1px;right:1px;background:linear-gradient(110deg,#c65aff,#8528f4)}.brand-word{font:15px/15px Georgia,serif}.workspace-nav{padding:17px 10px 10px}.nav-group{margin-bottom:16px}.nav-caption{font-size:9px;font-weight:700;letter-spacing:1.1px;color:#777c9e;margin:7px 9px 10px}.nav-item{width:100%;min-height:39px;display:flex;align-items:center;gap:12px;padding:9px 11px;margin:2px 0;border:0;border-radius:7px;background:transparent;color:#c2c5d9;text-align:left;font-size:12px;cursor:pointer}.nav-item svg{flex:none}.nav-item:hover{background:#252946;color:#fff}.nav-item.active{background:#292e59;color:#fff;border-left:3px solid #9747ff;padding-left:8px}.nav-item.active svg{color:#b86aff}.workspace-bottom{margin-top:auto;padding:13px 10px 20px;border-top:1px solid #30334d}.workspace-main{flex:1;min-width:0}.workspace-topbar{height:76px;padding:0 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #30334d;gap:18px}.workspace-search{height:43px;width:min(500px,55%);display:flex;align-items:center;gap:12px;padding:0 14px;border:1px solid #3c426b;border-radius:9px;background:#252946;color:#aeb5d4}.workspace-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#fff;font-size:13px}.workspace-search input::placeholder{color:#aeb5d4}.workspace-search kbd{padding:4px 7px;border:1px solid #454b70;border-radius:5px;font-size:10px}.workspace-user-area{display:flex;align-items:center;gap:16px}.ai-pill{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:#2a2155;border:1px solid #6a49c7;color:#d7c8ff;font-size:11px;font-weight:600;white-space:nowrap}.notification-button{position:relative;border:0;background:transparent;color:#cbd0e5;cursor:pointer}.notification-button i{position:absolute;right:1px;top:1px;width:6px;height:6px;background:#a64cff;border-radius:50%}.workspace-user{display:flex;align-items:center;gap:10px;font-size:13px}.workspace-user span{width:36px;height:36px;border:1px solid #70769d;border-radius:50%;display:grid;place-items:center;background:#343a62;font-weight:700}.workspace-notice{display:flex;align-items:center;gap:10px;margin:12px 32px 0;padding:10px 12px;border-radius:8px;font-size:13px}.workspace-notice.is-done{background:#14352f;border:1px solid #1f6a57;color:#2fe0b0}.workspace-notice.is-error{background:#3a1f2c;border:1px solid #6a3140;color:#ffb4b4}.notice-body{flex:1;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-size:13px;font-weight:600}.notice-close{border:0;background:transparent;color:inherit;cursor:pointer;display:grid;place-items:center}.workspace-page{max-width:1450px;margin:0 auto;padding:28px 32px 34px;min-width:0}
@media(max-width:1000px){.workspace-sidebar{width:76px;min-width:76px}.workspace-brand{justify-content:center;padding:0}.brand-word,.workspace-nav .nav-caption,.workspace-bottom .nav-caption,.nav-item span{display:none}.workspace-nav,.workspace-bottom{padding-left:7px;padding-right:7px}.nav-item{justify-content:center;padding:11px 0}.nav-item.active{padding-left:0}.workspace-page{padding:24px 20px}.workspace-notice{margin-left:20px;margin-right:20px}}
@media(max-width:700px){.workspace-sidebar{width:60px;min-width:60px}.workspace-brand{height:65px}.workspace-topbar{height:65px;padding:0 14px;gap:10px}.workspace-search{width:38%}.workspace-search kbd{display:none}.workspace-user-area{gap:8px;flex-wrap:wrap;justify-content:flex-end}.workspace-user strong{display:none}.ai-pill{font-size:10px;padding:5px 8px;max-width:160px;white-space:normal;line-height:1.25}.workspace-page{padding:22px 14px}.workspace-notice{margin-left:14px;margin-right:14px}}
</style>
