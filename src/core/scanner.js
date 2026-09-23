/**
 * Turns a live document into plain field descriptors for the matcher.
 *
 * This is the only module that reads the page DOM. Everything it produces is
 * serialisable, so matching stays testable without a browser.
 */

import { squish } from './text.js';

const SKIPPED_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'password',
  'search',
  'range',
  'color',
]);

/** Attributes ATS platforms use for stable hooks (Workday, Ashby, SmartRecruiters). */
const HINT_ATTRIBUTES = ['data-automation-id', 'data-testid', 'data-test-id', 'data-qa', 'data-field', 'data-name'];

/** Depth-first walk that also descends into open shadow roots. */
function* walk(root) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node instanceof Element) yield node;
    const children = node instanceof Element || node instanceof DocumentFragment || node instanceof Document
      ? node.children
      : null;
    if (children) for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    if (node instanceof Element && node.shadowRoot) stack.push(node.shadowRoot);
  }
}

export function isVisible(el) {
  if (!el || !el.isConnected) return false;
  if (el.disabled || el.readOnly) return false;
  if (el.getClientRects().length === 0) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!style) return true;
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

function isFormControl(el) {
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !SKIPPED_INPUT_TYPES.has((el.type || 'text').toLowerCase());
}

/** How many form controls live under `node` — used to bound label search. */
function controlCount(node) {
  return node.querySelectorAll('input, select, textarea').length;
}

function textOf(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  // Drop nested controls so a wrapping <label> doesn't absorb its own input's text.
  clone.querySelectorAll?.('input, select, textarea, script, style').forEach((child) => child.remove());
  return squish(clone.textContent || '');
}

function labelFromFor(el) {
  if (!el.id) return '';
  const root = el.getRootNode();
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id;
  return textOf(root.querySelector?.(`label[for="${escaped}"]`));
}

function labelFromAriaLabelledBy(el) {
  const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
  if (!ids.length) return '';
  const root = el.getRootNode();
  return squish(ids.map((id) => textOf(root.getElementById?.(id))).join(' '));
}

/**
 * Climb towards the nearest ancestor that still wraps only this control and
 * look for label-ish markup. Stopping as soon as a second control appears is
 * what prevents picking up the neighbouring field's label.
 */
function labelFromAncestor(el) {
  let node = el.parentElement;
  for (let depth = 0; node && depth < 5; depth += 1) {
    if (controlCount(node) > 1) break;
    const candidate = node.querySelector('label, legend, [class*="label" i], [class*="Label"]');
    const text = textOf(candidate);
    if (text && text.length <= 120) return text;
    node = node.parentElement;
  }
  return '';
}

function labelFromPreviousSibling(el) {
  let sibling = el.previousElementSibling;
  for (let steps = 0; sibling && steps < 3; steps += 1) {
    if (!isFormControl(sibling)) {
      const text = textOf(sibling);
      if (text && text.length <= 120) return text;
    }
    sibling = sibling.previousElementSibling;
  }
  return '';
}

export function resolveLabel(el) {
  return (
    labelFromFor(el) ||
    labelFromAriaLabelledBy(el) ||
    squish(el.getAttribute('aria-label')) ||
    textOf(el.closest?.('label')) ||
    labelFromAncestor(el) ||
    labelFromPreviousSibling(el) ||
    ''
  );
}

/** Heading or legend describing the block this control sits in. */
export function resolveSectionText(el) {
  const parts = [];
  let node = el.parentElement;
  for (let depth = 0; node && depth < 8; depth += 1) {
    if (node.tagName === 'FIELDSET') {
      const legend = textOf(node.querySelector('legend'));
      if (legend) parts.push(legend);
    }
    const ariaLabel = node.getAttribute?.('aria-label');
    if (ariaLabel) parts.push(squish(ariaLabel));

    // The closest heading that appears before this control in document order.
    const headings = node.querySelectorAll?.('h1, h2, h3, h4, h5, h6, legend');
    if (headings?.length) {
      for (let i = headings.length - 1; i >= 0; i -= 1) {
        const heading = headings[i];
        if (heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
          parts.push(textOf(heading));
          break;
        }
      }
    }
    if (parts.length) break;
    node = node.parentElement;
  }
  return squish(parts.join(' ')).slice(0, 200);
}

function hintAttributes(el) {
  return HINT_ATTRIBUTES.map((attribute) => el.getAttribute(attribute))
    .filter(Boolean)
    .join(' ');
}

function optionsOf(el) {
  if (el.tagName !== 'SELECT') return [];
  return Array.from(el.options).map((option) => ({
    value: option.value,
    text: squish(option.textContent),
  }));
}

function kindOf(el, radioGroup) {
  if (radioGroup) return 'choice';
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return 'longtext';
  if (tag === 'SELECT') return 'choice';
  const type = (el.type || 'text').toLowerCase();
  if (type === 'file') return 'file';
  if (type === 'checkbox') return 'boolean';
  if (type === 'date' || type === 'month' || type === 'week') return 'date';
  if (type === 'number') return 'number';
  return 'text';
}

/**
 * Collect descriptors for every fillable control in `root`.
 *
 * Radio buttons (and same-named checkbox sets) collapse into a single
 * descriptor for the group, since the profile holds one value for the answer,
 * not one per option.
 */
export function scanFields(root = document) {
  const controls = [];
  for (const el of walk(root)) {
    if (isFormControl(el) && isVisible(el)) controls.push(el);
  }

  const descriptors = [];
  const seenGroups = new Set();

  for (const el of controls) {
    const type = (el.type || '').toLowerCase();
    const isGrouped = (type === 'radio' || type === 'checkbox') && el.name;
    let members = [el];

    if (isGrouped) {
      const groupKey = `${type}:${el.name}`;
      if (seenGroups.has(groupKey)) continue;
      members = controls.filter((other) => (other.type || '').toLowerCase() === type && other.name === el.name);
      if (type === 'checkbox' && members.length === 1) {
        members = [el]; // a lone checkbox is a yes/no, not a choice set
      } else {
        seenGroups.add(groupKey);
      }
    }

    const isGroup = members.length > 1;
    const anchor = members[0];
    const label = isGroup ? resolveSectionText(anchor) || resolveLabel(anchor) : resolveLabel(el);

    descriptors.push({
      element: el,
      elements: members,
      tag: el.tagName.toLowerCase(),
      type: type || 'text',
      kind: kindOf(el, isGroup),
      name: el.name || '',
      id: el.id || '',
      dataAttr: hintAttributes(el),
      autocomplete: el.getAttribute('autocomplete') || '',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      title: el.getAttribute('title') || '',
      label,
      sectionText: resolveSectionText(anchor),
      required: el.required || el.getAttribute('aria-required') === 'true',
      options: isGroup
        ? members.map((member) => ({ value: member.value, text: resolveLabel(member) || member.value }))
        : optionsOf(el),
      currentValue: type === 'checkbox' || type === 'radio' ? '' : el.value || '',
    });
  }

  return descriptors;
}
