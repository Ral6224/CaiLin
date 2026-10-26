'use strict';

const els = {
  grid: document.getElementById('materialGrid'),
  emptyState: document.getElementById('emptyState'),
  loadError: document.getElementById('loadError'),
  loadErrorText: document.getElementById('loadErrorText'),
  resultCount: document.getElementById('resultCount'),
  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  topicFilters: document.getElementById('topicFilters'),
  personFilters: document.getElementById('personFilters'),
  clearFilters: document.getElementById('clearFilters'),
  emptyReset: document.getElementById('emptyReset'),
  retryLoad: document.getElementById('retryLoad'),
  statMaterials: document.getElementById('statMaterials'),
  statPeople: document.getElementById('statPeople'),
  statTopics: document.getElementById('statTopics'),
  materialDialog: document.getElementById('materialDialog'),
  form: document.getElementById('materialForm'),
  formDialogTitle: document.getElementById('formDialogTitle'),
  formError: document.getElementById('formError'),
  saveButton: document.getElementById('saveButton'),
  editorState: document.getElementById('editorState'),
  deedsEditor: document.getElementById('deedsEditor'),
  deedsPreview: document.getElementById('deedsPreview'),
  editorCount: document.getElementById('editorCount'),
  editorTabs: Array.from(document.querySelectorAll('[data-editor-mode]')),
  formatButtons: Array.from(document.querySelectorAll('[data-format]')),
  detailDialog: document.getElementById('detailDialog'),
  detailPerson: document.getElementById('detailPerson'),
  detailIdentity: document.getElementById('detailIdentity'),
  detailUpdated: document.getElementById('detailUpdated'),
  detailQuoteBlock: document.getElementById('detailQuoteBlock'),
  detailQuote: document.getElementById('detailQuote'),
  detailSource: document.getElementById('detailSource'),
  detailDeedsSection: document.getElementById('detailDeedsSection'),
  detailDeeds: document.getElementById('detailDeeds'),
  detailSpiritSection: document.getElementById('detailSpiritSection'),
  detailSpirit: document.getElementById('detailSpirit'),
  detailTopicsSection: document.getElementById('detailTopicsSection'),
  detailTopics: document.getElementById('detailTopics'),
  detailKeywordsSection: document.getElementById('detailKeywordsSection'),
  detailKeywords: document.getElementById('detailKeywords'),
  closeDetail: document.getElementById('closeDetail'),
  editDetail: document.getElementById('editDetail'),
  deleteDetail: document.getElementById('deleteDetail'),
  toast: document.getElementById('toast')
};

const state = {
  materials: [],
  facets: { topics: [], people: [], keywords: [], stats: { materials: 0, people: 0, topics: 0, keywords: 0 } },
  filters: { q: '', topic: '', person: '' },
  sort: 'updated',
  detailId: null,
  deleteArmed: false,
  editorMode: 'write',
  editorDirty: false,
  loaded: false
};

let deleteTimer = null;
let toastTimer = null;

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => entities[char]);
}

function safeLink(url) {
  const decoded = String(url).replace(/&amp;/g, '&').trim();
  return /^(https?:\/\/|mailto:|\/|#)/i.test(decoded) ? decoded : '';
}

function renderInline(value) {
  let text = escapeHtml(value);
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    const safe = safeLink(url);
    if (!safe) return label;
    return '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return text;
}

function renderMarkdown(value) {
  const source = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!source) return '';

  const lines = source.split('\n');
  const out = [];
  const fence = String.fromCharCode(96).repeat(3);
  let paragraph = [];
  let quote = [];
  let list = null;
  let code = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    out.push('<p>' + paragraph.join('<br>') + '</p>');
    paragraph = [];
  }

  function flushQuote() {
    if (!quote.length) return;
    out.push('<blockquote><p>' + quote.join('<br>') + '</p></blockquote>');
    quote = [];
  }

  function flushList() {
    if (!list) return;
    const tag = list.type;
    out.push('<' + tag + '>' + list.items.map((item) => '<li>' + renderInline(item) + '</li>').join('') + '</' + tag + '>');
    list = null;
  }

  function flushAll() {
    flushParagraph();
    flushQuote();
    flushList();
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (code !== null) {
      if (trimmed.startsWith(fence)) {
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }

    if (trimmed.startsWith(fence)) {
      flushAll();
      code = [];
      continue;
    }

    if (!trimmed) {
      flushAll();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      out.push('<h' + level + '>' + renderInline(heading[2]) + '</h' + level + '>');
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      out.push('<hr>');
      continue;
    }

    const quoted = trimmed.match(/^>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(renderInline(quoted[1]));
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      flushQuote();
      if (list && list.type !== 'ul') flushList();
      if (!list) list = { type: 'ul', items: [] };
      list.items.push(unordered[1]);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (list && list.type !== 'ol') flushList();
      if (!list) list = { type: 'ol', items: [] };
      list.items.push(ordered[1]);
      continue;
    }

    flushQuote();
    flushList();
    paragraph.push(renderInline(trimmed));
  }

  if (code !== null) {
    out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
  }
  flushAll();
  return out.join('\n');
}

