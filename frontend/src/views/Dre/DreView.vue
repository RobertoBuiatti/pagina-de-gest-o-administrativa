<template>
  <div :class="$style.container">
    <header :class="$style.header">
      <h2>Demonstrativo de Resultado do Exercício (DRE)</h2>
      <div :class="$style.controls">
        <label>
          Período:
          <input type="date" v-model="start" />
          —
          <input type="date" v-model="end" />
        </label>
        <button @click="loadDre" :class="$style.btn">Carregar</button>
        <button @click="exportCsv" :class="$style.btnSecondary">Exportar CSV</button>
      </div>
    </header>

    <section :class="$style.summary">
      <div :class="$style.kv">
        <div>Receita Operacional Líquida</div>
        <div>{{ formatCurrency(dre.receita_operacional_liquida) }}</div>
      </div>
      <div :class="$style.kv">
        <div>Lucro Bruto</div>
        <div>{{ formatCurrency(dre.lucro_bruto) }}</div>
      </div>
      <div :class="$style.kv">
        <div>Resultado Operacional</div>
        <div>{{ formatCurrency(dre.resultado_operacional) }}</div>
      </div>
      <div :class="[$style.kv, $style.highlight]">
        <div>Lucro Líquido</div>
        <div>{{ formatCurrency(dre.lucro_liquido) }}</div>
      </div>
    </section>

    <section :class="$style.tableWrapper">
      <table :class="$style.table" aria-labelledby="dre-details">
        <caption id="dre-details">Detalhamento por categoria</caption>
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Descrição</th>
            <th class="right">Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in rows" :key="idx">
            <td>{{ row.categoria }}</td>
            <td>{{ row.descricao }}</td>
            <td class="right">{{ formatCurrency(row.valor) }}</td>
          </tr>

          <tr :class="$style.totalRow">
            <td colspan="2">Total Receitas</td>
            <td class="right">{{ formatCurrency(totals.receitas) }}</td>
          </tr>
          <tr :class="$style.totalRow">
            <td colspan="2">Total Custos</td>
            <td class="right">{{ formatCurrency(totals.custos) }}</td>
          </tr>
          <tr :class="$style.totalRow">
            <td colspan="2">Total Despesas</td>
            <td class="right">{{ formatCurrency(totals.despesas) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer :class="$style.footer">
      <small>Dados calculados a partir das transações filtradas. Valores exibidos em reais (BRL).</small>
    </footer>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'

export default {
  name: 'DreView',
  setup() {
    const start = ref('')
    const end = ref('')
    const loading = ref(false)
    const dre = reactive({
      receita_operacional_liquida: 0,
      lucro_bruto: 0,
      resultado_operacional: 0,
      lucro_liquido: 0
    })

    // linhas detalhadas do DRE (categoria, descrição, valor)
    const rows = ref([
      // valores iniciais de exemplo — serão substituídos pelo fetch quando disponível
      { categoria: 'Receitas', descricao: 'Vendas de produtos', valor: 150000 },
      { categoria: 'Deduções', descricao: 'Devoluções e descontos', valor: -5000 },
      { categoria: 'Custos', descricao: 'Custo das mercadorias vendidas', valor: -60000 },
      { categoria: 'Despesas Operacionais', descricao: 'Despesas com vendas', valor: -15000 },
      { categoria: 'Despesas Operacionais', descricao: 'Despesas administrativas', valor: -10000 },
      { categoria: 'Despesas Financeiras', descricao: 'Juros e variações', valor: -2000 },
      { categoria: 'Outros', descricao: 'Receitas não operacionais', valor: 3000 }
    ])

    const totals = computed(() => {
      const receitas = rows.value.filter(r => r.valor > 0).reduce((s, r) => s + r.valor, 0)
      const custos = rows.value.filter(r => r.categoria === 'Custos').reduce((s, r) => s + Math.abs(r.valor), 0)
      const despesas = rows.value.filter(r => r.categoria.includes('Despesas') || r.categoria === 'Deduções').reduce((s, r) => s + Math.abs(r.valor), 0)
      return { receitas, custos, despesas }
    })

    function recalcSummary() {
      dre.receita_operacional_liquida = totals.value.receitas - totals.value.despesas * 0 + 0 // placeholder lógico
      dre.lucro_bruto = totals.value.receitas - totals.value.custos
      dre.resultado_operacional = dre.lucro_bruto - totals.value.despesas
      // provisão IR fictícia 15% sobre resultado operacional (apenas exemplo)
      const provisaoIR = Math.max(0, dre.resultado_operacional * 0.15)
      dre.lucro_liquido = dre.resultado_operacional - provisaoIR
    }

    async function loadDre() {
      loading.value = true
      try {
        // tenta buscar do backend; se falhar, mantém os dados de exemplo
        const params = new URLSearchParams()
        if (start.value) params.append('start', start.value)
        if (end.value) params.append('end', end.value)

        const res = await fetch('/api/reports/dre?' + params.toString())
        if (res.ok) {
          const data = await res.json()
          // espera um formato: { rows: [{categoria, descricao, valor}], summary: {...} }
          if (data.rows) {
            rows.value = data.rows
            // se summary estiver presente, atualiza os campos principais
            if (data.summary) {
              Object.assign(dre, data.summary)
            } else {
              recalcSummary()
            }
          }
        } else {
          // fallback: recalcula apenas com os dados locais
          recalcSummary()
        }
      } catch (e) {
        // fallback local
        recalcSummary()
      } finally {
        loading.value = false
      }
    }

    function formatCurrency(value) {
      const v = Number(value || 0)
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }

    function exportCsv() {
      const header = ['Categoria', 'Descrição', 'Valor']
      const lines = [header.join(',')]
      rows.value.forEach(r => {
        // escape simples
        const desc = String(r.descricao).replace(/"/g, '""')
        lines.push(`"${r.categoria}","${desc}",${r.valor}`)
      })
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dre_${start.value || 'start'}_${end.value || 'end'}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }

    onMounted(() => {
      // carregar dados iniciais
      loadDre()
    })

    return {
      start,
      end,
      rows,
      dre,
      totals,
      loadDre,
      formatCurrency,
      exportCsv,
      loading
    }
  }
}
</script>

<style module src="./DreView.module.css"></style>
