import { renderContextView } from './views/context-view';
import { renderHomeView } from './views/home-view';

export type PopupView = 'home' | 'context';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Popup root element #app not found');
}

const app: HTMLElement = root;

function showView(view: PopupView): void {
  app.replaceChildren();

  if (view === 'home') {
    app.append(renderHomeView({ onConfigure: () => showView('context') }));
    return;
  }

  app.append(renderContextView({ onBack: () => showView('home') }));
}

showView('home');
