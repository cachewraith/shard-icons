// The "Change icon…" dialog: search, tabs, a grid, and a reset, for a folder or a file.
//
// Pattern: one Modal subclass holding view state (query, tab, active cell) and rebuilding the
// grid from it — the same shape as the React picker in cachewraith-explorer, minus React.
// Focus stays in the search box and the arrow keys drive a virtual cursor, so the dialog is
// fully keyboard-driven without a roving tabindex across several hundred buttons.
// A query searches every tab at once: each tab shows its match count, and when the chosen tab
// has none the first tab that does is shown instead, until the query matches the chosen one.

import type { App } from 'obsidian';
import { Modal, setIcon } from 'obsidian';
import type { Icon } from '../icons/icons';
import { renderIcon } from '../icons/render';
import { searchGroups } from '../icons/search';
import { basename } from '../store/assignments';
import type { IconCatalog, PickerTab } from './catalogs';

/** Typing pauses this long before the grid is rebuilt; hundreds of cells per key is felt. */
const SEARCH_DELAY_MS = 80;

export class IconPickerModal extends Modal {
	private query = '';
	/** The tab the user picked; `tab` is the one shown, which a query can override. */
	private chosenTab: PickerTab;
	private tab: PickerTab;
	private active = 0;
	private matches: readonly Icon[] = [];
	private results: ReadonlyMap<PickerTab, readonly Icon[]> = new Map();
	private closeMatches = false;
	private searchTimer: number | null = null;

	private searchEl!: HTMLInputElement;
	private noteEl!: HTMLElement;
	private gridEl!: HTMLElement;
	private resetEl!: HTMLButtonElement;
	private readonly cells: HTMLElement[] = [];
	private readonly tabButtons = new Map<PickerTab, { button: HTMLElement; count: HTMLElement }>();
	private readonly suggested: string | null;

	constructor(
		app: App,
		private readonly catalog: IconCatalog,
		private readonly path: string,
		private readonly current: string | null,
		private readonly onChoose: (icon: string | null) => void,
	) {
		super(app);
		const [first] = catalog.tabs;
		if (!first) throw new Error('Shard Icons: an icon catalog needs at least one tab');
		const currentTab = current === null ? undefined : catalog.tabOf(current);
		this.chosenTab = catalog.tabs.find((tab) => tab.id === currentTab) ?? first;
		this.tab = this.chosenTab;
		this.suggested = catalog.suggest(basename(path));
	}

	override onOpen(): void {
		this.modalEl.addClass('shard-picker');
		this.titleEl.setText(`Icon for "${basename(this.path)}"`);

		const search = this.contentEl.createDiv({ cls: 'shard-picker-search' });
		setIcon(search.createSpan({ cls: 'shard-picker-search-icon' }), 'search');
		this.searchEl = search.createEl('input', {
			type: 'text',
			attr: { 'aria-label': 'Search icons', spellcheck: 'false' },
		});
		this.searchEl.addEventListener('input', () => this.scheduleSearch());
		this.searchEl.addEventListener('keydown', (event) => this.onKeyDown(event));

		// One tab has nothing to switch between, so the bar is left out.
		if (this.catalog.tabs.length > 1) {
			const tabs = this.contentEl.createDiv({ cls: 'shard-picker-tabs', attr: { role: 'tablist' } });
			for (const tab of this.catalog.tabs) {
				const button = tabs.createEl('button', {
					cls: 'shard-picker-tab',
					attr: { type: 'button', role: 'tab' },
				});
				button.createSpan({ text: tab.label });
				const count = button.createSpan({ cls: 'shard-picker-count' });
				button.addEventListener('click', () => this.selectTab(tab));
				this.tabButtons.set(tab, { button, count });
			}
		}

		this.noteEl = this.contentEl.createDiv({ cls: 'shard-picker-note', attr: { 'aria-live': 'polite' } });

		this.gridEl = this.contentEl.createDiv({
			cls: 'shard-picker-grid',
			attr: { role: 'listbox', 'aria-label': `${this.catalog.noun} icons` },
		});

		const footer = this.contentEl.createDiv({ cls: 'shard-picker-footer' });
		this.resetEl = footer.createEl('button', {
			cls: 'shard-picker-reset',
			text: 'Reset to default',
			attr: { type: 'button' },
		});
		this.resetEl.disabled = this.current === null;
		this.resetEl.addEventListener('click', () => this.choose(null));
		const cancel = footer.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());

