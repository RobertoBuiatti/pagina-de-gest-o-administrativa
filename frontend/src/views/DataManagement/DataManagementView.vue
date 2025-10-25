<template>
  <div :class="$style.container">
    <h2>Gerenciamento de Dados</h2>

    <div :class="$style.card">
      <h3>Exportar Dados</h3>
      <p>Baixe seus dados para backup ou uso em outras aplicações.</p>
      <div :class="$style.actions">
        <AppButton @click="exportSql">Baixar SQL</AppButton>
        <AppButton @click="exportXls">Baixar XLS</AppButton>
      </div>
    </div>

    <div :class="$style.card">
      <h3>Importar Dados</h3>
      <p>Carregue dados previamente salvos (SQL ou XLS).</p>
      <input type="file" multiple @change="handleFileUpload" accept=".sql,.xls,.xlsx,.sqlite" />
      <div :class="$style.actions">
        <AppButton :disabled="selectedFiles.length === 0" @click="importData">Importar</AppButton>
      </div>
      <div v-if="importResults.length > 0" :class="$style.importResults">
        <h4>Resultados da Importação:</h4>
        <ul>
          <li v-for="(result, index) in importResults" :key="index">
            {{ result.filename }}: <span :class="result.success ? $style.success : $style.error">{{ result.message }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';
import axios from 'axios';
import AppButton from '../../components/Button/Button.vue';
import { useMainStore } from '../../stores/main';

export default {
  name: 'DataManagementView',
  components: { AppButton },
  setup() {
    const selectedFiles = ref([]);
    const importResults = ref([]);
    const mainStore = useMainStore();

    const exportSql = async () => {
      mainStore.setLoading(true);
      try {
        const response = await axios.get('/api/export/sql', {
          responseType: 'blob',
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', response.headers['content-disposition'].split('filename=')[1].replace(/"/g, ''));
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Erro ao baixar SQL:', error);
        alert('Erro ao baixar o arquivo SQL.');
      } finally {
        mainStore.setLoading(false);
      }
    };

    const exportXls = async () => {
      mainStore.setLoading(true);
      try {
        const response = await axios.get('/api/export/xls', {
          responseType: 'blob',
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'transactions.xlsx');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Erro ao baixar XLS:', error);
        alert('Erro ao baixar o arquivo XLS.');
      } finally {
        mainStore.setLoading(false);
      }
    };

    const handleFileUpload = (event) => {
      selectedFiles.value = Array.from(event.target.files);
      importResults.value = [];
    };

    const importData = async () => {
      if (selectedFiles.value.length === 0) {
        importResults.value = [{ filename: 'Nenhum arquivo', message: 'Por favor, selecione um arquivo para importar.', success: false }];
        return;
      }

      mainStore.setLoading(true);
      const formData = new FormData();
      selectedFiles.value.forEach(file => {
        formData.append('files', file);
      });

      try {
        const response = await axios.post('/api/import', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        importResults.value = response.data.results || [{ filename: 'Desconhecido', message: response.data.message || 'Importação concluída.', success: true }];
        if (response.data.results.every(r => r.success)) {
          mainStore.triggerDataRefresh(); // Trigger data refresh
        }
        alert(response.data.message || 'Importação concluída.');
      } catch (error) {
        console.error('Erro ao importar dados:', error);
        importResults.value = error.response?.data?.results || [{ filename: 'Desconhecido', message: error.response?.data?.error || 'Erro ao importar dados.', success: false }];
        alert(error.response?.data?.error || 'Erro ao importar dados.');
      } finally {
        mainStore.setLoading(false);
      }
    };

    return {
      selectedFiles,
      importResults,
      exportSql,
      exportXls,
      handleFileUpload,
      importData,
    };
  },
};
</script>

<style module src="./DataManagementView.module.css"></style>
