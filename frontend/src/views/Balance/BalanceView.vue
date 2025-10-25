<template>
  <div :class="$style.container">
    <h2>Balanço Rápido & Fluxo de Caixa</h2>

    <div :class="$style.cards">
      <div :class="$style.card">
        <h3>Entradas</h3>
        <p>{{ formatCurrency(summary.income) }}</p>
      </div>
      <div :class="$style.card">
        <h3>Saídas</h3>
        <p>{{ formatCurrency(summary.expenses) }}</p>
      </div>
      <div :class="$style.card">
        <h3>Saldo</h3>
        <p>{{ formatCurrency(summary.balance) }}</p>
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
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in timeseries" :key="row.id || idx">
            <template v-if="editingIndex === idx">
              <td>{{ row.date }}</td>
              <td>
                <input :class="$style.inlineInput" v-model="editForm.description" placeholder="Descrição" />
              </td>
              <td>
                <input :class="$style.inlineInput" v-model="editForm.category" placeholder="Categoria" />
              </td>
              <td>
                <div style="display:flex;gap:6px;align-items:center">
                  <select :class="$style.inlineInput" v-model="editForm.type" style="width:120px">
                    <option>Entrada</option>
                    <option>Saída</option>
                  </select>
                  <input :class="$style.inlineInput" type="number" step="0.01" v-model.number="editForm.value" style="flex:1" />
                </div>
              </td>
              <td>{{ formatCurrency(row.balance) }}</td>
              <td>
                <button :class="$style.actionBtn" @click.prevent="saveEdit(idx, row)">Salvar</button>
                <button :class="$style.actionBtnDelete" @click.prevent="cancelEdit()">Cancelar</button>
              </td>
            </template>
            <template v-else>
              <td>{{ row.date }}</td>
              <td>{{ row.description || '-' }}</td>
              <td>{{ row.type || (row.value >= 0 ? 'Entrada' : 'Saída') }}</td>
              <td>{{ formatCurrency(row.value) }}</td>
              <td>{{ formatCurrency(row.balance) }}</td>
              <td>
                <button :class="$style.actionBtn" @click.prevent="startEdit(idx, row)">Editar</button>
                <button :class="$style.actionBtnDelete" @click.prevent="deleteRow(idx, row)">Excluir</button>
              </td>
            </template>
          </tr>
          <tr v-if="!timeseries || timeseries.length === 0">
            <td colspan="6" style="opacity:0.8">Nenhum registro disponível</td>
          </tr>
        </tbody>
      </table>
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
  name: 'BalanceView',
  setup() {
    const summary = ref({ balance: null, income: null, expenses: null })
    const timeseries = ref([])
    const chart = ref(null)
    let chartInstance = null
    const mainStore = useMainStore();

    function formatCurrency(value) {
      if (value == null) return 'R$ 0,00'
      try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
      } catch {
        return `R$ ${Number(value).toFixed(2)}`
      }
    }

    async function loadSummary() {
      mainStore.setLoading(true);
      try {
        const res = await axios.get('/api/summary')
        const data = res.data || {}
        const series = data.timeseries || []
        // normalize and validate series, prefer row.type when classifying
        let income = 0
        let expenses = 0

        for (let i = 0; i < series.length; i++) {
          const row = series[i] || {}
          const rawVal = row.value
          const val = Number(rawVal === null || rawVal === undefined || rawVal === '' ? 0 : rawVal)
          const typeRaw = (row.type || '').toString().toLowerCase()

          // Log potential OCR issues for missing description or value
          if (!row.description || row.description.toString().trim() === '') {
            console.warn(`timeseries[${i}] missing description`, row)
          }
          if (rawVal === null || rawVal === undefined || rawVal === '') {
            console.warn(`timeseries[${i}] missing value`, row)
          }

          // classification: prefer explicit type from OCR/backend; fallback to sign
          if (typeRaw.includes('saída') || typeRaw.includes('saida')) {
            expenses += Math.abs(val)
            row.type = 'Saída'
          } else if (typeRaw.includes('entrada')) {
            income += val
            row.type = 'Entrada'
          } else {
            // fallback by sign
            if (val >= 0) {
              income += val
              row.type = 'Entrada'
            } else {
              expenses += Math.abs(val)
              row.type = 'Saída'
            }
          }

          // ensure numeric value stored for consistent rendering
          row.value = val
        }

        timeseries.value = series

        const balance = income - expenses

        summary.value = {
          income,
          expenses,
          balance
        }

        buildChart(timeseries.value)
      } catch (err) {
        console.error(err)
      } finally {
        mainStore.setLoading(false);
      }
    }

    function buildChart(series) {
      if (!chart.value) return
      const ctx = chart.value.getContext('2d')
      if (chartInstance) chartInstance.destroy()

      // Set global font color for Chart.js
      Chart.defaults.color = '#fff'; // White color for text

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
            x: { 
              ticks: { color: '#fff' },
              grid: { color: 'rgba(255,255,255,0.1)' }
            },
            y: { 
              ticks: { color: '#fff' },
              grid: { color: 'rgba(255,255,255,0.1)' }
            }
          },
          plugins: {
            legend: { labels: { color: '#fff' } }
          }
        }
      })
    }

    const editingIndex = ref(null)
    const editingId = ref(null)
    const editForm = ref({ description: '', type: 'Entrada', value: 0 })

    function recalcSummaryLocal() {
      let income = 0
      let expenses = 0
      for (let i = 0; i < timeseries.value.length; i++) {
        const r = timeseries.value[i] || {}
        const v = Number(r.value || 0)
        const typeRaw = (r.type || '').toString().toLowerCase()
        if (typeRaw.includes('saída') || typeRaw.includes('saida')) {
          expenses += Math.abs(v)
          r.type = 'Saída'
        } else if (typeRaw.includes('entrada')) {
          income += v
          r.type = 'Entrada'
        } else {
          if (v >= 0) {
            income += v
            r.type = 'Entrada'
          } else {
            expenses += Math.abs(v)
            r.type = 'Saída'
          }
        }
        r.value = v
      }
      summary.value = { income, expenses, balance: income - expenses }
    }

    function startEdit(idx, row) {
      if (!row) return
      editingIndex.value = idx
      editingId.value = row.id || null
      editForm.value = {
        description: row.description || '',
        category: row.category || '',
        type: row.type || (row.value >= 0 ? 'Entrada' : 'Saída'),
        value: Number(row.value || 0)
      }
    }

    function cancelEdit() {
      editingIndex.value = null
      editingId.value = null
      editForm.value = { description: '', category: '', type: 'Entrada', value: 0 }
    }

    function isoDateIfPossible(raw) {
      // Retorna string ISO completa (YYYY-MM-DDTHH:mm:ss.sssZ) quando possível.
      if (!raw) return undefined
      // Se já for ISO completo
      if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw
      // Se for apenas YYYY-MM-DD, converte para ISO full (meio-dia UTC)
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + 'T12:00:00Z').toISOString()
      const parsed = Date.parse(raw)
      if (!isNaN(parsed)) {
        return new Date(parsed).toISOString()
      }
      return undefined
    }

    async function saveEdit(idx, row) {
      if (!row) return
      mainStore.setLoading(true)
      try {
        // mapear para os campos esperados pelo backend
        const amount = Number(editForm.value.value)
        if (Number.isNaN(amount)) throw new Error('Valor inválido')
        const signedAmount = editForm.value.type === 'Saída' ? -Math.abs(amount) : Math.abs(amount)
        const dateIso = isoDateIfPossible(row.date) || new Date().toISOString()
        const payload = {
          amount: signedAmount,
          date: dateIso,
          category: String(editForm.value.category || editForm.value.type || 'Uncategorized'),
          description: String(editForm.value.description || '')
        }

        let res
        if (row.id) {
          res = await axios.put(`/api/transactions/${row.id}`, payload)
        } else {
          // cria registro no backend quando não existe id
          res = await axios.post(`/api/transactions`, payload)
        }

        // Se backend retornar erro de validação, será capturado pelo catch.
        // Recarrega o resumo completo para atualizar saldos corretamente
        await loadSummary()
        cancelEdit()
      } catch (err) {
        // mostrar mensagem mais explicativa para o usuário
        console.error(err)
        const server = err && err.response && err.response.data ? err.response.data : null
        const msg = server && (server.error || server.message) ? (server.error || server.message) : (err.message || 'Erro desconhecido')
        alert('Erro ao salvar registro: ' + (typeof msg === 'object' ? JSON.stringify(msg) : msg))
      } finally {
        mainStore.setLoading(false)
      }
    }

    async function deleteRow(idx, row) {
      if (!row) return
      if (row.id) {
        if (!confirm('Confirma exclusão deste registro?')) return
        mainStore.setLoading(true)
        try {
          await axios.delete(`/api/transactions/${row.id}`)
          await loadSummary()
        } catch (err) {
          console.error(err)
        } finally {
          mainStore.setLoading(false)
        }
      } else {
        if (!confirm('Excluir registro não persistido?')) return
        // remove localmente e recalcula resumo local
        timeseries.value.splice(idx, 1)
        recalcSummaryLocal()
      }
    }

    onMounted(loadSummary)

    watch(() => mainStore.dataRefreshed, () => {
      loadSummary();
    });

    return { summary, chart, timeseries, formatCurrency, editingIndex, editForm, startEdit, saveEdit, cancelEdit, deleteRow }
  }
}
</script>

<style module src="./BalanceView.module.css"></style>
