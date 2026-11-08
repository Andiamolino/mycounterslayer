<script lang="ts">
  import { Input, FormControl } from '@tableslayer/ui';
  import { commitOptionalDecimalInput } from '#lib/utils/numberInput.js';

  type Props = {
    label: string;
    name: string;
    // undefined = not set (the default applies)
    value: number | undefined;
    // Shown while the field is empty: the default value
    placeholder: number | string;
    // Receives the committed value; undefined = field cleared, remove the optional field
    onCommit: (value: number | undefined) => void;
    unit?: string;
    min?: number;
    max?: number;
  };

  let { label, name, value, placeholder, onCommit, unit = 'mm', min, max }: Props = $props();
</script>

<FormControl {label} {name}>
  {#snippet input({ inputProps })}
    <Input
      {...inputProps}
      type="text"
      inputmode="decimal"
      placeholder={String(placeholder)}
      value={value ?? ''}
      onchange={(e) => onCommit(commitOptionalDecimalInput(e.currentTarget, value ?? null, { min, max }) ?? undefined)}
    />
  {/snippet}
  {#snippet end()}{unit}{/snippet}
</FormControl>
