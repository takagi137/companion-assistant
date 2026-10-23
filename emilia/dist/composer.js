// Mouse, touch, form submission and Enter share exactly one path.
export function acceptTranscript({ input, text, autoSend, canSend, submit, changed }) {
  const hadDraft = Boolean(input.value.trim());
  const joined = `${input.value}${hadDraft ? '\n' : ''}${text}`;
  if (joined.length > 1000) return false;
  input.value = joined; changed();
  if (autoSend && !hadDraft && canSend()) { submit(joined); return 'sent'; }
  return true;
}
export function bindComposer({ form, input, button, submit, changed }) {
  const send = event => { event.preventDefault(); submit(input.value); };
  button.addEventListener('click', send);
  form.addEventListener('submit', send);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault(); if (!event.repeat) submit(input.value);
    }
  });
  for (const event of ['input', 'change', 'compositionend']) input.addEventListener(event, changed);
}
