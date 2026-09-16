import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvatarLightbox } from './AvatarLightbox';
import { createTranslator } from './i18n';

const t = createTranslator('en');

describe('AvatarLightbox', () => {
  it('shows Open and Save only for images Home can address (2.0.28)', () => {
    const withActions = renderToStaticMarkup(
      <AvatarLightbox
        image={{ actions: { onOpen: () => undefined, onSave: () => undefined }, name: 'photo.webp', src: 'blob:x' }}
        onClose={() => undefined}
        t={t}
      />,
    );
    expect(withActions).toContain('avatar-lightbox__actions');
    expect(withActions).toContain('>Open</button>');
    expect(withActions).toContain('>Save</button>');

    const saveOnly = renderToStaticMarkup(
      <AvatarLightbox image={{ actions: { onSave: () => undefined }, name: 'photo.webp', src: 'blob:x' }} onClose={() => undefined} t={t} />,
    );
    expect(saveOnly).not.toContain('>Open</button>');
    expect(saveOnly).toContain('>Save</button>');

    // An avatar or an inline data: image carries no host actions: no row at all.
    const plain = renderToStaticMarkup(<AvatarLightbox image={{ name: 'Alice', src: 'blob:x' }} onClose={() => undefined} t={t} />);
    expect(plain).not.toContain('avatar-lightbox__actions');
    expect(plain).toContain('Alice');
  });
});
