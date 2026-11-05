// Keeps the file icons drawn in every open search pane.
//
// Search rows carry no `data-path`; the path comes from the view's own file -> row map, which
// is not public API, so every step of reading it is guarded. Each file keeps one row element
// that the view attaches and detaches as the list scrolls, so a pass only draws attached rows
// and any mutation under the pane is enough reason to run one.

import type { App } from 'obsidian';
import type { DecorationContext } from './decorate';
import { decorateSearchResult, ICON_CLASS, undecorateTree } from './decorate';

const SEARCH_VIEW = 'search';

interface ResultDom {
	file?: { path?: unknown };
	selfEl?: unknown;
}

interface SearchViewInternals {
	containerEl: HTMLElement;
	dom?: { resultDomLookup?: unknown };
}

function resultRows(view: SearchViewInternals): Array<{ row: HTMLElement; path: string }> {
	const lookup = view.dom?.resultDomLookup;
	if (!(lookup instanceof Map)) return [];
	const rows: Array<{ row: HTMLElement; path: string }> = [];
	for (const result of lookup.values() as Iterable<ResultDom>) {
		const row = result?.selfEl;
		const path = result?.file?.path;
		if (row instanceof HTMLElement && typeof path === 'string') rows.push({ row, path });
	}
	return rows;
}

export class SearchResultIcons {
	private readonly observers = new Map<HTMLElement, MutationObserver>();
	private frame: number | null = null;
	private stopped = false;

	constructor(
		private readonly app: App,
		private readonly context: () => DecorationContext,
	) {}

	/** Decorates every search pane and starts watching the ones not watched yet. */
	refresh(): void {
		if (this.stopped) return;
		const live = new Set<HTMLElement>();
		const context = this.context();
		for (const view of this.views()) {
			live.add(view.containerEl);
			this.watch(view.containerEl);
			for (const { row, path } of resultRows(view)) {
				if (row.isConnected) decorateSearchResult(row, path, context);
			}
		}
		for (const [container, observer] of this.observers) {
			if (!live.has(container)) {
				observer.disconnect();
				this.observers.delete(container);
			}
		}
	}

	stop(): void {
		this.stopped = true;
		for (const observer of this.observers.values()) observer.disconnect();
		this.observers.clear();
		if (this.frame !== null) window.cancelAnimationFrame(this.frame);
		this.frame = null;
		for (const view of this.views()) {
			undecorateTree(view.containerEl);
			// Rows scrolled out of view are detached, and would come back still decorated.
			for (const { row } of resultRows(view)) undecorateTree(row.parentElement ?? row);
		}
	}

	private views(): SearchViewInternals[] {
		return this.app.workspace
			.getLeavesOfType(SEARCH_VIEW)
			.map((leaf) => leaf.view as unknown as SearchViewInternals);
	}

	private watch(container: HTMLElement): void {
		if (this.observers.has(container)) return;
		const observer = new MutationObserver((records) => {
			if (records.some((record) => this.isForeign(record))) this.schedule();
		});
		observer.observe(container, { childList: true, subtree: true });
		this.observers.set(container, observer);
	}

	/** A mutation this plugin did not cause by drawing an icon. */
	private isForeign(record: MutationRecord): boolean {
		if (record.target.instanceOf(Element) && record.target.closest(`.${ICON_CLASS}`)) return false;
		return Array.from(record.addedNodes).some(
			(node) => !(node.instanceOf(Element) && node.classList.contains(ICON_CLASS)),
		);
	}

	private schedule(): void {
		if (this.frame !== null || this.stopped) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = null;
			this.refresh();
		});
	}
}