function markdownToPlain(value) {
  let text = String(value || '');
  text = text.split(String.fromCharCode(96).repeat(3)).join(' ');
  text = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 420);
}

async function api(path, options) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error('无法连接服务器，请确认服务已启动。');
  }

  if (response.status === 204) return null;

  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error((data && data.error) || '请求失败，请稍后重试。');
  }
  return data;
}

async function loadMaterials() {
  els.loadError.hidden = true;
  if (!state.loaded) els.resultCount.textContent = '正在读取素材…';

  try {
    const data = await api('/api/materials');
    state.materials = data.materials || [];
    state.facets = data.facets || state.facets;
    state.loaded = true;
    renderStats();
    renderFilters();
    renderResults();
  } catch (error) {
    els.grid.replaceChildren();
    els.emptyState.hidden = true;
    els.loadError.hidden = false;
    els.loadErrorText.textContent = error.message;
    els.resultCount.textContent = '素材读取失败';
  }
}

function renderStats() {
  const stats = state.facets.stats || {};
  els.statMaterials.textContent = String(stats.materials ?? state.materials.length);
  els.statPeople.textContent = String(stats.people ?? state.facets.people.length);
  els.statTopics.textContent = String(stats.topics ?? state.facets.topics.length);
}

function makeFilterButton(label, count, active, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'filter-button' + (active ? ' is-active' : '');
  button.setAttribute('aria-pressed', active ? 'true' : 'false');

  const text = document.createElement('span');
  text.textContent = label;
  button.appendChild(text);

  if (typeof count === 'number') {
    const badge = document.createElement('span');
    badge.className = 'filter-count';
    badge.textContent = String(count);
    button.appendChild(badge);
  }

  button.addEventListener('click', onClick);
  return button;
}

function renderFilters() {
  els.topicFilters.replaceChildren();
  els.topicFilters.appendChild(
    makeFilterButton('全部话题', state.materials.length, !state.filters.topic, () => {
      state.filters.topic = '';
      renderFilters();
      renderResults();
    })
  );

  for (const topic of state.facets.topics) {
    els.topicFilters.appendChild(
      makeFilterButton(topic.name, topic.count, state.filters.topic === topic.name, () => {
        state.filters.topic = state.filters.topic === topic.name ? '' : topic.name;
        renderFilters();
        renderResults();
      })
    );
  }

  els.personFilters.replaceChildren();
  els.personFilters.appendChild(
    makeFilterButton('全部人物', state.materials.length, !state.filters.person, () => {
      state.filters.person = '';
      renderFilters();
      renderResults();
    })
  );

  for (const person of state.facets.people) {
    els.personFilters.appendChild(
      makeFilterButton(person.name, person.count, state.filters.person === person.name, () => {
        state.filters.person = state.filters.person === person.name ? '' : person.name;
        renderFilters();
        renderResults();
      })
    );
  }
}

