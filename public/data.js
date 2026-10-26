'use strict';

const els = {
  dataMaterialCount: document.getElementById('dataMaterialCount'),
  dataPeopleCount: document.getElementById('dataPeopleCount'),
  backupCount: document.getElementById('backupCount'),
  createBackup: document.getElementById('createBackup'),
  importBackup: document.getElementById('importBackup'),
  importFile: document.getElementById('importFile'),
  backupSummary: document.getElementById('backupSummary'),
  backupList: document.getElementById('backupList'),
  backupEmpty: document.getElementById('backupEmpty'),
  backupError: document.getElementById('backupError'),
  backupErrorText: document.getElementById('backupErrorText'),
  refreshBackups: document.getElementById('refreshBackups'),
  retryBackups: document.getElementById('retryBackups'),
  resetData: document.getElementById('resetData'),
  confirmDialog: document.getElementById('confirmDialog'),
  confirmKicker: document.getElementById('confirmKicker'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmDetail: document.getElementById('confirmDetail'),
  confirmCancel: document.getElementById('confirmCancel'),
  confirmAlternate: document.getElementById('confirmAlternate'),
  confirmAccept: document.getElementById('confirmAccept'),
  toast: document.getElementById('toast')
};

const state = {
  backups: [],
  stats: { materials: 0, people: 0, topics: 0, keywords: 0 },
  busy: false,
  confirmResolver: null
};

let toastTimer = null;

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : dateFormatter.format(date);
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '大小未知';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function currentTheme() {
  return window.CailinTheme ? window.CailinTheme.current() : 'light';
}

function applyBackupTheme(settings) {
  if (!settings || !window.CailinTheme) return;
  if (settings.theme === 'dark' || settings.theme === 'light') {
    window.CailinTheme.apply(settings.theme, true);
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
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
  let data = null;
  if (type.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    throw new Error((data && data.error) || '请求失败，请稍后重试。');
  }
  return data;
}

function setStats(stats) {
  state.stats = stats || state.stats;
  els.dataMaterialCount.textContent = String(state.stats.materials ?? 0);
  els.dataPeopleCount.textContent = String(state.stats.people ?? 0);
}

function backupMeta(backup) {
  const parts = [
    formatDate(backup.createdAt),
    formatSize(backup.size)
  ];
  if (backup.valid && typeof backup.materialCount === 'number') {
    parts.push(backup.materialCount + ' 则素材');
  } else {
    parts.push('文件无法读取');
  }
  return parts.join(' · ');
}

function makeAction(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', () => onClick(button));
  return button;
}

function renderBackups() {
  els.backupList.replaceChildren();

  if (!state.backups.length) {
    els.backupList.hidden = true;
    els.backupEmpty.hidden = false;
    els.backupSummary.textContent = '共 0 份备份';
    return;
  }

  els.backupEmpty.hidden = true;
  els.backupList.hidden = false;
  els.backupSummary.textContent = '共 ' + state.backups.length + ' 份备份';

  const fragment = document.createDocumentFragment();
  for (const backup of state.backups) {
    const row = document.createElement('article');
    row.className = 'backup-row' + (backup.valid ? '' : ' is-invalid');

    const main = document.createElement('div');
    main.className = 'backup-main';

    const name = document.createElement('h3');
    name.className = 'backup-name';
    name.textContent = backup.name;
    main.appendChild(name);

    const meta = document.createElement('p');
    meta.className = 'backup-meta';
    meta.textContent = backupMeta(backup);
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'backup-actions';

    const download = document.createElement('a');
    download.className = 'backup-action';
    download.href = '/api/backups/' + encodeURIComponent(backup.name) + '/download';
    download.setAttribute('download', backup.name);
    download.textContent = '下载';
    actions.appendChild(download);

    actions.appendChild(makeAction('恢复', 'backup-action', (button) => restoreBackup(backup, button)));
    actions.appendChild(makeAction('删除', 'backup-action is-danger', (button) => deleteBackup(backup, button)));

    row.append(main, actions);
    fragment.appendChild(row);
  }

  els.backupList.appendChild(fragment);
}

async function loadOverview() {
  els.backupError.hidden = true;
  els.backupSummary.textContent = '正在读取备份…';
  try {
    const data = await api('/api/backups');
    state.backups = data.backups || [];
    setStats(data.stats);
    els.backupCount.textContent = String(state.backups.length);
    renderBackups();
  } catch (error) {
    state.backups = [];
    els.backupCount.textContent = '—';
    els.backupSummary.textContent = '备份读取失败';
    els.backupList.hidden = true;
    els.backupEmpty.hidden = true;
    els.backupError.hidden = false;
    els.backupErrorText.textContent = error.message;
  }
}

function runBusy(button, label, task) {
  if (state.busy) return Promise.resolve();
  state.busy = true;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;

  return Promise.resolve()
    .then(task)
    .catch((error) => {
      showToast(error.message || '操作失败，请稍后重试。');
    })
    .finally(() => {
      state.busy = false;
      button.disabled = false;
      button.textContent = original;
    });
}

function openConfirm(options) {
  if (state.confirmResolver) return Promise.resolve(null);

  els.confirmKicker.textContent = options.kicker || '请确认';
  els.confirmTitle.textContent = options.title || '确认操作';
  els.confirmMessage.textContent = options.message || '';
  els.confirmDetail.textContent = options.detail || '';
  els.confirmDetail.hidden = !options.detail;
  els.confirmAccept.textContent = options.acceptLabel || '确认';
  els.confirmAccept.className = 'btn ' + (options.acceptClass || 'btn-primary');

  if (options.alternateLabel) {
    els.confirmAlternate.hidden = false;
    els.confirmAlternate.textContent = options.alternateLabel;
    els.confirmAlternate.className = 'btn ' + (options.alternateClass || 'btn-danger');
  } else {
    els.confirmAlternate.hidden = true;
    els.confirmAlternate.textContent = '';
  }

  els.confirmDialog.showModal();
  return new Promise((resolve) => {
    state.confirmResolver = resolve;
  });
}

function settleConfirm(value) {
  if (!state.confirmResolver) return;
  const resolve = state.confirmResolver;
  state.confirmResolver = null;
  els.confirmDialog.close();
  resolve(value);
}

async function createBackup() {
  if (state.busy) return;
  await runBusy(els.createBackup, '正在备份…', async () => {
    const data = await api('/api/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: currentTheme() })
    });
    showToast('备份已生成：' + data.backup.name);
    await loadOverview();
  });
}

async function restoreBackup(backup, button) {
  if (state.busy) return;
  const choice = await openConfirm({
    kicker: '恢复备份',
    title: '用这份备份覆盖当前数据？',
    message: '当前全部素材会被这份备份中的内容替换，恢复后不能撤销。',
    detail: backup.name + '\n' + backupMeta(backup),
    acceptLabel: '覆盖并恢复',
    acceptClass: 'btn-danger-solid'
  });
  if (choice !== 'accept') return;

  await runBusy(button || els.refreshBackups, '正在恢复…', async () => {
    const result = await api('/api/backups/' + encodeURIComponent(backup.name) + '/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true })
    });
    applyBackupTheme(result.settings);
    showToast('已恢复 ' + result.materialCount + ' 则素材');
    await loadOverview();
  });
}

