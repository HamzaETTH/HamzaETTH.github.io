const SVG_NS = 'http://www.w3.org/2000/svg';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className, text) {
  const node = element('button', className, text);
  node.type = 'button';
  return node;
}

function preview(preset, viewport) {
  const resolved = window.GravityWellPresets.resolve(preset.id, viewport);
  const svg = document.createElementNS(SVG_NS, 'svg');
  const minX = Math.min(...resolved.wells.map(well => well.x - well.radius));
  const minY = Math.min(...resolved.wells.map(well => well.y - well.radius));
  const maxX = Math.max(...resolved.wells.map(well => well.x + well.radius));
  const maxY = Math.max(...resolved.wells.map(well => well.y + well.radius));
  const padding = Math.max(maxX - minX, maxY - minY) * 0.12;
  svg.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const well of resolved.wells) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', well.x);
    circle.setAttribute('cy', well.y);
    circle.setAttribute('r', well.radius);
    circle.setAttribute('class', `well-preset-dot well-preset-dot-${well.type}`);
    circle.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(circle);
  }
  return svg;
}

export function createGravityWellPresetBrowser(pn) {
  const catalogue = window.GravityWellPresets;
  const dialog = element('dialog', 'well-preset-browser');
  dialog.id = 'well-preset-browser';
  dialog.setAttribute('aria-labelledby', 'well-preset-title');
  const header = element('header', 'well-preset-header');
  const title = element('h2', '', 'Well presets');
  title.id = 'well-preset-title';
  const close = button('well-preset-close', 'Close');
  header.append(title, close);

  const filters = element('div', 'well-preset-filters');
  const searchLabel = element('label', 'well-preset-search');
  searchLabel.appendChild(element('span', '', 'Search presets'));
  const search = element('input');
  search.type = 'search';
  search.placeholder = 'Name, family, or arrangement';
  search.autocomplete = 'off';
  searchLabel.appendChild(search);
  const familyLabel = element('label', 'well-preset-family');
  const familyName = element('span', '', 'Family');
  familyName.id = 'well-preset-family-label';
  familyLabel.appendChild(familyName);
  const family = element('select');
  family.setAttribute('aria-labelledby', familyName.id);
  for (const name of ['All', ...new Set(catalogue.presets.map(preset => preset.family))]) {
    const option = element('option', '', name);
    option.value = name === 'All' ? '' : name;
    family.appendChild(option);
  }
  familyLabel.appendChild(family);
  filters.append(searchLabel, familyLabel);

  const summary = element('div', 'well-preset-summary');
  const results = element('output', 'well-preset-results');
  results.setAttribute('aria-live', 'polite');
  const legend = element('div', 'well-preset-legend');
  for (const type of ['black', 'white']) {
    const label = element('span', '', `${type === 'black' ? 'Black' : 'White'} hole`);
    const dot = element('i', `well-preset-key well-preset-key-${type}`);
    dot.setAttribute('aria-hidden', 'true');
    label.prepend(dot);
    legend.appendChild(label);
  }
  summary.append(results, legend);

  const content = element('div', 'well-preset-content');
  const gallery = element('div', 'well-preset-gallery');
  gallery.setAttribute('role', 'group');
  gallery.setAttribute('aria-label', 'Preset arrangements');
  const detail = element('section', 'well-preset-detail');
  detail.setAttribute('aria-labelledby', 'well-preset-selected-name');
  const detailPreview = element('div', 'well-preset-detail-preview');
  const description = element('div', 'well-preset-description');
  const selectedName = element('h3');
  selectedName.id = 'well-preset-selected-name';
  const selectedMeta = element('p', 'well-preset-meta');
  const selectedDescription = element('p');
  description.append(selectedName, selectedMeta, selectedDescription);
  const actions = element('div', 'well-preset-actions');
  const motionLabel = element('label', 'well-preset-motion');
  const motion = element('input');
  motion.type = 'checkbox';
  motion.checked = true;
  motionLabel.append(motion, element('span', '', 'Use recommended motion'));
  const apply = button('well-preset-apply', 'Apply Preset');
  const replaceNote = element('p', 'well-preset-replace-note', 'Replaces current wells. Undo restores them.');
  actions.append(motionLabel, apply, replaceNote);
  detail.append(detailPreview, description, actions);
  content.append(gallery, detail);
  dialog.append(header, filters, summary, content);

  let selectedId = null;
  let opener = null;
  let destroyed = false;

  function getViewport() {
    if (typeof pn._getGravityWellPresetViewport === 'function') return pn._getGravityWellPresetViewport();
    return { width: pn.i.size.width, height: pn.i.size.height, minRadius: 24, maxRadius: 500 };
  }

  function renderSelection() {
    const selected = catalogue.get(selectedId);
    gallery.querySelectorAll('[data-preset-id]').forEach(entry => {
      const active = entry.dataset.presetId === selectedId;
      entry.setAttribute('aria-pressed', String(active));
      entry.tabIndex = active ? 0 : -1;
    });
    detailPreview.replaceChildren();
    apply.disabled = !selected;
    motion.disabled = !selected;
    selectedName.textContent = selected ? selected.name : 'No matching presets';
    selectedMeta.textContent = selected ? `${selected.family} · ${selected.wells.length} wells` : '';
    selectedDescription.textContent = selected ? selected.description : 'Try another name or choose All families.';
    if (selected) detailPreview.appendChild(preview(selected, getViewport()));
  }

  function renderGallery() {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = catalogue.presets.filter(preset =>
      (!family.value || preset.family === family.value) &&
      `${preset.name} ${preset.family} ${preset.description}`.toLocaleLowerCase().includes(query));
    if (!visible.some(preset => preset.id === selectedId)) selectedId = visible[0]?.id || null;
    const fragment = document.createDocumentFragment();
    const viewport = getViewport();
    for (const preset of visible) {
      const entry = button('well-preset-entry');
      entry.dataset.presetId = preset.id;
      entry.setAttribute('aria-label', `${preset.name}, ${preset.wells.length} wells`);
      entry.append(preview(preset, viewport), element('span', '', preset.name));
      fragment.appendChild(entry);
    }
    if (!visible.length) fragment.appendChild(element('p', 'well-preset-empty', 'No presets match your search.'));
    gallery.replaceChildren(fragment);
    results.textContent = `${visible.length} of ${catalogue.presets.length} presets`;
    renderSelection();
  }

  function closeBrowser() {
    if (dialog.open) dialog.close();
  }

  function restoreFocus() {
    window.removeEventListener('resize', onResize);
    if (!destroyed && opener?.isConnected) opener.focus({ preventScroll: true });
  }

  function selectEntry(event) {
    const entry = event.target.closest('[data-preset-id]');
    if (!entry) return;
    selectedId = entry.dataset.presetId;
    renderSelection();
  }

  function navigateGallery(event) {
    const entry = event.target.closest('[data-preset-id]');
    if (!entry || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const entries = [...gallery.querySelectorAll('[data-preset-id]')];
    const index = entries.indexOf(entry);
    const columns = entries.filter(candidate => candidate.offsetTop === entries[0].offsetTop).length;
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 :
      Math.max(0, Math.min(entries.length - 1, index + steps[event.key]));
    entries.forEach(candidate => { candidate.tabIndex = -1; });
    entries[nextIndex].tabIndex = 0;
    entries[nextIndex].focus();
  }

  function applySelection() {
    if (!selectedId || pn._destroyed) return;
    pn.applyGravityWellPreset(selectedId, { useRecommendedMotion: motion.checked });
    closeBrowser();
  }

  function stopCanvasHotkeys(event) {
    event.stopPropagation();
  }

  function onResize() {
    if (!dialog.open) return;
    const focusedId = document.activeElement?.dataset.presetId;
    renderGallery();
    if (focusedId) gallery.querySelector(`[data-preset-id="${focusedId}"]`)?.focus({ preventScroll: true });
  }

  close.addEventListener('click', closeBrowser);
  dialog.addEventListener('close', restoreFocus);
  dialog.addEventListener('keydown', stopCanvasHotkeys);
  dialog.addEventListener('keyup', stopCanvasHotkeys);
  search.addEventListener('input', renderGallery);
  family.addEventListener('change', renderGallery);
  gallery.addEventListener('click', selectEntry);
  gallery.addEventListener('keydown', navigateGallery);
  apply.addEventListener('click', applySelection);

  return {
    open(trigger) {
      if (destroyed || pn._destroyed || dialog.open) return;
      opener = trigger || document.activeElement;
      if (!dialog.isConnected) document.body.appendChild(dialog);
      selectedId = pn.activeGravityWellPreset?.id || pn.lastGravityWellPresetId || catalogue.presets[0].id;
      search.value = '';
      family.value = '';
      renderGallery();
      dialog.showModal();
      window.addEventListener('resize', onResize);
      search.focus();
    },
    destroy() {
      destroyed = true;
      closeBrowser();
      window.removeEventListener('resize', onResize);
      dialog.remove();
    }
  };
}
