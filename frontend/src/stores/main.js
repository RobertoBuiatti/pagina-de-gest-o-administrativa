import { defineStore } from 'pinia'

export const useMainStore = defineStore('main', {
  state: () => ({
    isLoading: false,
    dataRefreshed: false,
  }),
  actions: {
    setLoading(status) {
      this.isLoading = status
    },
    triggerDataRefresh() {
      this.dataRefreshed = !this.dataRefreshed;
    },
  },
})