async function deleteBackup(backup, button) {
  if (state.busy) return;
  const choice = await openConfirm({
    kicker: '删除备份',
    title: '删除这份备份文件？',
    message: '文件会从服务器 backup 文件夹中删除，删除后不能恢复。',
    detail: backup.name,
    acceptLabel: '删除备份',
    acceptClass: 'btn-danger-solid'
  });
  if (choice !== 'accept') return;

  await runBusy(button || els.refreshBackups, '正在删除…', async () => {
    await api('/api/backups/' + encodeURIComponent(backup.name), { method: 'DELETE' });
    showToast('备份已删除');
    await loadOverview();
  });
}

async function resetData() {
  if (state.busy) return;
  const choice = await openConfirm({
    kicker: '恢复初始设置',
    title: '清空素材，恢复内置模板？',
    message: '当前所有素材会被清空，并重新加入内置的 8 则模板素材。此操作不会删除已经生成的备份文件。',
    detail: '建议先在上方生成一份备份，再执行恢复。',
    acceptLabel: '清空并恢复',
    acceptClass: 'btn-danger-solid'
  });
  if (choice !== 'accept') return;

  await runBusy(els.resetData, '正在恢复…', async () => {
    const result = await api('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true })
    });
    showToast('已恢复 ' + result.materialCount + ' 则内置素材');
    await loadOverview();
  });
}

