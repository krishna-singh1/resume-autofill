import { extractDocxText } from '../core/docx.js';
import { parseResumeText } from '../core/parser.js';
import { extractPdfText } from '../core/pdf.js';
import { emptyEducationEntry, emptyProjectEntry, emptyWorkEntry, normalizeProfile } from '../core/schema.js';
import {
  clearAll,
  clearFile,
  exportAll,
  getFile,
  getLearnedAnswers,
  getProfile,
  getSettings,
  importAll,
  saveFile,
  saveLearnedAnswers,
  saveProfile,
  saveSettings,
} from '../core/storage.js';
import { squish } from '../core/text.js';

/** Files above this are almost certainly not a resume, and would bloat storage. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const AUTOSAVE_DELAY = 700;

const LIST_FIELDS = {
  work: {
    title: (entry) => [entry.title, entry.company].filter(Boolean).join(' @ ') || 'New role',
    empty: emptyWorkEntry,
    fields: [
      { key: 'company', label: 'Company' },
      { key: 'title', label: 'Title' },
      { key: 'location', label: 'Location' },
      { key: 'startDate', label: 'Start (YYYY-MM)' },
      { key: 'endDate', label: 'End (YYYY-MM)' },
      { key: 'current', label: 'Current role', type: 'checkbox' },
      { key: 'highlights', label: 'Highlights — one per line', type: 'lines', wide: true },
    ],
  },
  education: {
    title: (entry) => [entry.degree, entry.school].filter(Boolean).join(' — ') || 'New school',
    empty: emptyEducationEntry,
    fields: [
      { key: 'school', label: 'School' },
      { key: 'degree', label: 'Degree' },
      { key: 'field', label: 'Field of study' },
      { key: 'location', label: 'Location' },
      { key: 'startDate', label: 'Start (YYYY-MM)' },
      { key: 'endDate', label: 'End (YYYY-MM)' },
      { key: 'gpa', label: 'GPA' },
    ],
  },
  projects: {
    title: (entry) => entry.name || 'New project',
    empty: emptyProjectEntry,
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'url', label: 'URL' },
      { key: 'description', label: 'One-line description', wide: true },
      { key: 'highlights', label: 'Highlights — one per line', type: 'lines', wide: true },
    ],
  },
};

let profile = null;
let settings = null;
let parsed = null;
let saveTimer = null;

const saveState = document.getElementById('save-state');

// ------------------------------------------------------------------ helpers

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

function readPath(root, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), root);
}

function writePath(root, path, value) {
  const keys = path.split('.');
  let node = root;
  for (const key of keys.slice(0, -1)) node = node[key] ?? (node[key] = {});
  node[keys[keys.length - 1]] = value;
}

function readFileAs(file, method) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader[method](file);
  });
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el('a', { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ------------------------------------------------------------------- saving

function markDirty() {
  saveState.textContent = 'Unsaved changes…';
  saveState.style.color = 'var(--warn)';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, AUTOSAVE_DELAY);
}

async function save() {
  clearTimeout(saveTimer);
  await saveProfile(profile);
  saveState.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  saveState.style.color = 'var(--good)';
}

// ------------------------------------------------------------ scalar fields

function bindScalars() {
  for (const select of document.querySelectorAll('select[data-choices="yesno"]')) {
    select.replaceChildren(...['', 'Yes', 'No'].map((value) => el('option', { value, textContent: value || '—' })));
  }
  for (const input of document.querySelectorAll('[data-path]')) {
    input.value = readPath(profile, input.dataset.path) ?? '';
    input.addEventListener('input', () => {
      writePath(profile, input.dataset.path, input.value);
      markDirty();
    });
  }

  const skills = document.getElementById('skills');
  skills.value = profile.skills.join(', ');
  skills.addEventListener('input', () => {
    profile.skills = skills.value.split(/[,\n]/).map(squish).filter(Boolean);
    markDirty();
  });
}

function refreshScalars() {
  for (const input of document.querySelectorAll('[data-path]')) {
    input.value = readPath(profile, input.dataset.path) ?? '';
  }
  document.getElementById('skills').value = profile.skills.join(', ');
}

// -------------------------------------------------------------- list fields

function fieldControl(entry, field, onChange) {
  if (field.type === 'checkbox') {
    const box = el('input', { type: 'checkbox', checked: Boolean(entry[field.key]) });
    box.addEventListener('change', () => onChange(box.checked));
    return el('label', { className: 'check' }, [box, el('span', { textContent: field.label })]);
  }
  if (field.type === 'lines') {
    const area = el('textarea', { rows: 4, value: (entry[field.key] || []).join('\n') });
    area.addEventListener('input', () => onChange(area.value.split('\n').map(squish).filter(Boolean)));
    return el('label', { className: 'field' }, [el('span', { textContent: field.label }), area]);
  }
  const input = el('input', { type: 'text', value: entry[field.key] ?? '' });
  input.addEventListener('input', () => onChange(input.value));
  return el('label', { className: 'field' }, [el('span', { textContent: field.label }), input]);
}

function renderList(name) {
  const config = LIST_FIELDS[name];
  const container = document.querySelector(`[data-list="${name}"]`);
  container.replaceChildren();

  profile[name].forEach((entry, index) => {
    const heading = el('strong', { textContent: config.title(entry) });
    const controls = el('div', { className: 'row' });

    const move = (delta) => {
      const target = index + delta;
      if (target < 0 || target >= profile[name].length) return;
      [profile[name][index], profile[name][target]] = [profile[name][target], profile[name][index]];
      renderList(name);
      markDirty();
    };

    const up = el('button', { textContent: '↑', title: 'Move up', disabled: index === 0 });
    up.addEventListener('click', () => move(-1));
    const down = el('button', { textContent: '↓', title: 'Move down', disabled: index === profile[name].length - 1 });
    down.addEventListener('click', () => move(1));
    const remove = el('button', { textContent: 'Remove', className: 'danger' });
    remove.addEventListener('click', () => {
      profile[name].splice(index, 1);
      renderList(name);
      markDirty();
    });
    controls.append(up, down, remove);

    const grid = el('div', { className: 'grid-3' });
    const wide = el('div');
    for (const field of config.fields) {
      const control = fieldControl(entry, field, (value) => {
        entry[field.key] = value;
        heading.textContent = config.title(entry);
        markDirty();
      });
      (field.wide ? wide : grid).append(control);
    }

    container.append(
      el('div', { className: 'entry' }, [el('div', { className: 'entry-head' }, [heading, controls]), grid, wide]),
    );
  });
}

function bindLists() {
  for (const name of Object.keys(LIST_FIELDS)) {
    renderList(name);
    document.querySelector(`[data-add="${name}"]`).addEventListener('click', () => {
      profile[name].push(LIST_FIELDS[name].empty());
      renderList(name);
      markDirty();
    });
  }
}

// ------------------------------------------------------------- resume import

async function textFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPdfText(await readFileAs(file, 'readAsArrayBuffer'));
  if (name.endsWith('.docx')) return extractDocxText(await readFileAs(file, 'readAsArrayBuffer'));
  if (name.endsWith('.doc')) throw new Error('Legacy .doc files are not supported — save it as .docx or PDF first.');
  return readFileAs(file, 'readAsText');
}

async function fileRecord(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`That file is ${formatBytes(file.size)}; the limit is 8 MB.`);
  return { name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl: await readFileAs(file, 'readAsDataURL') };
}

async function handleResumeUpload(file) {
  const status = document.getElementById('parse-status');
  const actions = document.getElementById('parse-actions');
  status.textContent = `Reading ${file.name}…`;
  actions.hidden = true;

  try {
    const text = await textFromFile(file);
    const result = parseResumeText(text);
    parsed = { ...result, file };

    const found = [
      result.profile.basics.firstName && 'name',
      result.profile.basics.email && 'email',
      result.profile.basics.phone && 'phone',
      result.profile.work.length && `${result.profile.work.length} role${result.profile.work.length === 1 ? '' : 's'}`,
      result.profile.education.length && `${result.profile.education.length} school${result.profile.education.length === 1 ? '' : 's'}`,
      result.profile.skills.length && `${result.profile.skills.length} skills`,
    ].filter(Boolean);

    status.replaceChildren(
      el('div', { textContent: found.length ? `Found: ${found.join(', ')}.` : 'Found very little in this file.' }),
      ...result.warnings.map((warning) => el('div', { textContent: `• ${warning}`, style: 'color: var(--warn)' })),
    );
    actions.hidden = false;
  } catch (error) {
    parsed = null;
    status.textContent = `Could not read that file: ${error.message}`;
  }
}

/** Fill blanks from the parsed resume; never overwrite what the user already typed. */
function applyParsed() {
  if (!parsed) return;
  const incoming = parsed.profile;

  for (const section of ['basics', 'links']) {
    for (const [key, value] of Object.entries(incoming[section] || {})) {
      if (value && !profile[section][key]) profile[section][key] = value;
    }
  }
  for (const name of ['work', 'education', 'projects']) {
    if (incoming[name]?.length) profile[name] = profile[name].length ? [...profile[name], ...incoming[name]] : incoming[name];
  }
  profile.skills = [...new Set([...profile.skills, ...incoming.skills])];
  profile = normalizeProfile(profile);

  refreshScalars();
  for (const name of Object.keys(LIST_FIELDS)) renderList(name);
  markDirty();

  const { file } = parsed;
  if (/\.(pdf|docx)$/i.test(file.name)) {
    getFile('resume').then(async (existing) => {
      if (existing) return;
      await saveFile('resume', await fileRecord(file));
      renderFileSlot('resume');
    });
  }

  document.getElementById('parse-status').textContent = 'Applied. Review the fields below and adjust anything the parser got wrong.';
  document.getElementById('parse-actions').hidden = true;
  parsed = null;
}

