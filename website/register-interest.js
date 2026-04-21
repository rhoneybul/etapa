/*
 * Etapa — Register Interest + Social Links (shared site-wide)
 *
 * Drop this script into any page:
 *   <script src="/register-interest.js" defer></script>
 *   (or ../register-interest.js from the /blog/ subfolder)
 *
 * It will:
 *   1. Inject a "Coming Soon" register-interest modal and its styles
 *   2. Wire up any element with data-register-interest (or href="#register-interest")
 *      to open the modal — including the existing .nav-cta, .btn-primary and
 *      .pricing-btn buttons
 *   3. Inject Instagram + YouTube social icons into every <footer> on the page
 *   4. POST { email, source } to /api/public/register-interest on submit
 */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var API_URL = 'https://etapa.up.railway.app/api/public/register-interest';
  var INSTAGRAM_URL = 'https://www.instagram.com/getetapa/';
  var YOUTUBE_URL = 'https://www.youtube.com/@getetapa';
  // Page identifier sent with the signup (e.g. "index", "support", "blog/how-to...")
  var PAGE_SOURCE = (function () {
    try {
      var path = window.location.pathname.replace(/^\/+|\/+$/g, '');
      if (!path) return 'index';
      return path.replace(/\.html$/i, '');
    } catch (e) {
      return 'unknown';
    }
  })();

  // ── 1. Inject CSS ─────────────────────────────────────────────────────────
  var css = '' +
    '.ri-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:9998;display:none;align-items:center;justify-content:center;padding:20px;animation:riFade .2s ease}' +
    '.ri-modal-backdrop.ri-open{display:flex}' +
    '@keyframes riFade{from{opacity:0}to{opacity:1}}' +
    '@keyframes riSlide{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}' +
    '.ri-modal{position:relative;background:#0a0a0a;border:1px solid #232323;border-radius:24px;max-width:480px;width:100%;padding:40px 32px 32px;font-family:\'Poppins\',-apple-system,sans-serif;color:#fff;box-shadow:0 40px 80px rgba(0,0,0,.6);animation:riSlide .25s ease}' +
    '.ri-close{position:absolute;top:16px;right:16px;width:36px;height:36px;border-radius:50%;background:#161616;border:1px solid #232323;color:#bbb;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;line-height:1;transition:all .2s;font-family:inherit}' +
    '.ri-close:hover{background:#1e1e1e;color:#fff;border-color:#333}' +
    '.ri-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(232,69,139,.12);border:1px solid rgba(232,69,139,.25);border-radius:100px;padding:6px 14px;font-size:12px;color:#E8458B;font-weight:600;letter-spacing:.8px;text-transform:uppercase;margin-bottom:16px}' +
    '.ri-badge-dot{width:6px;height:6px;border-radius:50%;background:#E8458B}' +
    '.ri-modal h2{font-family:\'Poppins\',sans-serif;font-size:28px;font-weight:600;line-height:1.15;margin:0 0 12px;color:#fff;letter-spacing:-.3px}' +
    '.ri-modal h2 span{color:#E8458B}' +
    '.ri-modal p.ri-lead{font-size:15px;color:#aaa;line-height:1.6;font-weight:300;margin:0 0 24px}' +
    '.ri-form{display:flex;flex-direction:column;gap:12px}' +
    '.ri-form input[type=email],.ri-form input[type=text]{background:#111;border:1px solid #232323;border-radius:14px;padding:14px 18px;font-family:\'Poppins\',sans-serif;font-size:15px;color:#fff;width:100%;transition:border-color .2s,background .2s;box-sizing:border-box}' +
    '.ri-form input[type=email]:focus,.ri-form input[type=text]:focus{outline:none;border-color:#E8458B;background:#141414}' +
    '.ri-form input[type=email]::placeholder,.ri-form input[type=text]::placeholder{color:#555}' +
    /* Cycling-level segmented control */
    '.ri-level-label{font-size:12px;color:#999;font-weight:500;margin-top:4px;margin-bottom:-4px;letter-spacing:.3px}' +
    '.ri-level{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}' +
    '.ri-level label{cursor:pointer;background:#111;border:1px solid #232323;border-radius:12px;padding:10px 8px;font-size:12px;font-weight:500;color:#bbb;text-align:center;transition:all .15s;line-height:1.3;box-sizing:border-box}' +
    '.ri-level label:hover{border-color:#333;color:#fff}' +
    '.ri-level input[type=radio]{position:absolute;opacity:0;pointer-events:none}' +
    '.ri-level input[type=radio]:checked+span{color:#E8458B}' +
    '.ri-level label:has(input[type=radio]:checked){border-color:#E8458B;background:rgba(232,69,139,.08);color:#fff}' +
    '.ri-form button{background:#E8458B;color:#000;font-family:\'Poppins\',sans-serif;border:none;padding:14px 24px;border-radius:100px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s,transform .1s;display:inline-flex;align-items:center;justify-content:center;gap:8px}' +
    '.ri-form button:hover:not(:disabled){background:#F472B6}' +
    '.ri-form button:disabled{opacity:.6;cursor:not-allowed}' +
    '.ri-form button .ri-spin{width:16px;height:16px;border:2px solid rgba(0,0,0,.3);border-top-color:#000;border-radius:50%;animation:riSpin .8s linear infinite}' +
    '@keyframes riSpin{to{transform:rotate(360deg)}}' +
    '.ri-msg{font-size:13px;margin-top:4px;font-weight:400;line-height:1.5}' +
    '.ri-msg.ri-ok{color:#6EE7B7}' +
    '.ri-msg.ri-err{color:#F87171}' +
    '.ri-success{text-align:center;padding:12px 0 4px}' +
    '.ri-success-icon{width:56px;height:56px;border-radius:50%;background:rgba(110,231,183,.12);border:1px solid rgba(110,231,183,.35);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#6EE7B7;font-size:28px}' +
    '.ri-success h3{font-size:22px;font-weight:600;margin:0 0 8px;color:#fff}' +
    '.ri-success p{font-size:14px;color:#999;line-height:1.6;font-weight:300;margin:0 0 20px}' +
    '.ri-social-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}' +
    '.ri-social-row a{display:inline-flex;align-items:center;gap:8px;background:#161616;border:1px solid #232323;border-radius:100px;padding:10px 16px;font-size:13px;font-weight:500;color:#ddd;text-decoration:none;transition:all .2s}' +
    '.ri-social-row a:hover{border-color:#E8458B;color:#fff;background:#1a1a1a}' +
    '.ri-social-row svg{width:16px;height:16px}' +
    '.ri-disclaimer{font-size:11px;color:#666;font-weight:300;margin-top:16px;text-align:center;line-height:1.5}' +
    /* Footer socials */
    '.ri-footer-social{display:inline-flex;align-items:center;gap:14px;margin-left:16px;padding-left:16px;border-left:1px solid #1a1a1a}' +
    '.ri-footer-social a{color:#666;transition:color .2s;display:inline-flex;align-items:center}' +
    '.ri-footer-social a:hover{color:#E8458B}' +
    '.ri-footer-social svg{width:20px;height:20px}' +
    /* Floating follow chip (shows on scroll on long pages) */
    '@media (max-width:640px){.ri-footer-social{margin-left:0;padding-left:0;border-left:none}}';

  var style = document.createElement('style');
  style.setAttribute('data-ri-style', '');
  style.textContent = css;
  document.head.appendChild(style);

  // ── 2. Build modal ────────────────────────────────────────────────────────
  var modal = document.createElement('div');
  modal.className = 'ri-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'ri-title');
  modal.innerHTML =
    '<div class="ri-modal">' +
      '<button type="button" class="ri-close" aria-label="Close">&times;</button>' +
      '<div class="ri-form-view">' +
        '<div class="ri-badge"><span class="ri-badge-dot"></span>Coming Soon</div>' +
        '<h2 id="ri-title">Etapa is <span>almost here</span>.</h2>' +
        '<p class="ri-lead">We\'re putting the finishing touches on Etapa — your AI cycling coach for beginners and every rider after that. Drop your email below and we\'ll let you know the moment it\'s live.</p>' +
        '<form class="ri-form" novalidate>' +
          '<input type="text" name="firstName" placeholder="First name (optional)" autocomplete="given-name" maxlength="80">' +
          '<input type="email" name="email" placeholder="you@example.com" required autocomplete="email">' +
          '<div class="ri-level-label">How often do you cycle?</div>' +
          '<div class="ri-level" role="radiogroup" aria-label="Cycling experience">' +
            '<label><input type="radio" name="cyclingLevel" value="new"><span>New to cycling</span></label>' +
            '<label><input type="radio" name="cyclingLevel" value="sometimes"><span>Ride sometimes</span></label>' +
            '<label><input type="radio" name="cyclingLevel" value="regular"><span>Ride regularly</span></label>' +
          '</div>' +
          '<button type="submit">Register Interest</button>' +
          '<div class="ri-msg" aria-live="polite"></div>' +
        '</form>' +
        '<p class="ri-disclaimer">No spam. Just one email when we launch. You can unsubscribe any time.</p>' +
      '</div>' +
      '<div class="ri-success-view" style="display:none;">' +
        '<div class="ri-success">' +
          '<div class="ri-success-icon">✓</div>' +
          '<h3>You\'re on the list</h3>' +
          '<p class="ri-success-msg">We\'ll let you know the moment Etapa is live.</p>' +
          '<div class="ri-social-row">' +
            '<a href="' + INSTAGRAM_URL + '" target="_blank" rel="noopener">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>' +
              'Follow on Instagram' +
            '</a>' +
            '<a href="' + YOUTUBE_URL + '" target="_blank" rel="noopener">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' +
              'Subscribe on YouTube' +
            '</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Append once DOM is ready
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    document.body.appendChild(modal);

    var formView = modal.querySelector('.ri-form-view');
    var successView = modal.querySelector('.ri-success-view');
    var form = modal.querySelector('.ri-form');
    var input = form.querySelector('input[type=email]');
    var button = form.querySelector('button');
    var msg = form.querySelector('.ri-msg');
    var successMsg = modal.querySelector('.ri-success-msg');

    function open() {
      modal.classList.add('ri-open');
      document.body.style.overflow = 'hidden';
      // Reset to form view each time
      formView.style.display = '';
      successView.style.display = 'none';
      msg.textContent = '';
      msg.className = 'ri-msg';
      // Focus the first (name) input so users can just start typing.
      // Falls back to email if the name field isn't present for any reason.
      setTimeout(function () {
        var focusTarget = form.querySelector('input[name=firstName]') || input;
        focusTarget.focus();
      }, 50);
    }

    function close() {
      modal.classList.remove('ri-open');
      document.body.style.overflow = '';
    }

    // Close handlers
    modal.querySelector('.ri-close').addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('ri-open')) close();
    });

    // Submit handler
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input.value || '').trim();
      msg.textContent = '';
      msg.className = 'ri-msg';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.textContent = 'Please enter a valid email address.';
        msg.className = 'ri-msg ri-err';
        return;
      }

      // Optional profile fields — captured if the user filled them in.
      var firstNameInput = form.querySelector('input[name=firstName]');
      var firstName = firstNameInput ? (firstNameInput.value || '').trim().slice(0, 80) : '';
      var levelRadio = form.querySelector('input[name=cyclingLevel]:checked');
      var cyclingLevel = levelRadio ? levelRadio.value : null;

      button.disabled = true;
      button.innerHTML = '<span class="ri-spin"></span> Submitting…';

      // If the interactive MCP demo is on the page, grab its session ID + CTA variant
      // so the backend can attribute this signup to a specific demo interaction.
      var demoMeta = (window.__etapaDemo && typeof window.__etapaDemo === 'object') ? window.__etapaDemo : {};

      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          firstName: firstName || null,
          cyclingLevel: cyclingLevel,
          source: PAGE_SOURCE,
          demoSessionId: demoMeta.sessionId || null,
          demoCtaVariant: demoMeta.ctaVariant || null,
        }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (resp) {
          if (!resp.ok) throw new Error(resp.body && resp.body.error || 'Something went wrong.');
          // Success
          successMsg.textContent = resp.body.message || "We'll let you know the moment Etapa is live.";
          formView.style.display = 'none';
          successView.style.display = '';
          try {
            // Analytics-ish fire-and-forget
            if (window.posthog && window.posthog.capture) {
              window.posthog.capture('register_interest_submitted', { source: PAGE_SOURCE });
            }
          } catch (err) { /* ignore */ }
        })
        .catch(function (err) {
          msg.textContent = err.message || 'Something went wrong. Please try again.';
          msg.className = 'ri-msg ri-err';
        })
        .finally(function () {
          button.disabled = false;
          button.innerHTML = 'Register Interest';
        });
    });

    // ── 3. Wire up triggers ────────────────────────────────────────────────
    // Any link with href="#register-interest" or any element with
    // data-register-interest opens the modal.
    function isTrigger(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.hasAttribute('data-register-interest')) return true;
      var href = el.getAttribute && el.getAttribute('href');
      if (href === '#register-interest') return true;
      return false;
    }

    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== document.body) {
        if (isTrigger(el)) {
          e.preventDefault();
          open();
          return;
        }
        el = el.parentNode;
      }
    }, true);

    // Expose as window.EtapaRegisterInterest.open() for custom triggers
    window.EtapaRegisterInterest = { open: open, close: close };

    // ── 4. Inject social icons into every <footer> on the page ─────────────
    var instaSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>';
    var ytSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';

    var socialRow =
      '<div class="ri-footer-social">' +
        '<a href="' + INSTAGRAM_URL + '" target="_blank" rel="noopener" aria-label="Etapa on Instagram">' + instaSvg + '</a>' +
        '<a href="' + YOUTUBE_URL + '" target="_blank" rel="noopener" aria-label="Etapa on YouTube">' + ytSvg + '</a>' +
      '</div>';

    var footers = document.querySelectorAll('footer');
    footers.forEach(function (footer) {
      // Avoid duplicates if script runs twice
      if (footer.querySelector('.ri-footer-social')) return;
      // Prefer appending to an existing footer-links container
      var linkContainer = footer.querySelector('.footer-links') || footer;
      var wrap = document.createElement('div');
      wrap.innerHTML = socialRow;
      linkContainer.appendChild(wrap.firstChild);
    });
  });
})();
