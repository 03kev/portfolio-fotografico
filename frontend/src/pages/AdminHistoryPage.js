import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Clock3, Filter, Loader2 } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import styled from 'styled-components';
import useSeo from '../seo/useSeo';
import { auditService } from '../utils/api';
import { viewportQueries } from '../styles/responsive';
import Section from '../ui/Section';

const PAGE_SIZE = 40;

const OPERATION_LABELS = Object.freeze({
  'photo.create': 'Foto creata',
  'photo.update': 'Metadati foto modificati',
  'photo.metadata-update': 'Metadati foto modificati',
  'photo.delete': 'Foto eliminata',
  'photo.media.crop': 'Crop foto aggiornato',
  'photo.media.regenerate': 'Derivate foto rigenerate',
  'photo.media.replace-source': 'Sorgente foto sostituita',
  'photo.media.path-migration': 'Path media migrati',
  'series.create': 'Serie creata',
  'series.update': 'Serie modificata',
  'series.delete': 'Serie eliminata',
  'series.add-photo': 'Foto aggiunta alla serie',
  'series.remove-photo': 'Foto rimossa dalla serie',
  'series.reorder-photos': 'Foto della serie riordinate',
  'series.photo-delete-cleanup': 'Riferimento eliminato automaticamente'
});

const FIELD_LABELS = Object.freeze({
  title: 'Titolo',
  description: 'Descrizione',
  date: 'Data dello scatto',
  location: 'Luogo',
  lat: 'Latitudine',
  lng: 'Longitudine',
  camera: 'Fotocamera',
  lens: 'Obiettivo',
  resolution: 'Risoluzione',
  settings: 'Impostazioni',
  tags: 'Tag',
  sourcePath: 'Sorgente',
  sourceContentType: 'Formato sorgente',
  mobileImage: 'Variante mobile',
  derivativesVersion: 'Versione derivate',
  mediaGeneration: 'Generazione media',
  slug: 'Slug',
  coverImage: 'Copertina',
  photos: 'Foto',
  content: 'Layout e contenuto',
  published: 'Pubblicazione',
  updatedAt: 'Ultimo aggiornamento'
});

const HistoryShell = styled.div`
  display: grid;
  gap: 22px;
  max-width: 1040px;
  margin: 0 auto;
`;

const Panel = styled.div`
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-2xl);
  background: rgba(255, 255, 255, 0.025);
`;

const Filters = styled.form`
  display: grid;
  grid-template-columns: minmax(150px, 0.7fr) minmax(150px, 0.7fr) minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: end;

  @media ${viewportQueries.down('content')} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media ${viewportQueries.down('small')} {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.label`
  display: grid;
  gap: 7px;
  min-width: 0;
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const fieldControlStyles = `
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  background: rgba(8, 9, 12, 0.88);
  color: var(--color-text);
  font: inherit;
  text-transform: none;
  letter-spacing: normal;

  &:focus {
    outline: 2px solid rgba(214, 179, 106, 0.3);
    outline-offset: 1px;
    border-color: rgba(214, 179, 106, 0.55);
  }
`;

const Input = styled.input`
  ${fieldControlStyles}
`;

const Select = styled.select`
  ${fieldControlStyles}
`;

const Button = styled.button`
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid rgba(214, 179, 106, 0.42);
  border-radius: var(--border-radius-lg);
  background: rgba(214, 179, 106, 0.12);
  color: var(--color-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: var(--font-weight-semibold);

  &:hover:not(:disabled) {
    background: rgba(214, 179, 106, 0.2);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.65;
  }
`;

const EventList = styled.ol`
  display: grid;
  gap: 12px;
  list-style: none;
`;

const EventCard = styled.li`
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-xl);
  background: rgba(255, 255, 255, 0.025);
  overflow: hidden;
`;

const EventSummary = styled.summary`
  padding: 17px 18px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  cursor: pointer;

  &::-webkit-details-marker {
    display: none;
  }

  @media ${viewportQueries.down('small')} {
    grid-template-columns: 1fr;
    gap: 10px;
  }
`;

const EventHeading = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 0;
`;

const EntityBadge = styled.span`
  padding: 5px 9px;
  border-radius: var(--border-radius-full);
  border: 1px solid rgba(214, 179, 106, 0.3);
  background: rgba(214, 179, 106, 0.09);
  color: var(--color-accent);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
