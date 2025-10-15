<template>
  <div :class="$style.container">
    <h2>OCR & Extração</h2>

    <div :class="$style.uploader">
      <div
        :class="[$style.dropzone, dragOver ? $style.dragActive : '']"
        @click="openFileDialog"
        @dragover.prevent="handleDragOver"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
      >
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          @change="onFileChange"
          style="display: none"
        />
        <div class="drop-inner">
          <p>Arraste e solte a imagem aqui ou clique para escolher</p>
          <small v-if="!previewSrc">PNG, JPG ou PDF</small>
          <small v-else>Arquivo selecionado</small>
        </div>
      </div>

      <AppButton :class="$style.btn" @click="openCamera">Usar Câmera</AppButton>
      <AppButton
        :class="[$style.typeBtn, transactionType === 'entrada' ? $style.active : '']"
        @click="setType('entrada')"
      >Entrada</AppButton>
      <AppButton
        :class="[$style.typeBtn, transactionType === 'saida' ? $style.active : '']"
        @click="setType('saida')"
      >Saída</AppButton>
    </div>

    <div v-if="cameraActive" :class="$style.cameraWrap">
      <video ref="video" autoplay playsinline :class="$style.video"></video>
      <div :class="$style.cameraBtns">
        <AppButton :class="$style.btn" @click="captureFromCamera">Capturar</AppButton>
        <AppButton :class="$style.btn" @click="closeCamera">Fechar</AppButton>
      </div>
    </div>

    <div v-if="previewSrc" :class="$style.previewWrap">
      <img :src="previewSrc" :class="$style.preview" alt="preview" />
    </div>

    <div v-if="previewSrc" :class="$style.actions">
      <AppButton :class="$style.btn" :disabled="!previewSrc && !file" @click="runOcr">Extrair</AppButton>
    </div>

    <div v-if="isProcessing" :class="$style.processing">Processando... {{ progress }}%</div>

    <div v-if="extractedText || previewSrc" :class="[$style.result, isPreviewLight ? $style.resultLight : $style.resultDark]">
      <h3>Texto extraído</h3>
      <textarea :value="extractedText" readonly rows="8"></textarea>

      <h3>Campos (editáveis)</h3>

      <div :class="$style.formRow">
        <label>Valor provável</label>
        <input type="text" v-model="detected.amount" />
      </div>

      <div :class="$style.formRow">
        <label>Data</label>
        <input type="text" v-model="detected.date" placeholder="DD-MM-YYYY" />
      </div>

      <div :class="$style.formRow">
        <label>Descrição</label>
        <textarea v-model="detected.description" rows="3"></textarea>
      </div>

      <div :class="$style.formRow">
        <label>Tipo</label>
        <input type="text" :value="detected.type" readonly />
      </div>

      <div :class="$style.formRow">
        <label>Texto bruto (preview)</label>
        <textarea :value="previewText" readonly rows="3"></textarea>
      </div>

      <div :class="$style.geminiInfo" v-if="geminiUsed">Gemini foi usado para completar campos faltantes.</div>

      <div :class="$style.actions">
        <AppButton :class="$style.btn" :disabled="isProcessing" @click="saveExtraction">Salvar</AppButton>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onBeforeUnmount, nextTick, watch } from "vue";
import { createWorker } from "tesseract.js";
import Tesseract from "tesseract.js";
import axios from "axios";
import AppButton from "../../components/Button/Button.vue";