function bindImport() {
  const dropzone = document.getElementById('dropzone');
  const input = document.getElementById('resume-file');

  document.getElementById('pick-file').addEventListener('click', () => input.click());
  input.addEventListener('change', () => input.files[0] && handleResumeUpload(input.files[0]));

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
    const file = event.dataTransfer.files[0];
    if (file) handleResumeUpload(file);
  });

  document.getElementById('apply-parsed').addEventListener('click', applyParsed);
  document.getElementById('discard-parsed').addEventListener('click', () => {
    parsed = null;
    document.getElementById('parse-status').textContent = '';
    document.getElementById('parse-actions').hidden = true;
  });
}

// --------------------------------------------------------------- file slots

const FILE_SLOTS = {
  resume: { slot: 'resume-slot', set: 'set-resume', remove: 'remove-resume', input: 'resume-upload' },
  coverLetter: { slot: 'cover-slot', set: 'set-cover', remove: 'remove-cover', input: 'cover-upload' },
};

async function renderFileSlot(kind) {
  const record = await getFile(kind);
  const slot = document.getElementById(FILE_SLOTS[kind].slot);
  slot.textContent = record ? `${record.name} · ${formatBytes(record.size)}` : 'No file saved.';
  document.getElementById(FILE_SLOTS[kind].remove).hidden = !record;
}

