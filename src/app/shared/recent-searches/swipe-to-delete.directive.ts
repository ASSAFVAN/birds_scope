import { DestroyRef, Directive, ElementRef, inject, output, signal } from '@angular/core';

/** Movement (px) before a gesture is classified as a horizontal swipe or a vertical scroll. */
const DIRECTION_LOCK_PX = 10;
/** A swipe deletes when it travels past this share of the row width (but at least MIN_DELETE_PX). */
const DELETE_RATIO = 0.35;
const MIN_DELETE_PX = 80;
const ANIMATION_MS = 180;

/**
 * Touch swipe-to-delete for a list row: drag sideways to reveal what's behind the
 * element, past the threshold to emit `swipeDelete`, otherwise it snaps back.
 * Mouse input is ignored (desktop uses the row's remove button). Vertical scrolling
 * stays native via touch-action: pan-y, and the click that ends a swipe is swallowed
 * so swiping never also activates the row.
 */
@Directive({
  selector: '[appSwipeToDelete]',
  host: {
    '[style.transform]': 'offset() ? "translateX(" + offset() + "px)" : null',
    '[style.transition]': 'dragging() ? "none" : "transform ' + ANIMATION_MS + 'ms ease-out"',
    '[style.touch-action]': '"pan-y"',
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp()',
    '(pointercancel)': 'reset()',
  },
})
export class SwipeToDeleteDirective {
  readonly swipeDelete = output<void>();

  protected readonly offset = signal(0);
  protected readonly dragging = signal(false);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private horizontal: boolean | null = null;
  private suppressClick = false;
  private removeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Capture phase, so the row's own (click) handler never sees the click that ends a swipe.
    const swallow = (event: MouseEvent) => {
      if (!this.suppressClick) return;
      this.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    this.el.addEventListener('click', swallow, true);
    inject(DestroyRef).onDestroy(() => {
      this.el.removeEventListener('click', swallow, true);
      clearTimeout(this.removeTimer);
    });
  }

  protected onDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' || this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.horizontal = null;
    this.suppressClick = false;
  }

  protected onMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    if (this.horizontal === null) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      this.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!this.horizontal) return this.reset();
      this.dragging.set(true);
      this.suppressClick = true;
      this.el.setPointerCapture?.(event.pointerId);
    }
    this.offset.set(dx);
  }

  protected onUp(): void {
    if (this.pointerId === null) return;
    const dx = this.offset();
    const width = this.el.offsetWidth;
    this.pointerId = null;
    this.dragging.set(false);
    if (this.horizontal && Math.abs(dx) >= Math.max(MIN_DELETE_PX, width * DELETE_RATIO)) {
      // Slide the row out, then remove it.
      this.offset.set(Math.sign(dx) * Math.max(width, MIN_DELETE_PX));
      this.removeTimer = setTimeout(() => this.swipeDelete.emit(), ANIMATION_MS);
    } else {
      this.offset.set(0);
    }
  }

  protected reset(): void {
    this.pointerId = null;
    this.horizontal = null;
    this.dragging.set(false);
    this.offset.set(0);
  }
}
