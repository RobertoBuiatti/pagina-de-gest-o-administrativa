<template>
  <div :class="$style.container">
    <h2>Análises</h2>
    <p>Visão geral de métricas e tendências.</p>

<div :class="$style.widgets">
      <div :class="$style.widget">
        <h4>Receitas x Despesas</h4>
        <div :class="$style.legend">
          <span :class="$style.income">Entradas</span>
          <span :class="$style.expense">Saídas</span>
        </div>
        <canvas ref="chart1"></canvas>
      </div>
      <div :class="$style.widget">
        <h4>Categorias</h4>
        <div :class="$style.legend">
          <span :class="$style.income">Entradas</span>
          <span :class="$style.expense">Saídas</span>
        </div>
        <canvas ref="chart2"></canvas>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import Chart from 'chart.js'

export default {
  name: 'AnalyticsView',
  setup() {
    const chart1 = ref(null)
    const chart2 = ref(null)
    let c1, c2

    async function loadAnalytics() {
      try {
        const res = await axios.get('/api/analytics')
        const data = res.data
        buildCharts(data)
      } catch (err) {
        console.error(err)
      }
    }

    function buildCharts(data) {
      const ctx1 = chart1.value.getContext('2d')
      const ctx2 = chart2.value.getContext('2d')
      if (c1) c1.destroy()
      if (c2) c2.destroy()

      // simple examples
      c1 = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: (data.timeseries || []).map(t => t.date),
          datasets: [
            { label: 'Entradas', data: (data.timeseries || []).map(t => t.income), borderColor: '#10b981' },
            { label: 'Saídas', data: (data.timeseries || []).map(t => t.expenses), borderColor: '#ef4444' }
          ]
        }
      })

      c2 = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: (data.categories || []).map(c => c.name),
          datasets: [{ data: (data.categories || []).map(c => c.amount), backgroundColor: ['#0f172a', '#10b981', '#ef4444'] }]
        }
      })
    }

    onMounted(loadAnalytics)

    return { chart1, chart2 }
  }
}
</script>

<style module src="./AnalyticsView.module.css"></style>
