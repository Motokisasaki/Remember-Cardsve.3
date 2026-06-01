const DEFAULT_DATA = window.FLASHCARD_DATA;

const els = {
  categoryFilter: document.getElementById('categoryFilter'),
  tagFilter: document.getElementById('tagFilter'),
  statusFilter: document.getElementById('statusFilter'),
  sortMode: document.getElementById('sortMode'),
  searchText: document.getElementById('searchText'),
  showJapanese: document.getElementById('showJapanese'),
  autoNext: document.getElementById('autoNext'),
  totalCount: document.getElementById('totalCount'),
  visibleCount: document.getElementById('visibleCount'),
  okCount: document.getElementById('okCount'),
  okRate: document.getElementById('okRate'),
  progressFill: document.getElementById('progressFill'),
  deckTitle: document.getElementById('deckTitle'),
  counterText: document.getElementById('counterText'),
  flashcard: document.getElementById('flashcard'),
  questionEn: document.getElementById('questionEn'),
  questionJa: document.getElementById('questionJa'),
  answerEn: document.getElementById('answerEn'),
  answerJa: document.getElementById('answerJa'),
  categoryBadge: document.getElementById('categoryBadge'),
  statusBadge: document.getElementById('statusBadge'),
  originalNoBadge: document.getElementById('originalNoBadge'),
  tagsList: document.getElementById('tagsList'),
  cardList: document.getElementById('cardList'),
  listSummary: document.getElementById('listSummary'),
  flipBtn: document.getElementById('flipBtn'),
  okBtn: document.getElementById('okBtn'),
  skipBtn: document.getElementById('skipBtn'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  resetOkBtn: document.getElementById('resetOkBtn'),
  shuffleBtn: document.getElementById('shuffleBtn'),
  speakQuestionBtn: document.getElementById('speakQuestionBtn'),
  speakAnswerBtn: document.getElementById('speakAnswerBtn'),
  stopSpeechBtn: document.getElementById('stopSpeechBtn'),
  voiceSelect: document.getElementById('voiceSelect'),
  speechRate: document.getElementById('speechRate'),
  toggleEditorBtn: document.getElementById('toggleEditorBtn'),
  editorPanel: document.getElementById('editorPanel'),
  editAnswerJa: document.getElementById('editAnswerJa'),
  editAnswerEn: document.getElementById('editAnswerEn'),
  autoTranslateJaToEn: document.getElementById('autoTranslateJaToEn'),
  saveEditBtn: document.getElementById('saveEditBtn'),
  resetEditBtn: document.getElementById('resetEditBtn'),
  speechStatus: document.getElementById('speechStatus'),
  translateStatus: document.getElementById('translateStatus'),
  excelFileInput: document.getElementById('excelFileInput'),
  importExcelBtn: document.getElementById('importExcelBtn'),
  resetImportedDataBtn: document.getElementById('resetImportedDataBtn'),
  importStatus: document.getElementById('importStatus'),
};

const STORAGE_KEY = 'gbc_flashcards_ok_map_v1';
const SETTINGS_KEY = 'gbc_flashcards_settings_v2';
const EDITS_KEY = 'gbc_flashcards_answer_edits_v1';
const IMPORTED_DATA_KEY = 'gbc_flashcards_imported_dataset_v1';

const state = {
  allItems: [],
  meta: { categories: [], tags: [], totalCount: 0 },
  visibleItems: [],
  currentIndex: 0,
  flipped: false,
  okMap: loadJson(STORAGE_KEY, {}),
  settings: loadSettings(),
  editsMap: loadJson(EDITS_KEY, {}),
  importedData: loadJson(IMPORTED_DATA_KEY, null),
  editorOpen: false,
  touch: {
    startX: 0,
    startY: 0,
    startTime: 0,
  },
  translateTimer: null,
  translateRequestId: 0,
  utterances: [],
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadSettings() {
  const defaults = {
    category: 'all',
    tag: 'all',
    status: 'all',
    sort: 'original',
    search: '',
    showJapanese: true,
    autoNext: false,
    voiceName: 'auto',
    speechRate: '0.92',
  };
  return { ...defaults, ...loadJson(SETTINGS_KEY, {}) };
}

function saveSettings() {
  state.settings = {
    category: els.categoryFilter.value,
    tag: els.tagFilter.value,
    status: els.statusFilter.value,
    sort: els.sortMode.value,
    search: els.searchText.value,
    showJapanese: els.showJapanese.checked,
    autoNext: els.autoNext.checked,
    voiceName: els.voiceSelect?.value || 'auto',
    speechRate: els.speechRate?.value || '0.92',
  };
  saveJson(SETTINGS_KEY, state.settings);
}

function saveOkMap() {
  saveJson(STORAGE_KEY, state.okMap);
}

function saveEditsMap() {
  saveJson(EDITS_KEY, state.editsMap);
}

function saveImportedData() {
  saveJson(IMPORTED_DATA_KEY, state.importedData);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeTags(tagsRaw) {
  return String(tagsRaw || '')
    .replaceAll('／', '/')
    .split('/')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function buildMeta(items) {
  return {
    totalCount: items.length,
    categories: [...new Set(items.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')),
    tags: [...new Set(items.flatMap(item => item.tags || []).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')),
  };
}

function sortByOriginal(items) {
  return [...items].sort((a, b) => Number(a.originalNo || 999999) - Number(b.originalNo || 999999));
}

function installDataset(dataset, { imported = false } = {}) {
  const safeItems = Array.isArray(dataset?.items) ? dataset.items : [];
  state.allItems = safeItems;
  state.meta = dataset?.meta || buildMeta(safeItems);
  state.importedData = imported ? { meta: state.meta, items: safeItems } : null;
  saveImportedData();
}

function getEffectiveItem(item) {
  if (!item) return null;
  const edit = state.editsMap[item.id];
  if (!edit) return item;
  return {
    ...item,
    answerJa: typeof edit.answerJa === 'string' ? edit.answerJa : item.answerJa,
    answerEn: typeof edit.answerEn === 'string' ? edit.answerEn : item.answerEn,
    edited: true,
  };
}

function getCurrentItem() {
  return state.visibleItems[state.currentIndex];
}

function getCurrentEffectiveItem() {
  return getEffectiveItem(getCurrentItem());
}

function isOk(item) {
  return Boolean(state.okMap[item.id]);
}

function buildFilters() {
  els.categoryFilter.innerHTML = ['<option value="all">すべてのカテゴリ</option>']
    .concat(state.meta.categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`))
    .join('');

  els.tagFilter.innerHTML = ['<option value="all">すべてのタグ</option>']
    .concat(state.meta.tags.map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`))
    .join('');

  els.categoryFilter.value = state.settings.category || 'all';
  if (![...els.categoryFilter.options].some(option => option.value === els.categoryFilter.value)) {
    els.categoryFilter.value = 'all';
  }
  els.tagFilter.value = state.settings.tag || 'all';
  if (![...els.tagFilter.options].some(option => option.value === els.tagFilter.value)) {
    els.tagFilter.value = 'all';
  }
  els.statusFilter.value = state.settings.status || 'all';
  els.sortMode.value = state.settings.sort || 'original';
  els.searchText.value = state.settings.search || '';
  els.showJapanese.checked = !!state.settings.showJapanese;
  els.autoNext.checked = !!state.settings.autoNext;
  if (els.speechRate) {
    els.speechRate.value = state.settings.speechRate || '0.92';
  }
}

function populateVoiceOptions() {
  if (!('speechSynthesis' in window) || !els.voiceSelect) return;
  const voices = window.speechSynthesis.getVoices().filter(voice => /^en/i.test(voice.lang));
  const selected = state.settings.voiceName || 'auto';
  const options = ['<option value="auto">自動で最適な音声を選択</option>']
    .concat(
      voices.map(voice => `<option value="${escapeHtml(voice.name)}">${escapeHtml(voice.name)} (${escapeHtml(voice.lang)})</option>`)
    )
    .join('');
  els.voiceSelect.innerHTML = options;
  els.voiceSelect.value = [...els.voiceSelect.options].some(option => option.value === selected) ? selected : 'auto';
}

function scoreVoice(voice) {
  const name = `${voice.name} ${voice.lang}`.toLowerCase();
  let score = 0;
  const preferred = ['samantha', 'daniel', 'karen', 'moira', 'ava', 'allison', 'serena', 'siri', 'google us english', 'google uk english female', 'google uk english male', 'microsoft aria', 'microsoft jenny', 'microsoft guy'];
  preferred.forEach((keyword, index) => {
    if (name.includes(keyword)) score += 120 - index;
  });
  if (voice.localService) score += 20;
  if (name.includes('female')) score += 6;
  if (/en-(us|gb|au|ca)/i.test(voice.lang)) score += 10;
  if (name.includes('compact')) score -= 10;
  return score;
}

function resolveVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter(voice => /^en/i.test(voice.lang));
  if (!voices.length) return null;
  if (els.voiceSelect?.value && els.voiceSelect.value !== 'auto') {
    return voices.find(voice => voice.name === els.voiceSelect.value) || null;
  }
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
}

function splitIntoSpeechChunks(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+|(?<=[。！？])\s*/)
    .flatMap(sentence => {
      if (sentence.length <= 180) return sentence ? [sentence] : [];
      const parts = [];
      for (let i = 0; i < sentence.length; i += 160) {
        parts.push(sentence.slice(i, i + 160));
      }
      return parts;
    })
    .filter(Boolean);
}

function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  state.utterances = [];
  if (els.speechStatus) {
    els.speechStatus.textContent = '読み上げ停止';
  }
}

function speakText(text, label) {
  if (!text || !('speechSynthesis' in window)) {
    if (els.speechStatus) {
      els.speechStatus.textContent = 'このブラウザでは高品質読み上げを利用できないか、対象テキストがありません。';
    }
    return;
  }

  const chunks = splitIntoSpeechChunks(text);
  if (!chunks.length) return;

  stopSpeech();
  const voice = resolveVoice();
  const rate = Number(els.speechRate?.value || state.settings.speechRate || 0.92);

  state.utterances = chunks.map((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1;
    utterance.lang = voice?.lang || 'en-US';
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      if (els.speechStatus) {
        const voiceLabel = voice ? ` / ${voice.name}` : '';
        els.speechStatus.textContent = `${label}を自然音声で読み上げ中${voiceLabel}`;
      }
    };
    utterance.onend = () => {
      if (index === chunks.length - 1 && els.speechStatus) {
        els.speechStatus.textContent = `${label}の読み上げが完了しました`;
      }
    };
    utterance.onerror = () => {
      if (els.speechStatus) {
        els.speechStatus.textContent = '読み上げに失敗しました。別の英語音声を選ぶと改善することがあります。';
      }
    };
    return utterance;
  });

  state.utterances.forEach(utterance => window.speechSynthesis.speak(utterance));
}

function parseWorkbookToDataset(workbook) {
  const targetName = workbook.SheetNames.includes('Categorized_QA') ? 'Categorized_QA' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) {
    throw new Error('empty_sheet');
  }

  const headers = rows[0].map(value => String(value || '').trim());
  const idx = {
    category: headers.indexOf('カテゴリ'),
    tags: headers.indexOf('関連タグ'),
    questionJa: headers.indexOf('日本語質問'),
    answerJa: headers.indexOf('日本語回答'),
    questionEn: headers.indexOf('英語質問'),
    answerEn: headers.indexOf('英語回答'),
    originalNo: headers.indexOf('元No.'),
  };

  if (idx.category < 0 || idx.questionEn < 0 || idx.answerEn < 0) {
    throw new Error('invalid_headers');
  }

  const items = rows.slice(1).filter(row => row.some(cell => String(cell || '').trim())).map((row, index) => {
    const category = String(row[idx.category] || '').trim();
    const tagsText = String(row[idx.tags] || '').trim();
    const questionJa = String(row[idx.questionJa] || '').trim();
    const answerJa = String(row[idx.answerJa] || '').trim();
    const questionEn = String(row[idx.questionEn] || '').trim();
    const answerEn = String(row[idx.answerEn] || '').trim();
    const originalNo = String(row[idx.originalNo] || index + 1).trim();
    const id = `${category || 'uncategorized'}__${originalNo}__${index + 1}`;
    return {
      id,
      category,
      tags: normalizeTags(tagsText),
      tagsText,
      questionJa,
      answerJa,
      questionEn,
      answerEn,
      originalNo,
    };
  }).filter(item => item.questionEn || item.answerEn);

  const sortedItems = sortByOriginal(items);
  return {
    meta: buildMeta(sortedItems),
    items: sortedItems,
  };
}

async function importExcelFile() {
  const file = els.excelFileInput?.files?.[0];
  if (!file) {
    if (els.importStatus) els.importStatus.textContent = '先にExcelファイルを選択してください。';
    return;
  }
  if (typeof XLSX === 'undefined') {
    if (els.importStatus) els.importStatus.textContent = 'Excel読み込みライブラリの初期化に失敗しました。';
    return;
  }

  try {
    if (els.importStatus) els.importStatus.textContent = `${file.name} を読み込み中…`;
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const dataset = parseWorkbookToDataset(workbook);
    installDataset(dataset, { imported: true });
    state.editsMap = {};
    saveEditsMap();
    buildFilters();
    applyFilters();
    if (els.importStatus) {
      els.importStatus.textContent = `${file.name} から ${dataset.items.length} 件のカードを更新しました。この端末に保存されています。`;
    }
  } catch (error) {
    if (els.importStatus) {
      if (error.message === 'invalid_headers') {
        els.importStatus.textContent = 'Excelの列名を確認してください。Categorized_QA シートの「カテゴリ / 英語質問 / 英語回答」などが必要です。';
      } else {
        els.importStatus.textContent = 'Excelの読み込みに失敗しました。元のフォーマットに近いファイルを使ってください。';
      }
    }
  }
}

function resetImportedDataset() {
  installDataset(DEFAULT_DATA, { imported: false });
  buildFilters();
  applyFilters();
  if (els.importStatus) {
    els.importStatus.textContent = '同梱されている元のカードデータに戻しました。';
  }
}

function sortItems(items, mode) {
  const copied = [...items];
  if (mode === 'category') {
    copied.sort((a, b) => {
      const cat = a.category.localeCompare(b.category, 'ja');
      if (cat !== 0) return cat;
      return Number(a.originalNo || 999999) - Number(b.originalNo || 999999);
    });
    return copied;
  }
  if (mode === 'random') {
    for (let i = copied.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copied[i], copied[j]] = [copied[j], copied[i]];
    }
    return copied;
  }
  return sortByOriginal(copied);
}

function applyFilters(keepCurrentId = null) {
  saveSettings();
  const search = els.searchText.value.trim().toLowerCase();
  let items = state.allItems.filter(item => {
    const merged = getEffectiveItem(item);
    if (els.categoryFilter.value !== 'all' && merged.category !== els.categoryFilter.value) return false;
    if (els.tagFilter.value !== 'all' && !merged.tags.includes(els.tagFilter.value)) return false;
    if (els.statusFilter.value === 'ok' && !isOk(merged)) return false;
    if (els.statusFilter.value === 'unlearned' && isOk(merged)) return false;
    if (search) {
      const haystack = [merged.questionEn, merged.answerEn, merged.questionJa, merged.answerJa, merged.category, merged.tagsText]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  items = sortItems(items, els.sortMode.value);
  state.visibleItems = items;

  if (!items.length) {
    state.currentIndex = 0;
    renderStats();
    renderEmptyState();
    return;
  }

  let nextIndex = 0;
  if (keepCurrentId) {
    const foundIndex = items.findIndex(item => item.id === keepCurrentId);
    if (foundIndex >= 0) nextIndex = foundIndex;
  } else if (state.currentIndex < items.length) {
    nextIndex = state.currentIndex;
  }
  state.currentIndex = Math.max(0, Math.min(nextIndex, items.length - 1));
  state.flipped = false;
  renderAll();
}

function renderStats() {
  const total = state.allItems.length;
  const visible = state.visibleItems.length;
  const okCount = state.allItems.filter(isOk).length;
  const okRate = total ? Math.round((okCount / total) * 100) : 0;
  els.totalCount.textContent = String(total);
  els.visibleCount.textContent = String(visible);
  els.okCount.textContent = String(okCount);
  els.okRate.textContent = `${okRate}%`;
  els.progressFill.style.width = `${okRate}%`;
}

function renderEmptyState() {
  els.deckTitle.textContent = '条件に合うカードがありません';
  els.counterText.textContent = '0 / 0';
  els.questionEn.textContent = '表示できるカードがありません';
  els.questionJa.textContent = 'フィルター条件を変更してください。';
  els.answerEn.textContent = '';
  els.answerJa.textContent = '';
  els.categoryBadge.textContent = '—';
  els.statusBadge.textContent = '—';
  els.originalNoBadge.textContent = 'No. —';
  els.tagsList.innerHTML = '';
  els.flashcard.classList.remove('flipped');
  els.cardList.innerHTML = '<div class="empty-state">条件に一致するカードがありません。カテゴリや検索条件を変更してください。</div>';
  els.listSummary.textContent = '0件';
  if (els.speechStatus) els.speechStatus.textContent = '読み上げ対象のカードがありません';
  renderEditor();
}

function resetCardScroll() {
  document.querySelectorAll('.face-body').forEach(section => {
    section.scrollTop = 0;
  });
}

function scrollCardIntoView() {
  if (window.innerWidth > 720 || !els.flashcard) return;
  requestAnimationFrame(() => {
    const top = els.flashcard.getBoundingClientRect().top + window.scrollY - 10;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  });
}

function renderEditor() {
  if (!els.editorPanel) return;
  const item = getCurrentEffectiveItem();
  if (!item) {
    els.editorPanel.classList.add('hidden');
    return;
  }
  els.editorPanel.classList.toggle('hidden', !state.editorOpen);
  if (!state.editorOpen) return;
  els.editAnswerJa.value = item.answerJa || '';
  els.editAnswerEn.value = item.answerEn || '';
  if (els.translateStatus) {
    els.translateStatus.textContent = navigator.onLine
      ? '日本語を編集すると、オンライン時に英語回答へ自動反映します。'
      : 'オフライン中は自動英訳できません。必要に応じて英語欄を直接編集してください。';
  }
}

function renderCard() {
  const item = getCurrentEffectiveItem();
  if (!item) {
    renderEmptyState();
    return;
  }
  const ok = isOk(item);
  els.deckTitle.textContent = item.category || 'カテゴリ未設定';
  els.counterText.textContent = `${state.currentIndex + 1} / ${state.visibleItems.length}`;
  els.questionEn.textContent = item.questionEn || 'No question';
  els.answerEn.textContent = item.answerEn || 'No answer';
  els.questionJa.textContent = els.showJapanese.checked ? item.questionJa || '' : '';
  els.answerJa.textContent = els.showJapanese.checked ? item.answerJa || '' : '';
  els.categoryBadge.textContent = item.category || 'カテゴリなし';
  els.statusBadge.textContent = ok ? 'OK済み' : '未OK';
  els.originalNoBadge.textContent = item.edited ? `No. ${item.originalNo || '—'} / 編集済み` : `No. ${item.originalNo || '—'}`;
  els.okBtn.textContent = ok ? 'OKを解除' : 'このカードをOK';
  els.tagsList.innerHTML = item.tags.length
    ? item.tags.map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')
    : '<span class="tag-pill">タグなし</span>';
  els.flashcard.classList.toggle('flipped', state.flipped);
  resetCardScroll();
  renderEditor();
}

function renderList() {
  els.listSummary.textContent = `${state.visibleItems.length}件`;
  if (!state.visibleItems.length) {
    els.cardList.innerHTML = '<div class="empty-state">表示中のカードはありません。</div>';
    return;
  }

  els.cardList.innerHTML = state.visibleItems.map((item, index) => {
    const merged = getEffectiveItem(item);
    const active = index === state.currentIndex ? 'active' : '';
    const ok = isOk(merged) ? 'ok' : '';
    const editedLabel = merged.edited ? ' / 編集済み' : '';
    return `
      <div class="list-item ${active} ${ok}" data-id="${escapeHtml(merged.id)}">
        <div class="list-item-index">${index + 1}</div>
        <div>
          <h4>${escapeHtml(merged.questionEn)}</h4>
          <p>${escapeHtml(merged.category)} / No.${escapeHtml(merged.originalNo || '—')}${escapeHtml(editedLabel)}</p>
        </div>
        <button type="button" data-jump="${escapeHtml(merged.id)}">開く</button>
      </div>
    `;
  }).join('');

  requestAnimationFrame(() => {
    const activeItem = els.cardList.querySelector('.list-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });
}

function renderAll() {
  renderStats();
  renderCard();
  renderList();
}

function toggleFlip(force) {
  state.flipped = typeof force === 'boolean' ? force : !state.flipped;
  els.flashcard.classList.toggle('flipped', state.flipped);
}

async function translateJapaneseToEnglish(text) {
  const requestId = ++state.translateRequestId;
  const endpoint = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error('translation_failed');
  }
  const data = await response.json();
  if (requestId !== state.translateRequestId) {
    return null;
  }
  const translated = Array.isArray(data?.[0]) ? data[0].map(part => part?.[0] || '').join('') : '';
  return translated.trim();
}

async function runAutoTranslation({ immediate = false } = {}) {
  if (!els.editAnswerJa || !els.editAnswerEn || !els.autoTranslateJaToEn?.checked) return;
  const text = els.editAnswerJa.value.trim();
  if (!text) {
    if (immediate) els.editAnswerEn.value = '';
    return;
  }
  if (!navigator.onLine) {
    if (els.translateStatus) els.translateStatus.textContent = 'オフライン中は自動英訳できません。必要に応じて英語欄を直接編集してください。';
    return;
  }
  try {
    if (els.translateStatus) els.translateStatus.textContent = '日本語から英語へ自動反映中…';
    const translated = await translateJapaneseToEnglish(text);
    if (translated !== null) {
      els.editAnswerEn.value = translated;
      if (els.translateStatus) els.translateStatus.textContent = '英語回答へ自動反映しました。必要に応じて微調整できます。';
    }
  } catch {
    if (els.translateStatus) els.translateStatus.textContent = '自動英訳に失敗しました。英語欄を手動で編集してください。';
  }
}

function scheduleAutoTranslation() {
  clearTimeout(state.translateTimer);
  if (!state.editorOpen || !els.autoTranslateJaToEn?.checked) return;
  state.translateTimer = setTimeout(() => runAutoTranslation(), 650);
}

function buildEditPayload(item, answerJa, answerEn) {
  const trimmedJa = answerJa.trim();
  const trimmedEn = answerEn.trim();
  const sameJa = trimmedJa === (item.answerJa || '').trim();
  const sameEn = trimmedEn === (item.answerEn || '').trim();
  if (sameJa && sameEn) return null;
  return {
    answerJa: trimmedJa,
    answerEn: trimmedEn,
    updatedAt: new Date().toISOString(),
  };
}

async function saveCurrentEdit() {
  const item = getCurrentItem();
  if (!item || !els.editAnswerJa || !els.editAnswerEn) return;
  if (els.autoTranslateJaToEn?.checked) {
    await runAutoTranslation({ immediate: true });
  }
  const payload = buildEditPayload(item, els.editAnswerJa.value, els.editAnswerEn.value);
  if (payload) {
    state.editsMap[item.id] = payload;
  } else {
    delete state.editsMap[item.id];
  }
  saveEditsMap();
  if (els.translateStatus) {
    els.translateStatus.textContent = payload ? '編集を保存しました。' : '元の回答に戻したため、編集内容を解除しました。';
  }
  applyFilters(item.id);
}

function resetCurrentEdit() {
  const item = getCurrentItem();
  if (!item) return;
  delete state.editsMap[item.id];
  saveEditsMap();
  state.translateRequestId += 1;
  if (els.translateStatus) {
    els.translateStatus.textContent = 'このカードの編集を解除しました。';
  }
  applyFilters(item.id);
}

function toggleEditor(force) {
  state.editorOpen = typeof force === 'boolean' ? force : !state.editorOpen;
  els.editorPanel.classList.toggle('hidden', !state.editorOpen);
  if (els.toggleEditorBtn) {
    els.toggleEditorBtn.textContent = state.editorOpen ? '編集を閉じる' : '回答を編集';
  }
  renderEditor();
}

function goToIndex(index) {
  if (!state.visibleItems.length) return;
  stopSpeech();
  state.currentIndex = (index + state.visibleItems.length) % state.visibleItems.length;
  state.flipped = false;
  renderAll();
  scrollCardIntoView();
}

function nextCard() {
  goToIndex(state.currentIndex + 1);
}

function prevCard() {
  goToIndex(state.currentIndex - 1);
}

function toggleOkCurrent() {
  const item = getCurrentItem();
  if (!item) return;
  const willBecomeOk = !isOk(item);
  if (isOk(item)) {
    delete state.okMap[item.id];
  } else {
    state.okMap[item.id] = true;
  }
  saveOkMap();
  const currentId = item.id;
  applyFilters(currentId);
  if (els.autoNext.checked && willBecomeOk && state.visibleItems.length > 1) {
    nextCard();
  }
}

function resetAllOk() {
  const confirmed = window.confirm('すべてのOK状態を解除します。よろしいですか？');
  if (!confirmed) return;
  state.okMap = {};
  saveOkMap();
  applyFilters(getCurrentItem()?.id || null);
}

function randomizeCurrentView() {
  els.sortMode.value = 'random';
  applyFilters(getCurrentItem()?.id || null);
}

function handleFlashcardTouchStart(event) {
  const touch = event.changedTouches?.[0];
  if (!touch) return;
  state.touch.startX = touch.clientX;
  state.touch.startY = touch.clientY;
  state.touch.startTime = Date.now();
}

function handleFlashcardTouchEnd(event) {
  const touch = event.changedTouches?.[0];
  if (!touch) return;
  const dx = touch.clientX - state.touch.startX;
  const dy = touch.clientY - state.touch.startY;
  const elapsed = Date.now() - state.touch.startTime;

  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
    if (dx < 0) nextCard(); else prevCard();
    return;
  }

  if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && elapsed < 300) {
    toggleFlip();
  }
}

function attachEvents() {
  [els.categoryFilter, els.tagFilter, els.statusFilter, els.sortMode].forEach(el => {
    el.addEventListener('change', () => applyFilters(getCurrentItem()?.id || null));
  });
  els.searchText.addEventListener('input', () => applyFilters(getCurrentItem()?.id || null));
  els.showJapanese.addEventListener('change', () => {
    saveSettings();
    renderCard();
  });
  els.autoNext.addEventListener('change', saveSettings);

  els.flipBtn.addEventListener('click', () => toggleFlip());
  els.okBtn.addEventListener('click', toggleOkCurrent);
  els.skipBtn.addEventListener('click', nextCard);
  els.prevBtn.addEventListener('click', prevCard);
  els.nextBtn.addEventListener('click', nextCard);
  els.resetOkBtn.addEventListener('click', resetAllOk);
  els.shuffleBtn.addEventListener('click', randomizeCurrentView);
  els.flashcard.addEventListener('click', () => toggleFlip());
  els.flashcard.addEventListener('touchstart', handleFlashcardTouchStart, { passive: true });
  els.flashcard.addEventListener('touchend', handleFlashcardTouchEnd, { passive: true });

  els.speakQuestionBtn?.addEventListener('click', () => {
    const item = getCurrentEffectiveItem();
    if (item) speakText(item.questionEn, '質問');
  });
  els.speakAnswerBtn?.addEventListener('click', () => {
    const item = getCurrentEffectiveItem();
    if (item) speakText(item.answerEn, '回答');
  });
  els.stopSpeechBtn?.addEventListener('click', stopSpeech);
  els.voiceSelect?.addEventListener('change', saveSettings);
  els.speechRate?.addEventListener('input', saveSettings);

  els.toggleEditorBtn?.addEventListener('click', () => toggleEditor());
  els.saveEditBtn?.addEventListener('click', saveCurrentEdit);
  els.resetEditBtn?.addEventListener('click', resetCurrentEdit);
  els.autoTranslateJaToEn?.addEventListener('change', () => {
    if (els.autoTranslateJaToEn.checked) {
      scheduleAutoTranslation();
    } else if (els.translateStatus) {
      els.translateStatus.textContent = '自動反映をオフにしました。英語欄を手動で編集できます。';
    }
  });
  els.editAnswerJa?.addEventListener('input', scheduleAutoTranslation);

  els.importExcelBtn?.addEventListener('click', importExcelFile);
  els.resetImportedDataBtn?.addEventListener('click', resetImportedDataset);

  els.cardList.addEventListener('click', event => {
    const button = event.target.closest('[data-jump]');
    if (!button) return;
    const id = button.getAttribute('data-jump');
    const index = state.visibleItems.findIndex(item => item.id === id);
    if (index >= 0) goToIndex(index);
  });

  document.addEventListener('keydown', event => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
    if (typing && event.key !== 'Escape') return;

    if (event.code === 'Space') {
      event.preventDefault();
      toggleFlip();
    } else if (event.key === 'ArrowRight') {
      nextCard();
    } else if (event.key === 'ArrowLeft') {
      prevCard();
    } else if (event.key.toLowerCase() === 'o') {
      toggleOkCurrent();
    } else if (event.key.toLowerCase() === 'r') {
      randomizeCurrentView();
    }
  });

  window.addEventListener('online', renderEditor);
  window.addEventListener('offline', renderEditor);
  if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener?.('voiceschanged', populateVoiceOptions);
    populateVoiceOptions();
    setTimeout(populateVoiceOptions, 300);
  }
}

function init() {
  const startingData = state.importedData?.items?.length ? state.importedData : DEFAULT_DATA;
  installDataset(startingData, { imported: Boolean(state.importedData?.items?.length) });
  buildFilters();
  attachEvents();
  applyFilters();
  if (state.importedData?.items?.length && els.importStatus) {
    els.importStatus.textContent = `前回読み込んだExcelの内容（${state.importedData.items.length}件）を復元しました。`;
  }
}

init();
