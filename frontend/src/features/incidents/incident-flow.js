import { createIncidentApi } from './incident-api.js';

export const statuses = ['NEW', 'UNDER_INVESTIGATION', 'CONTAINED', 'RESOLVED', 'FALSE_POSITIVE', 'CLOSED'];
export const categories = ['PHISHING', 'MALWARE', 'CREDENTIAL_COMPROMISE', 'DATA_EXPOSURE', 'SUSPICIOUS_ACTIVITY', 'OTHER'];
export const sources = ['EMAIL_ANALYSIS', 'URL_ANALYSIS', 'FILE_ANALYSIS', 'INCIDENT_ASSISTANCE', 'MANUAL_REPORT'];
export const label = (value) => typeof value === 'string' ? value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase()) : 'Unavailable';
export const personName = (person) => person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || 'Security administrator' : 'Unassigned';
export function incidentError(error) {
  if (error?.status === 401) return 'Your session or administrator MFA verification has expired. Sign in again.';
  if (error?.status === 403) return 'Your account is not authorized to access these incidents. Return to your workspace or sign in again.';
  if (error?.status === 404) return 'This incident is unavailable or you do not have access to it.';
  if (error?.status === 429) return 'Too many requests. Wait a minute before trying again.';
  if (error?.status === 400) return 'The request was not accepted. Check the filters or form and refresh the incident.';
  return 'The service could not complete this request. Please try again.';
}
export function incidentQuery(filters = {}, page = 1) {
  const query = { page, pageSize: 20 };
  for (const key of ['reference', 'severity', 'status', 'type', 'assigneeId', 'source', 'sort']) if (filters[key]) query[key] = filters[key].trim();
  if (query.source && !sources.includes(query.source)) throw new Error('Select a supported source.');
  if (query.sort && !['created_desc', 'created_asc', 'updated_desc', 'severity_desc'].includes(query.sort)) throw new Error('Select a supported sort order.');
  if (query.reference && !/^INC-\d{4}-\d{6,10}$/.test(query.reference)) throw new Error('Enter a complete reference, such as INC-2026-000123.');
  for (const [key, suffix] of [['createdFrom', 'T00:00:00.000Z'], ['createdTo', 'T23:59:59.999Z']]) if (filters[key]) {
    const date = new Date(filters[key] + suffix);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters[key]) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== filters[key]) throw new Error('Enter valid dates.');
    query[key] = date.toISOString();
  }
  if (query.createdFrom && query.createdTo && query.createdFrom > query.createdTo) throw new Error('The start date must be on or before the end date.');
  return query;
}
// Employee notes omit visibility in the API; explicit private/redacted values fail closed.
export const visibleNotes = (items, admin) => items.filter((note) => !note.redactedAt &&
  (admin || note.visibility === undefined || note.visibility === 'REPORTER'));