export default {
  name: "OcrView",
  components: { AppButton },
  setup() {
    const file = ref(null);
    const previewSrc = ref("");
    const previewText = ref("");
    const extractedText = ref("");
    const detected = ref({
      amount: null,
      date: null,
      description: null,
      type: null,
    });
    const isProcessing = ref(false);
    const progress = ref(0);
    const transactionType = ref(""); // 'entrada' | 'saida' | ''
    const fileInput = ref(null);
    const dragOver = ref(false);
    const geminiUsed = ref(false);

    // light/dark detection for preview contrast
    const isPreviewLight = ref(true);

    // camera / webcam
    const cameraActive = ref(false);
    const video = ref(null);
    const streamRef = ref(null);

    function openFileDialog() {
      if (fileInput.value) fileInput.value.click();
    }

    function openCamera() {
      cameraActive.value = true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Navegador não suporta câmera.");
        cameraActive.value = false;
        return;
      }
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then(async (s) => {
          streamRef.value = s;
          await nextTick();
          if (video.value) {
            try {
              video.value.srcObject = s;
              // tentar iniciar automaticamente
              await video.value.play();
            } catch (e) {
              // ignorar erros de autoplay
            }
          }
        })
        .catch((err) => {
          console.error("Camera error", err);
          alert("Erro ao acessar a câmera.");
          cameraActive.value = false;
        });
    }

    function closeCamera() {
      cameraActive.value = false;
      if (streamRef.value) {
        streamRef.value.getTracks().forEach((t) => t.stop());
        streamRef.value = null;
      }
    }

    onBeforeUnmount(() => {
      closeCamera();
    });

    function captureFromCamera() {
      if (!video.value) return;
      const canvas = document.createElement("canvas");
      const w = video.value.videoWidth || 1280;
      const h = video.value.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video.value, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/png");
      previewSrc.value = dataUrl;
      file.value = null;
      closeCamera();
    }

    function handleDragOver(e) {
      e.preventDefault();
      dragOver.value = true;
    }
    function handleDragLeave(e) {
      e.preventDefault();
      dragOver.value = false;
    }
    function handleDrop(e) {
      e.preventDefault();
      dragOver.value = false;
      onFileChange(e);
    }

    function onFileChange(e) {
      const f =
        (e && e.target && e.target.files && e.target.files[0]) ||
        (e &&
          e.dataTransfer &&
          e.dataTransfer.files &&
          e.dataTransfer.files[0]);
      if (!f) return;
      file.value = f;
      const reader = new FileReader();
      reader.onload = (ev) => {
        previewSrc.value = ev.target.result;
        if (ev && ev.target && ev.target.result) {
          try { analyzePreviewLum(ev.target.result); } catch (e) { /* ignore */ }
        }
      };
      reader.readAsDataURL(f);
    }

    // analyze image brightness (center crop) to decide contrast
    function analyzePreviewLum(dataUrl) {
      try {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
          const w = Math.min(200, img.width);
          const h = Math.min(200, img.height);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          const sx = Math.max(0, Math.floor((img.width - w) / 2));
          const sy = Math.max(0, Math.floor((img.height - h) / 2));
          ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
          try {
            const data = ctx.getImageData(0, 0, w, h).data;
            let total = 0;
            let count = 0;
            for (let i = 0; i < data.length; i += 16) {
              const r = data[i], g = data[i + 1], b = data[i + 2];
              const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
              total += lum;
              count++;
            }
            const avg = total / Math.max(1, count);
            // threshold: > 0.6 considered light background
            isPreviewLight.value = avg > 0.6;
          } catch (e) {
            isPreviewLight.value = true;
          }
        };
        img.onerror = () => { isPreviewLight.value = true; };
        img.src = dataUrl;
      } catch (e) {
        isPreviewLight.value = true;
      }
    }

 // watch preview changes to recalc
    watch(previewSrc, (v) => {
      if (v) analyzePreviewLum(v);
    });

    watch(() => detected.value.date, (v) => {
      if (v) {
        detected.value.date = normalizeDate(v);
      }
    });

    // simple client-side preprocessing to improve OCR:
    // - resize large images
    // - grayscale
    // - increase contrast
    // - global threshold (basic)
    // returns a Blob (png) suitable for Tesseract.recognize
    async function preprocessImage(input) {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";

        // create object URL for File/Blob, otherwise use data URL string
        let url = null;
        if (input instanceof Blob || (typeof File !== "undefined" && input instanceof File)) {
          url = URL.createObjectURL(input);
        } else if (typeof input === "string") {
          url = input;
        } else {
          // fallback: resolve original input as-is
          resolve(input);
          return;
        }

        img.onload = () => {
          try {
            const maxDim = 1600;
            let w = img.width;
            let h = img.height;
            if (Math.max(w, h) > maxDim) {
              const scale = maxDim / Math.max(w, h);
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            // draw original
            ctx.drawImage(img, 0, 0, w, h);

            // get image data
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;

            // convert to grayscale and compute avg luminance
            let total = 0;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i], g = data[i + 1], b = data[i + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              data[i] = data[i + 1] = data[i + 2] = lum;
              total += lum;
            }
            const avg = total / (data.length / 4);

            // boost contrast: linear stretch around average
            const contrast = 1.3; // tweakable: >1 increases contrast
            for (let i = 0; i < data.length; i += 4) {
              let v = data[i];
              v = (v - avg) * contrast + avg;
              v = Math.max(0, Math.min(255, v));
              data[i] = data[i + 1] = data[i + 2] = v;
            }

            // apply simple global threshold using avg as pivot
            const threshold = Math.max(100, Math.min(200, Math.round(avg)));
            for (let i = 0; i < data.length; i += 4) {
              const v = data[i];
              const out = v > threshold ? 255 : 0;
              data[i] = data[i + 1] = data[i + 2] = out;
            }

            ctx.putImageData(imageData, 0, 0);

            // optional: small blur/unsharp can be added here if needed

            canvas.toBlob(
              (b) => {
                if (url && (input instanceof Blob || (typeof File !== "undefined" && input instanceof File))) {
                  try { URL.revokeObjectURL(url); } catch (e) {}
                }
                resolve(b || input);
              },
              "image/png",
              0.9
            );
          } catch (e) {
            // on error, return original input
            resolve(input);
          }
        };

        img.onerror = () => {
          if (url && (input instanceof Blob || (typeof File !== "undefined" && input instanceof File))) {
            try { URL.revokeObjectURL(url); } catch (e) {}
          }
          resolve(input);
        };

        img.src = url;
      });
    }

