import type { ReactNode } from 'react';

import type { ChatNetwork } from './types';

export function ConversationNetworkSection({
  children,
  network,
  showHeader = true,
}: {
  children: ReactNode;
  network: ChatNetwork;
  showHeader?: boolean;
}) {
  return (
    <div
      className={`network-section network-section--${network}${showHeader ? '' : ' network-section--solo'}`}
    >
      {showHeader ? (
        <div className="network-section__header">
          <h2 className="network-section__title">{network === 'qortal' ? 'Qortal' : 'Qortium'}</h2>
          <span className="network-section__protocol">CHAT</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
