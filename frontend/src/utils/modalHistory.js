const modalStack = [];
let pendingProgrammaticBackCount = 0;
let popstateListenerAttached = false;

const removeModalEntry = (entry) => {
  const index = modalStack.lastIndexOf(entry);
  if (index !== -1) modalStack.splice(index, 1);
};

const detachPopstateListenerIfIdle = () => {
  if (
    typeof window === 'undefined'
    || !popstateListenerAttached
    || modalStack.length > 0
    || pendingProgrammaticBackCount > 0
  ) {
    return;
  }

  window.removeEventListener('popstate', handlePopstate);
  popstateListenerAttached = false;
};

function handlePopstate(event) {
  if (pendingProgrammaticBackCount > 0) {
    pendingProgrammaticBackCount -= 1;
    event.stopImmediatePropagation?.();
    detachPopstateListenerIfIdle();
    return;
  }

  const activeEntry = modalStack[modalStack.length - 1];
  if (!activeEntry) {
    detachPopstateListenerIfIdle();
    return;
  }

  if (!activeEntry.canClose()) {
    event.stopImmediatePropagation?.();
    window.history.pushState(
      {
        ...(window.history.state || {}),
        __modalToken: activeEntry.historyToken
      },
      ''
    );
    return;
  }

  activeEntry.consumed = true;
  activeEntry.onClose();
}

const ensurePopstateListener = () => {
  if (typeof window === 'undefined' || popstateListenerAttached) return;
  window.addEventListener('popstate', handlePopstate);
  popstateListenerAttached = true;
};

export function registerModalHistoryEntry({ historyToken, canClose, onClose }) {
  if (typeof window === 'undefined' || !window.history) return () => {};

  const entry = {
    historyToken,
    canClose,
    onClose,
    consumed: false
  };

  window.history.pushState(
    {
      ...(window.history.state || {}),
      __modalToken: historyToken
    },
    ''
  );
  modalStack.push(entry);
  ensurePopstateListener();

  return () => {
    removeModalEntry(entry);

    if (!entry.consumed && window.history.state?.__modalToken === historyToken) {
      pendingProgrammaticBackCount += 1;
      ensurePopstateListener();
      window.history.back();
    }

    detachPopstateListenerIfIdle();
  };
}

if (typeof module !== 'undefined' && module.hot) {
  module.hot.dispose(() => {
    if (typeof window !== 'undefined' && popstateListenerAttached) {
      window.removeEventListener('popstate', handlePopstate);
    }
    popstateListenerAttached = false;
    modalStack.length = 0;
    pendingProgrammaticBackCount = 0;
  });
}
