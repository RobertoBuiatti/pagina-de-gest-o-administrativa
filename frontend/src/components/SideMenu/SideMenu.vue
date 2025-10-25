<template>
  <nav :class="[$style.side, isCollapsed ? $style.collapsed : '']" aria-label="Main navigation">
    <div :class="$style.header">
      <button
        :class="$style.hamburger"
        @click="toggleMobileMenu"
        :aria-expanded="isMobileOpen"
        aria-controls="main-menu"
        aria-label="Abrir menu"
      >
        ☰
      </button>

      <h1 :class="$style.title">Gestão</h1>

      <button
        v-if="!isSmall"
        :class="$style.collapseBtn"
        @click="toggleCollapse"
        :aria-pressed="isCollapsed"
        :title="isCollapsed ? 'Expandir menu' : 'Recolher menu'"
      >
        {{ isCollapsed ? '›' : '‹' }}
      </button>
    </div>

    <ul
      id="main-menu"
      :class="[$style.menu, isMobileOpen ? $style.open : '', isCollapsed ? $style.collapsedMenu : '']"
      @click="closeMobileIfNeeded"
    >
      <li><router-link to="/ocr">OCR & Extração</router-link></li>
      <li><router-link to="/balance">Balanço / Fluxo</router-link></li>
      <li><router-link to="/analytics">Análises</router-link></li>
      <li><router-link to="/data-management">Gerenciar Dados</router-link></li>
    </ul>

    <div v-if="isMobileOpen" :class="$style.overlay" @click="toggleMobileMenu" aria-hidden="true"></div>
  </nav>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

export default {
  name: 'SideMenu',
  setup() {
    const isMobileOpen = ref(false)
    const isCollapsed = ref(false)
    const width = ref(window.innerWidth)

    const breakpoint = 769
    const isSmall = computed(() => width.value < breakpoint)

    function updateWidth() {
      width.value = window.innerWidth
      // auto-open sidebar on large screens and close mobile menu when resizing to desktop
      if (!isSmall.value) isMobileOpen.value = false
    }

    function toggleMobileMenu() {
      isMobileOpen.value = !isMobileOpen.value
    }

    function toggleCollapse() {
      isCollapsed.value = !isCollapsed.value
    }

    // close mobile menu when clicking a route on mobile
    function closeMobileIfNeeded() {
      if (isSmall.value) isMobileOpen.value = false
    }

    onMounted(() => {
      window.addEventListener('resize', updateWidth)
      // preserve user preference for collapsed menu across page reloads
      try {
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved === '1') isCollapsed.value = true
      } catch (e) {}
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', updateWidth)
      try {
        localStorage.setItem('sidebar-collapsed', isCollapsed.value ? '1' : '0')
      } catch (e) {}
    })

    return {
      isMobileOpen,
      isCollapsed,
      isSmall,
      toggleMobileMenu,
      toggleCollapse,
      closeMobileIfNeeded
    }
  }
}
</script>

<style module src="./SideMenu.module.css"></style>
