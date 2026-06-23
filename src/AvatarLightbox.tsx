import { type TranslateFunction } from './i18n';
import { useModalDialog } from './useModalDialog';

export type AvatarLightboxImage = {
  name: string | null;
  src: string;
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
      aria-label={t('aria.avatarLightbox')}
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
        <img alt={image.name ? t('label.avatarImageForName', { name: image.name }) : t('label.avatarImage')} src={image.src} />
        {image.name ? <figcaption>{image.name}</figcaption> : null}
      </figure>
    </div>
  );
}
