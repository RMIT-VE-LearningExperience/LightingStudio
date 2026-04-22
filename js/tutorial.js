// ─── TUTORIAL SYSTEM ─────────────────────────────────────────────────────────

const STEPS = [
  {
    id: 'intro',
    icon: '🎬',
    title: 'Welcome to Lighting Studio',
    body: "In this studio you'll explore how different lights shape shadow, contrast and mood — fundamental skills used across fashion photography, product design, interior styling, film production and visual arts.",
    hint: null,
    highlight: null,
    nextLabel: "Let's begin →",
    waitFor: null,
  },
  {
    id: 'interface',
    icon: '🎛️',
    title: 'Your Studio Controls',
    body: 'The toolbar at the bottom lets you add lights and objects, change your viewing angle, and take screenshots. The top-right panel controls global exposure and bloom. Click and drag on the canvas to orbit the camera.',
    hint: 'Try orbiting now — click and drag anywhere on the studio floor.',
    highlight: '#toolbar',
    nextLabel: 'Got it →',
    waitFor: null,
  },
  {
    id: 'key-light',
    icon: '💡',
    title: 'Meet Your Key Light',
    body: "Your studio already has a Key Light — the primary source. Notice the hard shadow it casts to one side. A single small light creates high contrast: bright highlights opposite deep shadow. This dramatic look appears in editorial fashion, product photography and film noir.",
    hint: 'Click the light stand in the scene to open its controls.',
    highlight: null,
    nextLabel: 'Next →',
    waitFor: null,
  },
  {
    id: 'fill-light',
    icon: '✨',
    title: 'Add a Fill Light',
    body: "A Fill Light reduces shadow contrast by adding soft light from the opposite side. The ratio between Key and Fill controls the mood — high ratio is dramatic and cinematic, even lighting is soft and commercial. This is one of the most important decisions in any shoot.",
    hint: 'Click "Fill Light" in the toolbar below to add one and watch the shadows change.',
    highlight: '[data-role="fill"]',
    nextLabel: 'Next →',
    waitFor: 'fill-added',
    waitLabel: 'Add a Fill Light to continue',
  },
  {
    id: 'capture',
    icon: '📸',
    title: 'Capture & Submit',
    body: "The studio is yours — explore freely. Add more lights, move them, adjust colour temperature and intensity. When your setup looks right, take a screenshot. You'll enter your name and download it for assignment submission.",
    hint: 'Click the 📷 Shot button in the toolbar when you are ready.',
    highlight: '#screenshot-btn',
    nextLabel: 'Start Exploring →',
    waitFor: null,
    isLast: true,
  },
];

let currentStep  = 0;
let fillAdded    = false;
let highlightEl  = null;

// ── Init ─────────────────────────────────────────────────────────────────────

export function initTutorial() {
  const overlay = document.getElementById('tutorial');
  overlay.classList.remove('hidden');
  renderStep(0);

  document.getElementById('tut-next').addEventListener('click', nextStep);
  document.getElementById('tut-skip').addEventListener('click', exitTutorial);

  // Listen for studio events dispatched from main.js
  window.addEventListener('studio:lightAdded', e => {
    if (e.detail.role === 'fill' && !fillAdded) {
      fillAdded = true;
      if (STEPS[currentStep]?.waitFor === 'fill-added') unlockNext();
    }
  });

  document.addEventListener('keydown', onKey);
}

// ── Step rendering ───────────────────────────────────────────────────────────

