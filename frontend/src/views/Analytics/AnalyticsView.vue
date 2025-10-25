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

      <div :class="$style.widget">
        <h4>Fluxo Líquido (por data)</h4>
        <canvas ref="chart3"></canvas>
      </div>
    </div>

    <div :class="$style.geminiCard">
      <h3>Análise automática (Gemini)</h3>
      <div v-if="geminiLoading">Carregando análise...</div>
      <div v-else-if="!geminiData">
        <p style="margin:0 0 8px 0;opacity:0.9">Nenhuma análise disponível.</p>
        <button :class="$style.actionBtn" @click="fetchGeminiAnalysis">Gerar análise</button>
      </div>
      <div v-else>
        <p><strong>Resumo:</strong> {{ geminiData.summary }}</p>
        <p><strong>Tendência:</strong> {{ geminiData.cash_flow_trend }}</p>

        <div v-if="geminiData.top_categories && geminiData.top_categories.length">
          <h4>Top categorias</h4>
          <ul>
            <li v-for="(c, i) in geminiData.top_categories" :key="i">{{ c.name }} — {{ formatCurrency(c.amount) }}</li>
          </ul>
        </div>

        <div v-if="geminiData.recommendations && geminiData.recommendations.length">
          <h4>Recomendações</h4>
          <ul>
            <li v-for="(r, i) in geminiData.recommendations" :key="i">{{ r }}</li>
          </ul>
        </div>

        <div v-if="geminiData.anomalies && geminiData.anomalies.length">
          <h4>Anomalias</h4>
          <ul>
            <li v-for="(a, i) in geminiData.anomalies" :key="i">{{ a }}</li>
          </ul>
        </div>

        <details style="margin-top:8px">
          <summary>Raw</summary>
          <pre style="white-space:pre-wrap">{{ geminiRaw }}</pre>
        </details>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch } from 'vue'
import axios from 'axios'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables);
import { useMainStore } from '../../stores/main';

export default {
  name: 'AnalyticsView',
  setup() {
    const chart1 = ref(null)
    const chart2 = ref(null)
    const chart3 = ref(null)
    let c1, c2, c3
    const mainStore = useMainStore();

    const geminiData = ref(null)
    const geminiRaw = ref(null)
    const geminiLoading = ref(false)

    function formatCurrency(value) {
      if (value == null) return 'R$ 0,00'
      try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
      } catch {
        return `R$ ${Number(value).toFixed(2)}`
      }
    }

    async function loadAnalytics() {
      mainStore.setLoading(true);
      try {
        const res = await axios.get('/api/analytics')
        const data = res.data || {}
        buildCharts(data)
      } catch (err) {
        console.error(err)
      } finally {
        mainStore.setLoading(false);
      }
    }

    function buildCharts(data) {
      const ctx1 = chart1.value?.getContext('2d')
      const ctx2 = chart2.value?.getContext('2d')
      const ctx3 = chart3.value?.getContext('2d')
      if (c1) c1.destroy()
      if (c2) c2.destroy()
      if (c3) c3.destroy()

      // Set global font color for Chart.js
      Chart.defaults.color = '#fff'; // White color for text

      // Chart 1: Line - entradas x saídas
      c1 = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: (data.timeseries || []).map(t => t.date),
          datasets: [
            { label: 'Entradas', data: (data.timeseries || []).map(t => t.income), borderColor: '#10b981', tension: 0.1, fill: false },
            { label: 'Saídas', data: (data.timeseries || []).map(t => t.expenses), borderColor: '#ef4444', tension: 0.1, fill: false }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: '#fff' },
              grid: { color: 'rgba(255,255,255,0.1)' }
            },
            x: {
              ticks: { color: '#fff' },
              grid: { color: 'rgba(255,255,255,0.1)' }
            }
          },
          plugins: {
            legend: { labels: { color: '#fff' } }
          }
        }
      })

      // Chart 2: Categories - doughnut
      c2 = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: (data.categories || []).map(c => c.name),
          datasets: [{
            data: (data.categories || []).map(c => c.amount),
            backgroundColor: ['#0f172a', '#10b981', '#ef4444', '#7fb1ff', '#f59e0b'],
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { labels: { color: '#fff' } }
          }
        }
      })

      // Chart 3: Fluxo líquido por data (income - expenses)
      const labels = (data.timeseries || []).map(t => t.date)
      const net = (data.timeseries || []).map(t => {
        const inc = Number(t.income || 0)
        const exp = Number(t.expenses || 0)
        return inc - exp
      })

      c3 = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Fluxo líquido',
            data: net,
            backgroundColor: net.map(v => v >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
            borderColor: net.map(v => v >= 0 ? '#10b981' : '#ef4444'),
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            y: {
              ticks: { color: '#fff' },
              grid: { color: 'rgba(255,255,255,0.1)' }
            },
            x: {
              ticks: { color: '#fff' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          },
          plugins: {
            legend: { labels: { color: '#fff' } }
          }
        }
      })
    }

    async function fetchGeminiAnalysis() {
      geminiLoading.value = true
      try {
        // Busca os lançamentos completos do resumo para enviar ao Gemini
        const summaryRes = await axios.get('/api/summary')
        const times = summaryRes.data && summaryRes.data.timeseries ? summaryRes.data.timeseries : []

        // Normaliza payload esperado pelo backend (date, description, category, amount)
        const payload = {
          data: (times || []).map(t => ({
            date: t.date || null,
            description: t.description || null,
            category: t.category || null,
            amount: Number(t.amount ?? t.value ?? 0)
          }))
        }

        // Log do payload para debug local
        try { console.log('geminiAggregate: sending payload', { count: (payload.data || []).length, preview: (payload.data || []).slice(0,3) }); } catch(e){}

        const res = await axios.post('/api/gemini-aggregate', payload)
        try { console.log('geminiAggregate: response', res && res.data); } catch(e){}

        geminiRaw.value = res.data && res.data.raw ? res.data.raw : null
        geminiData.value = res.data && res.data.parsed ? res.data.parsed : null
      } catch (err) {
        console.error('Erro Gemini', err)
        alert('Erro ao gerar análise automática.')
      } finally {
        geminiLoading.value = false
      }
    }

    onMounted(loadAnalytics)

    watch(() => mainStore.dataRefreshed, () => {
      loadAnalytics();
    });

    return { chart1, chart2, chart3, fetchGeminiAnalysis, geminiData, geminiRaw, geminiLoading, formatCurrency }
  }
}
</script>

<style module src="./AnalyticsView.module.css"></style>
