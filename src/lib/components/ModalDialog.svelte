<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy } from 'svelte';

  /**
   * Generic modal dialog frame: overlay, box with title, focus trap, Escape, focus return.
   * Knows nothing about its content, which comes in as children.
   * Mount it only while it should be visible ({#if isOpen}) and only client-side (reads document.activeElement).
   * Tab/Shift+Tab stay inside the dialog; on unmount focus goes back to returnFocusElement
   * (or the element that was focused when the dialog opened).
   * Initial focus: pass initialFocusElement (bound by the content, e.g. an input or the confirm button);
   * it is focused as soon as it is set, with its text selected when selectInitialText is true.
   */

  // Disabled elements are excluded so a disabled Save button is skipped
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  interface Props {
    title: string;
    onCancel: () => void;
    // Element to focus after closing; useful when the opener (e.g. a popover item) disappears
    returnFocusElement?: HTMLElement | null;
    // Element to focus when it becomes available; without it focus stays where it was
    initialFocusElement?: HTMLElement | null;
    // Select the text of initialFocusElement after focusing (text inputs only)
    selectInitialText?: boolean;
    children: Snippet;
  }

  let {
    title,
    onCancel,
    returnFocusElement = null,
    initialFocusElement = null,
    selectInitialText = false,
    children
  }: Props = $props();

  const titleId = $props.id();
  let boxElement: HTMLDivElement | undefined = $state();
  // Captured before the initial focus moves, fallback when no returnFocusElement is given
  const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  // Focus (and optionally select) as soon as the target element is mounted
  $effect(() => {
    if (!initialFocusElement) return;
    initialFocusElement.focus();
    if (selectInitialText && initialFocusElement instanceof HTMLInputElement) initialFocusElement.select();
  });

  // Return focus on every close path (confirm, cancel, Escape, backdrop), the opener decides the target
  onDestroy(() => {
    const target = returnFocusElement ?? previouslyFocusedElement;
    if (target?.isConnected) target.focus();
  });

  // Cycle Tab/Shift+Tab between the focusable elements of the box; also pulls focus back if it left the box
  function trapTabFocus(event: KeyboardEvent) {
    if (!boxElement) return;
    const focusableElements = Array.from(boxElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusableElements.length === 0) return;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const isFocusInside = activeElement instanceof Node && boxElement.contains(activeElement);
    if (event.shiftKey && (!isFocusInside || activeElement === firstElement)) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && (!isFocusInside || activeElement === lastElement)) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  // Window-level so Escape and Tab also work when focus left the content
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      trapTabFocus(event);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  }

  // Only clicks on the backdrop itself cancel, not clicks inside the box
  function onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) onCancel();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="modalDialog" role="presentation" onclick={onOverlayClick}>
  <div bind:this={boxElement} class="modalDialog__box" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <h2 id={titleId} class="modalDialog__title">{title}</h2>
    {@render children()}
  </div>
</div>

<style>
  .modalDialog {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(0 0 0 / 0.4);
  }

  .modalDialog__box {
    width: 100%;
    max-width: 24rem;
    padding: 1rem;
    background: var(--popoverBg);
    color: var(--fg);
    border: var(--borderThin);
    border-radius: var(--radius-2);
    box-shadow: var(--shadow-3);
  }

  .modalDialog__title {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    font-weight: 600;
  }
</style>
