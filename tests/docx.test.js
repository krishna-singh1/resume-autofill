import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { documentXmlToText } from '../src/core/docx.js';

describe('documentXmlToText', () => {
  it('turns paragraphs, tabs and breaks into plain text', () => {
    const xml = `<w:document><w:body>
      <w:p><w:r><w:t>Priya Raman</w:t></w:r></w:p>
      <w:p><w:r><w:t>Austin, TX</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>priya@example.com</w:t></w:r></w:p>
      <w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p>
      <w:p><w:r><w:t>R&amp;D &lt;team&gt; &#8211; lead</w:t></w:r></w:p>
    </w:body></w:document>`;

    const text = documentXmlToText(xml);
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    assert.deepEqual(lines, ['Priya Raman', 'Austin, TX   priya@example.com', 'Line one', 'Line two', 'R&D <team> – lead']);
  });
});
