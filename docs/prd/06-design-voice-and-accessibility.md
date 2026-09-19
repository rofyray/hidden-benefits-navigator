# Nature design, voice and accessibility

## Visual direction

Use the user's Nature theme by Serafim, linked at [21st.dev Nature](https://21st.dev/@serafimcloud/themes/nature). The supplied CSS below is the implementation baseline because the live gallery did not expose the complete token definition in retrieved text. Warm cream, forest green, generous whitespace and a clear action hierarchy should feel welcoming. Montserrat is the interface font; Merriweather is for brief explanatory blocks. Self-host licensed font assets with `font-display:swap`; keep system fallbacks. Base text 18px, line-height 1.5–1.6, content width 48–64rem, readable card measure about 65 characters, radius 0.5rem.

Use explicit light/dark/system controls. Persist only the theme preference. Apply system preference before first paint to avoid a bright flash, and test that theme changes do not reset intake. Mobile layouts must work even where local AI does not; show the supported manual/cloud options.

## Supplied tokens

```css
:root {
  --card: #f8f5f0;
  --ring: #2e7d32;
  --input: #e0d6c9;
  --muted: #f0e9e0;
  --accent: #c8e6c9;
  --border: #e0d6c9;
  --radius: 0.5rem;
  --chart-1: #4caf50;
  --chart-2: #388e3c;
  --chart-3: #2e7d32;
  --chart-4: #1b5e20;
  --chart-5: #0a1f0c;
  --popover: #f8f5f0;
  --primary: #2e7d32;
  --sidebar: #f0e9e0;
  --font-mono: Source Code Pro, monospace;
  --font-sans: Montserrat, sans-serif;
  --secondary: #e8f5e9;
  --background: #f8f5f0;
  --font-serif: Merriweather, serif;
  --foreground: #3e2723;
  --destructive: #c62828;
  --sidebar-ring: #2e7d32;
  --sidebar-accent: #c8e6c9;
  --sidebar-border: #e0d6c9;
  --card-foreground: #3e2723;
  --sidebar-primary: #2e7d32;
  --muted-foreground: #6d4c41;
  --accent-foreground: #1b5e20;
  --popover-foreground: #3e2723;
  --primary-foreground: #ffffff;
  --sidebar-foreground: #3e2723;
  --secondary-foreground: #1b5e20;
  --destructive-foreground: #ffffff;
  --sidebar-accent-foreground: #1b5e20;
  --sidebar-primary-foreground: #ffffff;
}

.dark {
  --card: #2d3a2e;
  --ring: #4caf50;
  --input: #3e4a3d;
  --muted: #252f26;
  --accent: #388e3c;
  --border: #3e4a3d;
  --radius: 0.5rem;
  --chart-1: #81c784;
  --chart-2: #66bb6a;
  --chart-3: #4caf50;
  --chart-4: #43a047;
  --chart-5: #388e3c;
  --popover: #2d3a2e;
  --primary: #4caf50;
  --sidebar: #1c2a1f;
  --secondary: #3e4a3d;
  --background: #1c2a1f;
  --foreground: #f0ebe5;
  --destructive: #c62828;
  --sidebar-ring: #4caf50;
  --sidebar-accent: #388e3c;
  --sidebar-border: #3e4a3d;
  --card-foreground: #f0ebe5;
  --sidebar-primary: #4caf50;
  --muted-foreground: #d7cfc4;
  --accent-foreground: #f0ebe5;
  --popover-foreground: #f0ebe5;
  --primary-foreground: #0a1f0c;
  --sidebar-foreground: #f0ebe5;
  --secondary-foreground: #d7e0d6;
  --destructive-foreground: #f0ebe5;
  --sidebar-accent-foreground: #f0ebe5;
  --sidebar-primary-foreground: #0a1f0c;
}
```

Apply the user's requested stronger light-mode action color as an intentional override; validate contrast in the built UI rather than relying on the prose estimate:

```css
:root:not(.dark) {
  --primary: oklch(0.47 0.14 144);
  --sidebar-primary: oklch(0.47 0.14 144);
}
html { color-scheme: light; }
html.dark { color-scheme: dark; }
body {
  margin: 0; background: var(--background); color: var(--foreground);
  font-family: var(--font-sans); font-size: 1.125rem; line-height: 1.55;
}
button, input, textarea, select { font: inherit; }
:focus-visible { outline: 3px solid var(--ring); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; }
}
```

Use CSS variables directly in this Vite baseline. Tailwind is optional; if added, map font variables with the correct `--font-*` namespace rather than blindly copying the supplied `--color-font-*` aliases. Ensure error, warning, success, disabled, focus and selected states each meet their contrast requirements in both modes. The supplied borders may be too subtle for interactive controls: strengthen control boundaries if testing shows failure without changing decorative dividers unnecessarily.

## Screens and component behavior

