import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DISPLAY_MODES = ['both', 'lowest', 'icon'];

function backendPath() {
    const local = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'airpods-tui']);
    if (GLib.file_test(local, GLib.FileTest.IS_EXECUTABLE))
        return local;
    return GLib.find_program_in_path('airpods-tui') ?? 'airpods-tui';
}

function run(command, args) {
    return new Promise(resolve => {
        let process;
        try {
            process = Gio.Subprocess.new([command, ...args], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (error) {
            resolve({success: false, stdout: ''});
            return;
        }
        process.communicate_utf8_async(null, null, (source, result) => {
            try {
                const [, stdout] = source.communicate_utf8_finish(result);
                resolve({success: source.get_successful(), stdout: stdout ?? ''});
            } catch (error) {
                resolve({success: false, stdout: ''});
            }
        });
    });
}

export default class AirPodsBatteryPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const panelGroup = new Adw.PreferencesGroup({title: 'Panel'});
        const displayRow = new Adw.ComboRow({
            title: 'Panel display',
            subtitle: 'Choose the battery information shown in the top panel',
            model: Gtk.StringList.new(['Left and right batteries', 'Lowest battery', 'Icon only']),
        });
        displayRow.selected = Math.max(0, DISPLAY_MODES.indexOf(settings.get_string('panel-display')));
        displayRow.connect('notify::selected', () => settings.set_string('panel-display', DISPLAY_MODES[displayRow.selected]));
        settings.connect('changed::panel-display', () => {
            displayRow.selected = Math.max(0, DISPLAY_MODES.indexOf(settings.get_string('panel-display')));
        });
        panelGroup.add(displayRow);

        const hideRow = new Adw.SwitchRow({title: 'Hide when disconnected'});
        settings.bind('hide-when-disconnected', hideRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(hideRow);

        const caseRow = new Adw.SwitchRow({title: 'Show charging case in menu'});
        settings.bind('show-case-battery', caseRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(caseRow);

        const dataGroup = new Adw.PreferencesGroup({title: 'Battery data'});
        const timeoutRow = new Adw.SpinRow({
            title: 'Stale timeout',
            subtitle: 'Hide battery percentages if no fresh update arrives',
            adjustment: new Gtk.Adjustment({lower: 5, upper: 60, step_increment: 5, page_increment: 5}),
        });
        settings.bind('stale-timeout-minutes', timeoutRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        dataGroup.add(timeoutRow);

        const backendGroup = new Adw.PreferencesGroup({
            title: 'Setup',
            description: 'This extension only reads battery data. airpods-tui must be installed and configured once.',
        });
        const backendRow = new Adw.ActionRow({title: 'airpods-tui', subtitle: 'Checking…'});
        const serviceRow = new Adw.ActionRow({title: 'User service', subtitle: 'Checking…'});
        const appleRow = new Adw.ActionRow({
            title: 'Apple AACP setup',
            subtitle: 'Set the Apple DeviceID in BlueZ, restart Bluetooth, then pair AirPods again if needed.',
        });
        const guideRow = new Adw.ActionRow({
            title: 'Installation guide',
            subtitle: 'Includes the required Ubuntu commands and troubleshooting steps.',
        });
        guideRow.add_suffix(new Gtk.LinkButton({
            label: 'Open guide',
            uri: 'https://github.com/ozcanpng/airpods-battery-gnome#install',
            valign: Gtk.Align.CENTER,
        }));
        const checkButton = new Gtk.Button({icon_name: 'view-refresh-symbolic', valign: Gtk.Align.CENTER});
        checkButton.tooltip_text = 'Check setup again';
        backendRow.add_suffix(checkButton);
        backendGroup.add(backendRow);
        backendGroup.add(serviceRow);
        backendGroup.add(appleRow);
        backendGroup.add(guideRow);

        const refreshSetup = async () => {
            checkButton.sensitive = false;
            backendRow.subtitle = 'Checking…';
            serviceRow.subtitle = 'Checking…';
            const backend = await run(backendPath(), ['--version']);
            if (!backend.success) {
                backendRow.subtitle = 'Not installed. Open the guide to install it.';
                serviceRow.subtitle = 'Unavailable until airpods-tui is installed.';
                checkButton.sensitive = true;
                return;
            }
            backendRow.subtitle = backend.stdout.trim() || 'Installed';
            const service = await run('systemctl', ['--user', 'is-active', 'airpods-tui.service']);
            serviceRow.subtitle = service.success && service.stdout.trim() === 'active'
                ? 'Running'
                : 'Stopped — run: systemctl --user enable --now airpods-tui.service';
            checkButton.sensitive = true;
        };
        checkButton.connect('clicked', () => refreshSetup());
        refreshSetup();

        const aboutGroup = new Adw.PreferencesGroup({title: 'About'});
        const aboutRow = new Adw.ActionRow({
            title: 'AirPods Battery for GNOME',
            subtitle: 'GNOME Shell 46 · GPL-3.0-or-later',
        });
        aboutRow.add_suffix(new Gtk.LinkButton({
            label: 'Project page',
            uri: 'https://github.com/ozcanpng/airpods-battery-gnome',
            valign: Gtk.Align.CENTER,
        }));
        aboutGroup.add(aboutRow);

        page.add(panelGroup);
        page.add(dataGroup);
        page.add(backendGroup);
        page.add(aboutGroup);
        window.add(page);
    }
}
