<script lang="ts">
  import { Button, FormControl, Input } from '@tableslayer/ui';
  import { onDestroy, untrack } from 'svelte';
  import { removeFileExtension } from '#lib/utils/fileName.js';

  /**
   * Small modal dialog that asks for a file name before a download.
   * Generic: knows nothing about the project, it only reports the entered name.
   * Mount it only while it should be visible ({#if isOpen}) and only client-side (reads document.activeElement);
   * the draft starts from initialName on mount.
   * Tab/Shift+Tab stay inside the dialog; on unmount focus goes back to returnFocusElement
   * (or the element that was focused when the dialog opened).
   */

  // Disabled elements are excluded so a disabled Save button is skipped
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  interface Props {
    title: string;
    // Pre-filled name without extension
    initialName: string;
    // Fixed extension shown after the field, including the dot, e.g. ".json"
    extension: string;
    confirmLabel?: string;
    // Receives the trimmed name with a trailing extension removed, never empty
    onConfirm: (name: string) => void;
    onCancel: () => void;
    // Element to focus after closing; useful when the opener (e.g. a popover item) disappears
    returnFocusElement?: HTMLElement | null;
  }

  let {
    title,
    initialName,
    extension,
    confirmLabel = 'Save',
    onConfirm,
    onCancel,
    returnFocusElement = null
  }: Props = $props();

  const titleId = $props.id();
  // Initial value only on purpose: later prop changes must not overwrite what the user typed
  let draftName = $state(untrack(() => initialName));
  let inputElement: HTMLInputElement | undefined = $state();
  let boxElement: HTMLDivElement | undefined = $state();
  // Captured before the input takes focus, fallback when no returnFocusElement is given
  const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  let cleanedName = $derived(removeFileExtension(draftName, extension));
  let isConfirmDisabled = $derived(cleanedName === '');

  // Focus and select the text as soon as the input is mounted
  $effect(() => {
    if (inputElement) {
      inputElement.focus();
      inputElement.select();
    }
  });

  // Enter in the field submits the form; guarded so an empty name does nothing
  function onFormSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (isConfirmDisabled) return;
    onConfirm(cleanedName);
  }

  // Return focus on every close path (Save, Cancel, Escape, backdrop), the opener decides the target
  onDestroy(() => {
    const target = returnFocusElement ?? previouslyFocusedElement;
    if (target?.isConnected) target.focus();
  });

  // Cycle Tab/Shift+Tab between the focusable elements of the box; also pulls focus back if it left the box
  function trapTabFocus(event: KeyboardEvent) {
    if (!boxElement) return;
    const focusableElements = Array.from(boxElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusableElements.length === 0) return;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const isFocusInside = activeElement instanceof Node && boxElement.contains(activeElement);
    if (event.shiftKey && (!isFocusInside || activeElement === firstElement)) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && (!isFocusInside || activeElement === lastElement)) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  // Window-level so Escape and Tab also work when focus left the input
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      trapTabFocus(event);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  }

  // Only clicks on the backdrop itself cancel, not clicks inside the box
  function onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) onCancel();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="saveNameDialog" role="presentation" onclick={onOverlayClick}>
  <div bind:this={boxElement} class="saveNameDialog__box" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <h2 id={titleId} class="saveNameDialog__title">{title}</h2>
    <form class="saveNameDialog__form" onsubmit={onFormSubmit}>
      <FormControl label="File name" name="saveFileName">
        {#snippet input({ inputProps })}
          <Input {...inputProps} bind:element={inputElement} bind:value={draftName} type="text" hideAutocomplete />
        {/snippet}
        {#snippet end()}{extension}{/snippet}
      </FormControl>
      <div class="saveNameDialog__actions">
        <Button type="button" variant="ghost" onclick={onCancel}>Cancel</Button>
        <Button type="submit" isDisabled={isConfirmDisabled}>{confirmLabel}</Button>
      </div>
    </form>
  </div>
</div>

<style>
  .saveNameDialog {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(0 0 0 / 0.4);
  }

  .saveNameDialog__box {
    width: 100%;
    max-width: 24rem;
    padding: 1rem;
    background: var(--popoverBg);
    color: var(--fg);
    border: var(--borderThin);
    border-radius: var(--radius-2);
    box-shadow: var(--shadow-3);
  }

  .saveNameDialog__title {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .saveNameDialog__form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .saveNameDialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
