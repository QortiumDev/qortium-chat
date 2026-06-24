import { useEffect, useState } from 'react';
import { type AvatarLightboxImage } from './AvatarLightbox';
import {
  getAvatarView,
  getMessageSenderLabel,
  getShortAddress,
  UserAvatar,
  type AccountInfoTarget,
  type AvatarProfilesByAddress,
} from './accountDisplay';
import { BLOCK_TIME_MS, computeApprovalWindow, type ApprovalWindowState } from './approvalProgress';
import { type AvatarProfile } from './avatarProfiles';
import { formatTimestamp } from './chatText';
import { copyTextToClipboard } from './clipboard';
import { type TranslateFunction } from './i18n';
import { useModalDialog } from './useModalDialog';
import {
  type ApprovalProgress,
  type AsyncState,
  type GroupData,
  type PendingApprovalTransaction,
} from './types';

export function AccountInfoDialog({
  canMention,
  canOpenDirect,
  directUnavailableLabel,
  onClose,
  onMention,
  onOpenAvatar,
  onOpenDirect,
  profile,
  target,
  t,
}: {
  canMention: boolean;
  canOpenDirect: boolean;
  directUnavailableLabel: string;
  onClose: () => void;
  onMention: (target: AccountInfoTarget) => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  onOpenDirect: (address: string, name: string | null) => void;
  profile: AvatarProfile | undefined;
  target: AccountInfoTarget;
  t: TranslateFunction;
}) {
  const [copyStatus, setCopyStatus] = useState<'copied' | 'error' | 'idle'>('idle');
  const { avatarSrc, name } = getAvatarView(profile, target.senderName);
  const label = getMessageSenderLabel(target, profile);

  const cardRef = useModalDialog<HTMLElement>(onClose);

  useEffect(() => {
    setCopyStatus('idle');
  }, [target.sender]);

  async function copyAddress() {
    if (await copyTextToClipboard(target.sender)) {
      setCopyStatus('copied');
      return;
    }

    setCopyStatus('error');
  }

  return (
    <div
      aria-label={t('aria.accountInfo')}
      aria-modal="true"
      className="account-dialog"
      onClick={onClose}
      role="dialog"
    >
      <section className="account-dialog__card" onClick={(event) => event.stopPropagation()} ref={cardRef} tabIndex={-1}>
        <header className="account-dialog__header">
          <UserAvatar
            className="account-dialog__avatar"
            name={name}
            src={avatarSrc}
          />
          <div className="account-dialog__heading">
            <span>{t('title.accountInfo')}</span>
            <h2>{label}</h2>
          </div>
          <button
            aria-label={t('button.close')}
            className="account-dialog__close"
            onClick={onClose}
            title={t('button.close')}
            type="button"
          >
            X
          </button>
        </header>

        <dl className="account-dialog__details">
          <div>
            <dt>{t('label.account.registeredName')}</dt>
            <dd>{name ?? t('label.account.noRegisteredName')}</dd>
          </div>
          <div>
            <dt>{t('label.account.address')}</dt>
            <dd className="account-dialog__address">{target.sender}</dd>
          </div>
        </dl>

        <div className="account-dialog__actions">
          <button className="button button--secondary" onClick={() => void copyAddress()} type="button">
            {copyStatus === 'copied' ? t('button.copied') : t('button.copyAddress')}
          </button>
          <button
            className="button"
            disabled={!canOpenDirect}
            onClick={() => onOpenDirect(target.sender, name)}
            title={canOpenDirect ? t('action.directTooltip') : directUnavailableLabel}
            type="button"
          >
            {t('button.openDirectChat')}
          </button>
          {canMention ? (
            <button
              className="button button--secondary"
              onClick={() => onMention(target)}
              title={t('action.mention', { account: label })}
              type="button"
            >
              {t('button.mention')}
            </button>
          ) : null}
          {avatarSrc ? (
            <button
              className="button button--secondary"
              onClick={() => onOpenAvatar({ name, src: avatarSrc })}
              type="button"
            >
              {t('button.viewAvatar')}
            </button>
          ) : null}
        </div>
        {copyStatus === 'error' ? <p className="error">{t('status.copyAddress.failed')}</p> : null}
      </section>
    </div>
  );
}

function shortenSignature(signature: string) {
  return signature.length > 24 ? `${signature.slice(0, 12)}...${signature.slice(-8)}` : signature;
}

function describeApprovalType(transaction: PendingApprovalTransaction, t: TranslateFunction) {
  // service id 1 === AUTO_UPDATE manifest (a Core auto-update).
  if (transaction.type === 'ARBITRARY' && transaction.service === 1) {
    return t('label.approval.type.autoUpdate');
  }

  return transaction.type ?? t('label.approval.type.unknown');
}