export function createIncidentFlow({ admin = false, id = null, api = createIncidentApi(admin) } = {}) {
  const initial = () => ({ loading: true, busy: false, editing: false, livePending: false, liveRefreshing: false, error: '', message: '', data: null, list: null,
    history: null, notes: null, historyLoading: false, notesLoading: false, historyError: '', notesError: '',
    assignees: [], assigneePage: 0, moreAssignees: false, assigneeLoading: false, assigneeError: '', filters: {}, page: 1 });
  let state = initial(); let generation = 0; const controllers = new Set(); const listeners = new Set();
  const sequences = {};
  let liveRunning = false;
  const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };
  function ticket(key) {
    const controller = new AbortController(); controllers.add(controller);
    const gen = generation; const seq = sequences[key] = (sequences[key] ?? 0) + 1;
    return { signal: controller.signal, valid: () => gen === generation && sequences[key] === seq,
      done: () => controllers.delete(controller) };
  }
  function denied(error) {
    if (![401, 403, 404].includes(error?.status)) return false;
    generation++; controllers.forEach((c) => c.abort()); controllers.clear();
    set({ ...initial(), loading: false, error: incidentError(error) }); return true;
  }
  const flow = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => state,
    setEditing(editing) { set({ editing }); },
    async liveRefresh() {
      if (state.editing || state.busy || state.loading || state.historyLoading || state.notesLoading || liveRunning) { set({ livePending: true }); return; }
      liveRunning = true;
      try { await flow.load(state.filters, state.page, true); }
      finally { liveRunning = false; }
      if (state.livePending && !state.editing && !state.busy && !state.loading) void flow.liveRefresh();
    },
    clear() { generation++; controllers.forEach((c) => c.abort()); controllers.clear(); set(initial()); },
    async load(filters = state.filters, page = state.page, background = false) {
      if (state.busy) return;
      let query;
      try { query = incidentQuery(filters, page); } catch (error) { set({ error: error.message }); return; }
      const job = ticket('main');
      sequences.history = (sequences.history ?? 0) + 1;
      sequences.notes = (sequences.notes ?? 0) + 1;
      const historyPage = state.history?.page ?? 1; const notesPage = state.notes?.page ?? 1;
      set({ ...(background ? { liveRefreshing: true } : { loading: true, data: null, list: null, history: null, notes: null, editing: false }), livePending: false, error: '', filters, page });
      try {
        if (id) {
          const data = await api.detail(id, job.signal);
          if (!job.valid()) return;
          // A draft may start while the background request is in flight.
          if (background && state.editing) { set({ livePending: true, liveRefreshing: false }); return; }
          set({ data, loading: false });
          await Promise.all([flow.section('history', background ? historyPage : 1, background), flow.section('notes', background ? notesPage : 1, background)]);
        } else {
          const list = await api.list(query, job.signal);
          if (job.valid()) set({ list, loading: false });
        }
      } catch (error) { if (job.valid() && error.name !== 'AbortError' && !denied(error)) set({ loading: false, error: incidentError(error) }); }
      finally { job.done(); if (job.valid()) { set({ liveRefreshing: false }); if (!background && state.livePending && !state.editing) void flow.liveRefresh(); } }
    },
    async section(kind, page, background = false) {
      if (!state.data || !['history', 'notes'].includes(kind)) return;
      const job = ticket(kind);
      set({ ...(!background ? { [kind]: null } : {}), [`${kind}Loading`]: true, [`${kind}Error`]: '' });
      try {
        const result = await api[kind](id, page, job.signal);
        if (job.valid()) set({ [kind]: { ...result, items: kind === 'notes' ? visibleNotes(result.items, admin) : result.items }, [`${kind}Loading`]: false });
      } catch (error) { if (job.valid() && error.name !== 'AbortError' && !denied(error)) set({ [`${kind}Loading`]: false, [`${kind}Error`]: incidentError(error) }); }
      finally { job.done(); if (job.valid() && state.livePending && !state.editing && !state.busy && !state.loading && !state.historyLoading && !state.notesLoading && !liveRunning) void flow.liveRefresh(); }
    },
    async assignees(more = false) {
      if (!admin || state.assigneeLoading) return;
      const page = more ? state.assigneePage + 1 : 1; const job = ticket('assignees');
      set({ assigneeLoading: true, assigneeError: '' });
      try {
        const result = await api.assignees(page, job.signal);
        if (job.valid()) set({ assignees: [...(more ? state.assignees : []), ...result.items], assigneePage: page, moreAssignees: result.hasMore, assigneeLoading: false });
      } catch (error) { if (job.valid() && error.name !== 'AbortError' && !denied(error)) set({ assigneeLoading: false, assigneeError: incidentError(error) }); }
      finally { job.done(); }
    },
    async mutate(operation, input) {
      if (!admin || !state.data || state.busy || state.loading) return false;
      if (operation === 'status' && !state.data.allowedTransitions?.includes(input.status)) return false;
      if (operation === 'notes' && (!input.body?.trim() || input.body.length > 4000 || input.acknowledged !== true ||
          !['SECURITY_TEAM', 'REPORTER'].includes(input.visibility) || input.noticeVersion !== state.data.noteNotice?.version)) return false;
      const job = ticket('mutation'); const version = state.data.incident.updatedAt;
      set({ busy: true, error: '', message: '' });
      let saved = false;
      try {
        await api.mutate(id, operation, { ...input, expectedUpdatedAt: version }, job.signal);
        if (!job.valid()) return false;
        saved = true; set({ busy: false, message: 'Change saved. Retrieving the latest incident state.' });
        await flow.load();
      } catch (error) {
        if (!job.valid() || error.name === 'AbortError') return false;
        if (denied(error)) return false;
        set({ busy: false });
        if (error.status === 409) {
          set({ message: 'Another administrator changed this incident. Your change was not applied. Review the latest state before submitting again.' });
          await flow.load();
        } else {
          // Never automatically replay a write: a transport failure may occur after commit.
          set({ data: null, history: null, notes: null, error: `${incidentError(error)} Refresh before submitting again; the change may already have been saved.` });
        }
      } finally { job.done(); }
      return saved;
    },
  };
  return flow;
}