function getFilteredMaterials() {
  const query = state.filters.q.trim().toLowerCase();
  const topic = state.filters.topic;
  const person = state.filters.person;

  const filtered = state.materials.filter((item) => {
    if (topic && !item.topics.includes(topic)) return false;
    if (person && item.person !== person) return false;
    if (!query) return true;

    const haystack = [
      item.person,
      item.identity,
      item.deeds,
      item.quote,
      item.source,
      item.spirit,
      item.topics.join(' '),
      item.keywords.join(' ')
    ].join('\n').toLowerCase();

    return haystack.includes(query);
  });

  filtered.sort((a, b) => {
    if (state.sort === 'person') {
      return a.person.localeCompare(b.person, 'zh-CN');
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
      a.person.localeCompare(b.person, 'zh-CN');
  });

  return filtered;
}

function hasActiveFilters() {
  return Boolean(state.filters.q.trim() || state.filters.topic || state.filters.person);
}

function makeTag(text, extraClass) {
  const tag = document.createElement('span');
  tag.className = 'tag' + (extraClass ? ' ' + extraClass : '');
  tag.textContent = text;
  return tag;
}

function createCard(item, index) {
  const card = document.createElement('article');
  card.className = 'material-card';
  card.dataset.id = item.id;
  card.addEventListener('click', () => openDetail(item.id));

  const top = document.createElement('div');
  top.className = 'card-top';

  const personBlock = document.createElement('div');
  const name = document.createElement('h3');
  name.className = 'person-name';
  name.textContent = item.person;
  personBlock.appendChild(name);

  const identity = document.createElement('p');
  identity.className = 'person-identity';
  identity.textContent = item.identity || '人物素材';
  personBlock.appendChild(identity);

  const cardIndex = document.createElement('span');
  cardIndex.className = 'card-index';
  cardIndex.textContent = String(index + 1).padStart(2, '0');

  top.append(personBlock, cardIndex);

  const quote = document.createElement('blockquote');
  quote.className = 'card-quote' + (item.quote ? '' : ' is-empty');
  const quoteText = document.createElement('p');
  quoteText.textContent = item.quote || '暂未录入语录';
  quote.appendChild(quoteText);

  const deeds = document.createElement('p');
  deeds.className = 'card-deeds' + (item.deeds ? '' : ' is-empty');
  deeds.textContent = item.deeds ? markdownToPlain(item.deeds) : '暂未录入事迹';

  const foot = document.createElement('div');
  foot.className = 'card-foot';

  const tags = document.createElement('div');
  tags.className = 'card-tags';

  if (item.topics.length) {
    for (const topic of item.topics.slice(0, 3)) tags.appendChild(makeTag(topic));
    if (item.topics.length > 3) {
      tags.appendChild(makeTag('+' + (item.topics.length - 3), 'tag-more'));
    }
  } else {
    tags.appendChild(makeTag('未分类', 'tag-more'));
  }

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'card-link';
  openButton.textContent = '查看全文';
  openButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openDetail(item.id);
  });

  foot.append(tags, openButton);
  card.append(top, quote, deeds, foot);
  return card;
}

function renderResults() {
  const materials = getFilteredMaterials();
  const active = hasActiveFilters();

  if (active) {
    els.resultCount.textContent = '筛选出 ' + materials.length + ' 则素材（共 ' + state.materials.length + ' 则）';
  } else {
    els.resultCount.textContent = '共 ' + materials.length + ' 则素材';
  }

  els.grid.replaceChildren();
  const fragment = document.createDocumentFragment();
  materials.forEach((item, index) => fragment.appendChild(createCard(item, index)));
  els.grid.appendChild(fragment);

  const empty = materials.length === 0;
  els.emptyState.hidden = !empty;
  els.grid.hidden = empty;
  els.loadError.hidden = true;
}

function resetDeleteButton() {
  state.deleteArmed = false;
  if (deleteTimer) clearTimeout(deleteTimer);
  els.deleteDetail.textContent = '删除';
  els.deleteDetail.classList.remove('is-confirming');
  els.deleteDetail.disabled = false;
}

function openDetail(id) {
  const item = state.materials.find((material) => material.id === id);
  if (!item) return;

  state.detailId = id;
  state.deleteArmed = false;
  resetDeleteButton();

  els.detailPerson.textContent = item.person;
  els.detailIdentity.textContent = item.identity || '人物素材';
  els.detailUpdated.textContent = '最近更新 ' + formatDate(item.updatedAt);

  if (item.quote) {
    els.detailQuoteBlock.hidden = false;
    els.detailQuote.textContent = item.quote;
    els.detailSource.textContent = item.source ? '—— ' + item.source : '';
    els.detailSource.hidden = !item.source;
  } else {
    els.detailQuoteBlock.hidden = true;
  }

  els.detailDeedsSection.hidden = !item.deeds;
  els.detailDeeds.innerHTML = item.deeds ? renderMarkdown(item.deeds) : '';

  els.detailSpiritSection.hidden = !item.spirit;
  els.detailSpirit.textContent = item.spirit;

  els.detailTopicsSection.hidden = item.topics.length === 0;
  els.detailTopics.replaceChildren(...item.topics.map((topic) => makeTag(topic)));

  els.detailKeywordsSection.hidden = item.keywords.length === 0;
  els.detailKeywords.replaceChildren(...item.keywords.map((keyword) => makeTag(keyword)));

  els.detailDialog.showModal();
}

