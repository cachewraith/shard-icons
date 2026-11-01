// Ranks the picker's icons against what the user typed.
//
// Pattern: a lazily built index plus a pure scoring function. Each icon is indexed once with
// its own words (label and name) and its aliases — the file extensions and folder names the
// Material Icon Theme maps to it, so `js` finds javascript and `pictures` finds the images
// folder. Every query word is scored by how well it hits (exact name, word, prefix, anywhere);
// lower is better, and an icon has to hit every word. Typo tolerance is only a fallback: close
// matches are offered when nothing matches exactly, so they never crowd out real results.

import { MATERIAL } from '../generated/icons';
import type { Icon } from './icons';
import { EXTRA_FOLDER_NAMES } from './material';

interface IndexedIcon {
	/** The bare name: `images` for `folder-images`, `fastapi` for `logo-fastapi`. */
	readonly name: string;
	readonly label: string;
	/** Words of the label and the name. */
	readonly words: readonly string[];
	/** Topic terms and the theme's extensions and folder names, minus the words above. */
	readonly aliases: readonly string[];
}

/**
 * Everyday words that name no icon themselves, each pointing at words that do. A query word
 * found here also matches what it points at, ranked below a direct hit.
 */
export const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
	note: ['markdown', 'notebook'],
	notes: ['markdown', 'notebook'],
	photo: ['image', 'images', 'camera'],
	photos: ['image', 'images', 'camera'],
	picture: ['image', 'images'],
	pictures: ['image', 'images'],
	movie: ['video'],
	movies: ['video'],
	film: ['video', 'movie'],
	music: ['audio'],
	song: ['audio'],
	songs: ['audio'],
	sound: ['audio'],
	sounds: ['audio'],
	document: ['docs', 'word'],
	documents: ['docs', 'word'],
	spreadsheet: ['table'],
	spreadsheets: ['table'],
	excel: ['table'],
	sheet: ['table'],
	sheets: ['table'],
	code: ['src', 'source'],
	settings: ['config'],
	preferences: ['config'],
	secret: ['keys', 'lock'],
	secrets: ['keys', 'lock'],
	password: ['keys', 'lock'],
	passwords: ['keys', 'lock'],
};

// Tiers, best first. A query's score is the sum over its words.
const EXACT_NAME = 0;
const EXACT_WORD = 1;
const NAME_PREFIX = 2;
const WORD_PREFIX = 3;
const ALIAS_PREFIX = 4;
const ANYWHERE = 5;
const SYNONYM = 6;
const CLOSE = 7;
/** A synonym only counts when it hits at least this well; `anywhere` is too loose for one. */
const SYNONYM_CUTOFF = ALIAS_PREFIX;

function words(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

/**
 * `__images__` -> `images`. Kept whole, never split: `quokka.js` split into words would make
 * every such icon an exact match for `js`.
 */
function normalizeAlias(alias: string): string {
	return alias.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

function bareName(icon: Icon): string {
	switch (icon.kind) {
		case 'folder':
			return icon.name === 'folder' ? 'folder' : icon.name.replace(/^folder-/, '');
		case 'logo':
			return icon.slug;
		case 'topic':
		case 'file':
			return icon.name;
	}
}

let aliasTable: Map<string, string[]> | null = null;

/** Icon id -> every extension and folder name the theme maps to it. Built on first search. */
function aliasesById(): Map<string, string[]> {
	if (aliasTable) return aliasTable;
	const table = new Map<string, string[]>();
	const add = (source: Readonly<Record<string, string>>) => {
		for (const [alias, id] of Object.entries(source)) {
			const list = table.get(id);
			if (list) list.push(alias);
			else table.set(id, [alias]);
		}
	};
	add(MATERIAL.fileExtensions);
	add(MATERIAL.folderNames);
	add(EXTRA_FOLDER_NAMES);
	aliasTable = table;
	return table;
}

const index = new Map<string, IndexedIcon>();

function indexed(icon: Icon): IndexedIcon {
	const cached = index.get(icon.id);
	if (cached) return cached;
	const name = bareName(icon).toLowerCase();
	const own = new Set([...words(icon.label), ...words(name)]);
	const aliases = new Set<string>();
	if (icon.kind === 'topic') for (const term of words(icon.terms)) aliases.add(term);
	// A logo borrows the aliases of the theme icon of the same name: `ts` finds the TypeScript logo.
	const sources = icon.kind === 'logo' ? [icon.id, icon.slug] : [icon.id];
	for (const alias of sources.flatMap((id) => aliasesById().get(id) ?? [])) {
		const word = normalizeAlias(alias);
		if (word !== '') aliases.add(word);
	}
	for (const word of own) aliases.delete(word);
	const entry: IndexedIcon = {
		name,
		label: icon.label.toLowerCase(),
		words: [...own],
		aliases: [...aliases],
	};
	index.set(icon.id, entry);
	return entry;
}

/** Optimal string alignment distance, giving up once it is certainly above `max`. */
function distance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let before: number[] = [];
	let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		let best = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let value = Math.min(
				(previous[j] ?? 0) + 1,
				(current[j - 1] ?? 0) + 1,
				(previous[j - 1] ?? 0) + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				value = Math.min(value, (before[j - 2] ?? 0) + 1);
			}
			current.push(value);
			best = Math.min(best, value);
		}
		if (best > max) return max + 1;
		before = previous;
		previous = current;
	}
	return previous[b.length] ?? max + 1;
}

