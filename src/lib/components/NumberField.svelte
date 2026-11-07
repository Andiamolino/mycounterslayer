<script lang="ts">
  import { Input, FormControl } from '@tableslayer/ui';
  import { commitDecimalInput, type DecimalInputOptions } from '#lib/utils/numberInput.js';

  type Props = {
    label: string;
    name: string;
    value: number;
    // Receives the committed (parsed and clamped) value
    onCommit: (value: number) => void;
    // Commit helper; default is the plain decimal parser, e.g. pass clampFloorInput for floor fields
    commit?: (input: HTMLInputElement, current: number, opts?: DecimalInputOptions) => number;
    opts?: DecimalInputOptions;
    unit?: string;
  };

  let { label, name, value, onCommit, commit = commitDecimalInput, opts, unit = 'mm' }: Props = $props();
</script>

<FormControl {label} {name}>
  {#snippet input({ inputProps })}
    <Input
      {...inputProps}
      type="text"
      inputmode="decimal"
      {value}
      onchange={(e) => onCommit(commit(e.currentTarget, value, opts))}
    />
  {/snippet}
  {#snippet end()}{unit}{/snippet}
</FormControl>
