import { describe, expect, it } from 'vitest';

import { ICON_GROUPS } from '../src/icons/groups';
import type { Icon } from '../src/icons/icons';
import { parseIcon } from '../src/icons/icons';
import { scoreIcon, searchGroups, searchIcons, searchTerms, SYNONYMS } from '../src/icons/search';

function icon(id: string): Icon {
	const parsed = parseIcon(id);
	if (!parsed) throw new Error(`unknown icon ${id}`);
	return parsed;
}

const ids = (icons: readonly Icon[]) => icons.map((each) => each.id);
const top = (group: readonly Icon[], query: string, count = 1) =>
	ids(searchIcons(group, searchTerms(query))).slice(0, count);

describe('search', () => {
	it('splits the query into lower-case words', () => {
		expect(searchTerms('  Fast  API ')).toEqual(['fast', 'api']);
		expect(searchTerms('   ')).toEqual([]);
	});

	it('matches on label, name and topic terms', () => {
		expect(scoreIcon(icon('logo-fastapi'), ['fast'])).not.toBeNull();
		expect(scoreIcon(icon('logo-fastapi'), ['fast', 'api'])).not.toBeNull();
		expect(scoreIcon(icon('logo-fastapi'), ['laravel'])).toBeNull();
		expect(scoreIcon(icon('logo-fastapi'), [])).toBe(0);
		expect(scoreIcon(icon('topic-school'), ['education'])).not.toBeNull();
		expect(scoreIcon(icon('topic-cash'), ['money'])).not.toBeNull();
		expect(scoreIcon(icon('topic-cash'), ['education'])).toBeNull();
	});

	it('does not match the kind prefix of an id', () => {
		// `go` used to match every logo, through the `logo-` in its id.
		expect(searchIcons(ICON_GROUPS.logo, ['go']).length).toBeLessThan(40);
		expect(searchIcons(ICON_GROUPS.folder, ['folder'])).toHaveLength(1);
		expect(searchIcons(ICON_GROUPS.topic, ['topic'])).toHaveLength(0);
	});

	it('ranks an exact name before a prefix before a match anywhere', () => {
		expect(top(ICON_GROUPS.logo, 'git')).toEqual(['logo-git']);
		expect(top(ICON_GROUPS.folder, 'go')).toEqual(['folder-go']);
		expect(top(ICON_GROUPS.file, 'react')).toEqual(['react']);
		const git = scoreIcon(icon('logo-git'), ['git']) ?? Infinity;
		const github = scoreIcon(icon('logo-github'), ['git']) ?? Infinity;
		const digitalocean = scoreIcon(icon('logo-digitalocean'), ['git']) ?? Infinity;
		expect(git).toBeLessThan(github);
		expect(github).toBeLessThan(digitalocean);
	});

	it("finds an icon by the theme's extensions and folder names", () => {
		expect(top(ICON_GROUPS.file, 'js')).toEqual(['javascript']);
		expect(top(ICON_GROUPS.file, 'md')).toEqual(['markdown']);
		expect(top(ICON_GROUPS.file, 'py')).toEqual(['python']);
		expect(top(ICON_GROUPS.folder, 'pictures')).toEqual(['folder-images']);
		expect(top(ICON_GROUPS.folder, 'db')).toEqual(['folder-database']);
		expect(top(ICON_GROUPS.logo, 'ts')).toEqual(['logo-typescript']);
	});

	it('does not split an alias into words', () => {
		// `quokka.js` is one of quokka's names; it must not make quokka an exact match for `js`.
		const js = scoreIcon(icon('javascript'), ['js']) ?? Infinity;
		const quokka = scoreIcon(icon('quokka'), ['js']);
		expect(quokka === null || quokka > js).toBe(true);
	});

	it('follows synonyms, below a direct hit', () => {
		expect(top(ICON_GROUPS.file, 'note')).toEqual(['markdown']);
		expect(ids(searchIcons(ICON_GROUPS.file, ['photo']))).toContain('image');
		expect(top(ICON_GROUPS.folder, 'music')).toEqual(['folder-audio']);
		expect(top(ICON_GROUPS.folder, 'password')).toEqual(['folder-keys']);
		const direct = scoreIcon(icon('topic-music'), ['music']) ?? Infinity;
		const viaSynonym = scoreIcon(icon('folder-audio'), ['music']) ?? -Infinity;
		expect(direct).toBeLessThan(viaSynonym);
	});

	it('only lists synonyms that lead somewhere', () => {
		const everything = Object.values(ICON_GROUPS).flat();
		for (const [word, targets] of Object.entries(SYNONYMS)) {
			expect(searchIcons(everything, [word]).length, word).toBeGreaterThan(0);
			for (const target of targets)
				expect(searchIcons(everything, [target]).length, target).toBeGreaterThan(0);
		}
	});

	it('puts the preferred icon first among equal scores', () => {
		const icons = [icon('test-js'), icon('bench-js')];
		expect(ids(searchIcons(icons, ['js'], { preferred: 'bench-js' }))).toEqual(['bench-js', 'test-js']);
	});

	it('keeps the original order without a query', () => {
		expect(ids(searchIcons(ICON_GROUPS.folder, []))).toEqual(ids(ICON_GROUPS.folder));
	});
});

describe('searching every tab', () => {
	const tabs = (Object.keys(ICON_GROUPS) as (keyof typeof ICON_GROUPS)[]).map((id) => ({
		id,
		icons: ICON_GROUPS[id],
	}));
	const find = (id: string) => tabs.find((tab) => tab.id === id);

	it('returns matches for each tab', () => {
		const { results, close } = searchGroups(tabs, 'react');
		expect(close).toBe(false);
		const logo = find('logo');
		const topic = find('topic');
		expect(logo && ids(results.get(logo) ?? [])).toContain('logo-react');
		expect(topic && results.get(topic)).toHaveLength(0);
	});

	it('falls back to close matches only when nothing matches exactly', () => {
		const typo = searchGroups(tabs, 'pyhton');
		expect(typo.close).toBe(true);
		const file = find('file');
		expect(file && ids(typo.results.get(file) ?? [])[0]).toBe('python');
		expect(file && ids(searchGroups(tabs, 'typscript').results.get(file) ?? [])[0]).toBe('typescript');
		// A real match leaves typos out, so `react` is not padded with `preact`-like guesses.
		expect(searchGroups(tabs, 'python').close).toBe(false);
	});

	it('does not guess for short words', () => {
		const { results } = searchGroups(tabs, 'qzx');
		for (const icons of results.values()) expect(icons).toHaveLength(0);
	});
});
