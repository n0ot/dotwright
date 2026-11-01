/**
 * Screen-reader announcements through two polite live regions used in turn,
 * so repeating the same message is still announced. Each message is cleared
 * once it has been spoken, so it isn't left on the page for a screen reader
 * to find by touch or by reading on.
 */
export class Announcer {
  private regions: HTMLElement[];
  private next = 0;
  private clearTimer = 0;

  constructor(container: HTMLElement) {
    this.regions = [0, 1].map(() => {
      const region = document.createElement('div');
      region.setAttribute('aria-live', 'polite');
      region.className = 'visually-hidden';
      container.append(region);
      return region;
    });
  }

  say(message: string): void {
    const region = this.regions[this.next];
    this.next = 1 - this.next;
    this.regions[this.next].textContent = '';
    region.textContent = '';
    setTimeout(() => (region.textContent = message), 30);
    clearTimeout(this.clearTimer);
    this.clearTimer = window.setTimeout(() => (region.textContent = ''), 8000);
  }
}
