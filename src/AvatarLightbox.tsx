import { type TranslateFunction } from './i18n';
import { useModalDialog } from './useModalDialog';

export type AvatarLightboxImage = {
  alt?: string;
  name: string | null;
  src: string;
  /**
   * Host-backed actions for the image behind this preview: `open` shows it in
   * Home's shared viewer (zoom, save), `save` runs Home's native save dialog.
   * Absent for images Home cannot address (an avatar, an inline data: image).
   */
  actions?: {
    onOpen?: () => void;
    onSave?: () => void;
  };
};

export function AvatarLightbox({
  image,
  onClose,
  t,
}: {
  image: AvatarLightboxImage;
  onClose: () => void;
  t: TranslateFunction;
}) {
  const containerRef = useModalDialog<HTMLDivElement>(onClose);

  return (
    <div
      aria-label={image.alt ?? t('aria.avatarLightbox')}
      aria-modal="true"
      className="avatar-lightbox"
      onClick={onClose}
      ref={containerRef}
      role="dialog"
      tabIndex={-1}
    >
      <button
        aria-label={t('button.close')}
        className="avatar-lightbox__close"
        onClick={onClose}
        title={t('button.close')}
        type="button"
      >
        X
      </button>
      <figure className="avatar-lightbox__stage" onClick={(event) => event.stopPropagation()}>
        <img
          alt={image.alt ?? (image.name ? t('label.avatarImageForName', { name: image.name }) : t('label.avatarImage'))}
          src={image.src}
        />
        {image.name ? <figcaption>{image.name}</figcaption> : null}
        {image.actions?.onOpen || image.actions?.onSave ? (
          <div className="avatar-lightbox__actions">
            {image.actions.onOpen ? (
              <button
                onClick={() => {
                  image.actions?.onOpen?.();
                  onClose();
                }}
                type="button"
              >
                {t('button.open')}
              </button>
            ) : null}
            {image.actions.onSave ? (
              <button onClick={() => image.actions?.onSave?.()} type="button">
                {t('button.save')}
              </button>
            ) : null}
          </div>
        ) : null}
      </figure>
    </div>
  );
}
