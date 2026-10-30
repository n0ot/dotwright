/**
 * Screen-reader announcements through two polite live regions used in turn,
 * so repeating the same message is still announced.
 */
export class Announcer {
  private regions: HTMLElement[];
  private next = 0;

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
  }
}