function bindFileSlots() {
  for (const [kind, ids] of Object.entries(FILE_SLOTS)) {
    const input = document.getElementById(ids.input);
    document.getElementById(ids.set).addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        await saveFile(kind, await fileRecord(file));
      } catch (error) {
        document.getElementById(ids.slot).textContent = error.message;
        return;
      }
      renderFileSlot(kind);
    });
    document.getElementById(ids.remove).addEventListener('click', async () => {
      await clearFile(kind);
      renderFileSlot(kind);
    });
    renderFileSlot(kind);
  }
}

// ------------------------------------------------------------------ settings

function bindSettings() {
  for (const box of document.querySelectorAll('[data-setting]')) {
    box.checked = Boolean(settings[box.dataset.setting]);
    box.addEventListener('change', async () => {
      settings[box.dataset.setting] = box.checked;
      await saveSettings({ [box.dataset.setting]: box.checked });
    });
  }
}

// ----------------------------------------------------------- learned answers

async function renderLearned() {
  const answers = await getLearnedAnswers();
  const list = document.getElementById('learned-list');
  list.replaceChildren();
  document.getElementById('learned-empty').hidden = answers.length > 0;
  document.getElementById('learned-clear').hidden = answers.length === 0;

  const persist = async (next) => {
    await saveLearnedAnswers(next);
    renderLearned();
  };

  for (const answer of answers) {
    const value = el('input', { type: 'text', value: answer.value });
    value.addEventListener('change', () => {
      persist(answers.map((item) => (item.id === answer.id ? { ...item, value: value.value } : item)));
    });

    const scope = el('select');
    scope.replaceChildren(
      el('option', { value: 'global', textContent: 'Any site' }),
      el('option', { value: 'site', textContent: 'Only where captured' }),
    );
    scope.value = answer.scope;
    scope.addEventListener('change', () => {
      persist(answers.map((item) => (item.id === answer.id ? { ...item, scope: scope.value } : item)));
    });

    const remove = el('button', { textContent: 'Forget', className: 'danger' });
    remove.addEventListener('click', () => persist(answers.filter((item) => item.id !== answer.id)));

    const meta = `${answer.useCount || 0} use${answer.useCount === 1 ? '' : 's'} · ${(answer.sites || []).join(', ') || 'no sites yet'}`;
    list.append(
      el('div', { className: 'learned-row' }, [
        el('div', {}, [
          el('div', { className: 'question', textContent: answer.display || answer.question, title: answer.question }),
          el('div', { className: 'meta', textContent: meta }),
        ]),
        value,
        scope,
        remove,
      ]),
    );
  }
}

