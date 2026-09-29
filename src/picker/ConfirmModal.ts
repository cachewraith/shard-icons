// A yes/no dialog. Small enough to be a plain Modal subclass taking a callback; the one place
// that needs it (clearing every icon) is destructive and irreversible.

import type { App, ButtonComponent } from 'obsidian';
import { Modal, requireApiVersion, Setting } from 'obsidian';

/**
 * Styles a button as destructive. `setDestructive()` arrived in Obsidian 1.13.0 and deprecated
 * `setWarning()`; older versions get the class `setWarning()` itself adds.
 */
export function markDestructive(button: ButtonComponent): ButtonComponent {
	if (requireApiVersion('1.13.0')) return button.setDestructive();
	button.buttonEl.addClass('mod-warning');
	return button;
}

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly message: string,
		private readonly confirmLabel: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.titleEl.setText(this.title);
		this.contentEl.createEl('p', { text: this.message });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				markDestructive(button)
					.setButtonText(this.confirmLabel)
					.onClick(() => {
						this.close();
						this.onConfirm();
					}),
			);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
