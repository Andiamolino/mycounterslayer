<script lang="ts">
  import { tick } from 'svelte';
  import { Input } from '@tableslayer/ui';
  import { getProject, updateProjectName } from '#lib/stores/project.svelte.js';

  /**
   * Inline editor for the project name in the app header.
   * Reads and writes project.name only through the project store.
   */

  let projectName = $derived(getProject().name);
  let isEditing = $state(false);
  let draftName = $state('');
  let inputElement: HTMLInputElement | undefined = $state();
  let buttonElement: HTMLButtonElement | undefined = $state();

  // Focus and select the text as soon as the input is mounted
  $effect(() => {
    if (isEditing && inputElement) {
      inputElement.focus();
      inputElement.select();
    }
  });

  function startEditing() {
    draftName = projectName;
    isEditing = true;
  }

  // Guarded by isEditing so the blur that follows Enter/Escape does not save again
  function commitEditing() {
    if (!isEditing) return;
    isEditing = false;
    updateProjectName(draftName);
    restoreFocus();
  }

  function cancelEditing() {
    isEditing = false;
    restoreFocus();
  }

  // Return keyboard focus to the name button once the input is replaced
  async function restoreFocus() {
    await tick();
    buttonElement?.focus();
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditing();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  }
</script>

{#if isEditing}
  <Input
    bind:element={inputElement}
    bind:value={draftName}
    type="text"
    class="projectNameEditor__input"
    aria-label="Project name"
    hideAutocomplete
    onkeydown={onInputKeydown}
    onblur={commitEditing}
  />
{:else}
  <button
    bind:this={buttonElement}
    type="button"
    class="projectNameEditor__display"
    title="Rename project"
    onclick={startEditing}
  >
    <span class="projectNameEditor__name">{projectName}</span>
    <span class="projectNameEditor__pencil" aria-hidden="true">✎</span>
  </button>
{/if}

<style>
  .projectNameEditor__display {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--fg);
    cursor: pointer;
  }

  .projectNameEditor__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 20rem;
  }

  .projectNameEditor__pencil {
    color: var(--fgMuted);
  }

  .projectNameEditor__display:hover .projectNameEditor__pencil {
    color: var(--fg);
  }

  /* Keep the header height stable while editing */
  :global(.input.projectNameEditor__input) {
    height: 1.5rem;
    width: 16rem;
    padding: 0 0.5rem;
    font-size: inherit;
  }
</style>