async function importSelectedFile(file) {
  if (state.busy) return;

  if (!/\.zip$/i.test(file.name)) {
    showToast('请选择 zip 格式的备份文件');
    return;
  }
  if (file.size > 24 * 1024 * 1024) {
    showToast('备份文件过大，最大支持 24 MB');
    return;
  }

  const start = await openConfirm({
    kicker: '导入备份',
    title: '覆盖当前全部素材？',
    message: '导入会用备份中的内容替换当前全部素材。读取备份后，还会检查是否存在完全相同的素材。',
    detail: file.name + '\n' + formatSize(file.size),
    acceptLabel: '继续导入',
    acceptClass: 'btn-primary'
  });
  if (start !== 'accept') return;

  await runBusy(els.importBackup, '正在读取备份…', async () => {
    const form = new FormData();
    form.append('file', file, file.name);
    const preview = await api('/api/import/preview', { method: 'POST', body: form });

    let mode = 'overwrite';
    if (preview.duplicateCount > 0) {
      const people = preview.duplicatePeople || [];
      const detail = (people.length ? '涉及：' + people.join('、') + '。' : '') +
        '合并导入会保留当前素材，只加入与备份不一致的内容；仍然覆盖会清空当前素材，全部使用备份内容。';
      const choice = await openConfirm({
        kicker: '发现重复素材',
        title: '合并，还是覆盖？',
        message: '备份中有 ' + preview.duplicateCount + ' 则素材与当前素材完全相同。',
        detail,
        acceptLabel: '合并导入',
        acceptClass: 'btn-primary',
        alternateLabel: '仍然覆盖',
        alternateClass: 'btn-danger'
      });

      if (!choice) {
        await api('/api/import/preview/' + preview.token, { method: 'DELETE' }).catch(() => {});
        showToast('已取消导入');
        return;
      }
      mode = choice === 'alternate' ? 'overwrite' : 'merge';
    }

    const result = await api('/api/import/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: preview.token, mode })
    });

    applyBackupTheme(result.settings);
    if (mode === 'merge') {
      showToast('已合并导入 ' + result.added + ' 则素材，跳过 ' + result.skipped + ' 则重复素材');
    } else {
      showToast('已覆盖导入 ' + result.materialCount + ' 则素材');
    }
    await loadOverview();
  });
}

els.createBackup.addEventListener('click', createBackup);
els.importBackup.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', () => {
  const file = els.importFile.files && els.importFile.files[0];
  els.importFile.value = '';
  if (file) importSelectedFile(file);
});
els.refreshBackups.addEventListener('click', loadOverview);
els.retryBackups.addEventListener('click', loadOverview);
els.resetData.addEventListener('click', resetData);
els.confirmAccept.addEventListener('click', () => settleConfirm('accept'));
els.confirmAlternate.addEventListener('click', () => settleConfirm('alternate'));
els.confirmCancel.addEventListener('click', () => settleConfirm(null));
els.confirmDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  settleConfirm(null);
});
els.confirmDialog.addEventListener('close', () => {
  if (!state.confirmResolver) return;
  const resolve = state.confirmResolver;
  state.confirmResolver = null;
  resolve(null);
});

loadOverview();
