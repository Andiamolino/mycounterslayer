<script lang="ts" generics="T extends { id: string; name: string }">
  import { Button, ConfirmActionButton, Hr, Icon, Panel, Spacer, Text } from '@tableslayer/ui';
  import type { ComponentProps, Snippet } from 'svelte';
  import { PART_KIND_LABELS } from '#lib/utils/partFile.js';
  import type { DefinitionKind } from '#lib/utils/partPackage.js';

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
    // Number of trays that use the item (shown in the delete warning)
    countTrays: (item: T) => number;
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
    countTrays,
    onDelete,
    summary,
    fields,
    exportButton,
    links
  }: Props = $props();

  const label = $derived(PART_KIND_LABELS[kind]);
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
          {@const trayCount = countTrays(item)}
          <div class="shapePanelActions">
            <Button size="sm" onclick={() => (expandedIndex = null)}>Save</Button>
            {@render exportButton(kind, item.id)}
            <ConfirmActionButton action={() => onDelete(item.id)} actionButtonText="Delete {label}">
              {#snippet trigger({ triggerProps })}
                <Button {...triggerProps} size="sm" variant="ghost">Delete</Button>
              {/snippet}
              {#snippet actionMessage()}
                <div style="max-width: 15rem;">
                  <Text weight={600} color="var(--fgDanger)">Warning</Text>
                  <Spacer size="0.5rem" />
                  {#if trayCount > 0}
                    <Text size="0.875rem">
                      Deleting "{item.name}" will affect
                      <Text as="span" color="var(--fgDanger)">
                        {trayCount}
                        {label} tray{trayCount === 1 ? '' : 's'}
                      </Text> using it.
                    </Text>
                  {:else}
                    <Text size="0.875rem">Delete the "{item.name}" {label}?</Text>
                  {/if}
                  <Spacer size="0.5rem" />
                </div>
              {/snippet}
            </ConfirmActionButton>
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
