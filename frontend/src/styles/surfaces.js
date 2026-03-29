import { css } from 'styled-components';

export const modalBackdropSurface = css`
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  background: var(--panel-backdrop-bg);
  backdrop-filter: blur(var(--panel-backdrop-blur));
  -webkit-backdrop-filter: blur(var(--panel-backdrop-blur));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--panel-overlay-pad-inline);
`;

export const topAlignedModalBackdropSurface = css`
  ${modalBackdropSurface};
  align-items: flex-start;
  padding-top: var(--shell-overlay-pad-top);
`;

export const panelSurface = css`
  border-radius: var(--panel-radius);
  border: 1px solid var(--panel-border-color);
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  padding: var(--panel-padding);
`;

export const insetPanelSurface = css`
  border-radius: var(--panel-inset-radius);
  border: 1px solid var(--panel-inset-border-color);
  background: var(--panel-inset-bg);
  box-shadow: var(--panel-inset-shadow);
  padding: var(--panel-inset-padding);
`;
