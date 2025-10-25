<template>
  <div :class="$style.app">
    <SideMenu />
    <main :class="$style.main">
      <router-view />
    </main>
    <div v-if="mainStore.isLoading" :class="$style.loadingOverlay">
      <div :class="$style.spinner"></div>
    </div>
  </div>
</template>

<script>
import SideMenu from './components/SideMenu/SideMenu.vue'
import { useMainStore } from './stores/main'
import { watch } from 'vue'

export default {
  name: 'App',
  components: { SideMenu },
  setup() {
    const mainStore = useMainStore()

    // Watch for route changes to reset loading state or perform other actions
    watch(() => mainStore.isLoading, (newVal) => {
      if (newVal) {
        // Optionally, add a timeout to hide the spinner if it takes too long
        // setTimeout(() => mainStore.setLoading(false), 5000)
      }
    })

    return { mainStore }
  }
}
</script>

<style module>
:root {
  --sidebar-width: 240px;
  --bg: #f7f9fc;
  --fg: #0f172a;
  --gap: 16px;
}

.app {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
  flex-direction: column;
}

/* main content area */
.main {
  flex: 1;
  padding: 16px;
  box-sizing: border-box;
  width: 100%;
  transition: margin-left 200ms ease;
}

/* Desktop: use two-column layout with fixed sidebar */
@media (min-width: 769px) {
  .app {
    flex-direction: row;
  }
  /* leave space for the fixed sidebar */
  .main {
    margin-left: var(--sidebar-width);
    padding: 24px;
    max-width: calc(100% - var(--sidebar-width));
  }
}

/* smaller screens: stacked layout */
@media (max-width: 768px) {
  .app {
    flex-direction: column;
  }
  .main {
    padding: 12px;
    margin-top: 56px; /* space for a top bar / hamburger */
  }
}

/* utility */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--gap);
}

.loadingOverlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>