// Human-readable, approximate ETA for a target height relative to the tip.
function formatBlockEta(targetHeight: number | null, currentHeight: number | null, t: TranslateFunction) {
  if (targetHeight === null || currentHeight === null) {
    return null;
  }

  const blocksRemaining = targetHeight - currentHeight;

  if (blocksRemaining <= 0) {
    return null;
  }

  const remainingMs = blocksRemaining * BLOCK_TIME_MS;
  const minutes = Math.round(remainingMs / 60000);

  if (minutes < 60) {
    return t('label.approval.eta.minutes', { count: minutes });
  }

  if (remainingMs < 36 * 3600 * 1000) {
    return t('label.approval.eta.hours', { count: Math.round(remainingMs / (3600 * 1000)) });
  }

  return t('label.approval.eta.days', { count: Math.round(remainingMs / (24 * 3600 * 1000)) });
}

export function GroupApprovalDialog({
  actionSignature,
  avatarProfiles,
  canVote,
  currentHeight,
  group,
  knownNames,
  onApprove,
  onClose,
  onOppose,
  pending,
  progressBySignature,
  progressReady,
  t,
  voteUnavailableLabel,
  votedSignatures,
}: {
  actionSignature: string | null;
  avatarProfiles: AvatarProfilesByAddress;
  canVote: boolean;
  currentHeight: number | null;
  group: GroupData | null;
  knownNames: ReadonlyMap<string, string>;
  onApprove: (signature: string) => void;
  onClose: () => void;
  onOppose: (signature: string) => void;
  pending: AsyncState<PendingApprovalTransaction[]>;
  progressBySignature: ReadonlyMap<string, ApprovalProgress>;
  progressReady: boolean;
  t: TranslateFunction;
  voteUnavailableLabel: string;
  votedSignatures: Record<string, { approval: boolean }>;
}) {
  const cardRef = useModalDialog<HTMLElement>(onClose);

  const [copiedSignature, setCopiedSignature] = useState<string | null>(null);

  async function copySignature(signature: string) {
    if (await copyTextToClipboard(signature)) {
      setCopiedSignature(signature);
    }
  }

  const transactions = pending.value;

  return (
    <div
      aria-label={t('aria.groupApproval')}
      aria-modal="true"
      className="account-dialog"
      onClick={onClose}
      role="dialog"
    >
      <section
        className="account-dialog__card account-dialog__card--approval"
        onClick={(event) => event.stopPropagation()}
        ref={cardRef}
        tabIndex={-1}
      >
        <header className="account-dialog__header">
          <div className="account-dialog__heading">
            <span>{t('label.groupApproval.section')}</span>
            <h2>{t('title.groupApproval')}</h2>
          </div>
          <button
            aria-label={t('button.close')}
            className="account-dialog__close"
            onClick={onClose}
            title={t('button.close')}
            type="button"
          >
            X
          </button>
        </header>

        <p className="muted">{t('label.groupApproval.intro')}</p>
        <p className="muted">{t('label.approval.pendingNote')}</p>

        {pending.phase === 'error' ? <p className="error">{pending.error}</p> : null}

        {pending.phase === 'loading' && transactions.length === 0 ? (
          <p className="muted">{t('label.loading')}</p>
        ) : transactions.length === 0 ? (
          <p className="muted">{t('status.approval.empty')}</p>
        ) : (
          <ul className="approval-list">
            {transactions.map((transaction) => {
              const busy = actionSignature === transaction.signature;
              const creatorAddress = transaction.creatorAddress ?? '';
              const creatorProfile = creatorAddress ? avatarProfiles.get(creatorAddress) : undefined;
              const { avatarSrc, name } = getAvatarView(creatorProfile, knownNames.get(creatorAddress) ?? null);
              const creatorLabel = name ?? (creatorAddress ? getShortAddress(creatorAddress) : '-');

              const progress = progressBySignature.get(transaction.signature);
              const approvalsValue =
                progressReady && progress
                  ? t('label.approval.approvalsValue', {
                      count: progress.approvalsSoFar,
                      needed: progress.approvalsNeeded,
                    })
                  : t('label.approval.unavailable');
              const progressRatio =
                progress && progress.approvalsNeeded > 0
                  ? Math.min(1, progress.approvalsSoFar / progress.approvalsNeeded)
                  : 0;

              const optimisticVote = votedSignatures[transaction.signature];
              const effectiveVote: 'approve' | 'oppose' | null = optimisticVote
                ? optimisticVote.approval
                  ? 'approve'
                  : 'oppose'
                : (progress?.myVote ?? null);

              const approvalWindow = computeApprovalWindow(transaction, group, currentHeight);
              const renderWindow = (height: number | null, state: ApprovalWindowState) => {
                if (height === null) {
                  return t('label.approval.unavailable');
                }

                if (state === 'expired') {
                  return t('label.approval.windowExpired', { height });
                }

                if (state === 'open') {
                  return t('label.approval.windowEligibleNow', { height });
                }

                const eta = formatBlockEta(height, currentHeight, t);

                return eta
                  ? t('label.approval.windowEta', { height, eta })
                  : t('label.approval.windowEligibleNow', { height });
              };

              return (
                <li className="approval-item" key={transaction.signature}>
                  <div className="approval-item__details">
                    <strong>{describeApprovalType(transaction, t)}</strong>
                    <div className="approval-item__creator">
                      <UserAvatar className="approval-item__avatar" name={name} src={avatarSrc} />
                      <span className="approval-item__creator-name" title={creatorAddress || undefined}>
                        {creatorLabel}
                      </span>
                    </div>
                    <dl className="approval-item__meta">
                      <div>
                        <dt>{t('label.approval.approvalsSoFar')}</dt>
                        <dd>
                          <span className="approval-item__progress">
                            {approvalsValue}
                            {progressReady && progress && progress.opposed > 0
                              ? ` (${t('label.approval.opposed')}: ${progress.opposed})`
                              : ''}
                          </span>
                          {progressReady && progress ? (
                            <span className="approval-item__progress-bar" aria-hidden="true">
                              <span style={{ width: `${Math.round(progressRatio * 100)}%` }} />
                            </span>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('label.approval.threshold')}</dt>
                        <dd>
                          {progressReady && progress
                            ? t('label.approval.thresholdValue', {
                                pct: group?.approvalThreshold ?? '-',
                                total: progress.totalAuthorities,
                              })
                            : t('label.approval.unavailable')}
                        </dd>
                      </div>
                      {effectiveVote ? (
                        <div>
                          <dt>{t('label.approval.yourVote')}</dt>
                          <dd className="approval-item__yourvote">
                            {effectiveVote === 'approve'
                              ? t('label.approval.yourVote.approve')
                              : t('label.approval.yourVote.oppose')}
                          </dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>{t('label.approval.minWindow')}</dt>
                        <dd>{renderWindow(approvalWindow.minEndsAtHeight, approvalWindow.minState)}</dd>
                      </div>
                      <div>
                        <dt>{t('label.approval.maxWindow')}</dt>
                        <dd>{renderWindow(approvalWindow.maxEndsAtHeight, approvalWindow.maxState)}</dd>
                      </div>
                      <div>
                        <dt>{t('label.approval.creator')}</dt>
                        <dd>{creatorAddress || '-'}</dd>
                      </div>
                      <div>
                        <dt>{t('label.approval.time')}</dt>
                        <dd>{transaction.timestamp ? formatTimestamp(transaction.timestamp) : '-'}</dd>
                      </div>
                      {typeof transaction.blockHeight === 'number' ? (
                        <div>
                          <dt>{t('label.approval.block')}</dt>
                          <dd>{transaction.blockHeight}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>{t('label.approval.signature')}</dt>
                        <dd className="approval-item__signature">
                          <span title={transaction.signature}>{shortenSignature(transaction.signature)}</span>
                          <button
                            className="button button--secondary"
                            onClick={() => void copySignature(transaction.signature)}
                            type="button"
                          >
                            {copiedSignature === transaction.signature ? t('button.copied') : t('button.copy')}
                          </button>
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="approval-item__actions">
                    <button
                      className="button"
                      disabled={!canVote || busy}
                      onClick={() => onApprove(transaction.signature)}
                      title={canVote ? t('button.approve') : voteUnavailableLabel}
                      type="button"
                    >
                      {busy
                        ? t('button.approving')
                        : effectiveVote === 'approve'
                          ? t('button.voteSubmitted')
                          : t('button.approve')}
                    </button>
                    <button
                      className="button button--secondary"
                      disabled={!canVote || busy}
                      onClick={() => onOppose(transaction.signature)}
                      title={canVote ? t('button.oppose') : voteUnavailableLabel}
                      type="button"
                    >
                      {busy
                        ? t('button.opposing')
                        : effectiveVote === 'oppose'
                          ? t('button.voteSubmitted')
                          : t('button.oppose')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
