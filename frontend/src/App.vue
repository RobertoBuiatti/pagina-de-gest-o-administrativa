<template>
  <div :class="$style.app">
    <SideMenu />
    <main :class="$style.main">
      <router-view />
    </main>
  </div>
</template>

<script>
import SideMenu from './components/SideMenu/SideMenu.vue'

export default {
  name: 'App',
  components: { SideMenu }
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
</style>
