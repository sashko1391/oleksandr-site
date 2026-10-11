/* Коментарі parkinsandr.tech — first-party, без залежностей.
   Lazy-init, textContent-only рендер (XSS-safe), Turnstile explicit, 1 рівень тредів.
   v2: API зі слешем (vercel.json має trailingSlash — без нього кожен запит коштує 308), таймаут POST,
   і чесна реакція на Turnstile, який не приїхав: кажемо про блокувальник, а не просимо пройти перевірку,
   якої на сторінці немає. Зразок — subscribe.v2.js. */
(function () {
  'use strict';
  var SITE_KEY = '0x4AAAAAAD06Nen_zKGLZ_hN';
  var API = '/api/comments/';
  var CAPTCHA_TIMEOUT = 8000;
  var REQUEST_TIMEOUT = 15000;
  var CAPTCHA_MSG = 'Перевірка Cloudflare не завантажилась — її часто ріжуть блокувальники. ' +
    'Без неї коментар не надіслати: вимкніть блокувальник для цього сайту й оновіть сторінку.';
  var EXPIRED_MSG = 'Перевірка застаріла — пройдіть її ще раз.';
  var root = document.getElementById('comments');
  if (!root || !root.dataset.slug) return;
  var slug = root.dataset.slug;
  var inited = false, widgetId = null, parentId = null;
  var captchaDead = false; // Turnstile не приїхав або впав: краще сказати правду, ніж мовчки чекати
  var statusNode = null;

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting && !inited) { inited = true; io.disconnect(); init(); }
    }
  }, { rootMargin: '400px' });
  io.observe(root);

  function init() { injectStyles(); buildUI(); loadComments(); loadTurnstile(); }

  function injectStyles() {
    if (document.getElementById('cmt-styles')) return;
    var css =
      '#comments{max-width:680px;margin:2.5rem auto 0;padding:0 2rem;font-family:Manrope,system-ui,sans-serif}' +
      '.cmt-h{font-family:"Playfair Display",Georgia,serif;font-size:1.5rem;color:#1B3A5C;margin:0 0 1.25rem}' +
      '.cmt-list{list-style:none;margin:0 0 2rem;padding:0}' +
      '.cmt-item{padding:1rem 0;border-top:1px solid rgba(27,58,92,.09)}' +
      '.cmt-replies{list-style:none;margin:.75rem 0 0;padding:0 0 0 1.25rem;border-left:2px solid rgba(27,58,92,.08)}' +
      '.cmt-meta{display:flex;gap:.6rem;align-items:baseline;flex-wrap:wrap;margin-bottom:.35rem}' +
      '.cmt-name{font-weight:600;color:#1B3A5C;font-size:.95rem}' +
      '.cmt-date{font-size:.72rem;color:#6A6A6A}' +
      '.cmt-body{font-size:.98rem;line-height:1.65;color:#4A4A4A;font-weight:300;white-space:pre-wrap;word-wrap:break-word}' +
      '.cmt-reply-btn{background:none;border:none;color:#2E6B9E;font-size:.8rem;cursor:pointer;padding:.2rem 0;margin-top:.3rem;font-family:inherit}' +
      '.cmt-reply-btn:hover{text-decoration:underline}' +
      '.cmt-empty{color:#6A6A6A;font-weight:300;font-size:.95rem;margin:0 0 2rem}' +
      '.cmt-more{background:#EDE7DE;border:none;border-radius:10px;padding:.6rem 1.1rem;font-family:inherit;font-size:.85rem;color:#4A4A4A;cursor:pointer;margin-bottom:1.5rem}' +
      '.cmt-form{background:#fff;border:1px solid rgba(27,58,92,.1);border-radius:14px;padding:1.25rem 1.4rem}' +
      '.cmt-form h3{font-family:"Playfair Display",Georgia,serif;font-size:1.15rem;color:#1B3A5C;margin:0 0 .9rem}' +
      '.cmt-field{margin-bottom:.85rem}' +
      '.cmt-field label{display:block;font-size:.8rem;color:#4A4A4A;margin-bottom:.3rem}' +
      '.cmt-field input[type=text],.cmt-field textarea{width:100%;border:1px solid rgba(27,58,92,.18);border-radius:9px;padding:.6rem .75rem;font-family:inherit;font-size:.95rem;color:#1A1A1A;background:#FCFAF7}' +
      '.cmt-field textarea{min-height:6rem;resize:vertical}' +
      '.cmt-field input:focus,.cmt-field textarea:focus{outline:2px solid #5BA4D9;border-color:#5BA4D9}' +
      '.cmt-consent{display:flex;gap:.5rem;align-items:flex-start;font-size:.82rem;color:#4A4A4A;font-weight:300}' +
      '.cmt-consent a{color:#2E6B9E}' +
      '.cmt-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
      '.cmt-turnstile{min-height:65px;margin:.6rem 0}' +
      '.cmt-submit{background:#1B3A5C;color:#fff;border:none;border-radius:10px;padding:.7rem 1.4rem;font-family:inherit;font-size:.92rem;font-weight:500;cursor:pointer}' +
      '.cmt-submit:disabled{opacity:.55;cursor:default}' +
      '.cmt-status{font-size:.85rem;margin-top:.7rem;min-height:1.1rem}' +
      '.cmt-status.err{color:#C0392B}.cmt-status.ok{color:#3A8C5C}' +
      '.cmt-reply-note{font-size:.8rem;color:#2E6B9E;margin-bottom:.6rem}' +
      '.cmt-reply-note button{background:none;border:none;color:#C0392B;cursor:pointer;font-size:.8rem;margin-left:.4rem}';
    var st = document.createElement('style');
    st.id = 'cmt-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // XSS-safe
    return n;
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString('uk-UA', {
        timeZone: 'Europe/Kyiv', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return ''; }
  }

  function buildUI() {
    root.textContent = '';
    root.appendChild(el('h2', 'cmt-h', 'Коментарі'));
    var listWrap = el('div'); listWrap.id = 'cmt-listwrap';
    root.appendChild(listWrap);
    root.appendChild(buildForm());
  }

  function commentNode(c, isReply) {
    var li = el('li', 'cmt-item');
    var meta = el('div', 'cmt-meta');
    meta.appendChild(el('span', 'cmt-name', c.author_name));
    meta.appendChild(el('span', 'cmt-date', fmtDate(c.created_at)));
    li.appendChild(meta);
    li.appendChild(el('div', 'cmt-body', c.body));
    if (!isReply) {
      var btn = el('button', 'cmt-reply-btn', 'Відповісти');
      btn.type = 'button';
      btn.addEventListener('click', function () { setReply(c); });
      li.appendChild(btn);
    }
    return li;
  }

  function renderComments(all) {
    var wrap = document.getElementById('cmt-listwrap');
    wrap.textContent = '';
    document.querySelector('.cmt-h').textContent = 'Коментарі (' + all.length + ')';
    if (all.length === 0) {
      wrap.appendChild(el('p', 'cmt-empty', 'Ще немає коментарів. Будьте першим 🙂'));
      return;
    }
    var tops = all.filter(function (c) { return c.parent_id == null; });
    var byParent = {};
    all.forEach(function (c) {
      if (c.parent_id != null) { (byParent[c.parent_id] = byParent[c.parent_id] || []).push(c); }
    });
    var CHUNK = 20, shown = 0;
    var ul = el('ul', 'cmt-list');
    wrap.appendChild(ul);

    function paint() {
      var frag = document.createDocumentFragment();
      var slice = tops.slice(shown, shown + CHUNK);
      slice.forEach(function (c) {
        var li = commentNode(c, false);
        var kids = byParent[c.id];
        if (kids && kids.length) {
          var rul = el('ul', 'cmt-replies');
          kids.forEach(function (k) { rul.appendChild(commentNode(k, true)); });
          li.appendChild(rul);
        }
        frag.appendChild(li);
      });
      ul.appendChild(frag);
      shown += slice.length;
      var old = wrap.querySelector('.cmt-more');
      if (old) old.remove();
      if (shown < tops.length) {
        var more = el('button', 'cmt-more', 'Показати ще (' + (tops.length - shown) + ')');
        more.type = 'button';
        more.addEventListener('click', paint);
        wrap.appendChild(more);
      }
    }
    paint();
  }

  function loadComments() {
    fetch(API + '?slug=' + encodeURIComponent(slug), { headers: { 'x-requested-with': 'fetch' } })
      .then(function (r) {
        if (r.status === 404) return { notConnected: true };
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (d.notConnected) renderNotConnected();
        else renderComments(d.comments || []);
      })
      .catch(function () { renderLoadError(); });
  }

  // 404 = сторінку не зареєстровано в базі (`npm run register:post`): відправка гарантовано впаде теж,
  // тож форму ховаємо, а не пропонуємо писати в нікуди.
  var NOT_CONNECTED = 'Коментарі для цієї сторінки ще не підключені. Напишіть мені напряму — посилання на сторінці «Про мене».';
  function renderNotConnected() {
    var wrap = document.getElementById('cmt-listwrap');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'cmt-empty', NOT_CONNECTED));
    var form = root.querySelector('.cmt-form');
    if (form) { form.hidden = true; form.style.display = 'none'; }
  }

  // «Ще немає коментарів» тут була б неправдою: ми не знаємо, чи вони є. Форма лишається робочою.
  function renderLoadError() {
    var wrap = document.getElementById('cmt-listwrap');
    wrap.textContent = '';
    wrap.appendChild(el('p', 'cmt-empty', 'Не вдалося завантажити коментарі. Спробуйте оновити сторінку пізніше.'));
  }

  function setReply(c) {
    parentId = c.id;
    var note = document.getElementById('cmt-reply-note');
    note.textContent = 'Відповідь для ' + c.author_name;
    var x = el('button', null, '✕ скасувати'); x.type = 'button';
    x.addEventListener('click', clearReply);
    note.appendChild(x);
    note.style.display = 'block';
    document.getElementById('cmt-name').focus();
  }
  function clearReply() {
    parentId = null;
    var note = document.getElementById('cmt-reply-note');
    note.textContent = ''; note.style.display = 'none';
  }

  function buildForm() {
    var form = el('form', 'cmt-form');
    form.setAttribute('novalidate', '');
    form.appendChild(el('h3', null, 'Залишити коментар'));

    var note = el('div', 'cmt-reply-note'); note.id = 'cmt-reply-note'; note.style.display = 'none';
    form.appendChild(note);

    var f1 = el('div', 'cmt-field');
    var l1 = el('label', null, "Ім'я"); l1.setAttribute('for', 'cmt-name'); f1.appendChild(l1);
    var name = el('input'); name.type = 'text'; name.id = 'cmt-name'; name.maxLength = 60; name.required = true;
    f1.appendChild(name); form.appendChild(f1);

    var f2 = el('div', 'cmt-field');
    var l2 = el('label', null, 'Коментар'); l2.setAttribute('for', 'cmt-body'); f2.appendChild(l2);
    var body = el('textarea'); body.id = 'cmt-body'; body.maxLength = 4000; body.required = true;
    f2.appendChild(body); form.appendChild(f2);

    // honeypot
    var hpWrap = el('div', 'cmt-hp'); hpWrap.setAttribute('aria-hidden', 'true');
    var hp = el('input'); hp.type = 'text'; hp.id = 'cmt-hp'; hp.tabIndex = -1; hp.autocomplete = 'off';
    hpWrap.appendChild(hp); form.appendChild(hpWrap);

    var ts = el('div', 'cmt-turnstile'); ts.id = 'cmt-turnstile'; form.appendChild(ts);

    var cf = el('div', 'cmt-field');
    var cons = el('label', 'cmt-consent');
    var cb = el('input'); cb.type = 'checkbox'; cb.id = 'cmt-consent'; cb.required = true;
    cons.appendChild(cb);
    var span = el('span', null, 'Погоджуюсь із обробкою даних для публікації коментаря (див. ');
    var a = el('a', null, 'політику приватності'); a.href = '/privacy/'; span.appendChild(a);
    span.appendChild(document.createTextNode(').'));
    cons.appendChild(span); cf.appendChild(cons); form.appendChild(cf);

    var submit = el('button', 'cmt-submit', 'Надіслати'); submit.type = 'submit';
    form.appendChild(submit);
    var status = el('div', 'cmt-status'); status.id = 'cmt-status'; status.setAttribute('aria-live', 'polite');
    form.appendChild(status);
    statusNode = status;

    form.addEventListener('submit', function (e) { e.preventDefault(); submitForm(name, body, cb, hp, submit, status); });
    return form;
  }

  function setStatus(status, msg, kind) {
    if (!status) return;
    status.textContent = msg;
    status.className = 'cmt-status' + (kind ? ' ' + kind : '');
  }

  // Повідомлення про перевірку не перекриває фінальне «✅ Дякую»: reset() після відправки перезапускає
  // Turnstile, і його збій чи протухання через 5 хв інакше виглядали б як «коментар не пішов» → дубль.
  // captchaDead при цьому все одно ставиться, тож наступна спроба скаже правду.
  function captchaSay(msg) {
    if (statusNode && /\bok\b/.test(statusNode.className)) return;
    setStatus(statusNode, msg, 'err');
  }

  // Знімає лише повідомлення про перевірку: новий токен після reset() не повинен стерти «✅ Дякую».
  function clearCaptchaStatus() {
    if (statusNode && (statusNode.textContent === CAPTCHA_MSG || statusNode.textContent === EXPIRED_MSG)) {
      setStatus(statusNode, '', '');
    }
  }

  function submitForm(name, body, cb, hp, submit, status) {
    if (!name.value.trim() || !body.value.trim()) { setStatus(status, 'Заповніть ім’я і коментар.', 'err'); return; }
    if (!cb.checked) { setStatus(status, 'Потрібна згода на обробку даних.', 'err'); return; }
    if (captchaDead) { setStatus(status, CAPTCHA_MSG, 'err'); return; }
    var token = window.turnstile && widgetId != null ? window.turnstile.getResponse(widgetId) : '';
    if (!token) { setStatus(status, 'Зачекайте секунду — перевірка захисту від ботів ще не завершилась.', 'err'); return; }

    var payload = {
      slug: slug, author_name: name.value.trim(), body: body.value.trim(),
      consent: true, turnstileToken: token, hp: hp.value,
    };
    if (parentId != null) payload.parent_id = parentId;

    submit.disabled = true; setStatus(status, 'Надсилаю…', '');
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT) : null;
    var done = function () {
      if (timer) clearTimeout(timer);
      submit.disabled = false; // що б не сталося, кнопка не лишається мертвою
      // токен одноразовий: після будь-якої відповіді він уже спалений або сумнівний
      if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId);
    };
    fetch(API, {
      method: 'POST',
      signal: ctrl ? ctrl.signal : undefined,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      done();
      if (r.status === 202) {
        setStatus(status, '✅ Дякую! Коментар з’явиться після модерації.', 'ok');
        name.value = ''; body.value = ''; cb.checked = false; clearReply();
      } else if (r.status === 429) {
        setStatus(status, 'Забагато спроб надіслати коментар. Спробуйте трохи згодом.', 'err');
      } else if (r.status === 404) {
        setStatus(status, NOT_CONNECTED, 'err');
      } else if (r.status >= 500) {
        // Винні не поля. 503 — сховище лімітів або база (так було 11.08–21.09.2026); 502/504 шлюзу можуть прийти
        // вже після запису, тож «не збережено» стверджувати не можна.
        setStatus(status, 'Збій на нашому боці — не вдалося підтвердити, що коментар збережено. ' +
          'Текст лишився у формі, спробуйте пізніше.', 'err');
      } else {
        setStatus(status, 'Перевірка не пройшла або поля заповнені неправильно — спробуйте ще раз.', 'err');
      }
    }).catch(function (e) {
      done();
      setStatus(status, e && e.name === 'AbortError'
        ? 'Сервер не відповів вчасно — спробуйте ще раз.'
        : 'Помилка мережі. Спробуйте ще раз.', 'err');
    });
  }

  function loadTurnstile() {
    var giveUp = function () {
      if (widgetId != null) return;
      captchaDead = true;
      captchaSay(CAPTCHA_MSG);
    };
    if (window.turnstile) { renderWidget(); return; }
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.defer = true;
    s.onload = renderWidget;
    s.onerror = giveUp; // заблокований розширенням чи мережею
    document.head.appendChild(s);
    setTimeout(giveUp, CAPTCHA_TIMEOUT); // завантажився, але так і не намалювався
  }
  function renderWidget() {
    var elw = document.getElementById('cmt-turnstile');
    if (!elw || !window.turnstile || widgetId != null) return;
    widgetId = window.turnstile.render(elw, {
      sitekey: SITE_KEY,
      // Токен прийшов — навіть після помилки (Turnstile повторює сам): знімаємо вирок.
      callback: function () { captchaDead = false; clearCaptchaStatus(); },
      'error-callback': function () { captchaDead = true; captchaSay(CAPTCHA_MSG); },
      'expired-callback': function () {
        captchaSay(EXPIRED_MSG);
        if (widgetId != null) window.turnstile.reset(widgetId);
      },
    });
    // Приїхав пізніше за таймаут — знімаємо вирок, інакше форма лишилася б мертвою назавжди.
    if (widgetId != null && captchaDead) { captchaDead = false; clearCaptchaStatus(); }
  }
})();