`;

const EventTitle = styled.strong`
  display: block;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const EventSubtitle = styled.span`
  display: block;
  margin-top: 2px;
  color: var(--color-faint);
  font-size: var(--font-size-xs);
`;

const EventMeta = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  white-space: nowrap;

  svg:last-child {
    transition: transform var(--transition-normal);
  }

  details[open] & svg:last-child {
    transform: rotate(180deg);
  }

  @media ${viewportQueries.down('small')} {
    justify-content: space-between;
  }
`;

const EventBody = styled.div`
  display: grid;
  gap: 16px;
  padding: 0 18px 18px;
  border-top: 1px solid var(--color-border);
`;

const VersionLine = styled.p`
  margin: 16px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-sm);

  strong {
    color: var(--color-text);
  }
`;

const ChangeGrid = styled.div`
  display: grid;
  gap: 9px;
`;

const ChangeRow = styled.div`
  display: grid;
  grid-template-columns: minmax(120px, 0.28fr) minmax(0, 1fr);
  gap: 14px;
  padding: 11px 12px;
  border-radius: var(--border-radius-lg);
  background: rgba(255, 255, 255, 0.025);

  @media ${viewportQueries.down('small')} {
    grid-template-columns: 1fr;
    gap: 5px;
  }
`;

const ChangeField = styled.strong`
  color: var(--color-text);
  font-size: var(--font-size-sm);
`;

const ChangeValue = styled.div`
  min-width: 0;
  color: var(--color-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: var(--font-size-xs);
  line-height: 1.55;
  overflow-wrap: anywhere;
`;

const Snapshot = styled.details`
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  overflow: hidden;

  summary {
    padding: 10px 12px;
    cursor: pointer;
    color: var(--color-muted);
    font-size: var(--font-size-sm);
  }

  pre {
    max-height: 360px;
    margin: 0;
    padding: 14px;
    overflow: auto;
    border-top: 1px solid var(--color-border);
    background: rgba(0, 0, 0, 0.25);
    color: var(--color-muted);
    font-size: var(--font-size-xs);
    line-height: 1.5;
  }
`;

const StateMessage = styled(Panel)`
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 34px 20px;
  color: var(--color-muted);
  text-align: center;

  .spin {
    animation: admin-history-spin 0.9s linear infinite;
  }

  @keyframes admin-history-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadMore = styled(Button)`
  justify-self: center;
`;

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sì' : 'No';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function formatVersion(version) {
  return Number.isSafeInteger(Number(version)) ? `v${version}` : '—';
}

function eventDisplayName(event) {
  const snapshot = event.afterState || event.beforeState || {};
  return snapshot.title || `${event.entityType} #${event.entityId}`;
}

