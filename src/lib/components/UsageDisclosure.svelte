<script lang="ts">
  import { Icon } from '@tableslayer/ui';
  import { IconChevronDown, IconChevronRight } from '@tabler/icons-svelte';
  import type { DefinitionKind } from '#lib/utils/partPackage.js';
  import { formatTrayUsage, summarizeTrayUsages, type TrayUsage } from '#lib/utils/partReferences.js';

  // Collapsible "Used in N trays · M boxes" line of an expanded definition. Collapsed by default.
  type Props = {
    // Trays that use the definition (see findTraysReferencing)
    usages: TrayUsage[];
    // Only used for the test IDs
    kind: DefinitionKind;
  };

  let { usages, kind }: Props = $props();

  let open = $state(false);
  const summary = $derived(summarizeTrayUsages(usages));
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  // Loose trays are no box: leave the box part out when there is none
  const label = $derived(
    usages.length === 0
      ? 'Not used'
      : `Used in ${plural(summary.trays, 'tray', 'trays')}${
          summary.boxes > 0 ? ` · ${plural(summary.boxes, 'box', 'boxes')}` : ''
        }`
  );
</script>

<div class="usageDisclosure">
  {#if usages.length === 0}
    <span class="usageDisclosure__none" data-testid="usageToggle-{kind}">{label}</span>
  {:else}
    <button
      type="button"
      class="usageDisclosure__toggle"
      aria-expanded={open}
      data-testid="usageToggle-{kind}"
      onclick={() => (open = !open)}
    >
      <Icon Icon={open ? IconChevronDown : IconChevronRight} size={16} />
      <span>{label}</span>
    </button>
    {#if open}
      <ul class="usageDisclosure__list" data-testid="usageList-{kind}">
        {#each usages as usage (usage.trayId)}
          <li class="usageDisclosure__item" data-testid="usageItem-{kind}">
            {formatTrayUsage(usage)}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .usageDisclosure {
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  .usageDisclosure__toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 2.25rem;
    padding: 0 0.25rem;
    border: none;
    background: none;
    color: var(--fg);
    font: inherit;
    cursor: pointer;
    border-radius: var(--radius-1);
  }

  .usageDisclosure__toggle:hover {
    background: var(--contrastLow);
  }

  .usageDisclosure__none {
    display: inline-block;
    padding: 0.5rem 0.25rem;
    color: var(--fgMuted);
  }

  .usageDisclosure__list {
    margin: 0 0 0 1.5rem;
    padding: 0;
    list-style: none;
  }

  .usageDisclosure__item {
    padding: 0.125rem 0;
    overflow-wrap: anywhere;
  }
</style>
