import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { createAppI18n } from './i18n'
import './styles/main.css'

/* v8 ignore start -- @preserve mounts the app on the real document; there is no logic to test */
const pinia = createPinia()
createApp(App).use(pinia).use(createAppI18n(pinia)).mount('#app')
/* v8 ignore stop -- @preserve */
