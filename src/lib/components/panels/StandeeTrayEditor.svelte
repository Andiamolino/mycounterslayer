<script lang="ts">
  import SlottedTrayEditor from './SlottedTrayEditor.svelte';
  import type { SlottedTrayFieldText } from './SlottedTrayFields.svelte';
  import type { StandeeTray } from '#lib/types/project.js';
  import { type StandeeTrayParams, getStandeeTrayDimensions, getStandeeRowCounts } from '#lib/models/standeeTray.js';
  import { getStandees } from '#lib/stores/project.svelte.js';

  const FIELD_TEXT: SlottedTrayFieldText = {
    innerWall: 'Slot wall thickness',
    innerWallHint: 'Thickness of the slotted walls.',
    rimHeight: 'Wall height above standees',
    rimHeightHint: 'How far the outer walls rise above the highest standee.',
    width: 'Tray width',
    length: 'Tray length',
    elements: 'standees'
  };

  interface Props {
    tray: StandeeTray;
    onUpdateParams: (params: StandeeTrayParams) => void;
    actualHeight?: number;
    displayDimensions?: { width: number; depth: number; height: number } | null;
  }

  let { tray, onUpdateParams, actualHeight, displayDimensions }: Props = $props();

  let standees = $derived(getStandees());
  let selectedStandee = $derived(standees.find((s) => s.id === tray.params.standeeId));

  let rowCounts = $derived(getStandeeRowCounts(tray.params.count));
  let distributionText = $derived(`Left ${rowCounts[0]} + right ${rowCounts[1]} = ${rowCounts[0] + rowCounts[1]}`);

  function updateParam<K extends keyof StandeeTrayParams>(key: K, value: StandeeTrayParams[K]) {
    onUpdateParams({ ...tray.params, [key]: value });
  }
</script>

<SlottedTrayEditor
  params={tray.params}
  title="Standee"
  typeLabel="Standee type"
  typeName="standeeId"
  selectedId={tray.params.standeeId}
  options={standees.map((s) => ({
    value: s.id,
    label: `${s.name} (${(s.baseRadius * 2).toFixed(0)}mm base)`
  }))}
  onSelectId={(id) => updateParam('standeeId', id)}
  selectedInfo={selectedStandee
    ? `${selectedStandee.standeeWidth}mm × ${selectedStandee.standeeHeight}mm figure, ${(selectedStandee.baseRadius * 2).toFixed(0)}mm base`
    : undefined}
  countTitle="Standee Count"
  countLabel="Number of standees"
  distributionTestid="standeeDistribution"
  {distributionText}
  distributionInfo="Split across two opposing slotted walls; an odd one goes left."
  calcDimensions={(params) => getStandeeTrayDimensions({ ...tray.params, ...params }, standees)}
  {actualHeight}
  {displayDimensions}
  onUpdate={(key, value) => onUpdateParams({ ...tray.params, [key]: value })}
  onUpdateCount={(count) => updateParam('count', count)}
  fieldText={FIELD_TEXT}
/>
