import type { ReactNode } from 'react';

import { UserAvatar } from './accountDisplay';
import { BackIcon, LockIcon } from './icons';
import type { ChatNetwork } from './types';

export function ChatPaneHeader({
  actionHint,
  actions,
  avatar,
  backLabel,
  contextLabel,
  closedLabel,
  description,
  isClosed = false,
  network,
  onBack,
  title,
}: {
  actionHint?: string | null;
  actions?: ReactNode;
  avatar?: { fallback: string; name: string; src: string | null } | null;
  backLabel: string;
  contextLabel?: string | null;
  closedLabel?: string;
  description?: string | null;
  isClosed?: boolean;
  network?: ChatNetwork;
  onBack: () => void;
  title: string;
}) {
  return (
    <div className="chat-pane__header">
      <div className="chat-pane__identity">
        <button
          aria-label={backLabel}
          className="chat-pane__back"
          onClick={onBack}
          title={backLabel}
          type="button"
        >
          <BackIcon />
        </button>
        {avatar ? (
          <UserAvatar
            className="chat-pane__group-avatar"
            fallback={avatar.fallback}
            name={avatar.name}
            src={avatar.src}
          />
        ) : null}
        <div className="chat-pane__heading">
          <h2 className="chat-pane__title">
            {isClosed ? (
              <span
                aria-label={closedLabel}
                className="chat-pane__title-lock"
                role="img"
                title={closedLabel}
              >
                <LockIcon />
              </span>
            ) : null}
            <span className="chat-pane__title-text">{title}</span>
          </h2>
          {network ? (
            <div className="chat-pane__context">
              <span>{network === 'qortal' ? 'Qortal' : 'Qortium'}</span>
              <span>CHAT</span>
              {contextLabel ? <span>{contextLabel}</span> : null}
            </div>
          ) : null}
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="chat-pane__actions">{actions}</div> : null}
      {actionHint ? <p className="chat-pane__action-hint">{actionHint}</p> : null}
    </div>
  );
}