| Screen | Required content and actions | Loading/empty/error behavior |
|---|---|---|
| Welcome/intake | Title, Texas/six-program scope, brief privacy notice, theme, microphone CTA, visible labeled text area, “Continue” | Manual path visible during downloads; empty Continue explains what to enter; no autoplay |
| Setup | Separate local AI and speech-pack readiness; optional download action; progress; “Use guided form” | No infinite spinner; retry and alternative; no cloud switch without choice |
| Review | Editable extracted facts, unknown choices, confirm action, “Change my description” | Highlight uncertainty in words; errors adjacent to fields; preserve manual corrections |
| Follow-up | Exactly one question; answer control, play, microphone/text, Skip | Show prior facts for context; maximum-turn fallback; no forced answer |
| Processing | “Finding options” then “Checking next steps,” cancel | Stage timeouts produce reviewed fallback content; never show unverified prose |
| Results | Ranked cards, program count, current processing badge, Edit facts, Start over | Separate no clear match, unsupported state, incomplete facts, expired sources and outage messages |
| Program card | Name, label + icon, value description, 1–3 explanation sentences, checklist, official CTA, Play/Stop, source/date expander | Curated fallback visibly labeled; no unavailable estimate disguised as $0 |

Each card checklist uses native checkbox controls, a visible item label and optional “may need” annotation. User action checks are local session progress, distinct from the implementation checkboxes in these PRDs. A card's completion count is announced politely; do not imply the application has been submitted. Avoid nested clickable cards and unlabeled icon buttons.

Use “Not a clear match” with neutral styling, not a red rejection. Error red is for actual problems. “Possibly” includes the specific missing fact or official step. Low-confidence programs may be collapsed under “Other programs checked”; do not permanently hide all evidence of them. Human help means an official agency/referral link, not a promise that a staffed chat exists.

## Local speech-recognition lifecycle

The provided brief and [Web Speech documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) describe on-device recognition with `processLocally=true`. Feature-detect it before use. A prefixed/legacy recognizer without verified local support is not a substitute for a privacy-preserving path.

```js
async function localSpeechStatus() {
  if (!('SpeechRecognition' in globalThis) ||
      typeof SpeechRecognition.available !== 'function') return 'unavailable';
  return SpeechRecognition.available({ langs: ['en-US'], processLocally: true });
}
async function installLocalSpeech() {
  if (!('SpeechRecognition' in globalThis) ||
      typeof SpeechRecognition.install !== 'function') return false;
  return SpeechRecognition.install({ langs: ['en-US'], processLocally: true });
}
function makeLocalRecognizer() {
  if (!('SpeechRecognition' in globalThis)) throw new Error('local_unavailable');
  const recognizer = new SpeechRecognition();
  if (!('processLocally' in recognizer)) throw new Error('local_unavailable');
  recognizer.processLocally = true;
  recognizer.lang = 'en-US';
  recognizer.interimResults = true;
  recognizer.continuous = false;
  return recognizer; // Attach handlers before start(), invoked from a user action.
}
```

Implement final/interim transcript buffers keyed by result index so final segments are not appended twice. Microphone states: idle, requesting, listening, stopping, denied, unavailable, error. Listen only after the user starts it; show an obvious live indicator and Stop. Do not create recordings or MediaRecorder blobs. On `no-speech`, `audio-capture`, `not-allowed`, `language-not-supported`, network failure, or unexpected end, preserve text and provide a clear next action. One explicit retry is enough; never loop microphone prompts.

Stop/abort on reset, navigation, page hide, and before starting playback. A voice follow-up's answer is added to the relevant field, not blindly appended as a new full household story. Text corrections remain possible. Test in venue noise and with a screen reader, including the possibility that recognition hears its own spoken prompt.

## Playback

Use `speechSynthesis` with an English voice whose `localService` is true; handle asynchronous `voiceschanged`. See [local voice property](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService). If no tested local voice is available, keep text usable and explain audio unavailability. Do not quietly choose a remote voice while promising local audio.

Play only after an explicit tap or a previously enabled spoken-follow-up mode. Read the program name, preliminary label, short explanation, value caveat, and checklist in that order. Do not read long URLs. One global utterance queue: starting another card cancels the old one; Stop always works. Update controls on end/error, cancel on edits/reset, and recover if the voice disappears. Use a tested default rate near normal with an optional slower setting. Expose the exact spoken content as text. Results never auto-play.

## Accessibility acceptance

Target [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/quickref/). Product acceptance additionally uses 44×44 CSS-pixel target areas where practical and 18px base text. These product choices are intentionally stronger than some minimum criteria.

- [ ] Complete every journey with keyboard only; visible focus and logical order; no keyboard traps.
- [ ] Use semantic headings, native form labels, descriptive links, proper checkbox grouping and announced errors.
- [ ] Move focus to review/results headings after intentional transitions; do not steal focus for every interim speech update.
- [ ] Use a polite live region for stage status; suppress per-character transcript announcements.
- [ ] Meet 4.5:1 for normal text, 3:1 for large text and necessary non-text UI; verify focus/error/selected states in both themes.
- [ ] Support 200% zoom, 320 CSS-pixel reflow, reduced motion and high-contrast/forced-colors testing.
- [ ] Pair every semantic color with text or a recognizable icon plus accessible name.
- [ ] Manually check one screen-reader journey and actual microphone/playback behavior; automated checks supplement these.
- [ ] Keep language plain; expand SNAP/WIC/EITC on first use; never hide the program's official name.

## Required exact privacy copy

Default local mode: “Your voice and description stay on this device. We send limited household details and draft plan text to our server and Jev to check your options and next steps.”

Cloud-text choice: “This device cannot run the local text model. You can use the guided form, or send your typed description for cloud processing. Do not include names, Social Security numbers, addresses or account numbers.” Buttons: “Use guided form” / “Use cloud text processing.”

Only show provider-retention details supported by the deployed provider settings. “Nothing personal leaves this device” and “never stored anywhere” are prohibited because they misstate the actual architecture.
