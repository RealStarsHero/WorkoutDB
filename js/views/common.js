// Componenti condivisi tra le schermate
import { icon } from '../icons.js';
import { esc, openModal, parseVideo, fmtNum } from '../utils.js';
import { targetChips, hasLoad } from '../training.js';

export function showVideo(r) {
  const v = parseVideo(r.url_video);
  if (!v) {
    openModal({
      title: r.esercizio,
      body: `<div class="banner warn">${icon('alert')}<span>Nessun video disponibile per questo esercizio. Puoi aggiungerlo nella colonna <b>URL_Video</b> del CSV e reimportare il file.</span></div>`,
    });
    return;
  }
  let media;
  if (v.kind === 'iframe') {
    media = `<div class="video-frame"><iframe src="${esc(v.src)}" title="${esc(r.esercizio)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  } else if (v.kind === 'video') {
    media = `<div class="video-frame"><video src="${esc(v.src)}" controls playsinline preload="metadata"></video></div>`;
  } else {
    media = `<div class="banner warn">${icon('alert')}<span>Questo link non può essere incorporato nella pagina: aprilo nel browser.</span></div>`;
  }
  openModal({
    title: r.esercizio,
    body: `${media}<a class="btn btn-ghost btn-block" style="margin-top:12px" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${icon('external')} Apri nel browser</a>`,
  });
}

export function videoButton(r) {
  return parseVideo(r.url_video)
    ? `<button class="btn btn-ghost btn-sm" data-act="video">${icon('video')} Video</button>`
    : `<span class="chip chip-warn" title="Nessun URL video nel CSV">${icon('alert')} Video non disponibile</span>`;
}

export function exerciseDetail(r, age) {
  const kv = (k, v) => (v === null || v === undefined || v === '' ? '' : `<div class="kv"><span class="muted">${k}</span><span>${esc(v)}</span></div>`);
  openModal({
    title: r.esercizio,
    body: `<div class="chips" style="margin-bottom:12px">${targetChips(r, age).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
      <div class="notes">${esc(r.note_esecuzione || 'Nessuna nota di esecuzione.')}</div>
      <div class="kvs" style="margin-top:12px">
        ${kv('Fase', r.fase)}
        ${kv('Gruppo muscolare', r.gruppo_muscolare)}
        ${kv('Muscoli secondari', (r.muscoli_secondari || '').split('|').filter(Boolean).join(', '))}
        ${kv('Schema motorio', r.schema_movimento)}
        ${kv('Attrezzo', r.attrezzo)}
        ${kv('Progressione', r.metodo_progressione)}
        ${hasLoad(r) && r.incremento_kg ? kv('Incremento', `${fmtNum(r.incremento_kg, 2)} kg`) : ''}
        ${kv('Superserie', r.id_superserie)}
      </div>
      <div style="margin-top:14px">${parseVideo(r.url_video)
        ? `<button class="btn btn-primary btn-block" data-video>${icon('video')} Guarda il video</button>`
        : `<div class="banner warn">${icon('alert')}<span>Video non disponibile per questo esercizio.</span></div>`}</div>`,
    onMount: (el) => {
      const b = el.querySelector('[data-video]');
      if (b) b.onclick = () => showVideo(r);
    },
  });
}
