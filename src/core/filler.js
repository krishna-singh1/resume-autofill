/**
 * Writes values into form controls in a way front-end frameworks notice.
 *
 * Assigning `el.value` alone is not enough: React caches the previous value on
 * the node and ignores events whose value it believes is unchanged, so we go
 * through the native property setter and then dispatch the events a real user
 * would have produced.
 */

import { formatForDateInput } from './dates.js';
import { normalize, similarity, squish } from './text.js';

/** Minimum option similarity before we accept a dropdown match. */
const OPTION_THRESHOLD = 0.34;

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function emit(el, type, EventCtor = Event) {
  el.dispatchEvent(new EventCtor(type, { bubbles: true, composed: true }));
}

/** Mimic the event sequence a human typing into the field would generate. */
function notify(el) {
  emit(el, 'input', InputEvent);
  emit(el, 'change');
}

/** Closest option to `value`, by exact match then token similarity. */
export function pickOption(options, value) {
  const wanted = squish(value);
  if (!wanted || !options.length) return null;

  const exact = options.find(
    (option) => squish(option.text).toLowerCase() === wanted.toLowerCase() ||
      squish(option.value).toLowerCase() === wanted.toLowerCase(),
  );
  if (exact) return exact;

  // "Yes" should find "Yes, I am authorized to work": when every wanted word
  // appears in the option, score by how little else the option says.
  const wantedTokens = normalize(wanted).split(' ').filter(Boolean);
  const containment = (text) => {
    const optionTokens = new Set(normalize(text).split(' ').filter(Boolean));
    if (!optionTokens.size || !wantedTokens.every((token) => optionTokens.has(token))) return 0;
    return 0.5 + 0.5 * (wantedTokens.length / optionTokens.size);
  };

  let best = null;
  for (const option of options) {
    if (!squish(option.text) && !squish(option.value)) continue;
    const score = Math.max(
      similarity(option.text, wanted),
      similarity(option.value, wanted),
      containment(option.text),
    );
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score >= OPTION_THRESHOLD ? best.option : null;
}

function fillText(el, value) {
  const type = (el.type || 'text').toLowerCase();
  let next = value;

  if (type === 'date' || type === 'month' || type === 'week') {
    next = formatForDateInput(value, type);
    if (!next) return { status: 'skipped', reason: `could not read "${value}" as a date` };
  }
  if (type === 'number') {
    const digits = String(value).replace(/[^\d.-]/g, '');
    if (!digits) return { status: 'skipped', reason: 'no numeric value' };
    next = digits;
  }
  if (el.maxLength > 0 && next.length > el.maxLength) next = next.slice(0, el.maxLength);

  el.focus?.();
  setNativeValue(el, next);
  notify(el);
  el.blur?.();
  return { status: 'filled', value: next };
}

function fillSelect(el, value) {
  const options = Array.from(el.options).map((option) => ({ value: option.value, text: squish(option.textContent) }));
  const choice = pickOption(options.filter((option) => option.value !== ''), value);
  if (!choice) return { status: 'skipped', reason: `no option resembling "${value}"` };

  el.focus?.();
  setNativeValue(el, choice.value);
  notify(el);
  el.blur?.();
  return { status: 'filled', value: choice.text || choice.value };
}

function fillRadioGroup(members, value, optionLabels) {
  const options = members.map((member, index) => ({
    value: optionLabels?.[index]?.text || member.value,
    text: optionLabels?.[index]?.text || member.value,
    member,
  }));
  const choice = pickOption(options, value);
  if (!choice) return { status: 'skipped', reason: `no option resembling "${value}"` };

  const target = choice.member;
  if (!target.checked) {
    target.focus?.();
    target.click();
    if (!target.checked) {
      target.checked = true;
      notify(target);
    }
  }
  return { status: 'filled', value: choice.text };
}

function fillCheckbox(el, value) {
  const truthy = /^(yes|true|1|on|checked)$/i.test(squish(value));
  if (el.checked !== truthy) el.click();
  return { status: 'filled', value: truthy ? 'checked' : 'unchecked' };
}

function dataUrlToFile(dataUrl, name, fallbackType) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!match) return null;
  const [, mime, isBase64, payload] = match;
  const bytes = isBase64
    ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new File([bytes], name || 'resume.pdf', { type: mime || fallbackType || 'application/octet-stream' });
}

/** Attach a stored document to a file input via a synthetic DataTransfer. */
function fillFileInput(el, fileRecord) {
  if (!fileRecord?.dataUrl) return { status: 'skipped', reason: 'no file saved in your profile' };
  if (el.files?.length) return { status: 'skipped', reason: 'a file is already attached' };

  const file = dataUrlToFile(fileRecord.dataUrl, fileRecord.name, fileRecord.type);
  if (!file) return { status: 'failed', reason: 'stored file is unreadable' };

  const transfer = new DataTransfer();
  transfer.items.add(file);
  el.files = transfer.files;
  notify(el);
  // Drop-zone widgets listen for a drop rather than a change event.
  el.dispatchEvent(new DragEvent('drop', { bubbles: true, composed: true, dataTransfer: transfer }));
  return { status: 'filled', value: file.name };
}

/**
 * Fill one descriptor with one value.
 * `overwrite` false (the default) leaves anything the user already typed alone.
 */
export function fillDescriptor(descriptor, value, { overwrite = false } = {}) {
  const el = descriptor.element;
  if (!el || !el.isConnected) return { status: 'failed', reason: 'field disappeared' };

  if (descriptor.kind === 'file') return fillFileInput(el, value);

  const text = squish(value);
  if (!text) return { status: 'skipped', reason: 'nothing saved for this field' };

  if (!overwrite && descriptor.kind !== 'boolean' && descriptor.kind !== 'choice' && squish(el.value)) {
    return { status: 'skipped', reason: 'already filled' };
  }

  if (descriptor.elements?.length > 1) return fillRadioGroup(descriptor.elements, text, descriptor.options);
  if (descriptor.tag === 'select') return fillSelect(el, text);
  if (descriptor.kind === 'boolean') return fillCheckbox(el, text);
  return fillText(el, text);
}

/** Briefly outline a field so the user can see what was touched. */
export function flash(el, colour = '#16a34a') {
  if (!el?.style) return;
  const previous = el.style.boxShadow;
  el.style.boxShadow = `0 0 0 2px ${colour}`;
  setTimeout(() => {
    el.style.boxShadow = previous;
  }, 1600);
}