		this.search();
		this.searchEl.focus();
	}

	override onClose(): void {
		if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
		this.searchTimer = null;
		this.contentEl.empty();
	}

	private selectTab(tab: PickerTab): void {
		this.chosenTab = tab;
		this.tab = tab;
		this.active = 0;
		this.renderTabs();
		this.renderGrid();
		this.searchEl.focus();
	}

	private scheduleSearch(): void {
		if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
		this.searchTimer = window.setTimeout(() => this.search(), SEARCH_DELAY_MS);
	}

	/** Runs a search still waiting on the typing delay, so Enter acts on what is typed. */
	private flushSearch(): void {
		if (this.searchTimer !== null) this.search();
	}

	private search(): void {
		if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
		this.searchTimer = null;
		this.query = this.searchEl.value;
		this.active = 0;
		const { results, close } = searchGroups(this.catalog.tabs, this.query, this.suggested);
		this.results = results;
		this.closeMatches = close;
		const has = (tab: PickerTab) => (results.get(tab)?.length ?? 0) > 0;
		this.tab = has(this.chosenTab) ? this.chosenTab : (this.catalog.tabs.find(has) ?? this.chosenTab);
		this.renderTabs();
		this.renderGrid();
	}

	/** Totals with no query, match counts with one; a tab with no matches is dimmed. */
	private renderTabs(): void {
		const searching = this.query.trim() !== '';
		for (const [tab, { button, count }] of this.tabButtons) {
			const matches = this.results.get(tab)?.length ?? 0;
			count.setText(String(searching ? matches : tab.icons.length));
			button.toggleClass('is-active', tab === this.tab);
			button.toggleClass('is-empty', searching && matches === 0);
			button.setAttribute('aria-selected', String(tab === this.tab));
		}
	}

	/** With no query the icon the theme would pick comes first; a query ranks it with the rest. */
	private computeMatches(): readonly Icon[] {
		const matches = this.results.get(this.tab) ?? this.tab.icons;
		if (this.query.trim() !== '') return matches;
		const suggested = matches.find((icon) => icon.id === this.suggested);
		return suggested ? [suggested, ...matches.filter((icon) => icon !== suggested)] : matches;
	}

	private renderGrid(): void {
		this.matches = this.computeMatches();
		this.cells.length = 0;
		this.gridEl.empty();

		this.searchEl.placeholder = `Search ${this.tab.icons.length} icons: ${this.tab.hint}`;
		const anywhere = [...this.results.values()].some((icons) => icons.length > 0);
		this.noteEl.setText(
			this.closeMatches && anywhere
				? `No exact matches for "${this.query.trim()}" — showing close matches`
				: '',
		);
		this.noteEl.toggle(this.noteEl.getText() !== '');

		if (this.matches.length === 0) {
			this.gridEl.createDiv({
				cls: 'shard-picker-empty',
				text: `No icons match "${this.query.trim()}"`,
			});
			return;
		}

		for (const icon of this.matches) {
			const cell = this.gridEl.createEl('button', {
				cls: 'shard-picker-cell',
				attr: { type: 'button', role: 'option', title: icon.label, tabindex: '-1' },
			});
			renderIcon(cell.createDiv({ cls: 'shard-picker-cell-icon' }), icon);
			cell.createDiv({ cls: 'shard-picker-cell-label', text: icon.label });
			if (icon.id === this.current) {
				cell.addClass('is-selected');
				setIcon(cell.createSpan({ cls: 'shard-picker-check' }), 'check');
			} else if (icon.id === this.suggested && icon.id !== this.catalog.fallback) {
				cell.createSpan({ cls: 'shard-picker-badge', text: 'match' });
			}
			cell.setAttribute('aria-selected', String(icon.id === this.current));
			cell.addEventListener('click', () => this.choose(icon.id));
			this.cells.push(cell);
		}
		this.setActive(Math.min(this.active, this.cells.length - 1));
	}

	private columns(): number {
		const template = window.getComputedStyle(this.gridEl).gridTemplateColumns;
		return Math.max(1, template.split(' ').filter(Boolean).length);
	}

	private setActive(index: number): void {
		const clamped = Math.max(0, Math.min(index, this.cells.length - 1));
		this.cells[this.active]?.removeClass('is-active');
		this.active = clamped;
		const cell = this.cells[clamped];
		cell?.addClass('is-active');
		cell?.scrollIntoView({ block: 'nearest' });
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (
			event.key === 'Enter' ||
			event.key.startsWith('Arrow') ||
			event.key === 'Home' ||
			event.key === 'End'
		) {
			this.flushSearch();
		}
		const step = (delta: number) => {
			event.preventDefault();
			this.setActive(this.active + delta);
		};
		switch (event.key) {
			case 'ArrowRight':
				return step(1);
			case 'ArrowLeft':
				return step(-1);
			case 'ArrowDown':
				return step(this.columns());
			case 'ArrowUp':
				return step(-this.columns());
			case 'Home':
				return step(-this.active);
			case 'End':
				return step(this.cells.length);
			case 'Enter': {
				const icon = this.matches[this.active];
				if (icon) {
					event.preventDefault();
					this.choose(icon.id);
				}
				return;
			}
			default:
				return;
		}
	}

	private choose(icon: string | null): void {
		this.onChoose(icon);
		this.close();
	}
}
