import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from './lib/api.js'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

setUnauthorizedHandler(() => {
  const r = router.currentRoute.value
  if (r.meta.requiresAuth) {
    window.location.assign(`/login?redirect=${encodeURIComponent(r.fullPath)}`)
  }
})

app.mount('#app')
