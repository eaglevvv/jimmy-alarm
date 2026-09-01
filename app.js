const list = document.querySelector('#alarm-list'), template = document.querySelector('#alarm-template'), empty = document.querySelector('#empty-state'), count = document.querySelector('#alarm-count'), dialog = document.querySelector('#ring-dialog'), timeDialog = document.querySelector('#time-dialog'), hourSelect = document.querySelector('#picker-hour'), minuteSelect = document.querySelector('#picker-minute'), hourMenu = document.querySelector('#picker-hour-menu'), minuteMenu = document.querySelector('#picker-minute-menu'), librarySelect = document.querySelector('#sound-library');
let alarms = JSON.parse(localStorage.getItem('night-alarm-list') || '[]'), soundLibrary = JSON.parse(localStorage.getItem('night-alarm-sound-library') || '[]');
let audioContext, alarmOscillator, alarmTimer, lastMinute = '', playingAudio, playingAudioUrl, editingAlarm, selectedHour = '00', selectedMinute = '00';

const save = () => localStorage.setItem('night-alarm-list', JSON.stringify(alarms));
const saveLibrary = () => localStorage.setItem('night-alarm-sound-library', JSON.stringify(soundLibrary));
const sortAlarms = () => alarms.sort((a, b) => a.time.localeCompare(b.time));
const makeAlarm = () => ({ id: crypto.randomUUID(), time: '00:00', label: '', enabled: true, volume: 80, soundId: 'builtin' });
const escapeHtml = (value) => { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; };
const timeOptions = (limit) => Array.from({ length: limit }, (_, value) => { const time = String(value).padStart(2, '0'); return `<button type="button" role="option" data-time="${time}">${time}</button>`; }).join('');
function formatDate(d) { return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(d); }
function formatCountdown(time, now) { const [hour, minute] = time.split(':').map(Number); const next = new Date(now); next.setHours(hour, minute, 0, 0); if (next <= now) next.setDate(next.getDate() + 1); const seconds = Math.floor((next - now) / 1000); return `倒數 ${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function updateCountdowns(now) { document.querySelectorAll('.alarm-countdown[data-alarm-id]').forEach(element => { const alarm = alarms.find(item => item.id === element.dataset.alarmId); element.textContent = alarm?.enabled ? formatCountdown(alarm.time, now) : '已關閉'; }); }
function updateClock() { const now = new Date(); document.querySelector('#clock').textContent = now.toLocaleTimeString('zh-TW', { hour12: false }); document.querySelector('#date').textContent = formatDate(now); updateCountdowns(now); checkAlarms(now); }
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400); }

function soundDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.open('night-alarm-sounds', 1); request.onupgradeneeded = () => request.result.createObjectStore('sounds'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function saveSound(id, file) { const db = await soundDatabase(); await new Promise((resolve, reject) => { const tx = db.transaction('sounds', 'readwrite'); tx.objectStore('sounds').put(file, id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function getSound(id) { const db = await soundDatabase(); return new Promise((resolve, reject) => { const request = db.transaction('sounds').objectStore('sounds').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function deleteSound(id) { const db = await soundDatabase(); await new Promise((resolve, reject) => { const tx = db.transaction('sounds', 'readwrite'); tx.objectStore('sounds').delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function migrateLegacySound() {
  try {
    const legacySound = await getSound('custom');
    if (!legacySound || soundLibrary.length >= 5) return;
    const sound = { id: crypto.randomUUID(), name: localStorage.getItem('night-alarm-sound-name') || '已匯入鈴聲' };
    await saveSound(sound.id, legacySound);
    await deleteSound('custom');
    soundLibrary.push(sound);
    saveLibrary();
  } catch { /* The browser may have no previous sound to migrate. */ }
}
function soundOptions(selected = 'builtin') { return ['<option value="builtin">內建鈴聲</option>', ...soundLibrary.map(sound => `<option value="${sound.id}" ${sound.id === selected ? 'selected' : ''}>${escapeHtml(sound.name)}</option>`)].join(''); }
function updateSoundUi() { librarySelect.innerHTML = soundOptions(librarySelect.value || 'builtin'); document.querySelector('#sound-name').textContent = soundLibrary.length ? `已儲存 ${soundLibrary.length} / 5 組鈴聲` : '可儲存最多 5 組自訂鈴聲'; document.querySelector('#remove-sound').hidden = librarySelect.value === 'builtin'; }

function render() {
  sortAlarms(); list.innerHTML = '';
  alarms.forEach((alarm) => {
    const node = template.content.cloneNode(true), card = node.querySelector('.alarm-card'), enabled = node.querySelector('.enabled'), timeButton = node.querySelector('.time-picker-button'), timeDisplay = node.querySelector('.alarm-time-display'), countdown = node.querySelector('.alarm-countdown'), label = node.querySelector('.alarm-label'), volume = node.querySelector('.alarm-volume'), sound = node.querySelector('.alarm-sound');
    enabled.checked = alarm.enabled; timeDisplay.value = alarm.time; label.value = alarm.label; volume.value = alarm.volume ?? 80; sound.innerHTML = soundOptions(alarm.soundId || 'builtin');
    countdown.dataset.alarmId = alarm.id;
    enabled.addEventListener('change', () => { alarm.enabled = enabled.checked; save(); render(); });
    timeButton.addEventListener('click', () => { editingAlarm = alarm; [selectedHour, selectedMinute] = alarm.time.split(':'); hourSelect.textContent = selectedHour; minuteSelect.textContent = selectedMinute; timeDialog.showModal(); });
    label.addEventListener('input', () => { alarm.label = label.value; save(); }); volume.addEventListener('input', () => { alarm.volume = Number(volume.value); save(); }); sound.addEventListener('change', () => { alarm.soundId = sound.value; save(); });
    node.querySelector('.delete').addEventListener('click', () => { alarms = alarms.filter(x => x.id !== alarm.id); save(); render(); }); list.append(node);
  });
  empty.hidden = alarms.length > 0; count.textContent = `${alarms.filter(x => x.enabled).length} 個已啟用`; updateSoundUi();
}

async function unlockAudio() { try { audioContext ??= new AudioContext(); await audioContext.resume(); } catch { showToast('瀏覽器無法播放鈴聲'); } }
async function playSound(volume = 80, soundId = 'builtin') {
  const level = Math.max(0, Math.min(100, volume)) / 100; stopPlayback();
  if (soundId !== 'builtin') try { const file = await getSound(soundId); if (file) { playingAudioUrl = URL.createObjectURL(file); playingAudio = new Audio(playingAudioUrl); playingAudio.loop = true; playingAudio.volume = level; await playingAudio.play(); return; } } catch { /* use the built-in tone */ }
  await unlockAudio(); if (!audioContext) return;
  const playTone = () => { const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioContext.currentTime); osc.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + .34); gain.gain.setValueAtTime(.001, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.18 * level, audioContext.currentTime + .02); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .36); osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + .38); alarmOscillator = osc; };
  playTone(); alarmTimer = setInterval(playTone, 650);
}
function stopPlayback() { clearInterval(alarmTimer); try { alarmOscillator?.stop(); } catch {} playingAudio?.pause(); if (playingAudioUrl) URL.revokeObjectURL(playingAudioUrl); playingAudio = undefined; playingAudioUrl = undefined; }
function stopSound() { stopPlayback(); if (dialog.open) dialog.close(); }
async function ring(alarm) { document.querySelector('#ring-title').textContent = alarm.label || '鬧鐘時間到了'; document.querySelector('#ring-time').textContent = alarm.time; dialog.showModal(); await playSound(alarm.volume ?? 80, alarm.soundId || 'builtin'); }
function checkAlarms(now) { const minute = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}:${now.getMinutes()}`; if (minute === lastMinute) return; lastMinute = minute; const time = now.toTimeString().slice(0, 5); alarms.filter(a => a.enabled && a.time === time).forEach(ring); }

