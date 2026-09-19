const map = L.map('map', { zoomControl: false, preferCanvas: true, zoomAnimation: true, fadeAnimation: true }).setView([22.5726, 88.3639], 12);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 2, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const markerIndex = new Map();
let allRows = [];
let statusFilter = 'all';
let statusTargetKey = '';
const elements = { search: document.querySelector('#search'), theme: document.querySelector('#theme-filter'), chips: document.querySelector('#theme-chips'), table: document.querySelector('#pandal-table-body'), status: document.querySelector('#status'), modal: document.querySelector('#poi-modal'), form: document.querySelector('#poi-form'), mapLink: document.querySelector('#poi-map-link'), lat: document.querySelector('#poi-lat'), lon: document.querySelector('#poi-lon'), statusModal: document.querySelector('#status-modal'), commentForm: document.querySelector('#comment-form'), comments: document.querySelector('#comments-list') };

function valueFrom(row, names) {
  const key = Object.keys(row).find((item) => names.includes(item.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')));
  return key ? String(row[key] ?? '').trim() : '';
}

function parseCsv(csv) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index += 1; }
      else { quoted = !quoted; }
    } else if (character === ',' && !quoted) {
      record.push(field); field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      record.push(field); field = '';
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
    } else {
      field += character;
    }
  }
  if (field || record.length) { record.push(field); records.push(record); }
  const headers = records.shift().map((header) => header.trim());
  return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function normalizeRows(rows) {
  return rows.map((row) => ({
    pandal_name: valueFrom(row, ['pandal_name', 'pandal', 'name', 'pandal_name_']),
    latitude: valueFrom(row, ['latitude', 'lat', 'y']),
    longitude: valueFrom(row, ['longitude', 'lon', 'lng', 'long', 'x']),
    theme: valueFrom(row, ['theme', 'theme_name', 'theme_name_', 'theme_2026']) || 'Uncategorised',
    address: valueFrom(row, ['address', 'location', 'area', 'landmark']) || 'Address not provided'
  })).filter((row) => row.pandal_name && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));
}

function markerIcon(completed) { const color = completed ? '#20935e' : '#d9274f'; return L.divIcon({ className: 'custom-marker', html: `<span style="display:block;width:15px;height:15px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 1px 6px #555"></span>`, iconSize: [15, 15], iconAnchor: [7, 7] }); }
function populateThemes() {
  const current = elements.theme.value;
  const themes = [...new Set(allRows.map((row) => row.theme))].sort();
  elements.theme.innerHTML = '<option value="all">All themes</option>' + themes.map((theme) => `<option value="${escapeHtml(theme)}">${escapeHtml(theme)}</option>`).join('');
  elements.theme.value = themes.includes(current) ? current : 'all';
  const chipThemes = themes.slice(0, 5);
  elements.chips.innerHTML = '<button class="chip selected" data-theme="all">All</button>' + chipThemes.map((theme) => `<button class="chip" data-theme="${escapeHtml(theme)}">${escapeHtml(theme)}</button>`).join('');
  elements.chips.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => { elements.theme.value = chip.dataset.theme; elements.chips.querySelectorAll('.chip').forEach((item) => item.classList.toggle('selected', item === chip)); render(); }));
}
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function render() {
  const query = elements.search.value.toLowerCase().trim();
  const selectedTheme = elements.theme.value;
  markerLayer.clearLayers();
  markerIndex.clear();
  const visible = allRows.filter((row) => (selectedTheme === 'all' || row.theme === selectedTheme) && (statusFilter === 'all' || (statusFilter === 'completed') === isCompleted(row)) && [row.pandal_name, row.theme, row.address].join(' ').toLowerCase().includes(query));
  visible.forEach((row) => {
    const marker = L.marker([Number(row.latitude), Number(row.longitude)], { icon: markerIcon(isCompleted(row)) });
    marker.bindPopup(`<div class="popup-kicker">Puja Organizer</div><div class="popup-title">${escapeHtml(row.pandal_name)}</div><div class="popup-theme">Theme Name: ${escapeHtml(row.theme)}</div><p class="popup-address">${escapeHtml(row.address)}</p>`);
    marker.addTo(markerLayer);
    marker.on('dblclick', (event) => { L.DomEvent.stopPropagation(event); openStatusModal(rowKey(row)); });
    markerIndex.set(`${row.latitude}|${row.longitude}`, marker);
  });
  elements.table.innerHTML = visible.slice(0, 12).map((row, index) => { const completed = isCompleted(row); return `<tr class="table-row" data-key="${row.latitude}|${row.longitude}"><td>${index + 1}</td><td>${escapeHtml(row.pandal_name)}</td><td>${escapeHtml(row.theme)}</td><td>${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}</td><td>${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}</td><td>${escapeHtml(row.address)}</td><td><button class="visit-button ${completed ? 'completed' : 'pending'}" data-status-key="${row.latitude}|${row.longitude}" type="button">${completed ? 'Completed' : 'Pending'}</button></td></tr>`; }).join('');
  elements.table.querySelectorAll('.table-row').forEach((item) => { item.addEventListener('click', () => selectLocation(item.dataset.key)); item.addEventListener('dblclick', () => openStatusModal(item.dataset.key)); });
  elements.table.querySelectorAll('.visit-button').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); toggleStatus(button.dataset.statusKey); }));
}

