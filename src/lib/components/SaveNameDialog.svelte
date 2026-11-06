<script lang="ts">
  import { Button, FormControl, Input } from '@tableslayer/ui';
  import { untrack } from 'svelte';
  import ModalDialog from './ModalDialog.svelte';
  import { removeFileExtension } from '#lib/utils/fileName.js';

  /**
   * Small modal dialog that asks for a file name before a download.
   * Generic: knows nothing about the project, it only reports the entered name.
   * Mount it only while it should be visible ({#if isOpen}) and only client-side (see ModalDialog);
   * the draft starts from initialName on mount. Focus trap and focus return live in ModalDialog.
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

  // Initial value only on purpose: later prop changes must not overwrite what the user typed
  let draftName = $state(untrack(() => initialName));
  let inputElement: HTMLInputElement | undefined = $state();
  let cleanedName = $derived(removeFileExtension(draftName, extension));
  let isConfirmDisabled = $derived(cleanedName === '');

  // Enter in the field submits the form; guarded so an empty name does nothing
  function onFormSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (isConfirmDisabled) return;
    onConfirm(cleanedName);
  }
</script>

<ModalDialog {title} {onCancel} {returnFocusElement} initialFocusElement={inputElement} selectInitialText>
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
</ModalDialog>

<style>
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
