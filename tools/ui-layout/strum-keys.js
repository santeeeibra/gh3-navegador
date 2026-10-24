// One-time secondary shortcut. Never replace a user's assigned key.
try {
  if (!localStorage.getItem('gh3StrumShortcut.v1')) {
    const saved = JSON.parse(localStorage.getItem('gh3keys') || 'null');
    if (saved && typeof saved === 'object') {
      const row = saved['rasgueo abajo'];
      const used = Object.values(saved).some(keys => Array.isArray(keys) && keys.includes('KeyK'));
      if (Array.isArray(row) && !row[1] && !used) {
        row[1] = 'KeyK';
        localStorage.setItem('gh3keys', JSON.stringify(saved));
      }
    }
    localStorage.setItem('gh3StrumShortcut.v1', '1');
  }
} catch {}
