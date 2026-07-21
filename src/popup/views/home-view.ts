import { getContext, isContextReady } from '../../core/storage';
import { hasConfiguredContext } from '../../core/types';
import { isExtensionMessage, MessageType } from '../../shared/messages';

export interface HomeViewOptions {
  onConfigure: () => void;
}

/**
 * Tela 1 — Home: status do contexto, CTA Preencher, link para Configurar Contexto.
 */
export function renderHomeView(options: HomeViewOptions): HTMLElement {
  const root = document.createElement('section');
  root.className = 'view';
  root.dataset.view = 'home';

  const header = document.createElement('header');
  header.className = 'view-header';

  const title = document.createElement('h1');
  title.textContent = 'autoForm';

  const subtitle = document.createElement('p');
  subtitle.className = 'subtitle';
  subtitle.textContent =
    'Preenche formulários na aba ativa com base no seu contexto local.';

  header.append(title, subtitle);

  const status = document.createElement('div');
  status.className = 'status status--loading';
  status.setAttribute('role', 'status');
  status.textContent = 'Verificando contexto…';

  const fillButton = document.createElement('button');
  fillButton.type = 'button';
  fillButton.className = 'primary fill-button';
  fillButton.textContent = 'Preencher Formulário';
  fillButton.disabled = true;
  fillButton.title = 'Configure o contexto primeiro';

  const feedback = document.createElement('p');
  feedback.className = 'feedback';
  feedback.hidden = true;
  feedback.setAttribute('role', 'status');

  const configureLink = document.createElement('button');
  configureLink.type = 'button';
  configureLink.className = 'link-button';
  configureLink.textContent = 'Configurar Contexto';
  configureLink.addEventListener('click', options.onConfigure);

  fillButton.addEventListener('click', () => {
    void runFill();
  });

  root.append(header, status, fillButton, feedback, configureLink);

  void refreshReadyState();

  return root;

  async function refreshReadyState(): Promise<void> {
    try {
      const [ready, context] = await Promise.all([
        isContextReady(),
        getContext(),
      ]);

      fillButton.disabled = !ready;
      fillButton.title = ready
        ? 'Preencher formulário na aba ativa'
        : 'Configure o contexto primeiro';

      status.classList.remove('status--loading', 'status--ready', 'status--empty');

      if (ready && context) {
        status.classList.add('status--ready');
        const chars = context.rawContext.trim().length;
        const updated = formatUpdatedAt(context.updatedAt);
        status.textContent = updated
          ? `Contexto configurado · ${chars.toLocaleString('pt-BR')} caracteres · atualizado ${updated}`
          : `Contexto configurado · ${chars.toLocaleString('pt-BR')} caracteres`;
        return;
      }

      status.classList.add('status--empty');
      if (context && !hasConfiguredContext(context)) {
        const missingKey = context.apiKey.trim().length === 0;
        const missingText = context.rawContext.trim().length === 0;
        if (missingKey && missingText) {
          status.textContent = 'Nenhum contexto configurado';
        } else if (missingKey) {
          status.textContent =
            'Contexto incompleto — falta a API key. Configure o contexto.';
        } else {
          status.textContent =
            'Contexto incompleto — falta o texto. Configure o contexto.';
        }
        return;
      }

      status.textContent = 'Nenhum contexto configurado';
    } catch {
      fillButton.disabled = true;
      fillButton.title = 'Configure o contexto primeiro';
      status.classList.remove('status--loading', 'status--ready');
      status.classList.add('status--empty');
      status.textContent = 'Não foi possível ler o storage.';
    }
  }

  async function runFill(): Promise<void> {
    fillButton.disabled = true;
    fillButton.textContent = 'Preenchendo…';
    fillButton.classList.add('is-loading');
    hideFeedback();

    try {
      const response: unknown = await chrome.runtime.sendMessage({
        type: MessageType.FILL_REQUEST,
      });

      if (!isExtensionMessage(response)) {
        showFeedback('Resposta inesperada do background.', 'error');
        return;
      }

      if (response.type === MessageType.FILL_RESULT) {
        const { filled, skipped } = response;
        if (filled === 0 && skipped === 0) {
          showFeedback(
            'Nenhum campo preenchível encontrado nesta página.',
            'error',
          );
        } else if (filled === 0) {
          showFeedback(
            `Nenhum campo preenchido. ${skipped} campo(s) sem valor sugerido.`,
            'error',
          );
        } else {
          showFeedback(
            `Pronto: ${filled} campo(s) preenchido(s)${
              skipped > 0 ? `, ${skipped} ignorado(s)` : ''
            }.`,
            'success',
          );
        }
        return;
      }

      if (response.type === MessageType.FILL_ERROR) {
        showFeedback(response.message, 'error');
        return;
      }

      showFeedback('Resposta inesperada do background.', 'error');
    } catch {
      showFeedback(
        'Falha ao comunicar com o background. Recarregue a extensão e tente de novo.',
        'error',
      );
    } finally {
      fillButton.textContent = 'Preencher Formulário';
      fillButton.classList.remove('is-loading');
      await refreshReadyState();
    }
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

function formatUpdatedAt(iso: string): string | null {
  if (!iso.trim()) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
