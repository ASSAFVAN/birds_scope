import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwipeToDeleteDirective } from './swipe-to-delete.directive';

@Component({
  imports: [SwipeToDeleteDirective],
  template: `<div class="row" appSwipeToDelete (swipeDelete)="deleted = deleted + 1">
    <button type="button" (click)="clicked = clicked + 1">Entry</button>
  </div>`,
})
class HostComponent {
  deleted = 0;
  clicked = 0;
}

function pointer(el: Element, type: string, x: number, y = 0, pointerType = 'touch'): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerType: { value: pointerType }, pointerId: { value: 1 } });
  el.dispatchEvent(event);
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const row = fixture.nativeElement.querySelector('.row') as HTMLElement;
  const button = row.querySelector('button') as HTMLButtonElement;
  return { fixture, host: fixture.componentInstance, row, button };
}

describe('SwipeToDeleteDirective', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('deletes after a long enough sideways swipe, in either direction', () => {
    const { host, row, fixture } = setup();
    for (const dx of [-120, 120]) {
      pointer(row, 'pointerdown', 200);
      pointer(row, 'pointermove', 200 + dx / 2);
      pointer(row, 'pointermove', 200 + dx);
      fixture.detectChanges();
      expect(row.style.transform).toBe(`translateX(${dx}px)`);
      pointer(row, 'pointerup', 200 + dx);
      vi.runAllTimers();
    }
    expect(host.deleted).toBe(2);
  });

  it('snaps back on a short swipe without deleting', () => {
    const { host, row, fixture } = setup();
    pointer(row, 'pointerdown', 200);
    pointer(row, 'pointermove', 160);
    pointer(row, 'pointerup', 160);
    vi.runAllTimers();
    fixture.detectChanges();
    expect(host.deleted).toBe(0);
    expect(row.style.transform).toBe('');
  });

  it('leaves vertical scrolling alone', () => {
    const { host, row, fixture } = setup();
    pointer(row, 'pointerdown', 200, 0);
    pointer(row, 'pointermove', 205, 40);
    pointer(row, 'pointermove', 80, 60); // sideways after the gesture was already a scroll
    pointer(row, 'pointerup', 80, 60);
    vi.runAllTimers();
    fixture.detectChanges();
    expect(host.deleted).toBe(0);
    expect(row.style.transform).toBe('');
  });

  it('ignores mouse drags (desktop uses the remove button)', () => {
    const { host, row } = setup();
    pointer(row, 'pointerdown', 200, 0, 'mouse');
    pointer(row, 'pointermove', 50, 0, 'mouse');
    pointer(row, 'pointerup', 50, 0, 'mouse');
    vi.runAllTimers();
    expect(host.deleted).toBe(0);
  });

  it('swallows the click that ends a swipe but not a normal tap', () => {
    const { host, button } = setup();
    pointer(button, 'pointerdown', 200);
    pointer(button, 'pointermove', 150);
    pointer(button, 'pointerup', 150);
    button.click();
    expect(host.clicked).toBe(0);

    pointer(button, 'pointerdown', 200);
    pointer(button, 'pointerup', 200);
    button.click();
    expect(host.clicked).toBe(1);
  });
});
