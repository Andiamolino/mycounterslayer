<script lang="ts" generics="T extends { id: string; name: string }">
  import { Button, Hr, Icon, Panel, Spacer } from '@tableslayer/ui';
  import type { ComponentProps, Snippet } from 'svelte';
  import DefinitionDeleteButton from './DefinitionDeleteButton.svelte';
  import UsageDisclosure from './UsageDisclosure.svelte';
  import type { DefinitionKind } from '#lib/utils/partPackage.js';
  import type { TrayUsage } from '#lib/utils/partReferences.js';

  // List section for a global definition (standees, tiles) under Dimensions: collapsed summary rows,
  // one expanded edit form with Save / Export / Delete. The row, panel and button styles
  // (.shapeCard, .shapePanelContent, ...) are global classes defined in GlobalsPanel.svelte.
  type Props = {
    kind: DefinitionKind;
    title: string;
    items: T[];
    // Index of the expanded item (null = none)
    expandedIndex: number | null;
    // Icon in front of the name in the collapsed row
    icon: ComponentProps<typeof Icon>['Icon'];
    // Trays that use the item (a used item cannot be deleted)
    usages: (item: T) => TrayUsage[];
    onDelete: (id: string) => void;
    // Collapsed row: text after the name
    summary: Snippet<[T]>;
    // Expanded form content (inside the panel, above the actions)
    fields: Snippet<[T, number]>;
    // Export button of the parent (aria-label, handler)
    exportButton: Snippet<[DefinitionKind, string]>;
    // Add / import links below the list
    links: Snippet;
  };

  let {
    kind,
    title,
    items,
    expandedIndex = $bindable(),
    icon,
    usages: usagesOf,
    onDelete,
    summary,
    fields,
    exportButton,
    links
  }: Props = $props();
</script>

<section class="section">
  <h3 class="sectionTitle">{title}</h3>
  <Spacer size="0.5rem" />
  <div class="customShapesList">
    {#each items as item, index (item.id)}
      {#if expandedIndex === index}
        <!-- Expanded view: full form in Panel -->
        <Panel class="shapePanel">
          <div class="shapePanelContent">
            {@render fields(item, index)}
          </div>
          <Hr />
          {@const usages = usagesOf(item)}
          <UsageDisclosure {kind} {usages} />
          <div class="shapePanelActions">
            <Button size="sm" onclick={() => (expandedIndex = null)}>Save</Button>
            {@render exportButton(kind, item.id)}
            <DefinitionDeleteButton {kind} name={item.name} {usages} onDelete={() => onDelete(item.id)} />
          </div>
        </Panel>
      {:else}
        <div class="shapeCard">
          <!-- Collapsed view: compact summary -->
          <button class="shapeSummary" onclick={() => (expandedIndex = index)} title="Click to edit {item.name}">
            <span class="shapeIcon">
              <Icon Icon={icon} size={16} />
            </span>
            <span class="shapeName">{item.name}</span>
            <span class="shapeSize">{@render summary(item)}</span>
          </button>
        </div>
      {/if}
    {/each}
  </div>
  <Spacer />
  {@render links()}
</section>
