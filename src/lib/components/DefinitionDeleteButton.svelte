<script lang="ts">
  import { Button, ConfirmActionButton, Spacer, Text } from '@tableslayer/ui';
  import { PART_KIND_LABELS } from '#lib/utils/partFile.js';
  import type { DefinitionKind } from '#lib/utils/partPackage.js';
  import { formatTrayUsages, type TrayUsage } from '#lib/utils/partReferences.js';

  // Delete action for a global definition (counter, card size, standee, tile). A definition that
  // trays still use cannot be deleted: the click shows where it is used instead of deleting.
  type Props = {
    kind: DefinitionKind;
    name: string;
    // Trays that use the definition (empty = may be deleted)
    usages: TrayUsage[];
    onDelete: () => void;
  };

  let { kind, name, usages, onDelete }: Props = $props();

  const label = $derived(PART_KIND_LABELS[kind]);
  let showNotice = $state(false);
  // Forget a shown notice once the definition is no longer in use
  $effect(() => {
    if (usages.length === 0) showNotice = false;
  });
</script>

{#if usages.length > 0}
  <Button size="sm" variant="ghost" data-testid="deleteDefinition-{kind}" onclick={() => (showNotice = true)}>
    Delete
  </Button>
  {#if showNotice}
    <div class="definitionInUse" role="alert" data-testid="definitionInUse-{kind}">
      <Text size="0.875rem" color="var(--fgDanger)">"{name}" is in use and cannot be deleted.</Text>
      <Text size="0.875rem" data-testid="definitionInUseList-{kind}">Used in: {formatTrayUsages(usages)}</Text>
    </div>
  {/if}
{:else}
  <ConfirmActionButton action={onDelete} actionButtonText="Delete {label}">
    {#snippet trigger({ triggerProps })}
      <Button {...triggerProps} size="sm" variant="ghost" data-testid="deleteDefinition-{kind}">Delete</Button>
    {/snippet}
    {#snippet actionMessage()}
      <div style="max-width: 15rem;">
        <Text weight={600} color="var(--fgDanger)">Warning</Text>
        <Spacer size="0.5rem" />
        <Text size="0.875rem">Delete the "{name}" {label}?</Text>
        <Spacer size="0.5rem" />
      </div>
    {/snippet}
  </ConfirmActionButton>
{/if}

<style>
  .definitionInUse {
    flex-basis: 100%;
    margin-top: 0.5rem;
  }
</style>
