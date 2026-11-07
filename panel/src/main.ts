/** 面板入口：挂载 Vue 应用到 #app，加载全局样式。 */
import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

createApp(App).mount("#app");
