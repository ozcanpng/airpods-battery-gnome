# AirPods Battery for GNOME

An English-language GNOME Shell extension that shows live left and right
AirPods battery levels in the top panel. It uses
[airpods-tui](https://github.com/annoyedmilk/airpods-tui) as its Bluetooth and
Apple AACP backend.

## Supported GNOME versions

| GNOME Shell version | Status |
| --- | --- |
| 46 | Verified on Ubuntu |
| 45, 47, 48 | Planned, not yet verified |

## Features

- AirPods pair icon with left and right battery percentages
- Menu details for left, right, and case battery when available
- Live, stale, disconnected, and backend-unavailable states
- Optional hide when disconnected, icon-only, and lowest-battery panel modes
- Accessible status text and tooltips

## Requirements

- GNOME Shell 46
- [airpods-tui](https://github.com/annoyedmilk/airpods-tui) installed and its
  `airpods-tui.service` user service enabled

`airpods-tui` requires BlueZ to identify as an Apple host for AACP support.
Follow its installation guide to configure `DeviceID`, restart Bluetooth, and
re-pair your AirPods when required. This extension never changes system
Bluetooth configuration or runs `sudo`.

## Install

Install and start the backend first:

```bash
systemctl --user enable --now airpods-tui.service
```

Package this repository, then install the generated extension ZIP:

```bash
gnome-extensions pack --force --out-dir=dist --extra-source=icons --extra-source=LICENSE --extra-source=THIRD_PARTY_NOTICES.md .
gnome-extensions install --force dist/airpods-battery@ozcanpng.shell-extension.zip
gnome-extensions enable airpods-battery@ozcanpng
```

On X11, press `Alt+F2`, enter `r`, and press Enter after changing extension
code. On Wayland, log out and back in.

## Troubleshooting

```bash
systemctl --user status airpods-tui.service
journalctl --user -u airpods-tui.service -f
airpods-tui --waybar
```

If the extension reports stale data, wait for a fresh battery packet or adjust
the stale timeout in Preferences. A case battery is shown only when the
backend currently provides it.

## Uninstall

```bash
gnome-extensions disable airpods-battery@ozcanpng
gnome-extensions uninstall airpods-battery@ozcanpng
```

The backend remains installed so other airpods-tui integrations continue to
work.

## License and attribution

This project is GPL-3.0-or-later. The AirPods pair icon is derived from
[Airpod Battery Monitor](https://github.com/maniacx/Airpod-Battery-Monitor)
by maniacx; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
