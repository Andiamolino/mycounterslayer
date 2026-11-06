<script lang="ts">
  import { Button, FormControl, Input } from '@tableslayer/ui';
  import { untrack } from 'svelte';
  import { removeFileExtension } from '#lib/utils/fileName.js';

  /**
   * Small modal dialog that asks for a file name before a download.
   * Generic: knows nothing about the project, it only reports the entered name.
   * Mount it only while it should be visible ({#if isOpen}), the draft starts from initialName on mount.
   */

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
  }

  let { title, initialName, extension, confirmLabel = 'Save', onConfirm, onCancel }: Props = $props();

  const titleId = $props.id();
  // Initial value only on purpose: later prop changes must not overwrite what the user typed
  let draftName = $state(untrack(() => initialName));
  let inputElement: HTMLInputElement | undefined = $state();

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

  // Window-level so Escape also works when focus left the input
  function onWindowKeydown(event: KeyboardEvent) {
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
  <div class="saveNameDialog__box" role="dialog" aria-modal="true" aria-labelledby={titleId}>
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