function normalizeDate(input) {
  if (!input) return input;
  const s = ('' + input).trim().replace(/\s+/g, ' ').replace(/\//g, '-');
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dmy) {
    let day = dmy[1].padStart(2, '0');
    let month = dmy[2].padStart(2, '0');
    let year = dmy[3];
    if (year.length === 2) {
      const yy = parseInt(year, 10);
      year = yy > 50 ? '19' + year : '20' + year;
    }
    return `${day}-${month}-${year}`;
  }
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    return `${ymd[3].padStart(2,'0')}-${ymd[2].padStart(2,'0')}-${ymd[1]}`;
  }
  const nums = s.match(/(\d{1,4})[^\d](\d{1,2})[^\d](\d{1,4})/);
  if (nums) {
    let a = nums[1], b = nums[2], c = nums[3];
    if (a.length === 4) return `${c.padStart(2,'0')}-${b.padStart(2,'0')}-${a}`;
    if (c.length === 4) return `${a.padStart(2,'0')}-${b.padStart(2,'0')}-${c}`;
  }
  return input;
}

async function runOcr() {
      if (!file.value && !previewSrc.value) return;
      isProcessing.value = true;
      extractedText.value = "";
      detected.value = {
        amount: null,
        date: null,
        description: null,
        type: transactionType.value || null,
      };
      progress.value = 0;

      // prepare source (File/Blob or dataURL -> Blob)
      let source = file.value ? file.value : previewSrc.value;
      if (typeof source === "string" && source.startsWith("data:")) {
        try {
          const res = await fetch(source);
          source = await res.blob();
          console.debug("OCR: converted dataURL to Blob (size:", source.size || "unknown", ")");
        } catch (e) {
          console.warn("Failed to convert data URL to Blob", e);
        }
      }

      // run preprocessing
      let preprocessed = source;
      try {
        preprocessed = await preprocessImage(source);
        console.debug("OCR: preprocessing finished; preprocessed blob size=", (preprocessed && preprocessed.size) || "unknown");
      } catch (e) {
        console.warn("OCR: preprocessing failed, continuing with original source", e);
        preprocessed = source;
      }

      // logger for progress (works with Tesseract.recognize)
      const logger = (m) => {
        try {
          if (m && m.status === "recognizing text" && m.progress) {
            progress.value = Math.round(m.progress * 100);
          }
        } catch (e) { /* ignore */ }
      };


      let text = "";

      try {
        console.debug("OCR: attempting recognize with 'por'");
        const res = await Tesseract.recognize(source, "por", { logger });
        text = (res && res.data && res.data.text) ? res.data.text.trim() : "";
        console.debug("OCR: 'por' finished; text length=", (text && text.length) || 0);
      } catch (e) {
        console.warn("OCR recognize (por) failed, will try 'eng'", e);
      }

      if (!text) {
        try {
          console.debug("OCR: attempting recognize with 'eng'");
          const res2 = await Tesseract.recognize(source, "eng", { logger });
          text = (res2 && res2.data && res2.data.text) ? res2.data.text.trim() : "";
          console.debug("OCR: 'eng' finished; text length=", (text && text.length) || 0);
        } catch (e2) {
          console.warn("OCR recognize (eng) failed", e2);
        }
      }

      // ensure UI updated
      extractedText.value = text || "";
      previewText.value = text || "";

      // Enviar texto bruto ao backend (/api/gemini-raw) imediatamente para preencher campos
      try {
        const respRaw = await axios.post("/api/gemini-raw", { text: extractedText.value });
        const rawData = respRaw && respRaw.data ? respRaw.data : {};
        const parsed = rawData.parsed || {};
        console.debug("frontend: /api/gemini-raw parsed:", parsed, "raw preview:", (rawData.raw || "").slice(0, 300));

        // aplicar valores retornados pelo Gemini diretamente garantindo reatividade
        if (parsed.valor) detected.value.amount = parsed.valor;
        if (parsed.data) detected.value.date = normalizeDate(parsed.data);
        if (parsed.descricao) detected.value.description = parsed.descricao;
        geminiUsed.value = !!(parsed.valor || parsed.data || parsed.descricao);
        // DEBUG: log para inspecionar por que UI não atualiza
        console.debug("frontend: applied gemini fields -> detected:", JSON.parse(JSON.stringify(detected.value)));
      } catch (e) {
        console.warn("gemini-raw immediate enrich failed", e);
      }

      if (!text) {
        console.warn("OCR completed but returned empty text. Verifique console network para requests de tessdata e tente uma imagem de alto contraste.");
      }

      // heurísticas para detectar valores, datas e descrição (local)
      const moneyRegex =
        /R\$?\s?[\d\.,]{1,}\d{1,2}|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/g;
      const dateRegex =
        /(?:\d{2}[\/\-]\d{2}[\/\-]\d{2,4})|(?:\d{4}[\/\-]\d{2}[\/\-]\d{2})/g;
      const descRegex = /descri(?:çã|c)o[:\s-]*([^\n\r]+)/i;

      const textForDetect = extractedText.value || "";

      const moneyMatches = textForDetect.match(moneyRegex);
      const dateMatches = textForDetect.match(dateRegex);
      const descMatch = textForDetect.match(descRegex);

      if (moneyMatches && moneyMatches.length && !detected.value.amount) {
        detected.value.amount = moneyMatches[0];
      }
      if (dateMatches && dateMatches.length && !detected.value.date) {
        detected.value.date = normalizeDate(dateMatches[0]);
      }

      if (descMatch && descMatch[1]) {
        if (!detected.value.description) detected.value.description = descMatch[1].trim();
      } else {
        // fallback: escolher uma linha provável para descrição
        const lines = textForDetect
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const filtered = lines.filter(
          (l) => !l.match(moneyRegex) && !l.match(dateRegex)
        );
        if (filtered.length) {
          if (!detected.value.description) {
            detected.value.description =
              filtered.find((l) => l.length > 3) || filtered[0];
          }
        }
      }

      // inferir tipo localmente a partir do texto
      if (!transactionType.value) {
        const lower = textForDetect.toLowerCase();
        if (
          lower.includes("entrada") ||
          lower.includes("receb") ||
          lower.includes("crédito") ||
          lower.includes("credito")
        ) {
          transactionType.value = "entrada";
        } else if (
          lower.includes("saída") ||
          lower.includes("saida") ||
          lower.includes("debito") ||
          lower.includes("débito")
        ) {
          transactionType.value = "saida";
        }
      }
      detected.value.type = transactionType.value || null;

      // Chamar o backend apenas se 'amount' ou 'date' estiverem vazios
      try {
        const hasAmount = !!(detected.value && detected.value.amount);
        const hasDate = !!(detected.value && detected.value.date);

        if (!hasAmount || !hasDate) {
          // 1) Tentar envio do texto bruto ao endpoint específico que usa Gemini apenas com texto
          try {
            const respRaw = await axios.post("/api/gemini-raw", { text: extractedText.value });
            const rawData = respRaw && respRaw.data ? respRaw.data : {};
            const parsed = rawData.parsed || {};
            console.debug("frontend (fallback) /api/gemini-raw parsed:", parsed, "raw preview:", (rawData.raw || "").slice(0,300));

            // aplicar valores retornados pelo Gemini diretamente garantindo reatividade
            if (parsed.valor) detected.value.amount = parsed.valor;
            if (parsed.data) detected.value.date = normalizeDate(parsed.data);
            if (parsed.descricao) detected.value.description = parsed.descricao;

            // marcar que Gemini foi usado quando houver alguma informação preenchida
            geminiUsed.value = !!(parsed.valor || parsed.data || parsed.descricao);
            // DEBUG: log para inspecionar por que UI não atualiza (fallback)
            console.debug("frontend (fallback): applied gemini fields -> detected:", JSON.parse(JSON.stringify(detected.value)));

            // se gemini-raw não conseguiu extrair tudo e temos imagem, cair para /api/ocr (envia imagem)
            const stillMissing = !(detected.value && (detected.value.amount || detected.value.date));
            if (stillMissing && previewSrc.value) {
              const payload = {
                text: extractedText.value,
                fields: detected.value,
                image: previewSrc.value,
                action: "enrich",
              };
              const resp = await axios.post("/api/ocr", payload);
              const dataResp = resp && resp.data ? resp.data : {};
              if (dataResp.fields) {
                detected.value = Object.assign({}, detected.value || {}, dataResp.fields);
              }
              if (dataResp.text) {
                extractedText.value = dataResp.text;
                previewText.value = dataResp.text;
              }
              geminiUsed.value = geminiUsed.value || !!dataResp.geminiUsed;
            }
          } catch (errRaw) {
            // se o /api/gemini-raw falhar por qualquer motivo, tentar fallback para /api/ocr (com imagem se disponível)
            console.warn("gemini-raw failed, falling back to /api/ocr", errRaw);
            try {
              const payload = {
                text: extractedText.value,
                fields: detected.value,
                ...(previewSrc.value ? { image: previewSrc.value } : {}),
                action: "enrich",
              };
              const resp = await axios.post("/api/ocr", payload);
              const dataResp = resp && resp.data ? resp.data : {};
              if (dataResp.fields) {
                detected.value = Object.assign({}, detected.value || {}, dataResp.fields);
              }
              if (dataResp.text) {
                extractedText.value = dataResp.text;
                previewText.value = dataResp.text;
              }
              geminiUsed.value = !!dataResp.geminiUsed;
            } catch (e2) {
              console.error("Fallback /api/ocr failed", e2);
            }
          }
        } else {
          console.debug("OCR: amount and date detected locally — skipping Gemini enrichment");
        }
      } catch (e) {
        console.error("Gemini enrichment error", e);
      } finally {
        isProcessing.value = false;
      }
    }

    function setType(t) {
      transactionType.value = t;
      detected.value.type = t;
    }

    async function saveExtraction() {
      // envia texto extraído + campos detectados; anexa imagem se texto ausente ou campos faltando
      const needImage =
        !extractedText.value ||
        !(detected.value && (detected.value.amount || detected.value.date));
      const payload = {
        text: extractedText.value,
        fields: detected.value,
        ...(needImage && previewSrc.value ? { image: previewSrc.value } : {}),
      };
      try {
        const resp = await axios.post("/api/ocr", payload);
        const data = resp && resp.data ? resp.data : {};
        // se o backend retornou campos resolvidos, atualiza o UI
        if (data.fields) {
          detected.value = Object.assign(detected.value || {}, data.fields);
        }
        if (data.text) {
          extractedText.value = data.text;
          previewText.value = data.text;
        }
        // atualizar estado que indica uso do Gemini
        geminiUsed.value = !!data.geminiUsed;
        if (geminiUsed.value) {
          // mensagem discreta — também exibimos um aviso simples
          alert("Extração enviada. Gemini foi usado para completar campos faltantes.");
        } else {
          alert("Extração enviada ao servidor.");
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao salvar extração.");
      }
    }

    return {
      file,
      previewSrc,
      previewText,
      extractedText,
      detected,
      isProcessing,
      progress,
      transactionType,
      fileInput,
      dragOver,
      openFileDialog,
      openCamera,
      closeCamera,
      captureFromCamera,
      video,
      cameraActive,
      handleDrop,
      handleDragOver,
      handleDragLeave,
      onFileChange,
      runOcr,
      saveExtraction,
      setType,
      geminiUsed,
      isPreviewLight,
    };
  },
};
</script>

<style module src="./OcrView.module.css"></style>
