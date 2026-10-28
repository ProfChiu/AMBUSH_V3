/*
 * ambushdialogs.js — Phase 2 dialog engine (docs/11_GAME_BUILD_PHASES.md, docs/13_MESSAGE_SPEC.md)
 *
 * Pure presentation layer. No game rules, no rolls, no data — every later phase calls into this
 * through window.AmbushUI. Four independent subsystems, matching the four interaction patterns the
 * UX spec (docs/03_UX_SPEC.md) and dialog mockup (docs/mockups/dialogs.html) define:
 *
 *   Dialogs  — the modal MESSAGE queue. "The game talks to the player." One card on screen at a
 *              time, FIFO, never stacked (per UX spec "Dialogs never stack more than one deep").
 *   Popups   — reference material the PLAYER opens on demand (Squad Record, Charts, Mission Card,
 *              Map Key, Counter Inspector, Game Log). Not queued; opening one closes any other.
 *   Toasts   — brief, non-blocking notices (illegal-action errors). Stack, auto-dismiss, never
 *              block or queue behind the message dialogs.
 *   Float    — draggable, closable, non-modal windows that coexist with everything else. Used for
 *              the Roll & Resolve dice window (UX spec, Finalized Design Decisions #7).
 *
 * Requires #dialogs-root to exist in the page (see apps/game/dialogharness.html). Include this file before
 * any script that calls window.AmbushUI.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Shared DOM scaffolding
  // ---------------------------------------------------------------------
  let root;
  let lastFocused = null;

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function trapAndFocus(container, preferred) {
    lastFocused = document.activeElement;
    if (preferred) { preferred.focus(); return; }
    const focusable = container.querySelectorAll(
      'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (focusable[0] || container).focus();
  }

  function restoreFocus() {
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  }

  // ---------------------------------------------------------------------
  // Dialogs — modal message queue
  // ---------------------------------------------------------------------
  const Dialogs = (function () {
    const queue = [];
    let current = null;
    const presentListeners = [];
    let backdrop, card, headEl, titleEl, badgeEl, bodyEl, footEl;

    function build() {
      backdrop = el('div', 'backdrop dlg-backdrop');
      card = el('div', 'popup narrow');
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('tabindex', '-1');
      headEl = el('div', 'popup-head');
      titleEl = el('span');
      badgeEl = el('span', 'dialog-badge');
      headEl.appendChild(titleEl);
      headEl.appendChild(badgeEl);
      bodyEl = el('div', 'popup-body');
      footEl = el('div', 'popup-foot');
      card.appendChild(headEl);
      card.appendChild(bodyEl);
      card.appendChild(footEl);
      backdrop.appendChild(card);
      root.appendChild(backdrop);
    }

    function renderButtons(spec) {
      footEl.innerHTML = '';
      (spec.buttons || []).forEach(function (b) {
        const btn = el('button', 'btn' + (b.variant ? ' ' + b.variant : ''), b.label);
        btn.disabled = !!b.disabled;
        btn.dataset.btnId = b.id;
        btn.addEventListener('click', function () {
          handleButton(b.id);
        });
        footEl.appendChild(btn);
        b._el = btn;
      });
    }

    function setButtonDisabled(id, disabled) {
      const spec = current;
      if (!spec) return;
      const b = (spec.buttons || []).find(function (x) { return x.id === id; });
      if (!b) return;
      // Keep the spec's own flag in sync, not just the DOM element — onKeydown's Enter handler
      // reads b.disabled (the spec), so a caller enabling a button after a delayed reveal (e.g. a
      // die roll) needs that check to reflect reality, not the disabled:true it was pushed with.
      b.disabled = !!disabled;
      if (b._el) {
        b._el.disabled = !!disabled;
        if (!disabled && b.variant === 'amber') b._el.focus();
      }
    }

    // Same spec-and-DOM pairing as setButtonDisabled — lets one button change role mid-dialog
    // (e.g. a "Roll" button becoming "Continue" once the dice land) without a second button.
    function setButtonLabel(id, label) {
      const spec = current;
      if (!spec) return;
      const b = (spec.buttons || []).find(function (x) { return x.id === id; });
      if (!b) return;
      b.label = label;
      if (b._el) b._el.textContent = label;
    }

    function handleButton(id) {
      const spec = current;
      if (!spec || spec.modeless) return;
      if (typeof spec.onButton === 'function') {
        spec.onButton(id, ctxFor(spec));
      }
    }

    function ctxFor(spec) {
      return {
        bodyEl: bodyEl,
        setButtonDisabled: setButtonDisabled,
        setButtonLabel: setButtonLabel,
        close: function (result) {
          // A modeless item closes itself on a timer; if a reset (a pick, a load) has replaced the
          // queue meanwhile, that late close must not advance a queue it no longer owns.
          if (current !== spec) return;
          if (typeof spec.onClose === 'function') spec.onClose(result);
          advance();
        },
      };
    }

    function present(spec) {
      current = spec;
      // Modeless (v2 resolution cards): the item keeps its place in the one FIFO — so everything
      // resolves in exactly the order the classic dialogs would — but opens no backdrop and asks
      // for no press. spec.run(ctx) shows it wherever it likes and calls ctx.close() when done.
      if (spec.modeless) {
        backdrop.classList.remove('open');
        presentListeners.forEach(function (fn) { fn(spec); });
        spec.run(ctxFor(spec));
        return;
      }
      card.className = 'popup' + (spec.variant ? ' ' + spec.variant : ' narrow');
      titleEl.textContent = spec.title || '';
      badgeEl.textContent = queue.length ? '+' + queue.length + ' queued' : '';
      bodyEl.innerHTML = '';
      renderButtons(spec);
      backdrop.classList.add('open');
      if (typeof spec.render === 'function') spec.render(ctxFor(spec));
      // After render, so a listener sees spec.choices (chooseTarget/chooseOffer fill it there).
      presentListeners.forEach(function (fn) { fn(spec); });
      // Focus lands on the primary (amber) button when there is one enabled, not just whichever
      // button happens to be first in the footer — so a multi-button dialog's visual "selected"
      // state always matches what Enter (onKeydown, below) actually triggers.
      var primaryBtn = (spec.buttons || []).find(function (b) { return b.variant === 'amber' && !b.disabled; });
      trapAndFocus(card, primaryBtn && primaryBtn._el);
    }

    function advance() {
      if (!queue.length) {
        current = null;
        backdrop.classList.remove('open');
        restoreFocus();
        presentListeners.forEach(function (fn) { fn(null); }); // idle
        return;
      }
      present(queue.shift());
    }

    function push(spec) {
      spec.buttons = spec.buttons || [{ id: 'continue', label: 'Continue', variant: 'amber' }];
      if (!current) present(spec);
      else {
        queue.push(spec);
        badgeEl.textContent = '+' + queue.length + ' queued';
      }
    }

    function onKeydown(e) {
      if (!current || current.modeless) return;
      if (e.key === 'Escape' && current.allowEscape) {
        handleButton(current.escapeButtonId || 'cancel');
      } else if (e.key === 'Enter' && current.allowEnter !== false) {
        const primary = (current.buttons || []).find(function (b) {
          return b.variant === 'amber' && !b.disabled;
        });
        if (primary) handleButton(primary.id);
      }
    }

    function init() {
      build();
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop && current && current.allowBackdropClose) {
          handleButton(current.escapeButtonId || 'cancel');
        }
      });
      document.addEventListener('keydown', onKeydown);
    }

    // Force-dismiss whatever's open/queued without firing any onClose/onButton callback — for a
    // caller (Load Game) that's about to replace the whole game state out from under any in-flight
    // popup chain, where letting a queued callback run afterward would act on stale data.
    function reset() {
      queue.length = 0;
      current = null;
      if (backdrop) backdrop.classList.remove('open');
      restoreFocus();
      presentListeners.forEach(function (fn) { fn(null); });
    }

    // Programmatic press for the automation seam (__mission1Debug.press): same path as a click,
    // refused (false) when the open dialog has no such button or it is disabled — as a click on a
    // disabled button would be.
    function press(id) {
      if (!current || current.modeless) return false;
      const b = (current.buttons || []).find(function (x) { return x.id === id; });
      if (!b || b.disabled) return false;
      handleButton(id);
      return true;
    }
    function bodyText() { return current && !current.modeless && bodyEl ? (bodyEl.innerText || bodyEl.textContent || '') : ''; }
    // fn(spec) whenever an item is presented; fn(null) when the queue goes idle.
    function onPresent(fn) { presentListeners.push(fn); }

    return { init: init, push: push, reset: reset, press: press, bodyText: bodyText, onPresent: onPresent,
      get current() { return current; }, get queueLength() { return queue.length; } };
  })();

  // ---------------------------------------------------------------------
  // Popups — reference material, player-initiated, never queued
  // ---------------------------------------------------------------------
  const Popups = (function () {
    const registry = {};
    let openId = null;
    let backdrop;

    function register(id, buildFn) {
      registry[id] = buildFn;
    }

    function build() {
      backdrop = el('div', 'backdrop');
      backdrop.id = 'popup-backdrop';
      root.appendChild(backdrop);
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) close();
      });
    }

    function open(id, data) {
      if (!registry[id]) return;
      backdrop.innerHTML = '';
      const card = registry[id](data);
      const closeBtn = card.querySelector('[data-close]');
      if (closeBtn) closeBtn.addEventListener('click', close);
      backdrop.appendChild(card);
      backdrop.classList.add('open');
      openId = id;
      trapAndFocus(card);
    }

    function close() {
      backdrop.classList.remove('open');
      openId = null;
      restoreFocus();
    }

    function onKeydown(e) {
      if (e.key === 'Escape' && openId) close();
    }

    function init() {
      build();
      document.addEventListener('keydown', onKeydown);
    }

    return { init: init, register: register, open: open, close: close };
  })();

  // ---------------------------------------------------------------------
  // Toasts — brief, non-blocking notices (illegal-action / error)
  // ---------------------------------------------------------------------
  const Toasts = (function () {
    let stack;

    function init() {
      stack = el('div', 'toast-stack');
      root.appendChild(stack);
    }

    function show(message, opts) {
      opts = opts || {};
      const kind = opts.kind || 'error';
      const t = el('div', 'toast toast-' + kind, message);
      t.addEventListener('click', function () { dismiss(t); });
      stack.appendChild(t);
      const timeout = opts.timeout === undefined ? 4000 : opts.timeout;
      if (timeout > 0) setTimeout(function () { dismiss(t); }, timeout);
      return t;
    }

    function dismiss(t) {
      if (!t.parentNode) return;
      t.classList.add('toast-out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 200);
    }

    return { init: init, show: show };
  })();

  // ---------------------------------------------------------------------
  // FloatDialogs — draggable, closable, non-modal windows (dice tray, etc.)
  // ---------------------------------------------------------------------
  const FloatDialogs = (function () {
    const windows = {};

    function create(id, opts) {
      opts = opts || {};
      const win = el('div', 'float-dialog');
      win.id = 'float-' + id;
      const bar = el('div', 'float-titlebar');
      const label = el('span', null, opts.title || id);
      const closeBtn = el('button', null, '✕');
      bar.appendChild(label);
      bar.appendChild(closeBtn);
      const body = el('div', 'float-body');
      win.appendChild(bar);
      win.appendChild(body);
      root.appendChild(win);
      closeBtn.addEventListener('click', function () { hide(id); });

      let dragging = false, offX = 0, offY = 0;
      bar.addEventListener('mousedown', function (e) {
        dragging = true;
        const rect = win.getBoundingClientRect();
        offX = e.clientX - rect.left;
        offY = e.clientY - rect.top;
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        let x = e.clientX - offX, y = e.clientY - offY;
        x = Math.max(4, Math.min(window.innerWidth - 40, x));
        y = Math.max(4, Math.min(window.innerHeight - 40, y));
        win.style.left = x + 'px';
        win.style.top = y + 'px';
      });
      window.addEventListener('mouseup', function () { dragging = false; });

      windows[id] = { win: win, body: body, opts: opts };
      return windows[id];
    }

    function show(id) {
      const w = windows[id];
      if (!w) return;
      if (w.win.style.display !== 'block') {
        w.win.style.left = opts_or(w, 'left', 'calc(50% - 170px)');
        w.win.style.top = opts_or(w, 'top', '110px');
      }
      w.win.style.display = 'block';
    }
    function opts_or(w, key, fallback) {
      return (w.opts && w.opts[key]) || fallback;
    }

    function hide(id) {
      const w = windows[id];
      if (w) w.win.style.display = 'none';
    }

    function body(id) {
      return windows[id] && windows[id].body;
    }

    return { create: create, show: show, hide: hide, body: body };
  })();

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  function init(rootId) {
    root = document.getElementById(rootId);
    Dialogs.init();
    Popups.init();
    Toasts.init();
  }

  window.AmbushUI = {
    init: init,
    Dialogs: Dialogs,
    Popups: Popups,
    Toasts: Toasts,
    FloatDialogs: FloatDialogs,
  };
})();
