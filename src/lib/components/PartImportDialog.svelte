<script lang="ts">
  import { Button } from '@tableslayer/ui';
  import ModalDialog from './ModalDialog.svelte';
  import type { PartImportPreview } from '#lib/utils/partFile.js';

  /**
   * Confirmation dialog before a part is imported.
   * Generic: shows only the texts it is given (title, name, values, result) and reports confirm/cancel.
   * Mount it only while it should be visible ({#if isOpen}) and only client-side (see ModalDialog).
   * The confirm button gets the initial focus, so Enter confirms.
   */

  interface Props {
    preview: PartImportPreview;
    onConfirm: () => void;
    onCancel: () => void;
    // Element to focus after closing, usually the import link that opened the file chooser
    returnFocusElement?: HTMLElement | null;
  }

  let { preview, onConfirm, onCancel, returnFocusElement = null }: Props = $props();

  // Button does not expose its element, so it is looked up in the form
  let formElement: HTMLFormElement | undefined = $state();
  let confirmButton = $derived(formElement?.querySelector<HTMLElement>('button[type="submit"]') ?? null);

  function onFormSubmit(event: SubmitEvent) {
    event.preventDefault();
    onConfirm();
  }
</script>

<ModalDialog title={preview.title} {onCancel} {returnFocusElement} initialFocusElement={confirmButton}>
  <dl class="partImportDialog__preview">
    <dt>Name</dt>
    <dd>{preview.name}</dd>
    <dt>Values</dt>
    <dd>{preview.values}</dd>
    <dt>Result</dt>
    <dd>{preview.result}</dd>
  </dl>
  <form bind:this={formElement} class="partImportDialog__form" onsubmit={onFormSubmit}>
    <div class="partImportDialog__actions">
      <Button type="button" variant="ghost" onclick={onCancel}>Cancel</Button>
      <Button type="submit">{preview.confirmLabel}</Button>
    </div>
  </form>
</ModalDialog>

<style>
  .partImportDialog__preview {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.75rem;
    margin: 0 0 1rem;
    font-size: 0.875rem;
  }

  .partImportDialog__preview dt {
    color: var(--fgMuted);
  }

  .partImportDialog__preview dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .partImportDialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
