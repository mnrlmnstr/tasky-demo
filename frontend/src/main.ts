import { createApp } from 'vue'

import App from './App.vue'
import './styles/main.css'

/* v8 ignore next -- @preserve mounts the app on the real document; there is no logic to test */
createApp(App).mount('#app')
