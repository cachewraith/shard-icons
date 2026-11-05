// @vitest-environment jsdom
import type { App } from 'obsidian';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecorationContext } from '../src/explorer/decorate';
import { decorateSearchResult } from '../src/explorer/decorate';
import { SearchResultIcons } from '../src/explorer/SearchResultIcons';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import { installObsidianDom } from './support/obsidianDom';

beforeAll(installObsidianDom);

function context(patch: Partial<DecorationContext> = {}): DecorationContext {
	return { settings: { ...DEFAULT_SETTINGS, fileIcons: true }, icons: {}, light: false, ...patch };
}

/** The markup Obsidian 1.x builds for one file in the search pane. */
function resultRow(name: string): { el: HTMLElement; selfEl: HTMLElement } {
	const el = document.createElement('div');
	el.className = 'tree-item search-result';
	const selfEl = el.createDiv({ cls: 'tree-item-self search-result-file-title is-clickable' });
	selfEl.createDiv({ cls: 'tree-item-icon collapse-icon' });
	selfEl.createDiv({ cls: 'tree-item-inner', text: name });
	selfEl.createDiv({ cls: 'tree-item-flair-outer' });
	return { el, selfEl };
}

describe('decorateSearchResult', () => {
	it('draws the icon between the chevron and the name', () => {
		const { selfEl } = resultRow('index');
		decorateSearchResult(selfEl, 'src/index.ts', context());
		const icon = selfEl.querySelector('.shard-icon');
		expect(icon?.classList.contains('shard-search-icon')).toBe(true);
		expect(icon?.previousElementSibling?.classList.contains('collapse-icon')).toBe(true);
		expect(icon?.nextElementSibling?.className).toBe('tree-item-inner');
		expect(icon?.getAttribute('data-shard-icon')).toBe('icon:typescript');
	});

	it('follows the same rules as the explorer when file icons are off', () => {
		const { selfEl } = resultRow('todo');
		const off = { ...DEFAULT_SETTINGS, fileIcons: false };
		decorateSearchResult(selfEl, 'todo.md', context({ settings: off }));
		expect(selfEl.querySelector('.shard-icon')).toBeNull();
		decorateSearchResult(selfEl, 'todo.md', context({ settings: off, icons: { 'todo.md': 'docker' } }));
		expect(selfEl.querySelector('.shard-icon')?.getAttribute('data-shard-icon')).toBe('icon:docker');
	});
});

describe('SearchResultIcons', () => {
	let container: HTMLElement;
	let lookup: Map<{ path: string }, { file: { path: string }; selfEl: HTMLElement }>;
	let search: SearchResultIcons;

	function add(path: string, attach: boolean): HTMLElement {
		const { el, selfEl } = resultRow(path);
		const file = { path };
		lookup.set(file, { file, selfEl });
		if (attach) container.appendChild(el);
		return el;
	}

	async function nextFrame(): Promise<void> {
		await Promise.resolve();
		vi.runAllTimers();
	}

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
			window.setTimeout(() => cb(0), 0),
		);
		vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
		document.body.innerHTML = '';
		container = document.body.createDiv();
		lookup = new Map();
		const app = {
			workspace: {
				getLeavesOfType: () => [{ view: { containerEl: container, dom: { resultDomLookup: lookup } } }],
			},
		} as unknown as App;
		search = new SearchResultIcons(app, () => context());
	});

	afterEach(() => {
		search.stop();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('draws attached rows and skips detached ones', () => {
		const shown = add('a.ts', true);
		const hidden = add('b.ts', false);
		search.refresh();
		expect(shown.querySelector('.shard-icon')).not.toBeNull();
		expect(hidden.querySelector('.shard-icon')).toBeNull();
	});

	it('draws a row once it scrolls into view', async () => {
		search.refresh();
		const row = add('a.ts', false);
		container.appendChild(row);
		await nextFrame();
		expect(row.querySelector('.shard-icon')).not.toBeNull();
	});

	it('takes back icons from detached rows too on stop', () => {
		const row = add('a.ts', true);
		search.refresh();
		row.remove();
		search.stop();
		expect(row.querySelector('.shard-icon')).toBeNull();
		expect(row.querySelector('.shard-has-icon')).toBeNull();
	});

	it('ignores a view without the internal lookup', () => {
		const app = {
			workspace: { getLeavesOfType: () => [{ view: { containerEl: container } }] },
		} as unknown as App;
		const bare = new SearchResultIcons(app, () => context());
		expect(() => bare.refresh()).not.toThrow();
		bare.stop();
	});
});
