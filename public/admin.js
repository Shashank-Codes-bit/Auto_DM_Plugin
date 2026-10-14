// Admin panel helpers: reel product picker, copy link, confirmations, busy buttons, photo preview.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Confirm destructive forms.
  $$('form[data-confirm]').forEach((f) =>
    f.addEventListener('submit', (e) => {
      if (!confirm(f.dataset.confirm)) e.preventDefault();
    }),
  );

  // Forms that wait on the brand's website: show progress and prevent double submits.
  $$('form[data-busy]').forEach((f) =>
    f.addEventListener('submit', (e) => {
      if (e.defaultPrevented) return;
      const b = $('button[type="submit"]', f);
      if (!b) return;
      if (b.getAttribute('aria-busy') === 'true') return e.preventDefault();
      b.setAttribute('aria-busy', 'true');
      b.textContent = f.dataset.busy;
    }),
  );

  // Copy link.
  $$('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        const old = b.textContent;
        b.textContent = 'Copied';
        setTimeout(() => (b.textContent = old), 1500);
      } catch {
        prompt('Copy this link', b.dataset.copy);
      }
    }),
  );

  // Product form: preview a pasted photo link.
  const imageField = $('[data-image-field]');
  const imagePreview = $('[data-image-preview]');
  if (imageField && imagePreview) imageField.addEventListener('change', () => (imagePreview.src = imageField.value));

  // Move a list item up/down.
  function move(li, dir) {
    const sib = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
    if (!sib) return;
    dir < 0 ? li.parentNode.insertBefore(li, sib) : li.parentNode.insertBefore(sib, li);
  }

  // ---- reel product picker ----
  const picked = $('[data-picked]');
  if (picked) {
    const max = Number(picked.dataset.max) || 20;
    const counter = $('[data-counter]');
    const empty = $('[data-picked-empty]');
    const error = $('[data-picked-error]');
    const ids = () => $$('input[name="linkIds"]', picked).map((i) => i.value);

    function refresh() {
      const chosen = ids();
      counter.textContent = `${chosen.length} / ${max}`;
      counter.classList.toggle('full', chosen.length >= max);
      empty.hidden = chosen.length > 0;
      $$('[data-pick]').forEach((b) => (b.disabled = chosen.includes(b.dataset.pick) || chosen.length >= max));
      error.hidden = true;
    }

    picked.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const li = b.closest('li');
      if (b.dataset.move) move(li, Number(b.dataset.move));
      if (b.hasAttribute('data-unpick')) li.remove();
      refresh();
    });

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b || ids().length >= max) return;
      const tpl = $(`[data-picked-templates] template[data-for="${b.dataset.pick}"]`);
      if (tpl) picked.append(tpl.content.firstElementChild.cloneNode(true));
      refresh();
    });

    const search = $('[data-catalog-search]');
    search?.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      $$('[data-catalog] li').forEach((li) => (li.hidden = q && !li.dataset.name.includes(q)));
    });

    $('[data-reel-form]').addEventListener('submit', (e) => {
      const n = ids().length;
      if (n < 1 || n > max) {
        e.preventDefault();
        error.textContent = n < 1 ? 'Pick at least 1 product for this reel.' : `A reel can show at most ${max} products.`;
        error.hidden = false;
        error.scrollIntoView({ block: 'center' });
      }
    });
    refresh();
  }
})();
