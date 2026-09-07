import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const POLL_SECONDS = 30;
const State = Object.freeze({
    LIVE: 'live',
    STALE: 'stale',
    DISCONNECTED: 'disconnected',
    BACKEND_DOWN: 'backend-down',
});

const AirPodsIndicator = GObject.registerClass(
class AirPodsIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'AirPods Battery for GNOME');
        this._extension = extension;
        this._settings = extension.getSettings();
        this._refreshing = false;
        this._timeoutId = null;

        const panelBox = new St.BoxLayout({style_class: 'airpods-panel-box'});
        const iconPath = GLib.build_filenamev([extension.path, 'icons', 'airpods-pair-symbolic.svg']);
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(iconPath),
            style_class: 'system-status-icon airpods-panel-icon',
        });
        this._leftLabel = new St.Label({style_class: 'airpods-panel-percentage', y_align: Clutter.ActorAlign.CENTER});
        this._separatorLabel = new St.Label({text: '·', style_class: 'airpods-panel-separator', y_align: Clutter.ActorAlign.CENTER});
        this._rightLabel = new St.Label({style_class: 'airpods-panel-percentage', y_align: Clutter.ActorAlign.CENTER});
        this._lowestLabel = new St.Label({style_class: 'airpods-panel-percentage', y_align: Clutter.ActorAlign.CENTER});
        panelBox.add_child(this._icon);
        panelBox.add_child(this._leftLabel);
        panelBox.add_child(this._separatorLabel);
        panelBox.add_child(this._rightLabel);
        panelBox.add_child(this._lowestLabel);
        this.add_child(panelBox);

        this._titleItem = new PopupMenu.PopupMenuItem('Checking AirPods status…', {reactive: false});
        this.menu.addMenuItem(this._titleItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._leftItem = new PopupMenu.PopupMenuItem('Left AirPod: —', {reactive: false});
        this._rightItem = new PopupMenu.PopupMenuItem('Right AirPod: —', {reactive: false});
        this._caseItem = new PopupMenu.PopupMenuItem('Charging Case: —', {reactive: false});
        this._updatedItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._leftItem);
        this.menu.addMenuItem(this._rightItem);
        this.menu.addMenuItem(this._caseItem);
        this.menu.addMenuItem(this._updatedItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const actionsItem = new PopupMenu.PopupBaseMenuItem({reactive: false, style_class: 'airpods-menu-actions'});
        const actionsBox = new St.BoxLayout({x_expand: true, x_align: Clutter.ActorAlign.CENTER, style_class: 'airpods-menu-actions-box'});
        this._refreshButton = this._createActionButton('view-refresh-symbolic', 'Refresh');
        this._refreshButton.connect('clicked', () => this.refresh());
        this._settingsButton = this._createActionButton('preferences-system-symbolic', 'Preferences');
        this._settingsButton.connect('clicked', () => this._extension.openPreferences());
        this._startButton = this._createActionButton('media-playback-start-symbolic', 'Start airpods-tui');
        this._startButton.connect('clicked', () => this._startBackend());
        this._startButton.visible = false;
        actionsBox.add_child(this._refreshButton);
        actionsBox.add_child(this._settingsButton);
        actionsBox.add_child(this._startButton);
        actionsItem.add_child(actionsBox);
        this.menu.addMenuItem(actionsItem);

        this._settings.connectObject(
            'changed::panel-display', () => this.refresh(),
            'changed::hide-when-disconnected', () => this.refresh(),
            'changed::show-case-battery', () => this.refresh(),
            'changed::stale-timeout-minutes', () => this.refresh(),
            this);
    }

    start() {
        this.refresh();
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this.refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._timeoutId)
            GLib.Source.remove(this._timeoutId);
        this._timeoutId = null;
        this._settings.disconnectObject(this);
    }

    _backendPath() {
        const local = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'airpods-tui']);
        return GLib.file_test(local, GLib.FileTest.IS_EXECUTABLE) ? local : 'airpods-tui';
    }

    _createActionButton(iconName, accessibleName) {
        const button = new St.Button({
            can_focus: true,
            reactive: true,
            style_class: 'button airpods-menu-action-button',
            track_hover: true,
        });
        button.set_child(new St.Icon({icon_name: iconName, style_class: 'popup-menu-icon'}));
        button.accessible_name = accessibleName;
        return button;
    }

    _run(command, args) {
        return new Promise(resolve => {
            let process;
            try {
                process = Gio.Subprocess.new([command, ...args], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            } catch (error) {
                resolve({success: false, stdout: '', error});
                return;
            }
            process.communicate_utf8_async(null, null, (source, result) => {
                try {
                    const [, stdout] = source.communicate_utf8_finish(result);
                    resolve({success: source.get_successful(), stdout: stdout ?? ''});
                } catch (error) {
                    resolve({success: false, stdout: '', error});
                }
            });
        });
    }

    _readBatteryFile() {
        const path = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'airpods-battery.env']);
        const file = Gio.File.new_for_path(path);
        try {
            const info = file.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
            const [ok, bytes] = GLib.file_get_contents(path);
            if (!ok)
                return null;
            const values = {};
            for (const line of new TextDecoder().decode(bytes).split('\n')) {
                const [key, value] = line.split('=', 2);
                if (key && /^\d+$/.test(value)) {
                    const battery = Number(value);
                    if (battery >= 0 && battery <= 100)
                        values[key] = battery;
                }
            }
            if (values.LEFT === undefined && values.RIGHT === undefined && values.HEADPHONE === undefined)
                return null;
            return {values, ageSeconds: Math.max(0, GLib.get_real_time() / 1000000 - info.get_attribute_uint64('time::modified'))};
        } catch (error) {
            return null;
        }
    }

    _batteryDataFromBackend(backend) {
        const values = {};
        const tooltip = backend?.tooltip ?? '';
        const matchBattery = name => tooltip.match(new RegExp(`^${name}:\\s*(\\d+)%`, 'm'));
        const left = matchBattery('L');
        const right = matchBattery('R');
        const headphones = matchBattery('H');
        if (left)
            values.LEFT = Number(left[1]);
        if (right)
            values.RIGHT = Number(right[1]);
        if (headphones)
            values.HEADPHONE = Number(headphones[1]);

        // The daemon's env file may additionally contain the last observed case value.
        const fileData = this._readBatteryFile();
        if (fileData?.values.CASE !== undefined)
            values.CASE = fileData.values.CASE;

        if (values.LEFT === undefined && values.RIGHT === undefined && values.HEADPHONE === undefined)
            return null;
        return {values, ageSeconds: 0};
    }

    async refresh() {
        if (this._refreshing)
            return;
        try {
            this._refreshing = true;
            this._refreshButton.reactive = false;
            const service = await this._run('systemctl', ['--user', 'is-active', 'airpods-tui.service']);
            if (!service.success || service.stdout.trim() !== 'active') {
                this._render(State.BACKEND_DOWN);
                return;
            }
            const status = await this._run(this._backendPath(), ['--waybar']);
            let backend;
            try {
                backend = status.success ? JSON.parse(status.stdout) : null;
            } catch (error) {
                backend = null;
            }
            if (!backend) {
                this._render(State.BACKEND_DOWN);
                return;
            }
            if (backend.class !== 'connected') {
                this._render(State.DISCONNECTED);
                return;
            }
            const data = this._batteryDataFromBackend(backend);
            if (!data) {
                this._render(State.STALE, null, backend);
                return;
            }
            this._render(State.LIVE, data, backend);
        } catch (error) {
            console.error(`AirPods Battery refresh failed: ${error.message}`);
            try {
                this._render(State.BACKEND_DOWN);
            } catch (renderError) {
                console.error(`AirPods Battery render failed: ${renderError.message}`);
            }
        } finally {
            this._refreshing = false;
            if (this._refreshButton)
                this._refreshButton.reactive = true;
        }
    }

    async _startBackend() {
        this._startButton.reactive = false;
        await this._run('systemctl', ['--user', 'start', 'airpods-tui.service']);
        this._startButton.reactive = true;
        this.refresh();
    }

    _render(state, data = null, backend = null) {
        const values = data?.values ?? {};
        const left = values.LEFT;
        const right = values.RIGHT;
        const caseBattery = values.CASE;
        const lowest = Math.min(...[left, right].filter(value => value !== undefined));
        const active = state === State.LIVE;
        const display = this._settings.get_string('panel-display');
        this._leftLabel.visible = active && display === 'both';
        this._separatorLabel.visible = active && display === 'both';
        this._rightLabel.visible = active && display === 'both';
        this._lowestLabel.visible = active && display === 'lowest';
        this._leftLabel.text = left === undefined ? '—' : `${left}%`;
        this._rightLabel.text = right === undefined ? '—' : `${right}%`;
        this._lowestLabel.text = Number.isFinite(lowest) ? `${lowest}%` : '—';
        this._icon.set_style_class_name(`system-status-icon airpods-panel-icon airpods-panel-state-${state}`);

        this._caseItem.visible = this._settings.get_boolean('show-case-battery') && caseBattery !== undefined;
        this._startButton.visible = state === State.BACKEND_DOWN;
        this.visible = !(state === State.DISCONNECTED && this._settings.get_boolean('hide-when-disconnected'));

        if (state === State.LIVE) {
            const model = backend?.tooltip?.split('\n')[0] ?? 'AirPods';
            const age = this._ageText(data.ageSeconds);
            this._titleItem.label.text = model;
            this._leftItem.label.text = `Left AirPod: ${left ?? '—'}%`;
            this._rightItem.label.text = `Right AirPod: ${right ?? '—'}%`;
            this._caseItem.label.text = `Charging Case: ${caseBattery}%`;
            this._updatedItem.label.text = `Updated ${age}`;
            this._setAccessibleStatus(`AirPods. Left battery ${left ?? 'unknown'} percent. Right battery ${right ?? 'unknown'} percent.`);
        } else if (state === State.STALE) {
            this._titleItem.label.text = 'Battery data is stale';
            this._leftItem.label.text = 'Left AirPod: —';
            this._rightItem.label.text = 'Right AirPod: —';
            this._updatedItem.label.text = 'Waiting for a fresh battery update';
            this._setAccessibleStatus('AirPods battery information is stale.');
        } else if (state === State.DISCONNECTED) {
            this._titleItem.label.text = 'AirPods are disconnected';
            this._leftItem.label.text = 'Left AirPod: —';
            this._rightItem.label.text = 'Right AirPod: —';
            this._updatedItem.label.text = 'Connect AirPods to show battery levels';
            this._setAccessibleStatus('AirPods are disconnected.');
        } else {
            this._titleItem.label.text = 'airpods-tui is unavailable';
            this._leftItem.label.text = 'Left AirPod: —';
            this._rightItem.label.text = 'Right AirPod: —';
            this._updatedItem.label.text = 'Open Preferences for setup help';
            this._setAccessibleStatus('AirPods backend is unavailable.');
        }
    }

    _ageText(seconds) {
        if (seconds < 60)
            return 'just now';
        const minutes = Math.floor(seconds / 60);
        return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }

    _setAccessibleStatus(text) {
        this.accessible_name = text;
    }
});

