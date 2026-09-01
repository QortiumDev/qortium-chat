// attachments-matrix A3: search anything already published to QDN — by ANY
// account — and insert a link to it into the composer. Nothing is republished
// and no bytes move; the message just carries the link, in the form the
// conversation's network previews best (buildQdnResourceShareLink).
import { useState, type SubmitEvent } from 'react';
import { formatAttachmentSize } from './attachments';
import { searchQdnResources, type QdnResourceSearchResult } from './coreApi';
import { type TranslateFunction } from './i18n';
import { buildQdnResourceShareLink } from './messageLinks';
import { useModalDialog } from './useModalDialog';
import { type ChatNetwork } from './types';

const SEARCH_PAGE_SIZE = 20;

// A small, chat-relevant slice of QDN's service list; '' searches every type.
const SERVICE_FILTERS = ['', 'IMAGE', 'VIDEO', 'AUDIO', 'ATTACHMENT', 'DOCUMENT', 'WEBSITE', 'APP'] as const;

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { exhausted: boolean; kind: 'ready'; results: QdnResourceSearchResult[] };

export function LinkResourceDialog({
  network,
  onCancel,
  onInsert,
  t,
}: {
  network: ChatNetwork;
  onCancel: () => void;
  onInsert: (link: string) => void;
  t: TranslateFunction;
}) {
  const cardRef = useModalDialog<HTMLElement>(onCancel);
  const [query, setQuery] = useState('');
  const [service, setService] = useState<string>('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });

  async function runSearch(offset: number, previous: QdnResourceSearchResult[]) {
    setState(offset === 0 ? { kind: 'loading' } : { exhausted: false, kind: 'ready', results: previous });

    try {
      const page = await searchQdnResources(network, {
        limit: SEARCH_PAGE_SIZE,
        offset,
        query: query.trim(),
        service: service || undefined,
      });

      setState({
        exhausted: page.length < SEARCH_PAGE_SIZE,
        kind: 'ready',
        results: [...previous, ...page],
      });
    } catch {
      setState({ kind: 'error' });
    }
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    if (query.trim()) {
      void runSearch(0, []);
    }
  }

  return (
    <div
      aria-label={t('dialog.linkResource.title')}
      aria-modal="true"
      className="account-dialog"
      onClick={onCancel}
      role="dialog"
    >
      <section
        className="account-dialog__card"
        onClick={(event) => event.stopPropagation()}
        ref={cardRef}
        tabIndex={-1}
      >
        <header className="account-dialog__header">
          <div className="account-dialog__heading">
            <h2>{t('dialog.linkResource.title')}</h2>
          </div>
          <button
            aria-label={t('button.close')}
            className="account-dialog__close"
            onClick={onCancel}
            title={t('button.close')}
            type="button"
          >
            X
          </button>
        </header>

        <p className="muted">{t('dialog.linkResource.intro')}</p>

        <form className="link-resource__search" onSubmit={handleSubmit}>
          <input
            aria-label={t('placeholder.linkResource.query')}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('placeholder.linkResource.query')}
            type="search"
            value={query}
          />
          <select
            aria-label={t('label.linkResource.service')}
            onChange={(event) => setService(event.target.value)}
            value={service}
          >
            {SERVICE_FILTERS.map((filter) => (
              <option key={filter || 'any'} value={filter}>
                {filter || t('label.linkResource.service.any')}
              </option>
            ))}
          </select>
          <button className="button" disabled={!query.trim() || state.kind === 'loading'} type="submit">
            {t('button.search')}
          </button>
        </form>

        {state.kind === 'loading' ? <p className="muted">{t('label.loading')}</p> : null}
        {state.kind === 'error' ? <p className="error">{t('status.linkResource.error')}</p> : null}
        {state.kind === 'ready' && state.results.length === 0 ? (
          <p className="muted">{t('status.linkResource.empty')}</p>
        ) : null}

        {state.kind === 'ready' && state.results.length > 0 ? (
          <ul className="link-resource__results">
            {state.results.map((result, index) => (
              <li className="link-resource__result" key={`${result.service}/${result.name}/${result.identifier ?? ''}/${index}`}>
                <div className="link-resource__result-text">
                  <span className="link-resource__result-name">{result.name}</span>
                  <span className="muted">
                    {result.service}
                    {result.identifier ? ` · ${result.identifier}` : ''}
                    {typeof result.size === 'number' && result.size > 0 ? ` · ${formatAttachmentSize(result.size)}` : ''}
                  </span>
                </div>
                <button
                  className="button button--secondary"
                  onClick={() =>
                    onInsert(
                      buildQdnResourceShareLink(network, {
                        identifier: result.identifier ?? undefined,
                        name: result.name,
                        service: result.service,
                      }),
                    )
                  }
                  type="button"
                >
                  {t('button.insertLink')}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {state.kind === 'ready' && !state.exhausted ? (
          <div className="account-dialog__actions">
            <button
              className="button button--secondary"
              onClick={() => void runSearch(state.results.length, state.results)}
              type="button"
            >
              {t('button.loadMore')}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
