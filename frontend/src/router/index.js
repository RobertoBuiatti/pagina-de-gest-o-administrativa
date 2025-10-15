import { createRouter, createWebHistory } from 'vue-router'
import OcrView from '../views/Ocr/OcrView.vue'
import BalanceView from '../views/Balance/BalanceView.vue'
import AnalyticsView from '../views/Analytics/AnalyticsView.vue'

const routes = [
  { path: '/', redirect: '/ocr' },
  { path: '/ocr', name: 'OCR', component: OcrView },
  { path: '/balance', name: 'Balance', component: BalanceView },
  { path: '/analytics', name: 'Analytics', component: AnalyticsView }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