export default class AirPodsBatteryExtension extends Extension {
    enable() {
        this._indicator = new AirPodsIndicator(this);
        this._positionSettings = this.getSettings();
        this._positionChangedId = this._positionSettings.connect('changed::panel-position', () => this._moveIndicator());
        this._moveIndicator();
        this._indicator.start();
    }

    disable() {
        if (this._positionChangedId)
            this._positionSettings.disconnect(this._positionChangedId);
        this._positionChangedId = null;
        this._positionSettings = null;
        this._indicator.stop();
        this._indicator.destroy();
        this._indicator = null;
    }

    _moveIndicator() {
        const container = this._indicator.container ?? this._indicator;
        container.get_parent()?.remove_child(container);
        delete Main.panel.statusArea[this.uuid];
        const position = this._positionSettings.get_string('panel-position');
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, position);

        const box = position === 'left' ? Main.panel._leftBox : Main.panel._rightBox;
        const anchor = position === 'left'
            ? Main.panel.statusArea.activities
            : Main.panel.statusArea.quickSettings;
        const anchorContainer = anchor?.container ?? anchor;

        // Keep the indicator beside GNOME's built-in controls, not among other extensions.
        if (box.get_children().includes(anchorContainer)) {
            box.remove_child(container);
            const anchorIndex = box.get_children().indexOf(anchorContainer);
            const index = position === 'left' ? anchorIndex + 1 : anchorIndex;
            box.insert_child_at_index(container, index);
        }
    }
}
