import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { around } from 'monkey-around';
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
} from '@codemirror/view';

// add type safety for the undocumented methods
declare module 'obsidian' {
	interface Vault {
		setConfig: (config: string, newValue: boolean) => void;
		getConfig: (config: string) => boolean;
	}
}

interface YankSettings {
	timeout: number;
}

const DEFAULT_SETTINGS: YankSettings = { timeout: 2000 };

class HighlightPlugin {
	decorations: DecorationSet;
	timeout: number;
	// highlightTime: number;

	constructor(view: EditorView) {
		this.decorations = Decoration.none;
		// @ts-expect-error, not typed
		this.timeout = app.plugins.plugins['yank-highlight'].settings.timeout;
	}
	// update unnecessary because highlight gets removed by timeout; otherwise it would never apply the classes
	// update(update: ViewUpdate) {
	//	if (update.selectionSet || update.docChanged || update.viewportChanged) {
	//		this.decorations = Decoration.none;
	//		// this.makeYankDeco(update.view);
	//
	// }

	makeYankDeco() {
		const deco = [];
		const { editor } = app.workspace.getActiveViewOfType(MarkdownView);
		const posFrom = editor.posToOffset(editor.getCursor('from'));
		const posTo = editor.posToOffset(editor.getCursor('to'));
		const yankDeco = Decoration.mark({
			class: 'yank-deco',
			attributes: { 'data-contents': 'string' },
		});
		deco.push(yankDeco.range(posFrom, posTo));
		this.decorations = Decoration.set(deco);
		window.setTimeout(
			() => (this.decorations = Decoration.none),
			this.timeout
		);
	}
}

// cm6 view plugin
function matchHighlighter() {
	return ViewPlugin.fromClass(HighlightPlugin, {
		decorations: (v) => v.decorations,
	});
}

export default class YankHighlighter extends Plugin {
	highlightUninstaller: any;
	uninstall = false;
	settings: YankSettings;
	cmPlugin: ViewPlugin<any>;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new YankSettingTab(this.app, this));

		const viewPlugin = (this.cmPlugin = matchHighlighter());
		this.registerEditorExtension(this.cmPlugin);

		if (this.app.vault.getConfig('vimMode')) {
			this.highlightUninstaller = around(
				// @ts-expect-error, not typed
				window.CodeMirrorAdapter?.Vim.getRegisterController(),
				{
					pushText(oldMethod: any) {
						return function (...args: any[]) {
							let cm6Editor: EditorView;
							if (args.at(1) === 'yank')
								cm6Editor = app.workspace.getActiveViewOfType(
									MarkdownView
									// @ts-expect-error, not typed
								).editor.cm;
							cm6Editor.plugin(viewPlugin).makeYankDeco();
							const result =
								oldMethod && oldMethod.apply(this, args);
							return result;
						};
					},
				}
			);
			this.uninstall = true;
		}
		console.log('Yank Highlight plugin loaded.');
	}
	async onunload() {
		if (this.uninstall) this.highlightUninstaller();

		console.log('Yank Highlight plugin unloaded.');
	}
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class YankSettingTab extends PluginSettingTab {
	plugin: YankHighlighter;

	constructor(app: App, plugin: YankHighlighter) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Yank Highlighter settings' });

		new Setting(containerEl)
			.setName('Highlight timeout')
			.setDesc('The timeout is in milliseconds.')
			.addText((text) => {
				text.setPlaceholder(
					'Enter a number greater than 0. Default: 2000'
				)
					.setValue(settings.timeout.toString())
					.onChange(async (value) => {
						const num = Number.parseInt(value);
						if (Number.isInteger(num) && num > 0) {
							settings.timeout = num;
							await this.plugin.saveSettings();
						} else {
							new Notice(
								'Please enter an integer greater than 0.'
							);
						}
					});
			});
	}
}