/** How many typos a word of this length may have: none under 4 letters, two from 7. */
function typoBudget(term: string): number {
	if (term.length < 4) return 0;
	return term.length < 7 ? 1 : 2;
}

/** The best tier `term` reaches on `entry`, ignoring synonyms; `null` when it misses. */
function directTier(entry: IndexedIcon, term: string): number | null {
	if (entry.name === term) return EXACT_NAME;
	if (entry.words.includes(term) || entry.aliases.includes(term)) return EXACT_WORD;
	if (entry.name.startsWith(term) || entry.label.startsWith(term)) return NAME_PREFIX;
	if (entry.words.some((word) => word.startsWith(term))) return WORD_PREFIX;
	if (entry.aliases.some((alias) => alias.startsWith(term))) return ALIAS_PREFIX;
	if (entry.name.includes(term) || entry.label.includes(term)) return ANYWHERE;
	return null;
}

function termTier(entry: IndexedIcon, term: string, typos: boolean): number | null {
	const direct = directTier(entry, term);
	if (direct !== null) return direct;
	const synonyms = Object.hasOwn(SYNONYMS, term) ? (SYNONYMS[term] ?? []) : [];
	for (const synonym of synonyms) {
		const tier = directTier(entry, synonym);
		if (tier !== null && tier <= SYNONYM_CUTOFF) return SYNONYM;
	}
	if (!typos) return null;
	const budget = typoBudget(term);
	if (budget === 0) return null;
	const close = (word: string) => word.length >= 4 && distance(term, word, budget) <= budget;
	return close(entry.name) || entry.words.some(close) || entry.aliases.some(close) ? CLOSE : null;
}

/** The icon's score for these query words, lower is better; `null` when one of them misses. */
export function scoreIcon(icon: Icon, terms: readonly string[], typos = false): number | null {
	const entry = indexed(icon);
	let score = 0;
	for (const term of terms) {
		const tier = termTier(entry, term, typos);
		if (tier === null) return null;
		score += tier;
	}
	return score;
}

export function searchTerms(query: string): string[] {
	return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export interface SearchOptions {
	/** Offer close matches for typos. */
	readonly typos?: boolean;
	/** An id that goes first among results that score the same — the theme's own suggestion. */
	readonly preferred?: string | null;
}

/**
 * The icons that match every word, best first: by score, then the preferred id, then names
 * of fewer words (`javascript` before `bench-js` for `js`), then shorter names, then the
 * original order. No words keeps everything in its original order.
 */
export function searchIcons(
	icons: readonly Icon[],
	terms: readonly string[],
	options: SearchOptions = {},
): Icon[] {
	if (terms.length === 0) return [...icons];
	const scored: { icon: Icon; score: number; order: number }[] = [];
	for (const [order, icon] of icons.entries()) {
		const score = scoreIcon(icon, terms, options.typos ?? false);
		if (score !== null) scored.push({ icon, score, order });
	}
	const preferred = options.preferred ?? null;
	scored.sort((a, b) => {
		if (a.score !== b.score) return a.score - b.score;
		if ((a.icon.id === preferred) !== (b.icon.id === preferred)) return a.icon.id === preferred ? -1 : 1;
		const ea = indexed(a.icon);
		const eb = indexed(b.icon);
		return ea.words.length - eb.words.length || ea.name.length - eb.name.length || a.order - b.order;
	});
	return scored.map((entry) => entry.icon);
}

export interface GroupedResults<T> {
	readonly results: ReadonlyMap<T, readonly Icon[]>;
	/** True when nothing matched exactly and these are the close matches instead. */
	readonly close: boolean;
}

/**
 * Searches every group at once, so the picker can count matches on each tab. Close matches
 * are only tried when no group has an exact one.
 */
export function searchGroups<T extends { readonly icons: readonly Icon[] }>(
	groups: readonly T[],
	query: string,
	preferred: string | null = null,
): GroupedResults<T> {
	const terms = searchTerms(query);
	const run = (typos: boolean) =>
		new Map(groups.map((group) => [group, searchIcons(group.icons, terms, { typos, preferred })]));
	const exact = run(false);
	const anything = [...exact.values()].some((icons) => icons.length > 0);
	if (anything || terms.length === 0) return { results: exact, close: false };
	return { results: run(true), close: true };
}