function bindLearned() {
  document.getElementById('learned-clear').addEventListener('click', async () => {
    if (!confirm('Forget every remembered answer? This cannot be undone.')) return;
    await saveLearnedAnswers([]);
    renderLearned();
  });
  renderLearned();
}

// ------------------------------------------------------------------ toolbar

function bindToolbar() {
  document.getElementById('save').addEventListener('click', save);
  document.getElementById('open-resume').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/resume.html') });
  });

  document.getElementById('export').addEventListener('click', async () => {
    await save();
    const snapshot = await exportAll();
    const stamp = new Date().toISOString().slice(0, 10);
    download(`resume-autofill-${stamp}.json`, JSON.stringify(snapshot, null, 2), 'application/json');
  });

  const importInput = document.getElementById('import-file');
  document.getElementById('import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      await importAll(JSON.parse(await readFileAs(file, 'readAsText')));
      location.reload();
    } catch (error) {
      saveState.textContent = `Import failed: ${error.message}`;
      saveState.style.color = 'var(--bad)';
    }
  });

  document.getElementById('clear').addEventListener('click', async () => {
    if (!confirm('Delete your profile, files, settings and remembered answers from this browser?')) return;
    await clearAll();
    location.reload();
  });
}

// --------------------------------------------------------------------- init

async function init() {
  [profile, settings] = await Promise.all([getProfile(), getSettings()]);
  bindScalars();
  bindLists();
  bindImport();
  bindFileSlots();
  bindSettings();
  bindLearned();
  bindToolbar();
  saveState.textContent = 'All changes saved';

  window.addEventListener('beforeunload', () => {
    if (saveTimer) save();
  });
}

init();