function fillForm(item) {
  els.form.reset();
  els.form.elements.id.value = item ? item.id : '';
  els.form.elements.person.value = item ? item.person : '';
  els.form.elements.identity.value = item ? item.identity : '';
  els.form.elements.deeds.value = item ? item.deeds : '';
  els.form.elements.quote.value = item ? item.quote : '';
  els.form.elements.source.value = item ? item.source : '';
  els.form.elements.spirit.value = item ? item.spirit : '';
  els.form.elements.topics.value = item ? item.topics.join('，') : '';
  els.form.elements.keywords.value = item ? item.keywords.join('，') : '';
  els.formError.hidden = true;
  els.formError.textContent = '';
  els.formDialogTitle.textContent = item ? '编辑素材' : '新增素材';
  els.saveButton.textContent = item ? '保存修改' : '保存素材';
  els.saveButton.disabled = false;
  state.editorDirty = false;
  els.editorState.textContent = item ? '正在编辑' : '新素材';
  setEditorMode('write');
  updateEditorCount();
}

function openCreate() {
  if (els.detailDialog.open) els.detailDialog.close();
  fillForm(null);
  els.materialDialog.showModal();
  requestAnimationFrame(() => els.form.elements.person.focus());
}

function openEdit() {
  const item = state.materials.find((material) => material.id === state.detailId);
  if (!item) return;
  if (els.detailDialog.open) els.detailDialog.close();
  fillForm(item);
  els.materialDialog.showModal();
  requestAnimationFrame(() => els.form.elements.person.focus());
}

function markEditorDirty() {
  if (state.editorDirty) return;
  state.editorDirty = true;
  els.editorState.textContent = '尚未保存';
}

function updateEditorCount() {
  const count = els.deedsEditor.value.replace(/\s/g, '').length;
  els.editorCount.textContent = count + ' 字';
}

function renderEditorPreview() {
  const rendered = renderMarkdown(els.deedsEditor.value);
  els.deedsPreview.innerHTML = rendered || '<p class="md-empty">还没有正文内容。</p>';
}

function setEditorMode(mode) {
  state.editorMode = mode === 'preview' ? 'preview' : 'write';
  const preview = state.editorMode === 'preview';
  for (const tab of els.editorTabs) {
    const active = tab.dataset.editorMode === state.editorMode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  els.deedsEditor.hidden = preview;
  els.deedsPreview.hidden = !preview;
  if (preview) renderEditorPreview();
}

function notifyEditorChange() {
  els.deedsEditor.dispatchEvent(new Event('input', { bubbles: true }));
}

function wrapInline(prefix, suffix, placeholder) {
  const editor = els.deedsEditor;
  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = value.slice(start, end);
  const content = selected || placeholder;
  const replacement = prefix + content + suffix;

  editor.setRangeText(replacement, start, end, 'end');
  if (selected) {
    editor.setSelectionRange(start, start + replacement.length);
  } else {
    editor.setSelectionRange(start + prefix.length, start + prefix.length + content.length);
  }
  notifyEditorChange();
}

function prefixSelectedLines(prefixer) {
  const editor = els.deedsEditor;
  const value = editor.value;
  const lineStart = value.lastIndexOf('\n', editor.selectionStart - 1) + 1;
  let lineEnd = value.indexOf('\n', editor.selectionEnd);
  if (lineEnd === -1) lineEnd = value.length;

  const replacement = value.slice(lineStart, lineEnd)
    .split('\n')
    .map((line, index) => prefixer(index) + line)
    .join('\n');

  editor.setRangeText(replacement, lineStart, lineEnd, 'select');
  editor.setSelectionRange(lineStart, lineStart + replacement.length);
  notifyEditorChange();
}

function applyFormat(format) {
  if (state.editorMode !== 'write') setEditorMode('write');
  const editor = els.deedsEditor;
  editor.focus();

  if (format === 'bold') {
    wrapInline('**', '**', '重点');
    return;
  }
  if (format === 'italic') {
    wrapInline('*', '*', '强调');
    return;
  }
  if (format === 'heading') {
    prefixSelectedLines(() => '## ');
    return;
  }
  if (format === 'quote') {
    prefixSelectedLines(() => '> ');
    return;
  }
  if (format === 'ul') {
    prefixSelectedLines(() => '- ');
    return;
  }
  if (format === 'ol') {
    prefixSelectedLines((index) => (index + 1) + '. ');
    return;
  }

  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);

  if (format === 'link') {
    const label = selected || '链接文字';
    const url = 'https://';
    const replacement = '[' + label + '](' + url + ')';
    editor.setRangeText(replacement, start, end, 'end');
    const urlStart = start + label.length + 3;
    editor.setSelectionRange(urlStart, urlStart + url.length);
    notifyEditorChange();
    return;
  }

  if (format === 'hr') {
    editor.setRangeText('\n\n---\n\n', start, end, 'end');
    notifyEditorChange();
  }
}

