const DEFAULT_ESTIMATED_HEIGHT = 80;
const HEIGHT_EPSILON = 0.5;

export function buildOffsets(heights) {
  const offsets = new Array(heights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < heights.length; i++) {
    const height = Number.isFinite(heights[i]) && heights[i] > 0 ? heights[i] : DEFAULT_ESTIMATED_HEIGHT;
    offsets[i + 1] = offsets[i] + height;
  }
  return offsets;
}

export function findItemIndex(offsets, target) {
  if (offsets.length <= 1) return 0;
  let low = 0;
  let high = offsets.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] <= target) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, Math.min(offsets.length - 2, high));
}

export function computeRange(offsets, viewportStart, viewportEnd, overscanPx = 0) {
  const itemCount = Math.max(0, offsets.length - 1);
  if (itemCount === 0) return { start: 0, end: 0 };

  const totalHeight = offsets[itemCount];
  const rangeStart = Math.max(0, viewportStart - Math.max(0, overscanPx));
  const rangeEnd = Math.min(totalHeight, viewportEnd + Math.max(0, overscanPx));
  const start = findItemIndex(offsets, rangeStart);
  const endIndex = findItemIndex(offsets, rangeEnd);
  return { start, end: Math.min(itemCount, endIndex + 1) };
}

export class Virtualizer {
  constructor(container, options = {}) {
    if (!container) throw new Error('Virtualizer requires a container');
    this.container = container;
    this.overscanPx = options.overscanPx ?? 600;
    this.createContent = options.createContent;
    this.estimateHeight = options.estimateHeight || (item => item.estimatedHeight ?? DEFAULT_ESTIMATED_HEIGHT);
    this.items = [];
    this.heights = [];
    this.offsets = [0];
    this.mounted = new Map();
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(entries => this.measureWrappers(entries.map(entry => entry.target)));
    this.frame = 0;
    this.lastWidth = window.innerWidth;

    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.render = this.render.bind(this);

    window.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleResize, { passive: true });
    this.container.classList.add('is-virtualized');
  }

  setItems(items) {
    this.items = Array.isArray(items) ? items : [];
    this.lastWidth = window.innerWidth;
    this.resetMeasurements();
    this.clearMounted();
    this.updateContainerHeight();
    this.render();
  }

  resetMeasurements() {
    this.heights = this.items.map(item => {
      const estimated = Number(this.estimateHeight(item));
      return Number.isFinite(estimated) && estimated > 0 ? estimated : DEFAULT_ESTIMATED_HEIGHT;
    });
    this.offsets = buildOffsets(this.heights);
    this.updateContainerHeight();
  }

  clearMounted() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    for (const wrapper of this.mounted.values()) wrapper.remove();
    this.mounted.clear();
  }

  updateContainerHeight() {
    const totalHeight = this.offsets.length ? this.offsets[this.offsets.length - 1] : 0;
    this.container.style.height = totalHeight > 0 ? `${totalHeight}px` : '0px';
  }

  handleScroll() {
    this.scheduleRender();
  }

  handleResize() {
    if (window.innerWidth === this.lastWidth) return;
    this.lastWidth = window.innerWidth;
    this.resetMeasurements();
    this.render();
  }

  scheduleRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  render() {
    if (this.items.length === 0) {
      this.clearMounted();
      this.updateContainerHeight();
      return;
    }

    const containerTop = this.container.getBoundingClientRect().top + window.scrollY;
    const viewportStart = Math.max(0, window.scrollY - containerTop);
    const viewportEnd = viewportStart + window.innerHeight;
    const range = computeRange(this.offsets, viewportStart, viewportEnd, this.overscanPx);

    for (const [index, wrapper] of this.mounted) {
      if (index < range.start || index >= range.end) {
        if (this.resizeObserver) this.resizeObserver.unobserve(wrapper);
        wrapper.remove();
        this.mounted.delete(index);
      }
    }

    const newWrappers = [];
    const fragment = document.createDocumentFragment();
    for (let index = range.start; index < range.end; index++) {
      let wrapper = this.mounted.get(index);
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'virtual-feed-block';
        wrapper.dataset.virtualIndex = String(index);
        wrapper.appendChild(this.createContent(this.items[index], index));
        this.mounted.set(index, wrapper);
        fragment.appendChild(wrapper);
        newWrappers.push(wrapper);
      }
      wrapper.style.transform = `translate3d(0, ${this.offsets[index]}px, 0)`;
    }
    if (fragment.childNodes.length > 0) this.container.appendChild(fragment);
    if (this.resizeObserver) {
      for (const wrapper of newWrappers) this.resizeObserver.observe(wrapper);
    }
    this.measureWrappers(newWrappers);
  }

  measureWrappers(wrappers) {
    let firstChangedIndex = this.items.length;
    let measurementsChanged = false;

    for (const wrapper of wrappers) {
      const index = Number(wrapper.dataset.virtualIndex);
      if (!Number.isInteger(index) || this.mounted.get(index) !== wrapper) continue;
      const measuredHeight = wrapper.getBoundingClientRect().height;
      if (measuredHeight > 0 && Math.abs(measuredHeight - this.heights[index]) > HEIGHT_EPSILON) {
        this.heights[index] = measuredHeight;
        firstChangedIndex = Math.min(firstChangedIndex, index);
        measurementsChanged = true;
      }
    }

    if (!measurementsChanged) return;
    this.rebuildOffsetsFrom(firstChangedIndex);
    this.updateContainerHeight();
    for (const [index, wrapper] of this.mounted) {
      wrapper.style.transform = `translate3d(0, ${this.offsets[index]}px, 0)`;
    }
    this.scheduleRender();
  }

  rebuildOffsetsFrom(startIndex) {
    for (let i = Math.max(0, startIndex); i < this.heights.length; i++) {
      this.offsets[i + 1] = this.offsets[i] + this.heights[i];
    }
  }

  getOffset(index) {
    if (index < 0 || index >= this.items.length) return 0;
    return this.offsets[index];
  }

  getTotalHeight() {
    return this.offsets.length ? this.offsets[this.offsets.length - 1] : 0;
  }

  scrollToIndex(index, offsetWithinItem = 0) {
    const safeIndex = Math.max(0, Math.min(this.items.length - 1, index));
    if (this.items.length === 0) return;
    const containerTop = this.container.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, containerTop + this.getOffset(safeIndex) + offsetWithinItem);
    this.render();
  }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);
    this.clearMounted();
    this.container.classList.remove('is-virtualized');
    this.container.style.height = '';
  }
}
