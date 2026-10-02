import { useEffect, useRef, useState } from 'react';
import type { AvatarLightboxImage } from './AvatarLightbox';
import { formatAttachmentSize } from './attachments';
import { getChatAttachmentStreamUrl, openChatAttachmentViewer, saveChatAttachment } from './coreApi';
import type { TranslateFunction } from './i18n';
import { attachmentForViewer, readPrivateImagePreview } from './privateAttachments';
import type { ChatMessage, ChatNetwork, PrivateAttachmentDescriptor, QdnAction } from './types';

export function MessagePrivateAttachment({ descriptor, message, selfAddress, network, actions, onOpenImage, t }: {
  descriptor: PrivateAttachmentDescriptor;
  message: ChatMessage;
  selfAddress: string | null;
  network: ChatNetwork;
  actions: QdnAction[];
  onOpenImage: (image: AvatarLightboxImage) => void;
  t: TranslateFunction;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const blobUrl = useRef<string | null>(null);
  const running = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, []);
  const can = (action: string) => actions.some((candidate) => candidate.toUpperCase() === action);

  async function run(operation: 'preview' | 'open' | 'save') {
    if (running.current) return;
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    running.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const access = attachmentForViewer(descriptor, message, selfAddress, network);
      if (operation === 'open') {
        await openChatAttachmentViewer(network, access, actions);
      } else if (operation === 'save') {
        const result = await saveChatAttachment(network, access, actions);
        if (!signal.aborted) setNotice(t(result.canceled ? 'status.attachment.saveCanceled' : 'status.attachment.saved'));
      } else {
        const stream = await getChatAttachmentStreamUrl(network, access, actions);
        if (signal.aborted) return;
        const blob = await readPrivateImagePreview(stream, signal);
        if (signal.aborted) return;
        if (blob) {
          if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
          blobUrl.current = URL.createObjectURL(blob);
          setPreview(blobUrl.current);
        } else {
          setNotice(t('status.attachment.noImagePreview'));
        }
      }
    } catch (cause) {
      if (!signal.aborted) {
        const detail = cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string'
          ? cause.message : t('status.attachment.error');
        setError(detail);
      }
    } finally {
      running.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  return <div className="message__private-attachment">
    {preview ? <figure className="message__image-preview">
      <button className="message__image-preview-button" type="button"
        aria-label={t('button.viewImagePreview')}
        onClick={() => onOpenImage({ src: preview, alt: t('label.attachment.image'), name: t('label.attachment.image'), actions: {
          closeOnSave: true,
          onOpen: can('OPEN_CHAT_ATTACHMENT_VIEWER') ? () => void run('open') : undefined,
          onSave: can('SAVE_CHAT_ATTACHMENT') ? () => void run('save') : undefined,
        } })}>
        <img src={preview} alt={t('label.attachment.image')} onError={() => {
          setPreview(null);
          if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
          blobUrl.current = null;
          setError(t('status.loadingError.imagePreview'));
        }} />
      </button>
    </figure> : null}
    <div className="message__attachment-chip">
      <span aria-hidden="true">📎</span>
      <span className="message__attachment-chip-label">{t('label.attachment.file')}</span>
      <span className="message__attachment-chip-size">{formatAttachmentSize(descriptor.ciphertext.size)}</span>
      {!preview && can('GET_CHAT_ATTACHMENT_STREAM_URL') ?
        <button disabled={busy} onClick={() => void run('preview')} type="button">{t('button.previewAttachment')}</button> : null}
      {can('OPEN_CHAT_ATTACHMENT_VIEWER') ?
        <button disabled={busy} onClick={() => void run('open')} type="button">{t('button.open')}</button> : null}
      {can('SAVE_CHAT_ATTACHMENT') ?
        <button disabled={busy} onClick={() => void run('save')} type="button">{t('button.save')}</button> : null}
    </div>
    {busy ? <p role="status">{t('button.working')}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </div>;
}