function parseTags(value, limit) {
  const tags = [];
  const seen = new Set();
  for (const raw of String(value).split(/[,，、;；\n]+/)) {
    const tag = raw.trim().replace(/^#+/, '').slice(0, 24);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= limit) break;
  }
  return tags;
}

function showFormError(message) {
  els.formError.textContent = message;
  els.formError.hidden = false;
  els.formError.scrollIntoView({ block: 'nearest' });
}

async function saveMaterial(event) {
  event.preventDefault();
  const form = els.form;
  const id = form.elements.id.value;
  const payload = {
    person: form.elements.person.value.trim(),
    identity: form.elements.identity.value.trim(),
    deeds: form.elements.deeds.value.trim(),
    quote: form.elements.quote.value.trim(),
    source: form.elements.source.value.trim(),
    spirit: form.elements.spirit.value.trim(),
    topics: parseTags(form.elements.topics.value, 12),
    keywords: parseTags(form.elements.keywords.value, 20)
  };

  if (!payload.person) {
    showFormError('请填写人物。');
    form.elements.person.focus();
    return;
  }

  if (!payload.deeds && !payload.quote && !payload.spirit) {
    showFormError('事迹、语录、精神至少填写一项。');
    setEditorMode('write');
    els.deedsEditor.focus();
    return;
  }

  els.formError.hidden = true;
  els.saveButton.disabled = true;
  const originalLabel = els.saveButton.textContent;
  els.saveButton.textContent = '保存中…';

  try {
    if (id) {
      await api('/api/materials/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('素材已更新');
    } else {
      await api('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('素材已添加');
    }

    state.editorDirty = false;
    els.materialDialog.close();
    await loadMaterials();
  } catch (error) {
    showFormError(error.message);
  } finally {
    els.saveButton.disabled = false;
    els.saveButton.textContent = originalLabel;
  }
}

async function deleteMaterial() {
  if (!state.detailId) return;

  if (!state.deleteArmed) {
    state.deleteArmed = true;
    els.deleteDetail.textContent = '确认删除';
    els.deleteDetail.classList.add('is-confirming');
    deleteTimer = setTimeout(resetDeleteButton, 5000);
    return;
  }

  const id = state.detailId;
  els.deleteDetail.disabled = true;
  els.deleteDetail.textContent = '删除中…';

  try {
    await api('/api/materials/' + encodeURIComponent(id), { method: 'DELETE' });
    els.detailDialog.close();
    state.detailId = null;
    resetDeleteButton();
    showToast('素材已删除');
    await loadMaterials();
  } catch (error) {
    resetDeleteButton();
    showToast(error.message);
  }
}

function clearFilters() {
  state.filters = { q: '', topic: '', person: '' };
  els.searchInput.value = '';
  renderFilters();
  renderResults();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

document.querySelectorAll('[data-open-create]').forEach((button) => {
  button.addEventListener('click', openCreate);
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => els.materialDialog.close());
});

els.form.addEventListener('submit', saveMaterial);

els.form.addEventListener('input', (event) => {
  markEditorDirty();
  if (event.target === els.deedsEditor) {
    updateEditorCount();
    if (state.editorMode === 'preview') renderEditorPreview();
  }
});

for (const tab of els.editorTabs) {
  tab.addEventListener('click', () => setEditorMode(tab.dataset.editorMode));
}

for (const button of els.formatButtons) {
  button.addEventListener('click', () => applyFormat(button.dataset.format));
}

els.deedsEditor.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 'b' || key === 'i') {
    event.preventDefault();
    applyFormat(key === 'b' ? 'bold' : 'italic');
  } else if (key === 's') {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

els.materialDialog.addEventListener('close', () => {
  state.editorDirty = false;
});

els.closeDetail.addEventListener('click', () => els.detailDialog.close());
els.editDetail.addEventListener('click', openEdit);
els.deleteDetail.addEventListener('click', deleteMaterial);
els.detailDialog.addEventListener('close', () => {
  state.detailId = null;
  resetDeleteButton();
});

let searchTimer = null;
els.searchInput.addEventListener('input', () => {
  state.filters.q = els.searchInput.value;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(renderResults, 60);
});

els.sortSelect.addEventListener('change', () => {
  state.sort = els.sortSelect.value;
  renderResults();
});

els.clearFilters.addEventListener('click', clearFilters);
els.emptyReset.addEventListener('click', clearFilters);
els.retryLoad.addEventListener('click', loadMaterials);

document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !isEditableTarget(event.target) && !els.materialDialog.open && !els.detailDialog.open) {
    event.preventDefault();
    els.searchInput.focus();
  }
});

loadMaterials();
