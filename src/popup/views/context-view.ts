import { extractText } from '../../core/file-extractor';
import { clearContext, getContext, saveContext } from '../../core/storage';
import type { AiProviderId, LocalStorageData } from '../../core/types';
import { isAiProviderId } from '../../core/types';

export interface ContextViewOptions {
  onBack: () => void;
}

/** Soft cap for rawContext (TASKS: ~20.000 caracteres). */
export const CONTEXT_MAX_CHARS = 20_000;

const PROVIDER_OPTIONS: ReadonlyArray<{
  id: AiProviderId;
  label: string;
  enabled: boolean;
  keyPlaceholder: string;
}> = [
  { id: 'openai', label: 'OpenAI', enabled: true, keyPlaceholder: 'sk-…' },
  {
    id: 'gemini',
    label: 'Gemini',
    enabled: true,
    keyPlaceholder: 'AIza…',
  },
  {
    id: 'groq',
    label: 'Groq (em breve)',
    enabled: false,
    keyPlaceholder: 'gsk_…',
  },
];

/**
 * Tela 2 — Configurar Contexto: API key, provedor, upload PDF/DOCX, texto livre.
 */
export function renderContextView(options: ContextViewOptions): HTMLElement {
  const root = document.createElement('section');
  root.className = 'view';
  root.dataset.view = 'context';

  const header = document.createElement('header');
  header.className = 'view-header';

  const title = document.createElement('h1');
  title.textContent = 'Configurar Contexto';

  const intro = document.createElement('p');
  intro.className = 'subtitle';
  intro.textContent =
    'Tudo fica só no seu navegador (chrome.storage.local). Sem conta e sem servidor próprio.';

  header.append(title, intro);

  // --- API key ---
  const keyField = document.createElement('div');
  keyField.className = 'field';

  const keyLabel = document.createElement('label');
  keyLabel.htmlFor = 'api-key';
  keyLabel.textContent = 'Chave de API';

  const keyRow = document.createElement('div');
  keyRow.className = 'input-row';

  const apiKeyInput = document.createElement('input');
  apiKeyInput.id = 'api-key';
  apiKeyInput.type = 'password';
  apiKeyInput.autocomplete = 'off';
  apiKeyInput.spellcheck = false;
  apiKeyInput.placeholder = 'sk-…';

  const toggleKeyButton = document.createElement('button');
  toggleKeyButton.type = 'button';
  toggleKeyButton.className = 'ghost';
  toggleKeyButton.textContent = 'Mostrar';
  toggleKeyButton.setAttribute('aria-pressed', 'false');
  toggleKeyButton.addEventListener('click', () => {
    const showing = apiKeyInput.type === 'text';
    apiKeyInput.type = showing ? 'password' : 'text';
    toggleKeyButton.textContent = showing ? 'Mostrar' : 'Ocultar';
    toggleKeyButton.setAttribute('aria-pressed', showing ? 'false' : 'true');
  });

  keyRow.append(apiKeyInput, toggleKeyButton);
  keyField.append(keyLabel, keyRow);

  // --- Provider ---
  const providerField = document.createElement('div');
  providerField.className = 'field';

  const providerLabel = document.createElement('label');
  providerLabel.htmlFor = 'ai-provider';
  providerLabel.textContent = 'Provedor de IA';

  const providerSelect = document.createElement('select');
  providerSelect.id = 'ai-provider';
  for (const option of PROVIDER_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.id;
    el.textContent = option.label;
    el.disabled = !option.enabled;
    providerSelect.append(el);
  }
  providerSelect.value = 'openai';
  providerSelect.addEventListener('change', () => {
    syncKeyPlaceholder();
  });

  providerField.append(providerLabel, providerSelect);

  // --- File upload ---
  const uploadField = document.createElement('div');
  uploadField.className = 'field';

  const uploadLabel = document.createElement('label');
  uploadLabel.htmlFor = 'file-upload';
  uploadLabel.textContent = 'Arquivos (PDF ou DOCX)';

  const fileInput = document.createElement('input');
  fileInput.id = 'file-upload';
  fileInput.type = 'file';
  fileInput.accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  fileInput.multiple = true;

  const uploadHint = document.createElement('p');
  uploadHint.className = 'hint';
  uploadHint.textContent =
    'O texto é extraído localmente e anexado ao campo abaixo. Vários arquivos são separados por nome.';

  const uploadStatus = document.createElement('p');
  uploadStatus.className = 'hint upload-status';
  uploadStatus.hidden = true;

  fileInput.addEventListener('change', () => {
    void onFilesSelected();
  });

  uploadField.append(uploadLabel, fileInput, uploadHint, uploadStatus);

  // --- Free text ---
  const contextField = document.createElement('div');
  contextField.className = 'field';

  const contextLabel = document.createElement('label');
  contextLabel.htmlFor = 'raw-context';
  contextLabel.textContent = 'Texto do contexto';

  const contextArea = document.createElement('textarea');
  contextArea.id = 'raw-context';
  contextArea.rows = 8;
  contextArea.maxLength = CONTEXT_MAX_CHARS;
  contextArea.placeholder =
    'Cole bio, currículo ou respostas prontas… Ou envie arquivos acima.';
  contextArea.spellcheck = true;

  const charCounter = document.createElement('p');
  charCounter.className = 'char-counter';
  charCounter.setAttribute('aria-live', 'polite');

  contextArea.addEventListener('input', updateCharCounter);

  contextField.append(contextLabel, contextArea, charCounter);

  // --- Cost notice (security rule 10) ---
  const costNotice = document.createElement('p');
  costNotice.className = 'notice';
  costNotice.textContent =
    'O uso da IA está sujeito aos termos e custos do provedor escolhido. A extensão não é responsável por cobranças na sua conta.';

  // --- Feedback + actions ---
  const feedback = document.createElement('p');
  feedback.className = 'feedback';
  feedback.hidden = true;
  feedback.setAttribute('role', 'status');

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'primary';
  saveButton.textContent = 'Salvar';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'danger';
  clearButton.textContent = 'Limpar Contexto';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'ghost';
  backButton.textContent = 'Voltar';
  backButton.addEventListener('click', options.onBack);

  const actions = document.createElement('div');
  actions.className = 'actions-row';
  actions.append(saveButton, clearButton, backButton);

  saveButton.addEventListener('click', () => {
    void onSave();
  });
  clearButton.addEventListener('click', () => {
    void onClear();
  });

  root.append(
    header,
    keyField,
    providerField,
    uploadField,
    contextField,
    costNotice,
    feedback,
    actions,
  );

  syncKeyPlaceholder();
  updateCharCounter();
  void loadExisting();

  return root;

  function syncKeyPlaceholder(): void {
    const meta = PROVIDER_OPTIONS.find((p) => p.id === providerSelect.value);
    apiKeyInput.placeholder = meta?.keyPlaceholder ?? 'sk-…';
  }

  async function loadExisting(): Promise<void> {
    try {
      const existing = await getContext();
      if (!existing) {
        updateCharCounter();
        return;
      }
      apiKeyInput.value = existing.apiKey;
      if (isAiProviderId(existing.aiProvider)) {
        const meta = PROVIDER_OPTIONS.find((p) => p.id === existing.aiProvider);
        providerSelect.value = meta?.enabled
          ? existing.aiProvider
          : 'openai';
      }
      syncKeyPlaceholder();
      contextArea.value = existing.rawContext;
      updateCharCounter();
    } catch {
      showFeedback('Não foi possível ler o storage.', 'error');
    }
  }

  async function onFilesSelected(): Promise<void> {
    const files = fileInput.files;
    if (!files || files.length === 0) {
      return;
    }

    uploadStatus.hidden = false;
    uploadStatus.className = 'hint upload-status';
    uploadStatus.textContent = `Extraindo ${files.length} arquivo(s)…`;
    fileInput.disabled = true;
    hideFeedback();

    const blocks: string[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const text = await extractText(file);
        blocks.push(formatFileBlock(file.name, text));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha ao ler o arquivo.';
        errors.push(`${file.name}: ${message}`);
      }
    }

    fileInput.value = '';
    fileInput.disabled = false;

    if (blocks.length > 0) {
      const appended = appendContextBlocks(contextArea.value, blocks);
      if (appended.truncated) {
        contextArea.value = appended.text;
        showFeedback(
          `Texto anexado, mas truncado no limite de ${CONTEXT_MAX_CHARS.toLocaleString('pt-BR')} caracteres.`,
          'error',
        );
      } else {
        contextArea.value = appended.text;
      }
      updateCharCounter();
    }

    if (errors.length > 0 && blocks.length === 0) {
      uploadStatus.className = 'hint upload-status upload-status--error';
      uploadStatus.textContent = errors.join(' ');
      showFeedback(errors[0] ?? 'Falha ao extrair arquivos.', 'error');
    } else if (errors.length > 0) {
      uploadStatus.className = 'hint upload-status upload-status--error';
      uploadStatus.textContent = `${blocks.length} arquivo(s) ok. ${errors.length} com erro.`;
      showFeedback(errors.join(' '), 'error');
    } else {
      uploadStatus.className = 'hint upload-status upload-status--ok';
      uploadStatus.textContent = `${blocks.length} arquivo(s) anexado(s) ao texto.`;
    }
  }

  async function onSave(): Promise<void> {
    const apiKey = apiKeyInput.value.trim();
    const rawContext = contextArea.value.trim();
    const selected = providerSelect.value;
    const aiProvider: AiProviderId = isAiProviderId(selected)
      ? selected
      : 'openai';

    if (!apiKey || !rawContext) {
      showFeedback('Informe a API key e o texto do contexto antes de salvar.', 'error');
      return;
    }

    if (rawContext.length > CONTEXT_MAX_CHARS) {
      showFeedback(
        `O contexto excede ${CONTEXT_MAX_CHARS.toLocaleString('pt-BR')} caracteres.`,
        'error',
      );
      return;
    }

    const data: LocalStorageData = {
      apiKey,
      aiProvider,
      rawContext,
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveContext(data);
      showFeedback('Contexto salvo localmente.', 'success');
    } catch {
      showFeedback('Falha ao salvar o contexto.', 'error');
    }
  }

  async function onClear(): Promise<void> {
    try {
      await clearContext();
      apiKeyInput.value = '';
      apiKeyInput.type = 'password';
      toggleKeyButton.textContent = 'Mostrar';
      toggleKeyButton.setAttribute('aria-pressed', 'false');
      providerSelect.value = 'openai';
      syncKeyPlaceholder();
      contextArea.value = '';
      fileInput.value = '';
      uploadStatus.hidden = true;
      uploadStatus.textContent = '';
      updateCharCounter();
      showFeedback('Contexto apagado do storage local.', 'success');
    } catch {
      showFeedback('Falha ao limpar o contexto.', 'error');
    }
  }

  function updateCharCounter(): void {
    const length = contextArea.value.length;
    charCounter.textContent = `${length.toLocaleString('pt-BR')} / ${CONTEXT_MAX_CHARS.toLocaleString('pt-BR')}`;
    charCounter.classList.toggle('char-counter--warn', length >= CONTEXT_MAX_CHARS * 0.9);
    charCounter.classList.toggle('char-counter--over', length >= CONTEXT_MAX_CHARS);
  }

  function showFeedback(
    text: string,
    kind: 'success' | 'error' | 'info' = 'info',
  ): void {
    feedback.hidden = false;
    feedback.className = `feedback feedback--${kind}`;
    feedback.textContent = text;
  }

  function hideFeedback(): void {
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.className = 'feedback';
  }
}

/** Build a plain-text block tagged with the source filename. */
export function formatFileBlock(filename: string, text: string): string {
  const safeName = filename.trim() || 'arquivo';
  return `--- ${safeName} ---\n${text.trim()}`;
}

/**
 * Append file blocks to existing textarea text with blank-line separators.
 * Truncates to CONTEXT_MAX_CHARS when needed.
 */
export function appendContextBlocks(
  existing: string,
  blocks: string[],
): { text: string; truncated: boolean } {
  const combined = [existing.trim(), ...blocks.map((b) => b.trim())]
    .filter((part) => part.length > 0)
    .join('\n\n');

  if (combined.length <= CONTEXT_MAX_CHARS) {
    return { text: combined, truncated: false };
  }

  return {
    text: combined.slice(0, CONTEXT_MAX_CHARS),
    truncated: true,
  };
}
