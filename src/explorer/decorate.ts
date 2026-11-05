// Puts an icon into one file-explorer row, idempotently.
//
// Pattern: reconcile against a key held on the element (`data-shard-icon`), the way a diffing
// renderer does. Explorer rows are recycled as the list scrolls, so every pass has to be safe
// to repeat and must do nothing when the row already shows the right icon.

import { renderIcon } from '../icons/render';
import type { ShardIconsSettings } from '../settings/types';
import type { IconAssignments } from '../store/assignments';
import type { IconPlan } from './resolve';
import { planForFile, planForFolder } from './resolve';

export const ICON_CLASS = 'shard-icon';
/** Set on a row this plugin draws for, so the stylesheet can hide the icon it replaces. */
export const DECORATED_CLASS = 'shard-has-icon';
const SEARCH_ICON_CLASS = 'shard-search-icon';
const KEY_ATTR = 'data-shard-icon';
const TITLE_SELECTOR = '.nav-folder-title[data-path], .nav-file-title[data-path]';

export interface DecorationContext {
	settings: ShardIconsSettings;
	icons: IconAssignments;
	light: boolean;
}

function planFor(title: HTMLElement, path: string, context: DecorationContext): IconPlan | null {
	return title.classList.contains('nav-folder-title')
		? planForFolder(path, context.icons, context.settings, context.light)
		: planForFile(path, context.icons, context.settings, context.light);
}

function existingHost(row: HTMLElement): HTMLElement | null {
	return row.querySelector<HTMLElement>(`:scope > .${ICON_CLASS}`);
}

function createHost(row: HTMLElement, contentSelector: string, extraClass?: string): HTMLElement {
	const host = row.createDiv({ cls: ICON_CLASS, attr: { 'aria-hidden': 'true' } });
	if (extraClass) host.classList.add(extraClass);
	const content = row.querySelector(contentSelector);
	if (content) row.insertBefore(host, content);
	return host;
}

function reconcile(
	row: HTMLElement,
	plan: IconPlan | null,
	contentSelector: string,
	extraClass?: string,
): void {
	const host = existingHost(row);

	if (!plan) {
		host?.remove();
		row.classList.remove(DECORATED_CLASS);
		return;
	}
	if (host?.getAttribute(KEY_ATTR) === plan.key) {
		row.classList.add(DECORATED_CLASS);
		return;
	}

	const target = host ?? createHost(row, contentSelector, extraClass);
	const drawn = renderIcon(target, plan.icon);
	if (drawn) target.setAttribute(KEY_ATTR, plan.key);
	else target.remove();
	row.classList.toggle(DECORATED_CLASS, drawn);
}

export function decorateTitle(title: HTMLElement, context: DecorationContext): void {
	const path = title.getAttribute('data-path');
	reconcile(
		title,
		path ? planFor(title, path, context) : null,
		':scope > .nav-folder-title-content, :scope > .nav-file-title-content',
	);
}

/** Draws a file's icon before the name in a search-result title row. */
export function decorateSearchResult(row: HTMLElement, path: string, context: DecorationContext): void {
	reconcile(
		row,
		planForFile(path, context.icons, context.settings, context.light),
		':scope > .tree-item-inner',
		SEARCH_ICON_CLASS,
	);
}

/** Decorates every explorer row in `root`, and `root` itself when it is one. */
export function decorateTree(root: Element, context: DecorationContext): void {
	if (root.matches(TITLE_SELECTOR)) decorateTitle(root as HTMLElement, context);
	for (const title of Array.from(root.querySelectorAll<HTMLElement>(TITLE_SELECTOR))) {
		decorateTitle(title, context);
	}
}

/** Takes back everything this plugin injected under `root`. */
export function undecorateTree(root: ParentNode): void {
	for (const host of Array.from(root.querySelectorAll(`.${ICON_CLASS}`))) host.remove();
	for (const title of Array.from(root.querySelectorAll(`.${DECORATED_CLASS}`))) {
		title.classList.remove(DECORATED_CLASS);
	}
}
