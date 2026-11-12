'use strict';
/**
 * Tiny XML parser, enough for the vMix /api document.
 * parse(xml) -> { name, attrs, children: [node], text }
 */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e];
  });
}
function encode(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parse(xml) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (m[6] !== undefined) { top.text += decode(m[6]); continue; }
    if (!m[3]) continue; // comment / declaration
    if (m[2] === '/') {
      // close tag: pop to matching name (tolerant)
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === m[3]) { stack.length = i; break; }
      }
      continue;
    }
    const attrs = {};
    const ar = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a;
    while ((a = ar.exec(m[4] || ''))) attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { name: m[3], attrs, children: [], text: '' };
    top.children.push(node);
    if (!m[5]) stack.push(node);
  }
  return root.children[0] || root;
}

/** helpers */
const child = (n, name) => (n && n.children ? n.children.find((c) => c.name === name) : undefined);
const children = (n, name) => (n && n.children ? n.children.filter((c) => c.name === name) : []);
const text = (n) => (n ? n.text.trim() : '');

module.exports = { parse, child, children, text, decode, encode };
