// @vitest-environment jsdom
import type { App } from 'obsidian';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecorationContext } from '../src/explorer/decorate';
import { FileExplorerIcons } from '../src/explorer/FileExplorerIcons';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import { installObsidianDom } from './support/obsidianDom';

beforeAll(installObsidianDom);

function explorerApp(container: HTMLElement): App {
	return { workspace: { getLeavesOfType: () => [{ view: { containerEl: container } }] } } as unknown as App;
}

function context(): DecorationContext {
	return { settings: { ...DEFAULT_SETTINGS, fileIcons: true }, icons: {}, light: false };
}

/** Lets the MutationObserver deliver, then runs the frame it scheduled. */
async function nextFrame(): Promise<void> {
	await Promise.resolve();
	vi.runAllTimers();
}

describe('FileExplorerIcons', () => {
	let container: HTMLElement;
	let explorer: FileExplorerIcons;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
			window.setTimeout(() => cb(0), 0),
		);
		vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
		document.body.innerHTML = '';
		container = document.body.createDiv();
		explorer = new FileExplorerIcons(explorerApp(container), context);
		explorer.refresh();
	});

	afterEach(() => {
		explorer.stop();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('draws a row added after the first pass', async () => {
		const row = container.createDiv({ cls: 'nav-file-title', attr: { 'data-path': 'notes/a.md' } });
		row.createDiv({ cls: 'nav-file-title-content', text: 'a' });
		await nextFrame();
		expect(row.querySelector('.shard-icon')).not.toBeNull();
	});

	it('draws a row that gets its path only after it is attached', async () => {
		const row = container.createDiv({ cls: 'nav-file-title' });
		row.createDiv({ cls: 'nav-file-title-content', text: 'a' });
		await nextFrame();
		expect(row.querySelector('.shard-icon')).toBeNull();

		row.setAttribute('data-path', 'notes/a.md');
		await nextFrame();
		expect(row.querySelector('.shard-icon')).not.toBeNull();
	});
});
