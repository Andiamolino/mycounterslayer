<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Input, FormControl } from '@tableslayer/ui';

  // Labelled mm field with a hint below; `extra` renders further hints inside the field block
  interface Props {
    label: string;
    name: string;
    hint: string;
    hintTestid: string;
    value: string | number;
    onChange: (input: HTMLInputElement) => void;
    extra?: Snippet;
    placeholder?: string;
    inputTestid?: string;
  }

  let { label, name, hint, hintTestid, value, onChange, extra, placeholder, inputTestid }: Props = $props();
</script>

<div class="field">
  <FormControl {label} {name}>
    {#snippet input({ inputProps })}
      <Input
        {...inputProps}
        type="text"
        inputmode="decimal"
        data-testid={inputTestid}
        {placeholder}
        {value}
        onchange={(e) => onChange(e.currentTarget)}
      />
    {/snippet}
    {#snippet end()}mm{/snippet}
  </FormControl>
  <p class="standeeInfo fieldHint" data-testid={hintTestid}>{hint}</p>
  {@render extra?.()}
</div>

<style>
  .standeeInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }

  .fieldHint {
    margin-top: 0.25rem;
  }
</style>