function selectLocation(key) {
  const marker = markerIndex.get(key);
  if (!marker) return;
  const position = marker.getLatLng();
  map.setView(position, 16, { animate: true });
  marker.openPopup();
}
function savedPois() { try { return JSON.parse(localStorage.getItem('pandal-yatra-pois') || '[]'); } catch { return []; } }
function savePois(pois) { try { localStorage.setItem('pandal-yatra-pois', JSON.stringify(pois)); } catch { } }
function savedComments() { try { return JSON.parse(localStorage.getItem('pandal-yatra-comments') || '[]'); } catch { return []; } }
function saveComments(comments) { try { localStorage.setItem('pandal-yatra-comments', JSON.stringify(comments)); } catch { } }
function savedStatuses() { try { return JSON.parse(localStorage.getItem('pandal-yatra-statuses') || '{}'); } catch { return {}; } }
function saveStatuses(statuses) { try { localStorage.setItem('pandal-yatra-statuses', JSON.stringify(statuses)); } catch { } }
function rowKey(row) { return `${row.latitude}|${row.longitude}`; }
function isCompleted(row) { return savedStatuses()[rowKey(row)] === 'completed'; }
function toggleStatus(key) { const statuses = savedStatuses(); statuses[key] = statuses[key] === 'completed' ? 'pending' : 'completed'; saveStatuses(statuses); render(); }
function openStatusModal(key) { statusTargetKey = key; elements.statusModal.hidden = false; }
function closeStatusModal() { elements.statusModal.hidden = true; statusTargetKey = ''; }
function setVisitStatus(status) { if (!statusTargetKey) return; const statuses = savedStatuses(); statuses[statusTargetKey] = status; saveStatuses(statuses); closeStatusModal(); render(); }
function renderComments() { elements.comments.innerHTML = savedComments().slice(-4).reverse().map((comment) => `<article class="comment-card"><strong>${escapeHtml(comment.name || 'Community member')}</strong><p>${escapeHtml(comment.text)}</p></article>`).join(''); }
function openPoiForm(position) { elements.modal.hidden = false; if (position) { elements.lat.value = position.lat.toFixed(6); elements.lon.value = position.lng.toFixed(6); } }
function closePoiForm() { elements.modal.hidden = true; elements.form.reset(); }
function coordinatesFromLink(value) {
  const text = value.trim();
  const patterns = [/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,/[?&](?:q|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/];
  for (const pattern of patterns) { const match = text.match(pattern); if (match) return { latitude: match[1], longitude: match[2] }; }
  const plain = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return plain ? { latitude: plain[1], longitude: plain[2] } : null;
}
function loadRows(rows, message) { allRows = normalizeRows(rows).concat(normalizeRows(savedPois())); populateThemes(); render(); elements.status.textContent = `${allRows.length} valid location${allRows.length === 1 ? '' : 's'} loaded · ${message}`; if (allRows.length) map.fitBounds(L.latLngBounds(allRows.map((row) => [Number(row.latitude), Number(row.longitude)])), { padding: [35, 35], maxZoom: 14 }); setTimeout(() => map.invalidateSize({ pan: false }), 100); }

elements.search.addEventListener('input', render);
elements.theme.addEventListener('change', render);
document.querySelectorAll('[data-status-filter]').forEach((button) => button.addEventListener('click', () => { statusFilter = button.dataset.statusFilter; document.querySelectorAll('[data-status-filter]').forEach((item) => item.classList.toggle('active', item === button)); render(); }));
elements.mapLink.addEventListener('input', () => { const coordinates = coordinatesFromLink(elements.mapLink.value); if (coordinates) { elements.lat.value = coordinates.latitude; elements.lon.value = coordinates.longitude; } });
elements.commentForm.addEventListener('submit', (event) => { event.preventDefault(); const formData = new FormData(elements.commentForm); const comments = savedComments(); comments.push({ name: String(formData.get('commentName')).trim(), text: String(formData.get('commentText')).trim() }); saveComments(comments); elements.commentForm.reset(); renderComments(); });
renderComments();
window.addEventListener('resize', () => map.invalidateSize({ pan: false }));
window.addEventListener('load', () => map.invalidateSize({ pan: false }));
document.querySelector('#open-add-poi').addEventListener('click', () => openPoiForm());
document.querySelector('#close-add-poi').addEventListener('click', closePoiForm);
document.querySelector('#cancel-add-poi').addEventListener('click', closePoiForm);
elements.modal.addEventListener('click', (event) => { if (event.target === elements.modal) closePoiForm(); });
document.querySelector('#close-status-modal').addEventListener('click', closeStatusModal);
elements.statusModal.addEventListener('click', (event) => { if (event.target === elements.statusModal) closeStatusModal(); });
document.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => setVisitStatus(button.dataset.choice)));
map.on('click', (event) => openPoiForm(event.latlng));
elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const poi = { pandal_name: String(formData.get('name')).trim(), theme: String(formData.get('theme')).trim() || 'Uncategorised', address: String(formData.get('address')).trim() || 'Address not provided', latitude: String(formData.get('latitude')).trim(), longitude: String(formData.get('longitude')).trim() };
  if (!poi.pandal_name || !Number.isFinite(Number(poi.latitude)) || !Number.isFinite(Number(poi.longitude))) return;
  const pois = savedPois(); pois.push(poi); savePois(pois); allRows.push(poi); populateThemes(); render(); closePoiForm(); const marker = markerIndex.get(`${poi.latitude}|${poi.longitude}`); if (marker) { map.setView([Number(poi.latitude), Number(poi.longitude)], 16, { animate: true }); marker.openPopup(); }
});

fetch('pandal-data.csv?v=20260919')
  .then((response) => { if (!response.ok) throw new Error('Bundled CSV was not found'); return response.text(); })
  .then((csv) => loadRows(parseCsv(csv), 'your supplied CSV'))
  .catch(() => loadRows(parseCsv(window.pandalCsv), 'your supplied CSV'));