export default function AdminHistoryPage() {
  const { isAdmin } = useOutletContext();
  const [filters, setFilters] = useState({
    entityType: '',
    entityId: '',
    operation: ''
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [events, setEvents] = useState([]);
  const [nextBeforeId, setNextBeforeId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useSeo({
    title: 'Storico modifiche',
    description: 'Storico privato delle modifiche amministrative.',
    noindex: true
  });

  const canLoad = Boolean(isAdmin);

  const loadEvents = useCallback(async ({ append = false, beforeId = null } = {}) => {
    if (!canLoad) return;
    append ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const response = await auditService.getEvents({
        ...appliedFilters,
        limit: PAGE_SIZE,
        beforeId
      });
      const data = response?.data?.data || [];
      setEvents((current) => (append ? [...current, ...data] : data));
      setNextBeforeId(
        data.length === PAGE_SIZE
          ? response?.data?.pagination?.nextBeforeId || null
          : null
      );
    } catch (requestError) {
      setError(requestError?.message || 'Impossibile caricare lo storico.');
      if (!append) setEvents([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [appliedFilters, canLoad]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const operationOptions = useMemo(
    () => Object.entries(OPERATION_LABELS).sort(([, a], [, b]) => a.localeCompare(b, 'it')),
    []
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    setAppliedFilters({
      entityType: filters.entityType,
      entityId: filters.entityId.trim(),
      operation: filters.operation
    });
  };

  return (
    <Section
      title="Storico modifiche"
      subtitle="Cronologia immutabile di foto, serie e configurazioni editoriali."
      headingLevel="h1"
    >
      <HistoryShell>
        <Panel>
          <Filters onSubmit={handleSubmit}>
            <Field>
              Tipo
              <Select
                value={filters.entityType}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  entityType: event.target.value
                }))}
              >
                <option value="">Foto e serie</option>
                <option value="photo">Foto</option>
                <option value="series">Serie</option>
              </Select>
            </Field>
            <Field>
              ID
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Es. 1772055876156"
                value={filters.entityId}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  entityId: event.target.value.replace(/\D/g, '')
                }))}
              />
            </Field>
            <Field>
              Operazione
              <Select
                value={filters.operation}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  operation: event.target.value
                }))}
              >
                <option value="">Tutte le operazioni</option>
                {operationOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={loading}>
              <Filter size={16} />
              Filtra
            </Button>
          </Filters>
        </Panel>

        {loading && (
          <StateMessage>
            <Loader2 size={24} className="spin" />
            <p>Caricamento dello storico…</p>
          </StateMessage>
        )}

        {!loading && error && (
          <StateMessage>
            <AlertCircle size={24} />
            <p>{error}</p>
            <Button type="button" onClick={() => loadEvents()}>Riprova</Button>
          </StateMessage>
        )}

        {!loading && !error && events.length === 0 && (
          <StateMessage>
            <Clock3 size={24} />
            <p>Nessuna modifica corrisponde ai filtri selezionati.</p>
          </StateMessage>
        )}

        {!loading && !error && events.length > 0 && (
          <EventList>
            {events.map((event) => {
              const changes = Object.entries(event.changes || {});
              return (
                <EventCard key={event.id}>
                  <details>
                    <EventSummary>
                      <EventHeading>
                        <EntityBadge>{event.entityType === 'photo' ? 'Foto' : 'Serie'}</EntityBadge>
                        <span>
                          <EventTitle>{OPERATION_LABELS[event.operation] || event.operation}</EventTitle>
                          <EventSubtitle>{eventDisplayName(event)} · ID {event.entityId}</EventSubtitle>
                        </span>
                      </EventHeading>
                      <EventMeta>
                        <Clock3 size={14} />
                        <time dateTime={event.occurredAt}>
                          {new Intl.DateTimeFormat('it-IT', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          }).format(new Date(event.occurredAt))}
                        </time>
                        <ChevronDown size={16} />
                      </EventMeta>
                    </EventSummary>
                    <EventBody>
                      <VersionLine>
                        Versione: <strong>{formatVersion(event.fromVersion)}</strong>
                        {' → '}
                        <strong>{formatVersion(event.toVersion)}</strong>
                      </VersionLine>
                      {changes.length > 0 ? (
                        <ChangeGrid>
                          {changes.map(([field, change]) => (
                            <ChangeRow key={field}>
                              <ChangeField>{FIELD_LABELS[field] || field}</ChangeField>
                              <ChangeValue>
                                {formatValue(change.before)}
                                {' → '}
                                {formatValue(change.after)}
                              </ChangeValue>
                            </ChangeRow>
                          ))}
                        </ChangeGrid>
                      ) : (
                        <ChangeValue>Nessuna differenza di campo disponibile.</ChangeValue>
                      )}
                      <Snapshot>
                        <summary>Snapshot completi prima/dopo</summary>
                        <pre>{JSON.stringify({
                          before: event.beforeState,
                          after: event.afterState,
                          metadata: event.metadata
                        }, null, 2)}</pre>
                      </Snapshot>
                    </EventBody>
                  </details>
                </EventCard>
              );
            })}
          </EventList>
        )}

        {nextBeforeId && !loading && !error && (
          <LoadMore
            type="button"
            disabled={loadingMore}
            onClick={() => loadEvents({ append: true, beforeId: nextBeforeId })}
          >
            {loadingMore && <Loader2 size={16} />}
            {loadingMore ? 'Caricamento…' : 'Carica modifiche precedenti'}
          </LoadMore>
        )}
      </HistoryShell>
    </Section>
  );
}
