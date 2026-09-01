const list = document.querySelector('#alarm-list');
const template = document.querySelector('#alarm-template');
const empty = document.querySelector('#empty-state');
const count = document.querySelector('#alarm-count');
const dialog = document.querySelector('#ring-dialog');
let alarms = JSON.parse(localStorage.getItem('night-alarm-list') || '[]');
let audioContext, alarmOscillator, alarmTimer, lastMinute = '', customAudio, customAudioUrl, customSoundName = localStorage.getItem('night-alarm-sound-name') || '';

function save() { localStorage.setItem('night-alarm-list', JSON.stringify(alarms)); }
function makeAlarm() { return { id: crypto.randomUUID(), time: '07:00', label: '', days: [], enabled: true, volume: 80 }; }
function formatDate(d) { return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(d); }
function updateClock() { const now = new Date(); document.querySelector('#clock').textContent = now.toLocaleTimeString('zh-TW', { hour12: false }); document.querySelector('#date').textContent = formatDate(now); checkAlarms(now); }
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400); }
function soundDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.open('night-alarm-sounds', 1); request.onupgradeneeded = () => request.result.createObjectStore('sounds'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function storeSound(file) { const db = await soundDatabase(); await new Promise((resolve, reject) => { const tx = db.transaction('sounds', 'readwrite'); tx.objectStore('sounds').put(file, 'custom'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function getStoredSound() { const db = await soundDatabase(); return new Promise((resolve, reject) => { const request = db.transaction('sounds').objectStore('sounds').get('custom'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function removeStoredSound() { const db = await soundDatabase(); return new Promise((resolve, reject) => { const tx = db.transaction('sounds', 'readwrite'); tx.objectStore('sounds').delete('custom'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
function useCustomSound(file) { customAudio?.pause(); if (customAudioUrl) URL.revokeObjectURL(customAudioUrl); customAudioUrl = URL.createObjectURL(file); customAudio = new Audio(customAudioUrl); customAudio.loop = true; }
function updateSoundUi() { const hasCustom = Boolean(customAudio); document.querySelector('#sound-name').textContent = hasCustom ? `自訂鈴聲：${customSoundName}` : '目前使用內建鈴聲'; document.querySelector('#remove-sound').hidden = !hasCustom; }
async function loadCustomSound() { try { const file = await getStoredSound(); if (file) useCustomSound(file); updateSoundUi(); } catch { updateSoundUi(); } }
function render() {
  list.innerHTML = '';
  alarms.forEach((alarm) => {
    const node = template.content.cloneNode(true); const card = node.querySelector('.alarm-card');
    const enabled = node.querySelector('.enabled'), time = node.querySelector('.alarm-time'), label = node.querySelector('.alarm-label');
    const volume = node.querySelector('.alarm-volume');
    enabled.checked = alarm.enabled; time.value = alarm.time; label.value = alarm.label; volume.value = alarm.volume ?? 80;
    node.querySelectorAll('.days input').forEach((input) => { input.checked = alarm.days.includes(Number(input.value)); input.addEventListener('change', () => { alarm.days = [...card.querySelectorAll('.days input:checked')].map(x => Number(x.value)); save(); }); });
    enabled.addEventListener('change', () => { alarm.enabled = enabled.checked; save(); render(); });
    time.addEventListener('change', () => { alarm.time = time.value; save(); });
    label.addEventListener('input', () => { alarm.label = label.value; save(); });
    volume.addEventListener('input', () => { alarm.volume = Number(volume.value); save(); });
    node.querySelector('.delete').addEventListener('click', () => { alarms = alarms.filter(x => x.id !== alarm.id); save(); render(); });
    list.append(node);
  });
  empty.hidden = alarms.length > 0; const enabledCount = alarms.filter(x => x.enabled).length; count.textContent = `${enabledCount} 個已啟用`;
}
async function unlockAudio() { try { audioContext ??= new AudioContext(); await audioContext.resume(); showToast('鈴聲已啟用'); } catch { showToast('瀏覽器無法啟用鈴聲'); } }
async function playSound(volume = 80) { const level = Math.max(0, Math.min(100, volume)) / 100; clearInterval(alarmTimer); if (customAudio) { customAudio.currentTime = 0; customAudio.volume = level; try { await customAudio.play(); } catch { showToast('請先按「啟用鈴聲」再試一次'); } return; } await unlockAudio(); if (!audioContext) return; const playTone = () => { const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioContext.currentTime); osc.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + .34); gain.gain.setValueAtTime(.001, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.18 * level, audioContext.currentTime + .02); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .36); osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + .38); alarmOscillator = osc; }; playTone(); alarmTimer = setInterval(playTone, 650); }
function stopSound() { clearInterval(alarmTimer); alarmOscillator?.stop(); customAudio?.pause(); if (dialog.open) dialog.close(); }
async function ring(alarm) { document.querySelector('#ring-title').textContent = alarm.label || '鬧鐘時間到了'; document.querySelector('#ring-time').textContent = alarm.time; dialog.showModal(); await playSound(alarm.volume ?? 80); }
function checkAlarms(now) { const minute = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}:${now.getMinutes()}`; if (minute === lastMinute) return; lastMinute = minute; const day = now.getDay(), time = now.toTimeString().slice(0, 5); alarms.filter(a => a.enabled && a.time === time && (!a.days.length || a.days.includes(day))).forEach(ring); }
document.querySelector('#add-alarm').addEventListener('click', () => { alarms.push(makeAlarm()); save(); render(); document.querySelector('.alarm-card:last-child .alarm-time').focus(); });
document.querySelector('#enable-sound').addEventListener('click', unlockAudio);
document.querySelector('#sound-file').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; if (!file.type.startsWith('audio/')) { showToast('請選擇音訊檔案'); return; } try { await storeSound(file); customSoundName = file.name; localStorage.setItem('night-alarm-sound-name', customSoundName); useCustomSound(file); updateSoundUi(); showToast('已匯入自訂鈴聲'); } catch { showToast('鈴聲儲存失敗，請選擇較小的檔案'); } finally { event.target.value = ''; } });
document.querySelector('#preview-sound').addEventListener('click', () => { if (customAudio) { customAudio.currentTime = 0; customAudio.play().catch(() => showToast('請先按「啟用鈴聲」再試一次')); setTimeout(() => customAudio?.pause(), 6000); } else { playSound(); setTimeout(stopSound, 4000); } });
document.querySelector('#remove-sound').addEventListener('click', async () => { try { await removeStoredSound(); customAudio?.pause(); if (customAudioUrl) URL.revokeObjectURL(customAudioUrl); customAudio = undefined; customAudioUrl = undefined; customSoundName = ''; localStorage.removeItem('night-alarm-sound-name'); updateSoundUi(); showToast('已切換回內建鈴聲'); } catch { showToast('移除鈴聲時發生問題'); } });
document.querySelector('#stop-alarm').addEventListener('click', stopSound);
dialog.addEventListener('close', stopSound);
if (!alarms.length) { alarms = [{ ...makeAlarm(), time: '07:00', label: '早安', days: [1, 2, 3, 4, 5] }]; save(); }
render(); loadCustomSound(); updateClock(); setInterval(updateClock, 1000);

