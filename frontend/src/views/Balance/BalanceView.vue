<template>
  <div :class="$style.container">
    <h2>Balanço Rápido & Fluxo de Caixa</h2>

    <div :class="$style.cards">
      <div :class="$style.card">
        <h3>Saldo</h3>
        <p>{{ summary.balance || 'R$ 0,00' }}</p>
      </div>
      <div :class="$style.card">
        <h3>Entradas</h3>
        <p>{{ summary.income || 'R$ 0,00' }}</p>
      </div>
      <div :class="$style.card">
        <h3>Saídas</h3>
        <p>{{ summary.expenses || 'R$ 0,00' }}</p>
      </div>
    </div>

    <div :class="$style.chartWrap">
      <canvas ref="chart"></canvas>
    </div>

    <!-- Fluxo de caixa: tabela de entradas e saídas -->
    <div :class="$style.tableWrap">
      <h3>Fluxo de Caixa — Entradas e Saídas</h3>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Tipo</th>
            <th>Valor</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in timeseries" :key="idx">
            <td>{{ row.date }}</td>
            <td>{{ row.description || '-' }}</td>
            <td>{{ row.type || (row.value >= 0 ? 'Entrada' : 'Saída') }}</td>
            <td>{{ formatCurrency(row.value) }}</td>
            <td>{{ formatCurrency(row.balance) }}</td>
          </tr>
          <tr v-if="!timeseries || timeseries.length === 0">
            <td colspan="5" style="opacity:0.8">Nenhum registro disponível</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import Chart from 'chart.js'

export default {
  name: 'BalanceView',
  setup() {
    const summary = ref({ balance: null, income: null, expenses: null })
    const timeseries = ref([])
    const chart = ref(null)
    let chartInstance = null

    function formatCurrency(value) {
      if (value == null) return 'R$ 0,00'
      try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
      } catch {
        return `R$ ${Number(value).toFixed(2)}`
      }
    }

    async function loadSummary() {
      try {
        const res = await axios.get('/api/summary')
        summary.value = res.data
        timeseries.value = res.data.timeseries || []
        buildChart(timeseries.value)
      } catch (err) {
        console.error(err)
      }
    }

    function buildChart(series) {
      if (!chart.value) return
      const ctx = chart.value.getContext('2d')
      if (chartInstance) chartInstance.destroy()
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: (series || []).map(t => t.date),
          datasets: [
            {
              label: 'Saldo',
              data: (series || []).map(t => t.balance),
              borderColor: '#7fb1ff',
              backgroundColor: 'rgba(127,177,255,0.12)',
              tension: 0.2,
              pointRadius: 2
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#ddd' } },
            y: { ticks: { color: '#ddd' } }
          },
          plugins: {
            legend: { labels: { color: '#ddd' } }
          }
        }
      })
    }

    onMounted(loadSummary)

    return { summary, chart, timeseries, formatCurrency }
  }
}
</script>

<style module src="./BalanceView.module.css"></style>