document.querySelector('#add-alarm').addEventListener('click', () => { alarms.push(makeAlarm()); sortAlarms(); save(); render(); document.querySelector('.alarm-card:last-child .time-picker-button').focus(); });
document.querySelector('#sound-file').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; if (!file.type.startsWith('audio/')) { showToast('請選擇音訊檔案'); return; } if (soundLibrary.length >= 5) { showToast('鈴聲庫最多可儲存 5 組，請先移除一組'); event.target.value = ''; return; } try { const sound = { id: crypto.randomUUID(), name: file.name }; await saveSound(sound.id, file); soundLibrary.push(sound); saveLibrary(); render(); librarySelect.value = sound.id; updateSoundUi(); showToast('已新增至鈴聲庫'); } catch { showToast('鈴聲儲存失敗，請選擇較小的檔案'); } finally { event.target.value = ''; } });
librarySelect.addEventListener('change', updateSoundUi);
document.querySelector('#preview-sound').addEventListener('click', () => { playSound(80, librarySelect.value); setTimeout(stopSound, 6000); });
document.querySelector('#remove-sound').addEventListener('click', async () => { const id = librarySelect.value; if (id === 'builtin') return; try { await deleteSound(id); soundLibrary = soundLibrary.filter(sound => sound.id !== id); alarms.forEach(alarm => { if (alarm.soundId === id) alarm.soundId = 'builtin'; }); saveLibrary(); save(); librarySelect.value = 'builtin'; render(); showToast('已移除鈴聲，使用它的鬧鐘已改回內建鈴聲'); } catch { showToast('移除鈴聲時發生問題'); } });
document.querySelector('#stop-alarm').addEventListener('click', stopSound); dialog.addEventListener('close', stopSound);
hourMenu.innerHTML = timeOptions(24); minuteMenu.innerHTML = timeOptions(60);
function closeTimeMenus() { [hourSelect, minuteSelect].forEach(button => button.setAttribute('aria-expanded', 'false')); [hourMenu, minuteMenu].forEach(menu => { menu.hidden = true; }); }
function toggleTimeMenu(button, menu) { const open = menu.hidden; closeTimeMenus(); menu.hidden = !open; button.setAttribute('aria-expanded', String(open)); }
hourSelect.addEventListener('click', () => toggleTimeMenu(hourSelect, hourMenu));
minuteSelect.addEventListener('click', () => toggleTimeMenu(minuteSelect, minuteMenu));
hourMenu.addEventListener('click', event => { const option = event.target.closest('[data-time]'); if (!option) return; selectedHour = option.dataset.time; hourSelect.textContent = selectedHour; closeTimeMenus(); });
minuteMenu.addEventListener('click', event => { const option = event.target.closest('[data-time]'); if (!option) return; selectedMinute = option.dataset.time; minuteSelect.textContent = selectedMinute; closeTimeMenus(); });
timeDialog.addEventListener('close', () => { closeTimeMenus(); if (timeDialog.returnValue === 'default' && editingAlarm) { editingAlarm.time = `${selectedHour}:${selectedMinute}`; sortAlarms(); save(); render(); } editingAlarm = undefined; });
alarms.forEach(alarm => { delete alarm.days; });
if (!alarms.length) { alarms = [{ ...makeAlarm(), time: '00:00', label: '早安' }]; save(); }
sortAlarms(); save(); render(); migrateLegacySound().then(render); updateClock(); setInterval(updateClock, 1000);
