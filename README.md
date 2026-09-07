# AirPods Battery for GNOME

![AirPods Battery for GNOME overview](assets/airpods-battery-gnome.png)

GNOME Shell extension that shows live left and right
AirPods battery levels in the top panel. It uses
[airpods-tui](https://github.com/annoyedmilk/airpods-tui) as its Bluetooth and
Apple AACP backend.

## What this extension adds

This project deliberately does not reimplement Apple's AirPods protocol.
`airpods-tui` owns the Bluetooth and Apple AACP layer: it connects to AirPods,
identifies the model, and obtains battery data. This extension is the GNOME
Shell presentation and reliability layer on top of that backend.

```text
AirPods → airpods-tui → battery data and connection status → GNOME Shell panel
```

Compared with using `airpods-tui` alone, this extension provides:

- A compact GNOME top-panel indicator with an AirPods icon and left/right levels
- A GNOME menu with battery details and a case level when the backend provides it
- Clear live, stale, disconnected, and backend-unavailable states, so old values
  are never presented as current battery data
- Panel display preferences, including both batteries, lowest battery, or icon only
- Hide-when-disconnected behaviour, accessible status text, and tooltips
- A GNOME-native installation, enablement, and troubleshooting workflow
- An in-extension setup checker for the backend and its user service

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

When installed from GNOME Extensions, open this extension's Preferences if it
does not show battery levels. The **Setup** section checks whether
`airpods-tui` and its user service are ready and links to the commands below.

## Install

### 1. Install and configure airpods-tui

On Ubuntu, install the backend from source with the following commands:

```bash
sudo apt update
sudo apt install -y build-essential cargo git libdbus-1-dev libpulse-dev pkg-config
git clone https://github.com/annoyedmilk/airpods-tui.git
cd airpods-tui
cargo build --release
sudo install -Dm755 target/release/airpods-tui /usr/bin/airpods-tui
sudo install -Dm644 airpods-tui.service /usr/lib/systemd/user/airpods-tui.service
```

Enable Apple AACP support, then restart Bluetooth:

```bash
sudo sed -i '/^\[General\]/a DeviceID = bluetooth:004C:0000:0000' /etc/bluetooth/main.conf
sudo systemctl restart bluetooth
```

If the AirPods were paired before this change, remove them from Bluetooth
settings and pair them again. Then enable the backend service:

Enable the backend service and confirm that it can see the connected AirPods:

```bash
systemctl --user enable --now airpods-tui.service
airpods-tui --waybar
```

The last command should report a connected AirPods device before you continue.

For Arch and Omarchy installation, use the upstream
[airpods-tui installation guide](https://github.com/annoyedmilk/airpods-tui#installation).

### 2. Download and package the extension

```bash
git clone https://github.com/ozcanpng/airpods-battery-gnome.git
cd airpods-battery-gnome
gnome-extensions pack --force --out-dir=dist --extra-source=icons --extra-source=LICENSE --extra-source=THIRD_PARTY_NOTICES.md .
```

### 3. Install and enable it

```bash
gnome-extensions install --force dist/airpods-battery@ozcanpng.dev.shell-extension.zip
```

On X11, press `Alt+F2`, enter `r`, and press Enter. On Wayland, log out and
back in. Then enable the extension:

```bash
gnome-extensions enable airpods-battery@ozcanpng.dev
```

Open the extension menu in the top panel to see status and battery details.

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
gnome-extensions disable airpods-battery@ozcanpng.dev
gnome-extensions uninstall airpods-battery@ozcanpng.dev
```

The backend remains installed so other airpods-tui integrations continue to
work.

## License and attribution

This project is GPL-3.0-or-later. The AirPods pair icon is derived from
[Airpod Battery Monitor](https://github.com/maniacx/Airpod-Battery-Monitor)
by maniacx; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
