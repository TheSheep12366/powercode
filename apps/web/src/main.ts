import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { initTheme } from './composables/theme';
import router from './router';
// 思源黑体（Noto Sans SC）自托管，局域网内无需访问外网 CDN
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/500.css';
import '@fontsource/noto-sans-sc/700.css';
import './styles/fuxsto.css';

// 主题初始化（index.html 内联脚本已处理首帧防闪，这里同步组合式状态）
initTheme();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
