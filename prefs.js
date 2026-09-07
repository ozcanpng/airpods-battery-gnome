import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DISPLAY_MODES = ['both', 'lowest', 'icon'];

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

        const aboutGroup = new Adw.PreferencesGroup({title: 'Backend'});
        aboutGroup.add(new Adw.ActionRow({
            title: 'airpods-tui manages the AirPods connection',
            subtitle: 'Low-battery notifications and charging state are provided by the backend.',
        }));

        page.add(panelGroup);
        page.add(dataGroup);
        page.add(aboutGroup);
        window.add(page);
    }
}