function renderStep(idx) {
  const step = STEPS[idx];
  currentStep = idx;

  document.getElementById('tut-icon').textContent    = step.icon;
  document.getElementById('tut-title').textContent   = step.title;
  document.getElementById('tut-body').textContent    = step.body;
  document.getElementById('tut-counter').textContent = `${idx + 1} / ${STEPS.length}`;

  // Hint
  const hintEl = document.getElementById('tut-hint');
  if (step.hint) {
    hintEl.textContent = step.hint;
    hintEl.hidden = false;
  } else {
    hintEl.hidden = true;
  }

  // Progress dots
  document.getElementById('tut-dots').innerHTML = STEPS.map((_, i) =>
    `<div class="tut-dot ${i === idx ? 'active' : i < idx ? 'done' : ''}"></div>`
  ).join('');

  // Next button
  const nextBtn = document.getElementById('tut-next');
  nextBtn.textContent = step.nextLabel || 'Next →';

  // Last step styling
  const skipBtn = document.getElementById('tut-skip');
  skipBtn.textContent = step.isLast ? 'Skip' : 'Exit Tutorial';

  // Wait-for lock
  const locked = step.waitFor === 'fill-added' && !fillAdded;
  nextBtn.disabled = locked;
  nextBtn.setAttribute('aria-disabled', locked ? 'true' : 'false');
  nextBtn.title = locked ? (step.waitLabel || '') : '';

  // Highlight
  clearHighlight();
  if (step.highlight) {
    const el = document.querySelector(step.highlight);
    if (el) {
      el.classList.add('tut-highlight');
      highlightEl = el;
    }
  }

  // Animate card in
  const card = document.getElementById('tut-card');
  card.classList.remove('tut-anim-in');
  void card.offsetWidth;
  card.classList.add('tut-anim-in');

  // Focus next button for keyboard users
  if (!locked) nextBtn.focus();
  announce(`Tutorial step ${idx + 1} of ${STEPS.length}: ${step.title}`);
}

// ── Navigation ───────────────────────────────────────────────────────────────

function nextStep() {
  if (currentStep >= STEPS.length - 1) { exitTutorial(); return; }
  renderStep(currentStep + 1);
}

function unlockNext() {
  const btn = document.getElementById('tut-next');
  btn.disabled = false;
  btn.setAttribute('aria-disabled', 'false');
  btn.title = '';
  btn.classList.add('tut-unlocked');
  setTimeout(() => btn.classList.remove('tut-unlocked'), 700);
  announce('Fill Light added. You can now continue.');
}

export function exitTutorial() {
  clearHighlight();
  document.getElementById('tutorial').classList.add('hidden');
  document.removeEventListener('keydown', onKey);
  announce('Tutorial closed. Studio is in free exploration mode.');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clearHighlight() {
  if (highlightEl) { highlightEl.classList.remove('tut-highlight'); highlightEl = null; }
}

function onKey(e) {
  const overlay = document.getElementById('tutorial');
  if (overlay.classList.contains('hidden')) return;
  if (e.key === 'Escape') exitTutorial();
  if ((e.key === 'ArrowRight' || e.key === 'Enter') && e.target.id !== 'tut-skip') {
    const btn = document.getElementById('tut-next');
    if (!btn.disabled) nextStep();
  }
}

function announce(msg) {
  const el = document.getElementById('sr-announce');
  if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = msg; }); }
}

// ── Welcome screen ───────────────────────────────────────────────────────────

export function initWelcome() {
  const screen = document.getElementById('welcome-screen');
  if (!screen) return;

  document.getElementById('btn-start-tutorial').addEventListener('click', () => {
    dismissWelcome(() => initTutorial());
  });

  document.getElementById('btn-open-studio').addEventListener('click', () => {
    dismissWelcome(null);
    announce('Studio is open. Use the toolbar at the bottom to add lights and objects.');
  });

  // Trap focus inside welcome screen
  trapFocus(screen);
}

function dismissWelcome(callback) {
  const screen = document.getElementById('welcome-screen');
  screen.classList.add('ws-exit');
  screen.addEventListener('animationend', () => {
    screen.remove();
    if (callback) callback();
  }, { once: true });
}

// ── Focus trap (accessibility) ────────────────────────────────────────────────

function trapFocus(el) {
  const focusable = () => el.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  el.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const els  = [...focusable()];
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
  });
}
