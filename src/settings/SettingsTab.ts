// The Settings → Shard Icons pane.
//
// Obsidian 1.13.0 renders a tab from `getSettingDefinitions()`, which also puts its settings in
// the settings search, and deprecated `display()`. This plugin still supports 1.5.0, so it
// keeps `display()` as the fallback the API documents for older versions (see
// eslint.config.mjs). Both draw the same rows: 1.13 through `render` definitions, older
// versions by replaying them onto a `Setting` each.
//
// Pattern: a thin view over `IconStore`. Every control writes through the store and the store
// notifies whoever redraws, so this file holds no state of its own.

import type { App, Plugin, SettingDefinitionItem } from 'obsidian';
import { Notice, PluginSettingTab, Setting } from 'obsidian';
import { HAS_FILE_ICONS, SOURCES } from '../generated/icons';
import { ConfirmModal, markDestructive } from '../picker/ConfirmModal';
import type { IconStore } from '../store/IconStore';
import { MAX_ICON_SIZE, MIN_ICON_SIZE } from './types';

/** One row of the pane: a `render` setting definition, or a plain one with no `render`. */
interface Row {
	readonly name: string;
	readonly desc?: string;
	/** Adds the row's control; its name, and its description when static, are already set. */
	readonly render?: (setting: Setting) => void;
}

function filesAndFolders(count: number): string {
	return count === 1 ? '1 file or folder' : `${count} files and folders`;
}

export class ShardIconsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly store: IconStore,
	) {
		super(app, plugin);
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		return this.rows();
	}

	/** Obsidian before 1.13.0 only; later versions render `getSettingDefinitions()` instead. */
	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		for (const row of this.rows()) {
			const setting = new Setting(containerEl).setName(row.name);
			if (row.desc !== undefined) setting.setDesc(row.desc);
			row.render?.(setting);
		}
	}

	private rows(): Row[] {
		const { store } = this;
		return [
			{
				name: 'Automatic folder icons',
				desc: 'Folders with no chosen icon get an icon matched from their name.',
				render: (setting) => {
					setting.addToggle((toggle) =>
						toggle
							.setValue(store.settings.autoFolderIcons)
							.onChange((value) => void store.updateSettings({ autoFolderIcons: value })),
					);
				},
			},
			{
				name: 'File icons',
				desc: HAS_FILE_ICONS
					? 'Files with no chosen icon get an icon matched from their name and extension.'
					: 'This build of the plugin ships without file icons.',
				render: (setting) => {
					setting.addToggle((toggle) =>
						toggle
							.setValue(store.settings.fileIcons)
							.setDisabled(!HAS_FILE_ICONS)
							.onChange((value) => void store.updateSettings({ fileIcons: value })),
					);
				},
			},
			{
				name: 'Icon size',
				desc: 'Pixel size of the icons in the file explorer.',
				render: (setting) => {
					setting.addSlider((slider) =>
						slider
							.setLimits(MIN_ICON_SIZE, MAX_ICON_SIZE, 1)
							.setValue(store.settings.iconSize)
							.onChange((value) => void store.updateSettings({ iconSize: value })),
					);
				},
			},
			{ name: 'Clear all custom icons', render: (setting) => this.renderClear(setting) },
			{
				name: 'Icon sources',
				desc:
					`Material Icon Theme ${SOURCES.materialIconTheme} (MIT), ` +
					`Simple Icons ${SOURCES.simpleIcons} (CC0-1.0) ` +
					`and Material Design Icons ${SOURCES.materialDesignIcons} (Apache-2.0).`,
			},
		];
	}

	/** Its description and button follow the icon count, and update in place after clearing. */
	private renderClear(setting: Setting): void {
		const { store } = this;
		setting.addButton((button) => {
			const refresh = () => {
				const count = Object.keys(store.icons).length;
				setting.setDesc(
					count === 0
						? 'No file or folder has a custom icon.'
						: `${filesAndFolders(count)} ${count === 1 ? 'has' : 'have'} a custom icon.`,
				);
				button.setDisabled(count === 0);
			};
			markDestructive(button)
				.setButtonText('Clear')
				.onClick(() => {
					const count = Object.keys(store.icons).length;
					new ConfirmModal(
						this.app,
						'Clear all custom icons',
						`This removes the icon chosen for ${filesAndFolders(count)}. It cannot be undone.`,
						'Clear',
						() => {
							void store.clearIcons();
							new Notice('Cleared all custom icons');
							refresh();
						},
					).open();
				});
			refresh();
		});
	}
}
