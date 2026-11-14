import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { resolveNavigation } from './guard.js'

import LandingView from '../views/landingView.vue'
import LoginView from '../views/loginView.vue'
import RegisterView from '../views/registerView.vue'
import ProfileView from '../views/profileView.vue'
import DashboardView from '../views/dashboardView.vue'
import MyProfileView from '../views/myProfileView.vue'
import MyProjectView from '../views/myProjectView.vue'
import AiSkillAnalyzerView from '../views/aiSkillAnalyzerView.vue'
import SkillProfileView from '../views/skillProfileView.vue'
import SkillGapAnalysisView from '../views/skillGapAnalysisView.vue'
import CourseRecommendationsView from '../views/courseRecommendationsView.vue'
import ProjectRecommendationsView from '../views/projectRecommendationsView.vue'
import CompetencyProgressView from '../views/competencyProgressView.vue'
import PortfolioBuilderView from '../views/portfolioBuilderView.vue'
import PublicPortfolioView from '../views/publicPortfolioView.vue'
import SettingsView from '../views/settingsView.vue'

const authMeta = { requiresAuth: true }
const guestMeta = { guestOnly: true }

const routes = [
  { path: '/', name: 'Landing', component: LandingView },
  { path: '/login', name: 'Login', component: LoginView, meta: guestMeta },
  { path: '/register', name: 'Register', component: RegisterView, meta: guestMeta },
  { path: '/complete-profile', name: 'CompleteProfile', component: ProfileView, meta: authMeta },
  { path: '/my-profile', name: 'MyProfile', component: MyProfileView, meta: authMeta },
  { path: '/projects', name: 'MyProjects', component: MyProjectView, meta: authMeta },
  { path: '/dashboard', name: 'Dashboard', component: DashboardView, meta: authMeta },
  {
    path: '/ai-skill-analyzer',
    alias: '/ai-analyzer',
    name: 'AiSkillAnalyzer',
    component: AiSkillAnalyzerView,
    meta: authMeta,
  },
  { path: '/skill-profile', name: 'SkillProfile', component: SkillProfileView, meta: authMeta },
  {
    path: '/skill-gap-analysis',
    alias: '/skill-gap',
    name: 'SkillGapAnalysis',
    component: SkillGapAnalysisView,
    meta: authMeta,
  },
  { path: '/courses', name: 'CourseRecommendations', component: CourseRecommendationsView, meta: authMeta },
  {
    path: '/recommendations',
    name: 'ProjectRecommendations',
    component: ProjectRecommendationsView,
    meta: authMeta,
  },
  { path: '/competency', name: 'CompetencyProgress', component: CompetencyProgressView, meta: authMeta },
  { path: '/portfolio', name: 'PortfolioBuilder', component: PortfolioBuilderView, meta: authMeta },
  { path: '/settings', name: 'Settings', component: SettingsView, meta: authMeta },
  { path: '/p/:slug', name: 'PublicPortfolio', component: PublicPortfolioView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth || to.meta.guestOnly) {
    await auth.ensureSession()
  }
  // Pass session + soft profile-completion flags into pure resolveNavigation.
  return resolveNavigation(to, {
    isAuthenticated: auth.isAuthenticated,
    profileIncomplete: auth.profileIncomplete,
    profilePromptDismissed: auth.profilePromptDismissed,
  })
})

export default router
